'use strict';
const crypto=require('node:crypto');
class AppError extends Error { constructor(status,message,code='ERROR'){super(message);this.status=status;this.code=code;} }
function json(res,status,data){
  const b=Buffer.from(JSON.stringify(data));
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':b.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(b);
}
async function readBody(req){
  if(req._ovBody!==undefined)return req._ovBody;
  let parsed;
  // Node function helpers can consume the stream before our legacy handler.
  try{parsed=req.body;}catch{throw new AppError(400,'JSON invalido.','INVALID_JSON');}
  if(parsed!==undefined&&parsed!==null){
    if(Buffer.isBuffer(parsed))parsed=parsed.toString('utf8');
    if(typeof parsed==='string'){try{parsed=JSON.parse(parsed||'{}');}catch{throw new AppError(400,'JSON invalido.','INVALID_JSON');}}
  } else {
    const parts=[];let length=0;
    for await(const chunk of req){length+=Buffer.byteLength(chunk);if(length>1048576)throw new AppError(413,'Requisicao muito grande.','TOO_LARGE');parts.push(Buffer.from(chunk));}
    try{parsed=JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');}catch{throw new AppError(400,'JSON invalido.','INVALID_JSON');}
  }
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new AppError(400,'Envie um objeto JSON.','INVALID_BODY');
  if(Buffer.byteLength(JSON.stringify(parsed))>1048576)throw new AppError(413,'Requisicao muito grande.','TOO_LARGE');
  req._ovBody=parsed;return parsed;
}
function readCookies(req){const out={};for(const pair of String(req.headers.cookie||'').split(';')){const i=pair.indexOf('=');if(i<1)continue;try{out[pair.slice(0,i).trim()]=decodeURIComponent(pair.slice(i+1));}catch{}}return out;}
function sha256(value){return crypto.createHash('sha256').update(String(value)).digest('hex');}
class CapturedResponse {
  constructor(){this.statusCode=200;this.headers={};this.parts=[];this.ended=false;}
  setHeader(k,v){this.headers[k]=v;}
  writeHead(status,headers={}){this.statusCode=status;Object.assign(this.headers,headers);return this;}
  write(chunk){if(chunk)this.parts.push(Buffer.from(chunk));return true;}
  end(chunk){this.write(chunk);this.ended=true;return this;}
  flush(res){res.writeHead(this.statusCode,{...this.headers,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(Buffer.concat(this.parts));}
}
module.exports={AppError,json,readBody,readCookies,sha256,CapturedResponse};
