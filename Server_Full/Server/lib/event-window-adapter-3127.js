/* HERO_EVENTS_ADAPTER_STAGE60: native cached season windows, no Index edits. */
(function(){
 'use strict';
 const encoder=new TextEncoder(),decoder=new TextDecoder();
 function packet(value){const b=value instanceof ArrayBuffer?new Uint8Array(value):ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):null;if(!b||b.length<6||b[0]!==4||((b[1]<<16)|(b[2]<<8)|b[3])!==b.length-4)return null;const flag=b[4],type=flag>>1;if(flag&1||![0,1,3].includes(type))return null;let at=5;if(type===0){let guard=0;while(at<b.length&&b[at++]>=128)if(++guard>4)return null;}const len=b[at++];if(!len||at+len>b.length)return null;return{type,route:decoder.decode(b.subarray(at,at+len)),body:b.subarray(at+len)};}
 function ready(){const r=encoder.encode('local.events.ready'),n=r.length+2,b=new Uint8Array(n+4);b[0]=4;b[1]=n>>16&255;b[2]=n>>8&255;b[3]=n&255;b[4]=2;b[5]=r.length;b.set(r,6);return b;}
 const caches=new WeakMap();
 function filterPlan(win,kind,ids){
  if(ids===undefined)return null;if(!Array.isArray(ids)||ids.length>500||!ids.every(n=>Number.isSafeInteger(n)&&n>0))throw Error('INVALID_EVENT_FILTER');
  const get=n=>win.System?.get?.('chunks:///_virtual/'+n+'.ts'),base=get(kind)?.[kind+'SchemeTable'],manager=get(kind+'Manager')?.[kind+'Manager']?.Instance;
  if(!base||!manager){if(!ids.length)return null;throw Error('EVENT_SCHEME_NOT_LOADED');}
  let saved=caches.get(manager);if(!saved){const data=base.datas;if(!Array.isArray(data?.[kind])||!data[kind].length)throw Error('EVENT_SCHEME_NOT_LOADED');saved={...data,[kind]:data[kind].slice()};}
  if(ids.some(id=>!saved[kind].some(r=>r.ID===id)))throw Error('UNKNOWN_EVENT_FILTER');
  const rows=saved[kind].filter(r=>!ids.includes(r.ID));return()=>{caches.set(manager,saved);base._datas={...saved,[kind]:rows};if(kind==='PassTask'){manager.mPassTaskByID.clear();manager.load();}else manager.reload({PassShop:rows});};
 }
 function apply(win,data){if(data?.version!==1||!Array.isArray(data.passes)||data.passes.length>10)return false;const manager=win.System?.get?.('chunks:///_virtual/PassManager.ts')?.PassManager?.Instance;if(!manager?.mPassByID?.size||typeof manager.reload!=='function')return false;const rows=[];for(const p of data.passes){if(!manager.mPassByID.has(p.ID)||!['startTime','endTime','startShow','endShow'].every(k=>Number.isFinite(p[k])))return false;const native=manager.mPassByID.get(p.ID);rows.push({...native,startTime:p.startTime,endTime:p.endTime,startShow:p.startShow,endShow:p.endShow});}let plans;try{plans=[filterPlan(win,'PassTask',data.disabledTaskIDs),filterPlan(win,'PassShop',data.disabledShopIDs)];}catch{return false;}for(const plan of plans)plan?.();manager.reload({Pass:rows});return true;}
 function install(win){if(win.__HERO_EVENTS_60__)return;win.__HERO_EVENTS_60__=true;const Previous=win.WebSocket;let pending=null,attempt=0,timer=null;
  function drain(){timer=null;if(!pending)return;try{if(apply(win,pending)){pending=null;return;}}catch(e){win.console?.warn?.('[EVENT WINDOWS]',e.message);}if(++attempt<40)timer=win.setTimeout(drain,250);else win.console?.warn?.('[EVENT WINDOWS] native PassManager is not loaded; retry on next pass request');}
  function Socket(url,protocols){const socket=protocols===undefined?new Previous(url):new Previous(url,protocols),send=socket.send.bind(socket);let announced=false;socket.send=function(value){const p=packet(value);if(p?.type===0&&p.route.startsWith('game.')&&(!announced||['game.passHandler.passInfo','game.activityHandler.loadActivity'].includes(p.route))){announced=true;if(pending){if(timer)win.clearTimeout(timer);attempt=0;drain();}send(ready());}return send(value);};socket.addEventListener('message',ev=>{const p=packet(ev.data);if(p?.type!==3||p.route!=='localEvents')return;ev.stopImmediatePropagation();try{pending=JSON.parse(decoder.decode(p.body));attempt=0;if(timer)win.clearTimeout(timer);drain();}catch(e){win.console?.warn?.('[EVENT WINDOWS]',e.message);}});return socket;}
  Socket.prototype=Previous.prototype;Object.setPrototypeOf(Socket,Previous);win.WebSocket=Socket;
 }
 if(typeof window==='undefined'&&typeof module==='object')module.exports={packet,ready,apply,install};else install(window);
})();
