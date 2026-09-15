'use strict';
const {AppError}=require('./transport');
class SupabaseStore {
  constructor(env=process.env,fetcher=fetch){
    this.url=String(env.SUPABASE_URL||'').replace(/\/$/,'');
    this.key=String(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||'');
    this.fetcher=fetcher;
  }
  isConfigured(){return !!this.url&&!!this.key;}
  assertConfigured(){
    if(!this.isConfigured())throw new AppError(503,'API publicada, mas o banco online ainda nao foi configurado. Configure SUPABASE_URL e SUPABASE_SECRET_KEY na Vercel.','DATABASE_NOT_CONFIGURED');
    let url;try{url=new URL(this.url);}catch{throw new AppError(503,'SUPABASE_URL invalida.','DATABASE_NOT_CONFIGURED');}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new AppError(503,'Use a URL HTTPS do projeto Supabase.','DATABASE_NOT_CONFIGURED');
    if(!this.key.startsWith('sb_secret_')){
      let claims;try{claims=JSON.parse(Buffer.from(this.key.split('.')[1],'base64url').toString());}catch{}
      if(!claims||claims.role!=='service_role')throw new AppError(503,'Configure uma chave SECRET ou service_role, somente no servidor.','DATABASE_NOT_CONFIGURED');
    }
  }
  async rpc(name,args={}){
    this.assertConfigured();
    if(!/^ov_[a-z_]+$/.test(name))throw new Error('Invalid RPC name');
    const headers={'apikey':this.key,'Content-Type':'application/json','Accept':'application/json'};
    if(this.key.startsWith('eyJ'))headers.Authorization='Bearer '+this.key;
    let response;
    try{response=await this.fetcher(this.url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});}catch{throw new AppError(503,'Nao foi possivel consultar o banco. Nenhuma confirmacao de gravacao foi recebida.','DATABASE_UNAVAILABLE');}
    let data;try{data=await response.json();}catch{throw new AppError(503,'Resposta invalida do banco.','DATABASE_UNAVAILABLE');}
    if(!response.ok){
      const code=String(data?.code||'');
      console.error('Database RPC failed:',name,response.status,code);
      if(code==='PGRST202'||code==='42P01')throw new AppError(503,'Estrutura do banco ausente. Execute sql/01_estrutura.sql no projeto Supabase.','SCHEMA_NOT_INSTALLED');
      throw new AppError(503,'O banco recusou a operacao. Confira os logs do servidor, sem divulgar chaves.','DATABASE_ERROR');
    }
    return data;
  }
  async snapshot(includeAudit=false){
    const r=await this.rpc('ov_read_state',{p_include_audit:includeAudit});
    if(!r?.main)throw new AppError(503,'Banco conectado, mas os dados ainda nao foram importados. Execute a importacao local.','DATABASE_NOT_INITIALIZED');
    return r;
  }
  async commit(snapshot,state,user,action){
    const r=await this.rpc('ov_commit_state',{
      p_expected_main_revision:snapshot.main_revision,
      p_expected_audit_revision:snapshot.audit_revision??null,
      p_main:state.dirtyMain?state.db:null,
      p_audit:state.dirtyAudit?state.audit:null,
      p_actor:user.id,p_action:action
    });
    if(!r?.ok){if(r?.conflict)throw new AppError(409,'Outro usuario alterou os dados durante esta operacao. Sua alteracao NAO foi salva. Atualize a tela e confira antes de tentar novamente.','EDIT_CONFLICT');throw new AppError(503,'Alteracao nao confirmada pelo banco.','DATABASE_ERROR');}
    return r;
  }
}
module.exports={SupabaseStore};
