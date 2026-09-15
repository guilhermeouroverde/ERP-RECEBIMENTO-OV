'use strict';
// Run LOCALLY only. Sends the local data to a NEW test database, never overwrites.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const assert=require('node:assert/strict');
const {SupabaseStore}=require('../lib/store');const {question,newPassword}=require('./terminal');
function stripSecrets(value){
  if(Array.isArray(value))return value.map(stripSecrets);
  if(value&&typeof value==='object'){const out={};for(const [k,v] of Object.entries(value)){if(['password','password_hash','passwordHash','senha'].includes(k))continue;out[k]=stripSecrets(v);}return out;}
  return value;
}
function validateData(db){
  for(const key of ['users','producers','transactions']){
    if(!Array.isArray(db[key]))throw new Error(`Campo ${key} ausente ou invalido. Use o arquivo completo do ERP.`);
    const seen=new Set();for(const row of db[key]){if(!Number.isSafeInteger(row.id)||row.id<1||seen.has(row.id))throw new Error(`ID ausente ou repetido em ${key}. Importacao bloqueada para evitar sobrescrita.`);seen.add(row.id);}
  }
  const seen=new Set();for(const u of db.users){const un=String(u.username||'').trim().toLowerCase();if(!/^[a-z0-9_.-]{3,80}$/.test(un)||seen.has(un))throw new Error('Usuario invalido ou repetido.');seen.add(un);}
  if(!db.users.some(u=>u.active!==false&&u.role==='admin'))throw new Error('Administrador ativo ausente.');
  for(const [seq,arr] of [['producer','producers'],['transaction','transactions']]){
    if(!Number.isSafeInteger(db.seq?.[seq])||db.seq[seq]<=Math.max(0,...db[arr].map(x=>x.id)))throw new Error(`Contador ${seq} inconsistente. Nao foi corrigido automaticamente; confira a base antes de importar.`);
  }
}
function fileHash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
async function main(){
  const mainPath=path.resolve(process.argv[2]||'data/ouro_verde.json'),auditPath=path.resolve(process.argv[3]||'data/auditoria.json');
  if(!fs.existsSync(mainPath)||!fs.existsSync(auditPath))throw new Error('Arquivos locais ausentes. Informe ouro_verde.json e auditoria.json atuais; nao os envie ao GitHub.');
  const rawMain=fs.readFileSync(mainPath),rawAudit=fs.readFileSync(auditPath);
  const source=JSON.parse(rawMain.toString('utf8')),audit=JSON.parse(rawAudit.toString('utf8'));validateData(source);
  const store=new SupabaseStore();store.assertConfigured();const status=await store.rpc('ov_status');
  if(status.initialized)throw new Error('Banco ja inicializado. Este importador NAO substitui dados nem acrescenta duplicatas. Use um projeto de teste vazio.');
  console.log('Destino: '+store.url+'\nOrigem: '+mainPath+`\nProdutores: ${source.producers.length}\nLancamentos: ${source.transactions.length}\nAuditoria: ${(audit.items||[]).length} linhas`);
  console.log('Pesos, datas, tickets, valores, codigos e vinculos serao copiados sem recalcular. As senhas antigas NAO serao copiadas.');
  const hashes={main:crypto.createHash('sha256').update(rawMain).digest('hex'),audit:crypto.createHash('sha256').update(rawAudit).digest('hex')};
  const credentials=[];
  for(const u of source.users.filter(u=>u.active!==false)){
    credentials.push({id:u.id,username:String(u.username).trim().toLowerCase(),name:u.name,role:u.role,active:true,password_hash:await newPassword(u.username,u.password)});
  }
  if((await question('Digite IMPORTAR para gravar no banco de teste: '))!=='IMPORTAR')throw new Error('Cancelado. Nenhum dado importado.');
  assert.equal(fileHash(mainPath),hashes.main,'A base local mudou. Pare o servidor antes de importar.');assert.equal(fileHash(auditPath),hashes.audit,'A auditoria local mudou. Pare o servidor antes de importar.');
  const backupDir=path.join(path.dirname(mainPath),'backup_antes_online_'+new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(backupDir,{recursive:true});fs.writeFileSync(path.join(backupDir,'ouro_verde.json'),rawMain);fs.writeFileSync(path.join(backupDir,'auditoria.json'),rawAudit);
  const targetMain=stripSecrets(source),targetAudit=stripSecrets(audit);
  const result=await store.rpc('ov_initialize',{p_main:targetMain,p_audit:targetAudit,p_credentials:credentials});
  if(!result.ok)throw new Error('O banco nao confirmou a importacao. Nao repita sem conferir.');
  const snapshot=await store.snapshot(true);assert.deepStrictEqual(snapshot.main,targetMain);assert.deepStrictEqual(snapshot.audit,targetAudit);
  assert.equal(fileHash(mainPath),hashes.main);assert.equal(fileHash(auditPath),hashes.audit);
  const report={at:new Date().toISOString(),source_sha256:hashes,counts:{producers:source.producers.length,transactions:source.transactions.length,audit_items:(audit.items||[]).length},equal_after_readback:true,source_files_unchanged:true,removed_fields:['password','password_hash','passwordHash','senha'],target:store.url};
  fs.writeFileSync(path.join(backupDir,'CONFERENCIA_IMPORTACAO.json'),JSON.stringify(report,null,2));
  console.log('Importacao conferida por releitura do banco. Arquivos locais intactos. Backup: '+backupDir);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={stripSecrets,validateData};
