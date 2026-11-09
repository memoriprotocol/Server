'use strict';
// Website owns provider verification. The game grants only a matching, durable
// order after an authenticated website callback; renderer callbacks never grant.
const crypto=require('node:crypto'),inventory=require('./inventory'),{encode}=require('./codec');
const offers=require('../config/schemes/StoreScheme.json').Store;
const APP_ID=2349820;
function configure(game,{siteURL,secret}){const base=new URL(siteURL);if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error('INVALID_PAYMENT_SITE');game.paymentConfig={siteURL:base.origin,secret:String(secret||'')};}
function token(payload,secret){const raw=Buffer.from(JSON.stringify(payload)).toString('base64url');return raw+'.'+crypto.createHmac('sha256',secret).update(raw).digest('base64url');}
function publicOrder(game,order){const signed=token(order.payload,game.paymentConfig.secret);return{orderId:order.payload.orderId,payId:order.payload.payId,amount:order.payload.amount,currency:order.payload.currency,diamonds:order.diamonds,status:order.status,appID:APP_ID,url:game.paymentConfig.siteURL+'/pay/'+encodeURIComponent(order.payload.orderId)+'?token='+encodeURIComponent(signed)};}
function push(game,state,order){if(state.localPaymentReady)game.push(state,'localPayment',Buffer.from(JSON.stringify(publicOrder(game,order))));}
function create(game,state,request,time=Date.now()){
 if(!state.localPaymentReady)throw Error('PAYMENT_OVERLAY_ADAPTER_REQUIRED');
 const cfg=game.paymentConfig;if(!cfg?.secret||cfg.secret==='CHANGE_ME_LOCAL_SHARED_SECRET')throw Error('PAYMENT_CONFIG_REQUIRED');
 const offer=offers.find(o=>o.ID===Number(request.id)&&o.Type===1&&o.ItemID===111);if(!offer)throw Error('UNKNOWN_PAYMENT_PRODUCT');
 const price=Number(offer.DiscountPrice||offer.BasePrice),diamonds=Number(offer.ItemNum)+Number(offer.Extra||0);if(!Number.isSafeInteger(price)||price<=0||!Number.isSafeInteger(diamonds)||diamonds<=0)throw Error('INVALID_PAYMENT_PRODUCT');
 const old=state.player.paymentOrders||{},existing=Object.values(old).find(o=>o.status==='pending'&&o.payload.payId===offer.ID&&o.payload.exp>time);
 if(existing)return existing;if(Object.values(old).filter(o=>o.status==='pending'&&o.payload.exp>time).length>=10)throw Error('TOO_MANY_PENDING_ORDERS');
 const orderId='HL-'+crypto.randomUUID(),payload={orderId,uid:state.user.id,payId:offer.ID,amount:price/100,currency:offer.Currency,playerName:state.player.name||state.user.launcherName||state.user.username,language:String(request.language||'en').slice(0,12),iat:time,exp:time+86400000};
 const order={payload,diamonds,status:'pending',createdAt:time};inventory.commit(game,[[state.player,'paymentOrders',{...old,[orderId]:order}]],true);return order;
}
function notify(game,state,order){
 state.paymentDeliveryPending||=new Map();state.paymentDeliveryPending.set(order.payload.orderId,order);let ok=true;
 try{game.push(state,'updateDiamond',encode('DiamondUpdatePush',{diamond:Number(state.player.diamond)||0}));}catch(e){ok=false;}
 try{push(game,state,order);}catch(e){ok=false;}
 if(ok)state.paymentDeliveryPending.delete(order.payload.orderId);
}
function tick(game,time=Date.now()){if(time<(game.nextPaymentRetryAt||0))return;game.nextPaymentRetryAt=time+1000;for(const state of game.online)if(state.user&&state.player)for(const order of state.paymentDeliveryPending?.values()||[])notify(game,state,order);}
function confirm(game,request,time=Date.now()){
 const p=game.players.db[Number(request.uid)],order=p?.paymentOrders?.[String(request.orderId)];if(!order)throw Error('PAYMENT_ORDER_NOT_FOUND');
 const b=order.payload;if(request.status!=='paid'||Number(request.uid)!==b.uid||Number(request.payId)!==b.payId||Number(request.amount)!==b.amount||String(request.currency)!==b.currency)throw Error('PAYMENT_ORDER_MISMATCH');
 if(order.status==='paid'){for(const state of game.online)if(state.user?.id===b.uid)notify(game,state,order);return{ok:true,orderId:b.orderId,duplicate:true,diamond:Number(p.diamond)||0};}
 if(order.status!=='pending')throw Error('PAYMENT_ORDER_NOT_PENDING');
 const balance=(Number(p.diamond)||0)+order.diamonds;if(!Number.isSafeInteger(balance)||balance<0||balance>2147483647)throw Error('DIAMOND_BALANCE_OVERFLOW');
 const paid={...order,status:'paid',paidAt:time,balanceAfter:balance};inventory.commit(game,[[p,'diamond',balance],[p,'paymentOrders',{...p.paymentOrders,[b.orderId]:paid}]],true);
 for(const state of game.online)if(state.user?.id===b.uid)notify(game,state,paid);
 return{ok:true,orderId:b.orderId,duplicate:false,diamond:balance};
}
function handle(game,state,m,request){
 if(m.route==='game.marketHandler.buyMall'){
  let result,order;try{if(m.type!==0)throw Error('REQUEST_REQUIRED');order=create(game,state,request);result={code:0,id:order.payload.payId};}catch(e){result={code:1,message:e.message};}
  if(m.type===0)game.reply(state,m.id,encode('BuyMallRsp',result));if(order)try{push(game,state,order);}catch(e){console.warn('[PAYMENT OPEN]',e.message);}return true;
 }
 if(m.route==='game.marketHandler.authorizationMall'){
  const order=state.player.paymentOrders?.[String(request.orderId)],paid=order?.status==='paid';
  if(m.type===0)game.reply(state,m.id,encode('AuthorizationMallRsp',{code:paid?0:1,message:paid?'':'PAYMENT_NOT_CONFIRMED',orderId:String(request.orderId||'')}));return true;
 }return false;
}
module.exports={APP_ID,offers,configure,token,publicOrder,push,create,confirm,notify,tick,handle};
