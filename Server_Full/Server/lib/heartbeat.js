'use strict';
// WS control-frame ping/pong measures real server<->client round-trip latency.
// Application-level connector.entryHandler.heartbeat is counted independently:
// its echoed timestamps cannot be trusted as network RTT across clock domains.
const crypto = require('node:crypto');
class HeartbeatTelemetry {
 constructor({intervalMs=300000,probeMs=30000,now=()=>process.hrtime.bigint(),logger=console.info,autostart=true}={}){
  this.intervalMs=intervalMs;this.probeMs=probeMs;this.now=now;this.logger=logger;
  this.windows=new Map();this.pending=new WeakMap();this.states=new Set();
  if(autostart){this.probeTimer=setInterval(()=>this.probe(),probeMs);this.summaryTimer=setInterval(()=>this.report(),intervalMs);this.probeTimer.unref?.();this.summaryTimer.unref?.();}
 }
 stop(){clearInterval(this.probeTimer);clearInterval(this.summaryTimer);}
 key(state){return String(state.user?.id??'guest');}
 stats(key){let row=this.windows.get(key);if(!row){row={heartbeats:0,connector:0,battle:0,frames:0,frameBytes:0,pings:0,sum:0,min:Infinity,max:0,lost:0};this.windows.set(key,row);}return row;}
 register(state){this.states.add(state);}
 unregister(state){this.states.delete(state);this.pending.delete(state);}
 heartbeat(state,source='connector'){const x=this.stats(this.key(state));x.heartbeats++;x[source==='battle'?'battle':'connector']++;}
 frame(state,bytes=0){const row=this.stats(this.key(state));row.frames++;row.frameBytes+=Math.max(0,Number(bytes)||0);}
 probe(){for(const state of this.states){if(!state.handshake||!state.ws?.ping)continue;
   const old=this.pending.get(state);if(old){if(Number(this.now()-old.sent)/1e6<this.probeMs*2)continue;this.stats(old.key).lost++;this.pending.delete(state);}
   const token=crypto.randomBytes(8),sent=this.now(),key=this.key(state);
   this.pending.set(state,{token,sent,key});try{if(state.ws.ping(token)===false)this.pending.delete(state);}catch(_){this.pending.delete(state);}
  }}
 pong(state,payload){const p=this.pending.get(state);if(!p||!Buffer.isBuffer(payload)||!payload.equals(p.token))return false;
  this.pending.delete(state);const ms=Number(this.now()-p.sent)/1e6;if(!(ms>=0&&ms<600000))return false;
  const row=this.stats(p.key);row.pings++;row.sum+=ms;row.min=Math.min(row.min,ms);row.max=Math.max(row.max,ms);return true;
 }
 snapshot(){return [...this.windows.entries()].map(([uid,x])=>({uid,heartbeats:x.heartbeats,connectorHeartbeats:x.connector,battleHeartbeats:x.battle,frames:x.frames,frameBytes:x.frameBytes,pingSamples:x.pings,avgPingMs:x.pings?Number((x.sum/x.pings).toFixed(1)):null,minPingMs:x.pings?Number(x.min.toFixed(1)):null,maxPingMs:x.pings?Number(x.max.toFixed(1)):null,pingTimeouts:x.lost}));}
 report(){for(const x of this.snapshot()){
  const ping=x.avgPingMs===null?'нет данных RTT':`${x.avgPingMs.toFixed(1)} ms (min ${x.minPingMs.toFixed(1)}, max ${x.maxPingMs.toFixed(1)}, замеров ${x.pingSamples})`;
  this.logger(`[HEARTBEAT 5m] uid=${x.uid} count=${x.heartbeats} ping=${ping} connector=${x.connectorHeartbeats} battle=${x.battleHeartbeats} frames=${x.frames} frameBytes=${x.frameBytes} missedPong=${x.pingTimeouts}`);
 }this.windows.clear();}
}
module.exports={HeartbeatTelemetry};
