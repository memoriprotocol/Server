'use strict';
const {spawn}=require('node:child_process');
const readline=require('node:readline');

// Keep the terminal in a small parent process so a restart reloads every JS and
// JSON module. Works with both START_SERVER.bat and plain `node server.js`.
function supervise(entry,{input=process.stdin,output=process.stdout}={}){
 let child=null,restarting=false,stopping=false,killTimer=null;
 const interactive=!!input.isTTY&&typeof input.setRawMode==='function';
 const wasRaw=!!input.isRaw;
 function cleanup(){
  clearTimeout(killTimer);
  input.removeListener('keypress',onKey);
  if(interactive){input.setRawMode(wasRaw);input.pause();}
 }
 function launch(){
  restarting=false;
  child=spawn(process.execPath,[entry,...process.argv.slice(2)],{
   cwd:process.cwd(),env:{...process.env,HEROS_SERVER_WORKER:'1'},
   stdio:['ignore','inherit','inherit','ipc']
  });
  output.write(`[SERVER] Worker PID=${child.pid}; Ctrl+R: restart, Ctrl+C: stop.\n`);
  child.on('error',err=>{console.error('[SERVER]',err.message);cleanup();process.exitCode=1;});
  child.on('exit',(code,signal)=>{
   child=null;clearTimeout(killTimer);killTimer=null;
   if(restarting&&!stopping)return launch();
   cleanup();process.exitCode=stopping?0:(code??(signal?1:0));
   if(process.connected)process.disconnect();
  });
 }
 function requestStop(restart){
  if(stopping||restarting)return;
  restarting=restart;stopping=!restart;
  if(!child){cleanup();return;}
  output.write(restart?'[SERVER] Restart requested; saving state...\n':'[SERVER] Stopping; saving state...\n');
  const target=child;
  if(target.connected)target.send({type:'heros:shutdown'},err=>{if(err)target.kill();});
  else target.kill();
  killTimer=setTimeout(()=>{console.error('[SERVER] Shutdown timeout; terminating worker.');target.kill('SIGKILL');},5000);
  killTimer.unref?.();
 }
 function onKey(_str,key){
  if(key?.ctrl&&key.name==='r')requestStop(true);
  if(key?.ctrl&&key.name==='c')requestStop(false);
 }
 process.once('SIGTERM',()=>requestStop(false));
 process.once('SIGINT',()=>requestStop(false));
 if(interactive){readline.emitKeypressEvents(input);input.setRawMode(true);input.on('keypress',onKey);input.resume();}
 else output.write('[SERVER] Ctrl+R requires an interactive server console.\n');
 launch();
 return {restart:()=>requestStop(true),stop:()=>requestStop(false)};
}

function installWorkerShutdown({accounts,players,game,rtc,authServer,gameServer}){
 let stopping=false;
 function shutdown(){
  if(stopping)return;stopping=true;
  let code=0;
  clearInterval(game.worldTimer);game.heartbeats.stop?.();
  try{players.save();accounts.flush();console.log('[SERVER] State saved.');}
  catch(err){code=1;console.error('[SERVER] Save failed:',err.message);}
  for(const state of game.online)state.ws?.close?.();
  for(const client of rtc.peers||[])client.ws?.close?.();
  authServer.close();gameServer.close();
  authServer.closeAllConnections?.();gameServer.closeAllConnections?.();
  // Close frames are flushed before exit; the supervisor waits for the exit
  // event before starting the next worker, so ports cannot overlap.
  setTimeout(()=>process.exit(code),100);
 }
 process.on('message',message=>{if(message?.type==='heros:shutdown')shutdown();});
 process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
 process.on('disconnect',shutdown);
 return shutdown;
}
module.exports={supervise,installWorkerShutdown};
