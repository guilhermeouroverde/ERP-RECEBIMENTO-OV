'use strict';
function question(prompt,{secret=false}={}){
  if(!process.stdin.isTTY||!process.stdout.isTTY)return Promise.reject(new Error('Execute em um terminal interativo. Nao envie senhas por argumentos ou arquivos publicos.'));
  return new Promise((resolve,reject)=>{
    let value='';process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
    function finish(err){process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');err?reject(err):resolve(value);}
    function onData(chunk){for(const char of chunk){
      if(char==='\u0003')return finish(new Error('Cancelado.'));
      if(char==='\r'||char==='\n')return finish();
      if(char==='\u007f'||char==='\b'){if(value.length){value=Array.from(value).slice(0,-1).join('');if(!secret)process.stdout.write('\b \b');}continue;}
      if(char<' ')continue;value+=char;if(!secret)process.stdout.write(char);
    }}
    process.stdin.on('data',onData);
  });
}
async function newPassword(username,oldPassword){
  const {validateNewPassword,hashPassword}=require('../lib/password');
  for(;;){
    const value=await question(`Senha NOVA de ${username} (12+ caracteres; nao aparece): `,{secret:true});
    try{validateNewPassword(value);if(value===oldPassword)throw new Error('Nao reutilize a senha antiga que pode ter sido exposta.');}catch(e){console.log(e.message);continue;}
    const confirm=await question('Repita a senha: ',{secret:true});if(confirm!==value){console.log('As senhas nao coincidem.');continue;}
    return hashPassword(value);
  }
}
module.exports={question,newPassword};
