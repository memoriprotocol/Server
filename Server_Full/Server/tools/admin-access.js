'use strict';
/** Local, offline developer-role manager for the independent HeroLand 3.12.7 auth server.
 * Usage: node Server/tools/admin-access.js           (interactive)
 *        node Server/tools/admin-access.js list
 *        node Server/tools/admin-access.js grant LOGIN_OR_ID
 *        node Server/tools/admin-access.js revoke LOGIN_OR_ID
 * The game auth server must be stopped: it caches accounts.json in memory.
 */
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const {stdin,stdout} = require('node:process');
const SERVER_ROOT = path.resolve(__dirname, '..');
const FILE = path.join(SERVER_ROOT, 'data', 'accounts.json');
const ROLE = 'developer';
const PORT = Number(process.env.HEROS_AUTH_PORT || 10000);
const HOST = process.env.HEROS_HOST || '127.0.0.1';
function portOpen(host,port){return new Promise(resolve=>{
  if(!Number.isInteger(port)||port<1||port>65535)return resolve(true);
  const socket = net.createConnection({host,port});let settled=false;
  const done = result=>{if(settled)return;settled=true;socket.destroy();resolve(result);};
  socket.setTimeout(1200,()=>done(false));socket.once('connect',()=>done(true));socket.once('error',()=>done(false));
});}
function loadDB(){
  if(!fs.existsSync(FILE))throw Error('База аккаунтов не найдена: '+FILE+'\nСначала зарегистрируйте аккаунт на сайте.');
  const raw=fs.readFileSync(FILE,'utf8');let db;
  try{db=JSON.parse(raw);}catch(e){throw Error('Неправильный формат accounts.json. Файл не изменён.');}
  if(!db||!Array.isArray(db.accounts)||!db.accounts.every(x=>x&&Number.isSafeInteger(x.id)&&x.id>0&&typeof x.username==='string')||!Array.isArray(db.audit))throw Error('Неизвестная структура базы. Изменение отменено.');
  return {db,raw};
}
function printAccounts(db){
  if(!db.accounts.length){console.log('Зарегистрированных аккаунтов пока нет.');return;}
  console.log('\nID    Логин                            Роль          Состояние');
  console.log('-------------------------------------------------------------------');
  for(const u of [...db.accounts].sort((a,b)=>a.id-b.id))console.log(String(u.id).padEnd(5),String(u.username).slice(0,32).padEnd(32),String(u.role||'user').padEnd(13),u.status||'active');
  console.log('');
}
function findUser(db,selector){const input=String(selector||'').trim();if(!input)throw Error('Не выбран аккаунт.');const matches=db.accounts.filter(x=>x.username.toLowerCase()===input.toLowerCase()||(String(x.id)===input));if(matches.length!==1)throw Error('Аккаунт не найден или совпадение неоднозначно: '+input);return matches[0];}
function backupAndSave(db,raw){
  const bdir=path.join(SERVER_ROOT,'data','admin-backups');fs.mkdirSync(bdir,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');const bfile=path.join(bdir,`accounts-${stamp}-${crypto.randomBytes(3).toString('hex')}.json`);
  fs.writeFileSync(bfile,raw,{flag:'wx',mode:0o600});
  const temp=FILE+'.admin-'+process.pid+'-'+crypto.randomBytes(4).toString('hex')+'.tmp';
  try{fs.writeFileSync(temp,JSON.stringify(db,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temp,FILE);}catch(e){try{fs.unlinkSync(temp);}catch(_){}throw Error('Не удалось обновить базу: '+e.message+'\nРезервная копия: '+bfile);}
  return bfile;
}
async function change(action,selector){
  // The independent server loads the file once. An offline change while running
  // would be discarded by its next flush, so never attempt it.
  if(await portOpen(HOST,PORT)||HOST!=='127.0.0.1'&&await portOpen('127.0.0.1',PORT)||await portOpen('::1',PORT)){
    throw Error('Порт '+PORT+' занят. СНАЧАЛА закройте START_SERVER.bat нового сервера, затем запустите этот BAT повторно.');
  }
  const {db,raw}=loadDB();const u=findUser(db,selector);
  if(u.status&&u.status!=='active')throw Error('Аккаунт '+u.username+' имеет статус '+u.status+'. Сначала снимите ограничения.');
  const developers=db.accounts.filter(x=>x.role===ROLE);
  if(action==='revoke'&&u.role===ROLE&&developers.length===1)throw Error('Нельзя отозвать права у последнего разработчика.');
  const previous=String(u.role||'user');
  if(action==='grant'){
    if(u.role===ROLE&&u.admin===true){console.log('Права уже выданы:',u.username);return;}
    u.role='developer';u.admin=true;u.permissions=['*'];
  }else if(action==='revoke'){
    if(u.role!=='developer'&&u.role!=='admin'){console.log('У пользователя уже обычные права:',u.username);return;}
    u.role='user';u.admin=false;u.permissions=[];
  }else throw Error('Неверное действие: '+action);
  u.permissionVersion=(Number.isSafeInteger(u.permissionVersion)&&u.permissionVersion>=0?u.permissionVersion:0)+1;
  db.audit.push({at:new Date().toISOString(),actor:0,command:'local-admin-cli-'+action,data:{targetId:u.id,username:u.username,from:previous,to:u.role}});
  if(db.audit.length>1000)db.audit.splice(0,db.audit.length-1000);
  const bfile=backupAndSave(db,raw);
  console.log('\nГОТОВО. Аккаунт: '+u.username+' (ID '+u.id+')');
  console.log('Роль: '+u.role+(u.role==='developer'?' — полный доступ к панели сайта':''));
  console.log('Резервная копия: '+bfile);
  console.log('Теперь запустите игровой сервер и обновите страницу http://127.0.0.1:3000/admin');
}
async function main(args){
  if(args[0]==='list'||args[0]==='--list'){printAccounts(loadDB().db);return;}
  if(['grant','revoke'].includes(args[0])&&args[1]){await change(args[0],args[1]);return;}
  if(args.length)throw Error('Использование: node Server/tools/admin-access.js [list | grant ЛОГИН | revoke ЛОГИН]');
  const r=readline.createInterface({input:stdin,output:stdout});
  try{
    const {db}=loadDB();printAccounts(db);
    if(!db.accounts.length)return;
    const selected=(await r.question('Введите логин или ID своего аккаунта: ')).trim();
    const user=findUser(db,selected);
    const choice=(await r.question('1 — выдать полную админку; 2 — забрать админку; 0 — выход: ')).trim();
    if(choice==='0')return;
    if(choice!=='1'&&choice!=='2')throw Error('Неизвестный пункт меню.');
    const confirmation=(await r.question('Для подтверждения повторно введите логин '+user.username+': ')).trim();
    if(confirmation.toLowerCase()!==user.username.toLowerCase())throw Error('Логин не совпал. Ничего не изменено.');
    await change(choice==='1'?'grant':'revoke',String(user.id));
  }finally{r.close();}
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error('\nОШИБКА: '+e.message);process.exitCode=1;});
module.exports={findUser,loadDB,printAccounts,change};
