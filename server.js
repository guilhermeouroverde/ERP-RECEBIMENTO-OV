'use strict';
// Online adapter for the server.js uploaded by the user. No disk database writes.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {SupabaseStore}=require('./lib/store');
const {createLegacyContext}=require('./lib/legacy');
const {verifyPassword,DUMMY}=require('./lib/password');
const {AppError,json,readBody,readCookies,sha256,CapturedResponse}=require('./lib/transport');
const VERSION='35.2.1-online-test';
function validateOrigin(req,env){
  if(['GET','HEAD'].includes(req.method))return;
  let expected;
  if(env.APP_ORIGIN){try{expected=new URL(env.APP_ORIGIN).origin;}catch{}}
  if(!expected){
    if(env.VERCEL)throw new AppError(503,'Configure APP_ORIGIN com o endereco HTTPS do ERP.','ORIGIN_NOT_CONFIGURED');
    expected='http://'+req.headers.host;
  }
  const origin=String(req.headers.origin||'');
  if(origin!==expected)throw new AppError(403,'Origem nao autorizada. Abra o ERP no endereco configurado em APP_ORIGIN.','ORIGIN_NOT_ALLOWED');
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw new AppError(415,'Envie JSON.','INVALID_CONTENT_TYPE');
}
function setSessionCookie(res,token,env,maxAge=43200){
  const secure=!!env.VERCEL||String(env.APP_ORIGIN||'').startsWith('https:');
  const name=secure?'__Host-ov_session':'ov_session';
  res.setHeader('Set-Cookie',`${name}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`);
}
function sessionToken(req,env){
  const c=readCookies(req),secure=!!env.VERCEL||String(env.APP_ORIGIN||'').startsWith('https:');
  const value=c[secure?'__Host-ov_session':'ov_session']||'';
  return /^[0-9a-f]{64}$/.test(value)?value:'';
}
function safeUser(p){return {id:p.id,name:p.name,username:p.username,role:p.role,active:p.active};}
function validateInputReferences(body,state,url,method){
  // General transport/integrity checks. Original calculation functions are unchanged.
  if((url.pathname==='/api/transactions'||/^\/api\/transactions\/\d+$/.test(url.pathname))&&['POST','PUT'].includes(method)){
    if(!['CACAU','CAF\u00c9','CASTANHAS'].includes(body.product))throw new AppError(400,'Produto invalido.','INVALID_INPUT');
    if(!state.producers.some(x=>x.id===Number(body.producer_id)&&x.active!==false))throw new AppError(400,'Produtor nao encontrado ou inativo.','INVALID_INPUT');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date||''))||Number.isNaN(Date.parse(body.date+'T12:00:00Z'))||new Date(body.date+'T12:00:00Z').toISOString().slice(0,10)!==body.date)throw new AppError(400,'Data invalida.','INVALID_INPUT');
    const operations=['Compra do Produtor','Dep\u00f3sito','Compra do Caf\u00e9 Depositado','Compra do Cacau Depositado','Compra da Castanha Depositada','Retirada do Dep\u00f3sito','Ajuste de Entrada','Ajuste de Sa\u00edda'];
    if(!operations.includes(body.operation))throw new AppError(400,'Operacao invalida.','INVALID_INPUT');
    for(const field of ['gross_weight','price','moisture','mold','brocade','yield_value','defects','manual_net_weight','manual_gross_value','manual_rural_fund','manual_net_value']){
      const v=body[field];if(v===undefined||v===null||v==='')continue;
      if(!Number.isFinite(Number(v))||Number(v)<0)throw new AppError(400,`Campo invalido: ${field}.`,'INVALID_INPUT');
    }
    if(!(Number(body.gross_weight)>0))throw new AppError(400,'Informe um peso maior que zero.','INVALID_INPUT');
  }
}
function localStatic(req,res,root){
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{return json(res,400,{error:'Endereco invalido.'});}
  if(pathname==='/')pathname='/index.html';
  const publicRoot=path.resolve(root,'public'),file=path.resolve(publicRoot,'.'+pathname);
  if(file!==publicRoot&&!file.startsWith(publicRoot+path.sep))return json(res,403,{error:'Acesso negado.'});
  const m={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
  if(!m[path.extname(file).toLowerCase()])return json(res,404,{error:'Arquivo nao encontrado.'});
  fs.readFile(file,(err,bytes)=>{if(err)return json(res,404,{error:'Arquivo nao encontrado.'});res.writeHead(200,{'Content-Type':m[path.extname(file).toLowerCase()],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(bytes);});
}
function createApplication({store=new SupabaseStore(),env=process.env,root=__dirname}={}){
  return async function handleRequest(req,res){
    try{
      const url=new URL(req.url,'http://localhost');
      if(!url.pathname.startsWith('/api/'))return localStatic(req,res,root);
      if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,version:VERSION,api:'available',database:store.isConfigured()?'configured_not_checked':'not_configured'});
      if(req.method==='GET'&&url.pathname==='/api/ready'){
        const status=await store.rpc('ov_status');
        return json(res,status.initialized?200:503,{ok:!!status.initialized,api:'available',database:status.initialized?'ready':'awaiting_import',message:status.initialized?'Servidor e banco prontos para o teste de login.':'Execute a importacao inicial local antes do login.'});
      }
      validateOrigin(req,env);
      if(req.method==='POST'&&url.pathname==='/api/login'){
        const b=await readBody(req),username=String(b.username||'').trim().toLowerCase(),password=String(b.password||'');
        if(!/^[a-z0-9_.-]{3,80}$/.test(username)||!password||password.length>128)throw new AppError(401,'Usuario ou senha invalidos.','INVALID_CREDENTIALS');
        const ip=env.VERCEL?String(req.headers['x-real-ip']||req.headers['x-forwarded-for']||'unknown').split(',')[0].trim():String(req.socket?.remoteAddress||'local');
        const limit=await store.rpc('ov_auth_allow',{p_keys:[sha256('ip:'+ip),sha256('pair:'+ip+':'+username)],p_limits:[60,8]});
        if(!limit.allowed)throw new AppError(429,'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.','RATE_LIMIT');
        const account=await store.rpc('ov_login_user',{p_username:username});
        const valid=await verifyPassword(password,account?.password_hash||DUMMY);
        if(!account||!account.active||!valid)throw new AppError(401,'Usuario ou senha invalidos.','INVALID_CREDENTIALS');
        const snap=await store.snapshot(false),profile=snap.main.users.find(p=>p.id===account.id&&p.active!==false);
        if(!profile)throw new AppError(401,'Usuario ou senha invalidos.','INVALID_CREDENTIALS');
        const token=crypto.randomBytes(32).toString('hex');
        await store.rpc('ov_session_create',{p_user_id:account.id,p_token_hash:sha256(token),p_expires_at:new Date(Date.now()+43200000).toISOString()});
        setSessionCookie(res,token,env);
        return json(res,200,{user:safeUser(profile)});
      }
      if(req.method==='POST'&&url.pathname==='/api/logout'){
        const token=sessionToken(req,env);if(token)await store.rpc('ov_session_delete',{p_token_hash:sha256(token)});
        setSessionCookie(res,'',env,0);return json(res,200,{ok:true});
      }
      const token=sessionToken(req,env);
      if(!token)throw new AppError(401,'Nao autenticado.','UNAUTHENTICATED');
      const session=await store.rpc('ov_session_user',{p_token_hash:sha256(token)});
      if(!session)throw new AppError(401,'Sessao expirada. Entre novamente.','UNAUTHENTICATED');
      const needsAudit=url.pathname.startsWith('/api/audit')||url.pathname==='/api/operations-center';
      const snap=await store.snapshot(needsAudit),profile=snap.main.users.find(p=>p.id===session.id&&p.active!==false);
      if(!profile)throw new AppError(401,'Usuario inativo.','UNAUTHENTICATED');
      if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
        const b=await readBody(req);
        validateInputReferences(b,snap.main,url,req.method);
        if(req.method==='PUT'&&url.pathname==='/api/settings'&&profile.role!=='admin')throw new AppError(403,'Apenas o administrador pode alterar parametros.','FORBIDDEN');
        if(url.pathname.startsWith('/api/audit')&&profile.role!=='admin')throw new AppError(403,'Apenas o administrador pode implantar ou corrigir pela auditoria.','FORBIDDEN');
      }
      const ctx=createLegacyContext(snap.main,snap.audit,profile),capture=new CapturedResponse();
      await ctx.handler(req,capture);
      if(!capture.ended)throw new AppError(500,'Resposta interna incompleta.','SERVER_ERROR');
      const change=ctx.getState();
      if(capture.statusCode<400&&(change.dirtyMain||change.dirtyAudit)){
        // All successful writes are confirmed only after the atomic database commit.
        await store.commit(snap,change,profile,req.method+' '+url.pathname);
      }
      capture.flush(res);
    }catch(err){
      if(res.headersSent){if(!res.writableEnded)res.end();return;}
      const status=err instanceof AppError?err.status:500;
      if(!(err instanceof AppError))console.error('API failed:',err.name);
      return json(res,status,{error:err instanceof AppError?err.message:'Erro interno. Consulte os logs do servidor.',code:err.code||'SERVER_ERROR'});
    }
  };
}
const handleRequest=createApplication();
module.exports={handleRequest,createApplication,VERSION};
// Local development only. Vercel executes api/index.js as its explicit function.
if(require.main===module&&!process.env.VERCEL){
  const port=Number(process.env.PORT||3213),host=process.env.HOST||'127.0.0.1';
  http.createServer(handleRequest).listen(port,host,()=>console.log(`Ouro Verde API: http://${host}:${port}`));
}
