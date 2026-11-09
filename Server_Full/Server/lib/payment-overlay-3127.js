/* Local website overlay adapter. Loaded after the existing local-bootstrap shim.
 * Native Cocos Index and Electron Index are untouched. No renderer can grant money.
 */
(function(){
 'use strict';
 const encoder=new TextEncoder(),decoder=new TextDecoder();
 function bytes(value){if(value instanceof ArrayBuffer)return new Uint8Array(value);if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);return null;}
 function packet(value){const b=bytes(value);if(!b||b.length<5||b[0]!==4||((b[1]<<16)|(b[2]<<8)|b[3])!==b.length-4)return null;const flag=b[4],type=flag>>1;if(flag&1||![0,1,3].includes(type))return null;let at=5;if(type===0){let n=0;while(at<b.length&&b[at++]>=128){if(++n>=5)return null;}}const len=b[at++];if(!len||at+len>b.length)return null;return{type,route:decoder.decode(b.subarray(at,at+len)),body:b.subarray(at+len)};}
 function ready(){const route=encoder.encode('local.payment.ready'),n=2+route.length,out=new Uint8Array(4+n);out[0]=4;out[1]=(n>>16)&255;out[2]=(n>>8)&255;out[3]=n&255;out[4]=2;out[5]=route.length;out.set(route,6);return out;}
 function checkout(data){if(!data||!/^HL-[a-f0-9-]{36}$/.test(data.orderId)||!['pending','paid'].includes(data.status))return null;let url;try{url=new URL(data.url);}catch{return null;}if(url.username||url.password||!['http:','https:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.pathname!=='/pay/'+encodeURIComponent(data.orderId))return null;return{...data,url:url.href,origin:url.origin};}
 function install(win){
  if(win.__HERO_PAYMENT_OVERLAY_47__)return;win.__HERO_PAYMENT_OVERLAY_47__=true;
  const doc=win.document,Previous=win.WebSocket;let active=null;
  function nativeDone(order,authorized){const ipc=win.electron?.ipcRenderer;if(ipc?.emit)ipc.emit('txnAuthorization',{}, {appID:2349820,orderID:order.orderId,authorized});}
  function close(authorized=false){if(!active)return;const old=active;active=null;old.layer.remove();nativeDone(old.order,authorized);}
  function receive(raw){const data=checkout(raw);if(!data)return;if(data.status==='paid'){if(active?.order.orderId===data.orderId)close(true);return;}
   if(active?.order.orderId===data.orderId)return;if(active)close(false);
   const layer=doc.createElement('div');layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label','Оплата');Object.assign(layer.style,{position:'fixed',inset:'0',zIndex:'2147483647',background:'rgba(0,0,0,.8)',display:'flex',alignItems:'center',justifyContent:'center'});
   const box=doc.createElement('div');Object.assign(box.style,{position:'relative',width:'min(900px,96vw)',height:'min(720px,94vh)',background:'#151b25'});
   const frame=doc.createElement('iframe');frame.src=data.url;frame.title='Оплата на сайте';frame.referrerPolicy='no-referrer';frame.setAttribute('sandbox','allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');Object.assign(frame.style,{width:'100%',height:'100%',border:'0'});
   const button=doc.createElement('button');button.textContent='×';button.setAttribute('aria-label','Закрыть оплату');Object.assign(button.style,{position:'absolute',right:'8px',top:'8px',zIndex:'2',fontSize:'28px',cursor:'pointer'});button.addEventListener('click',()=>close(false));box.append(frame,button);layer.append(box);doc.body.append(layer);active={order:data,layer,frame};frame.focus();
  }
  win.addEventListener('message',ev=>{if(active&&ev.source===active.frame.contentWindow&&ev.origin===active.order.origin&&ev.data?.type==='heroPayment.close')close(false);});
  win.addEventListener('keydown',ev=>{if(!active)return;ev.stopImmediatePropagation();if(ev.key==='Escape'){ev.preventDefault();close(false);}},true);
  function Socket(url,protocols){const socket=protocols===undefined?new Previous(url):new Previous(url,protocols),send=socket.send.bind(socket);socket.binaryType='arraybuffer';socket.send=function(value){const p=packet(value);if(p?.type===0&&p.route==='game.marketHandler.buyMall')send(ready());return send(value);};
   socket.addEventListener('message',ev=>{const p=packet(ev.data);if(p?.type!==3||p.route!=='localPayment')return;ev.stopImmediatePropagation();try{receive(JSON.parse(decoder.decode(p.body)));}catch(error){console.warn('[PAYMENT OVERLAY]',error.message);}});return socket;
  }
  Socket.prototype=Previous.prototype;Object.setPrototypeOf(Socket,Previous);win.WebSocket=Socket;
 }
 const api={bytes,packet,ready,checkout,install};if(typeof window==='undefined'&&typeof module==='object')module.exports=api;else install(window);
})();
