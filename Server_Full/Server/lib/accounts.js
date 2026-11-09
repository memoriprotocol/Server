'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const makeToken=()=>crypto.randomBytes(32).toString('base64url');
class Accounts{
 constructor(file){this.file=file;fs.mkdirSync(path.dirname(file),{recursive:true});this.db={accounts:[],sessions:{},tickets:{},usedTickets:{},audit:[],nextId:1};if(fs.existsSync(file))this.db={...this.db,...JSON.parse(fs.readFileSync(file,'utf8'))};this.flush();}
 flush(){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.db,null,2),{mode:0o600});fs.renameSync(tmp,this.file);}
 clean(){const now=Date.now();for(const [k,v] of Object.entries(this.db.sessions))if(v.expires<=now)delete this.db.sessions[k];for(const [k,v] of Object.entries(this.db.tickets))if(v.expires<=now)delete this.db.tickets[k];for(const [k,v] of Object.entries(this.db.usedTickets||{}))if(v.expires<=now)delete this.db.usedTickets[k];}
 hash(password,salt=crypto.randomBytes(16).toString('hex')){return salt+':'+crypto.scryptSync(String(password),salt,64).toString('hex');}
 userById(id){return this.db.accounts.find(x=>x.id===Number(id))||null;}
 public(u){return {accountId:u.id,username:u.username,launcherName:u.launcherName,role:u.role||'user',admin:!!u.admin,permissions:u.permissions||[],permissionVersion:u.permissionVersion||0,status:u.status||'active',restrictionReason:u.restrictionReason||'',restrictionUntil:u.restrictionUntil||null};}
 register(b){const username=String(b.username||'').trim(),password=String(b.password||''),launcherName=String(b.launcherName||username).trim();if(!/^[\w.-]{3,32}$/.test(username)||password.length<8||password.length>256||!launcherName||launcherName.length>32)return {ok:false,code:'INVALID_INPUT'};if(this.db.accounts.some(x=>x.username.toLowerCase()===username.toLowerCase()))return {ok:false,code:'USERNAME_EXISTS'};
 const owner=process.env.HEROS_OWNER_USERNAME&&process.env.HEROS_OWNER_USERNAME.toLowerCase()===username.toLowerCase()&&!this.db.accounts.some(x=>x.role==='developer');const u={id:this.db.nextId++,username,launcherName,passwordHash:this.hash(password),role:owner?'developer':'user',admin:!!owner,permissions:owner?['*']:[],status:'active',permissionVersion:0,createdAt:new Date().toISOString()};this.db.accounts.push(u);this.flush();return {ok:true,...this.public(u)};}
 login(b){const username=String(b.username||'').toLowerCase(),u=this.db.accounts.find(x=>x.username.toLowerCase()===username);if(!u)return {ok:false,code:'INVALID_CREDENTIALS'};const [salt,h]=u.passwordHash.split(':');if(!salt||!h)return {ok:false,code:'INVALID_CREDENTIALS'};const attempt=crypto.scryptSync(String(b.password||''),salt,64),expected=Buffer.from(h,'hex');if(attempt.length!==expected.length||!crypto.timingSafeEqual(attempt,expected))return {ok:false,code:'INVALID_CREDENTIALS'};if(!this.allowed(u))return {ok:false,code:u.status==='banned'?'ACCOUNT_BANNED':'ACCOUNT_SUSPENDED',reason:u.restrictionReason,until:u.restrictionUntil};const token=makeToken();this.db.sessions[token]={id:u.id,expires:Date.now()+7*86400000};this.flush();return {ok:true,token,...this.public(u)};}
 allowed(u){if(u.status==='banned')return false;if(u.status==='suspended'){if(Date.parse(u.restrictionUntil||'')>Date.now())return false;u.status='active';u.restrictionUntil=null;this.flush();}return true;}
 identify(token){const sess=this.db.sessions[String(token||'')];if(!sess||sess.expires<Date.now())return null;const u=this.userById(sess.id);return u&&this.allowed(u)?u:null;}
 revoke(token){delete this.db.sessions[String(token||'')];this.flush();}
 ticket(token){const u=this.identify(token);if(!u)return {ok:false,code:'AUTH_REQUIRED'};this.clean();const ticket=makeToken();this.db.tickets[ticket]={id:u.id,expires:Date.now()+60000};this.flush();return {ok:true,ticket,expiresIn:60,expiresAt:new Date(this.db.tickets[ticket].expires).toISOString()};}
 exchange(ticket){this.clean();const row=this.db.tickets[String(ticket||'')];if(!row)return {ok:false,code:'INVALID_LAUNCH_TICKET'};delete this.db.tickets[ticket];this.db.usedTickets[ticket]={id:row.id,expires:Date.now()+300000};const u=this.userById(row.id);if(!u||!this.allowed(u)){this.flush();return {ok:false,code:'ACCOUNT_BLOCKED'};}const token=makeToken();this.db.sessions[token]={id:u.id,expires:Date.now()+7*86400000};this.flush();return {ok:true,token,...this.public(u)};}
 ticketStatus(token,ticket){const u=this.identify(token);if(!u)return {ok:false,code:'AUTH_REQUIRED'};
  const pending=this.db.tickets[String(ticket||'')],used=this.db.usedTickets?.[String(ticket||'')];
  if(pending?.id===u.id)return {ok:true,status:pending.expires>Date.now()?'pending':'expired'};
  if(used?.id===u.id)return {ok:true,status:'consumed'};
  return {ok:true,status:'invalid'};
 }
 profile(token){const u=this.identify(token);return u?{ok:true,...this.public(u)}:{ok:false,code:'INVALID_CREDENTIALS'};}
 changePassword(token,old,next){const u=this.identify(token);if(!u)return {ok:false,code:'AUTH_REQUIRED'};if(!next||String(next).length<8)return {ok:false,code:'INVALID_INPUT'};const [salt,h]=u.passwordHash.split(':'),p=crypto.scryptSync(String(old||''),salt,64),e=Buffer.from(h,'hex');if(p.length!==e.length||!crypto.timingSafeEqual(p,e))return {ok:false,code:'PASSWORD_MISMATCH'};u.passwordHash=this.hash(next);this.flush();return {ok:true};}
 changeName(token,name){const u=this.identify(token);if(!u)return {ok:false,code:'AUTH_REQUIRED'};if(!name||String(name).length>32)return {ok:false,code:'INVALID_INPUT'};u.launcherName=String(name).trim();this.flush();return {ok:true,...this.public(u)};}
 asAdmin(token){const u=this.identify(token);return u&&(u.admin||['admin','developer'].includes(u.role))?u:null;}
 audit(actor,command,data){this.db.audit.push({id:Date.now(),at:new Date().toISOString(),actor:actor?.id||0,actorId:actor?.id||0,actorName:actor?.launcherName||actor?.username||'',command,data,params:data,ok:true,success:true});if(this.db.audit.length>1000)this.db.audit.splice(0,this.db.audit.length-1000);this.flush();}
}
module.exports={Accounts};
