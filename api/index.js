'use strict';
const {handleRequest}=require('../server');
module.exports=async function handler(req,res){
  // Preserve the API path when Vercel forwards it through this entrypoint.
  const url=new URL(req.url,'http://localhost');
  const routed=url.searchParams.get('__ov_path');
  if(url.pathname==='/api/index'&&routed!==null){
    url.pathname='/api/'+routed.replace(/^\/+/, '');
  }
  url.searchParams.delete('__ov_path');
  req.url=url.pathname+url.search;
  return handleRequest(req,res);
};
