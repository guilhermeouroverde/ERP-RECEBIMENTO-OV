'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),src=path.join(root,'public'),out=path.join(root,'dist');
if(!fs.existsSync(path.join(src,'index.html')))throw new Error('Pasta public/index.html ausente. Mantenha sua pasta public atual na raiz do projeto.');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const allowed=new Set(['.html','.js','.css','.png','.svg','.jpg','.jpeg','.webp','.gif','.ico','.woff','.woff2','.ttf','.map']);
let files=0;
function copy(dir,dest){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const input=path.join(dir,entry.name),output=path.join(dest,entry.name);
  if(entry.isSymbolicLink())throw new Error('Links simbolicos nao permitidos em public.');
  if(entry.name.startsWith('.')||/ouro_verde.*\.json|auditoria\.json|backup|\.env/i.test(entry.name))throw new Error('Arquivo privado encontrado em public. Retire antes de publicar: '+entry.name);
  if(entry.isDirectory()){fs.mkdirSync(output,{recursive:true});copy(input,output);continue;}
  if(!allowed.has(path.extname(entry.name).toLowerCase()))throw new Error('Tipo nao autorizado para publicacao: '+entry.name);
  if(entry.name==='index.html'){
    let html=fs.readFileSync(input,'utf8');
    // Only remove hard-coded login defaults. The source public/index.html is unchanged.
    html=html.replace(/<input\b[^>]*>/gi,tag=>/\bname\s*=\s*['"](?:password|username)['"]/i.test(tag)?tag.replace(/\svalue\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,''):tag);
    fs.writeFileSync(output,html);
  } else fs.copyFileSync(input,output);
  files++;
}}
copy(src,out);console.log(`Interface preparada: ${files} arquivos. Nenhum banco foi copiado para dist.`);
