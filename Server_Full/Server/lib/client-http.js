'use strict';
function clientHttp(req,res,url,accounts,ports){
 const p=url.pathname,method=req.method;
 if(!p.startsWith('/client/')&&!['/local-update/remote_version.json','/local-update/maintenance.json'].includes(p))return false;
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 if(method==='OPTIONS'){res.statusCode=204;res.end();return true;}
 if(method==='GET'&&/^\/client\/notices\/(out_game|in_game|marquee)\/\d+\/index\.json$/.test(p)){send(200,{});return true;}
 if(method==='GET'&&p==='/local-update/maintenance.json'){send(200,{open:false,isOpen:false,maintenance:false,list:[]});return true;}
 if(method==='GET'&&p==='/local-update/remote_version.json'){send(200,{version:'3.12.7',reviewVersion:'3.12.7',versionName:'3.12.7',versionCode:3127,forceUpdate:false});return true;}
 if(method==='POST'&&['/client/gateway','/client/ping','/client/telemetry'].includes(p)){
  let text='',size=0,tooLarge=false;req.on('data',chunk=>{size+=chunk.length;if(size>256*1024){tooLarge=true;return;}text+=chunk;});req.on('end',()=>{
   if(tooLarge){send(413,{code:1,message:'REQUEST_TOO_LARGE'});return;}
   if(p!=='/client/gateway'){send(200,{code:0,success:true,data:{}});return;}
   let b;try{b=JSON.parse(text);}catch{send(400,{code:1});return;}
   const user=accounts.identify(b.token);if(!user||String(b.account)!==String(user.id)){send(401,{code:10,message:'LOCAL_LOGIN_REQUIRED'});return;}
   send(200,{code:0,data:{host:'127.0.0.1',port:ports.gamePort}});
  });req.on('error',()=>{if(!res.writableEnded)res.destroy();});return true;
 }
 send(404,{code:1,message:'NOT_FOUND'});return true;
}
module.exports={clientHttp};
