'use strict';
// Local, offline operator utility. Uses the same inventory rules as the game server.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const readline=require('node:readline/promises');
const {Players}=require('../lib/players'),{grantItems,items}=require('../lib/inventory');
function busy(port){return new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});let done=false;function end(value){if(done)return;done=true;socket.destroy();resolve(value);}socket.once('connect',()=>end(true));socket.once('error',e=>end(e.code!=='ECONNREFUSED'));socket.setTimeout(1000,()=>end(true));});}
async function assertStopped(){for(const port of [Number(process.env.HEROS_AUTH_PORT||10000),Number(process.env.HEROS_GAME_PORT||11000)])if(await busy(port))throw Error('Остановите игровой сервер (занят порт '+port+').');}
async function main(){
 await assertStopped();const root=path.resolve(__dirname,'..'),accountFile=path.join(root,'data/accounts.json');
 if(!fs.existsSync(accountFile))throw Error('Сначала зарегистрируйте аккаунт на сайте.');
 const accounts=JSON.parse(fs.readFileSync(accountFile,'utf8')).accounts;console.table(accounts.map(u=>({ID:u.id,account:u.username})));
 console.log('Тестовые ID из клиента: 5 — дерево; 611000 — лук; 612900 — копьё; 800201 — одежда.');
 const input=readline.createInterface({input:process.stdin,output:process.stdout});
 try{
  const id=Number(await input.question('ID аккаунта: ')),itemId=Number(await input.question('ID предмета: ')),amount=Number(await input.question('Количество: '));
  const account=accounts.find(u=>u.id===id);if(!account||!items.has(itemId))throw Error('Неверный аккаунт или ID предмета.');
  await assertStopped();
  const players=new Players(path.join(root,'data/players.json'));
  // Preserve the complete pre-grant database before the explicit operator mutation.
  if(fs.existsSync(players.file))fs.copyFileSync(players.file,players.file+'.before-grant-'+Date.now()+'.bak');
  grantItems({players},players.ensure(account),itemId,amount);
  console.log('Сохранено: аккаунт '+id+', предмет '+itemId+', количество '+amount+'. Можно запускать сервер.');
 }finally{input.close();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
