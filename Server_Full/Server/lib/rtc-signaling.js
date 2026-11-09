'use strict';
// Authenticated local WebRTC signaling (offer/answer/ICE), separate from the 2024 Tencent GME SDK.
const {websocketUpgrade}=require('./wire');
const LOOPBACK=new Set(['127.0.0.1','::1','::ffff:127.0.0.1']);
const message=(type,body={})=>JSON.stringify({type,...body});
class LocalRtcSignaling{
 constructor(accounts,game){this.accounts=accounts;this.game=game;this.peers=new Set();this.counts={connected:0,relayed:0,rejected:0};}
 roomOf(uid){const s=[...this.game.online].find(x=>x.user?.id===uid&&x.world?.sceneReady);return s?.world?.room||null;}
 status(){return {ok:true,service:'local-webrtc-signaling',connected:[...this.peers].filter(x=>x.user).length,stats:{...this.counts},gmeVoiceAvailable:false,note:'This signaling service does not replace the proprietary Tencent GME audio transport.'};}
 attach(httpServer){httpServer.on('upgrade',(req,socket)=>{
  const url=new URL(req.url||'/','http://127.0.0.1');
  if(url.pathname!=='/rtc/signal'||!LOOPBACK.has(socket.remoteAddress||'')){socket.destroy();return;}
  const peer={user:null,ws:null,count:0,window:Date.now()};
  const send=(t,payload)=>{try{peer.ws?.sendText(message(t,payload))}catch(_){}};
  const fail=(why)=>{this.counts.rejected++;send('error',{code:why});};
  const close=()=>{this.peers.delete(peer);};
  const receive=(buffer)=>{
   if(buffer.length>65536){fail('PAYLOAD_TOO_LARGE');peer.ws.close();return;}
   const now=Date.now();if(now-peer.window>=1000){peer.window=now;peer.count=0;}if(++peer.count>30){fail('RATE_LIMIT');return;}
   let msg;try{msg=JSON.parse(buffer.toString('utf8'));}catch(_){fail('INVALID_JSON');return;}
   if(!msg||typeof msg!=='object'||Array.isArray(msg)){fail('INVALID_MESSAGE');return;}
   if(!peer.user){if(msg.type!=='auth'||typeof msg.token!=='string')return fail('AUTH_REQUIRED');
    const user=this.accounts.identify(msg.token);if(!user)return fail('INVALID_SESSION');
    if(!this.roomOf(user.id))return fail('GAME_ROOM_REQUIRED');
    // One signaling connection per user; no cross-account impersonation.
    for(const old of this.peers)if(old!==peer&&old.user?.id===user.id){old.ws?.close();this.peers.delete(old);}
    peer.user=user;this.counts.connected++;return send('ready',{uid:user.id});
   }
   if(msg.type==='ping')return send('pong');
   if(msg.type==='leave'){peer.ws.close();return;}
   if(!['offer','answer','ice','hangup'].includes(msg.type))return fail('UNKNOWN_SIGNAL');
   const target=Number(msg.to),sourceRoom=this.roomOf(peer.user.id);
   if(!Number.isSafeInteger(target)||target<=0||target===peer.user.id||!sourceRoom)return fail('INVALID_TARGET');
   const recipient=[...this.peers].find(x=>x.user?.id===target);
   if(!recipient||this.roomOf(target)!==sourceRoom)return fail('NOT_IN_SAME_ROOM');
   if(msg.type!=='hangup'&&(!msg.data||typeof msg.data!=='object'||Array.isArray(msg.data)))return fail('INVALID_PAYLOAD');
   const data=JSON.stringify(msg.data||{});if(data.length>48000)return fail('PAYLOAD_TOO_LARGE');
   recipient.ws.sendText(message(msg.type,{from:peer.user.id,data:msg.data||{}}));
   this.counts.relayed++;send('delivered',{to:target,signal:msg.type});
  };
  peer.ws=websocketUpgrade(req,socket,receive,close,undefined,{allowText:true});
  if(peer.ws)this.peers.add(peer);
 });}
}
module.exports={LocalRtcSignaling};
