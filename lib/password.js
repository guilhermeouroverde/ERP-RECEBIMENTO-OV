'use strict';
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const params={N:32768,r:8,p:1,maxmem:67108864};
function validateNewPassword(password){
  if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('Use uma senha NOVA de 12 a 128 caracteres.');
  if(/^(.)(\1)+$/.test(password)||['123456789012','abcdefghijkl','password1234','guilhermeadmin'].includes(password.toLowerCase()))throw new Error('Escolha uma senha menos previsivel.');
}
async function hashPassword(password){validateNewPassword(password);const salt=crypto.randomBytes(16);const key=await scrypt(password,salt,32,params);return ['scrypt',params.N,params.r,params.p,salt.toString('hex'),key.toString('hex')].join('$');}
async function verifyPassword(password,encoded){
  const parts=String(encoded||'').split('$');
  if(parts.length!==6||parts[0]!=='scrypt'||parts[1]!=='32768'||parts[2]!=='8'||parts[3]!=='1'||!/^([0-9a-f]{32})$/.test(parts[4])||!/^([0-9a-f]{64})$/.test(parts[5]))return false;
  const actual=await scrypt(String(password),Buffer.from(parts[4],'hex'),32,params);
  return crypto.timingSafeEqual(actual,Buffer.from(parts[5],'hex'));
}
const DUMMY=['scrypt',32768,8,1,'00000000000000000000000000000000','0'.repeat(64)].join('$');
module.exports={hashPassword,verifyPassword,validateNewPassword,DUMMY};
