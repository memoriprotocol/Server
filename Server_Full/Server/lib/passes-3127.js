'use strict';
const {encode,contract}=require('./codec'),C=require('./admin-catalog-3127');
const tables={pass:require('../config/schemes/PassScheme.json').Pass,tasks:require('../config/schemes/PassTaskScheme.json').PassTask,awards:require('../config/schemes/PassAwardScheme.json').PassAward,shop:require('../config/schemes/PassShopScheme.json').PassShop};
const week=t=>Math.floor((t/1000+3*86400)/604800),day=t=>Math.floor(t/86400000),level=(info,cfg)=>Math.min(cfg.maxLevel,Math.floor(info.exp/cfg.expLevel)+1);
function initial(cfg,time){return{seasonId:cfg.ID,exp:0,taskExp:0,advanceType:0,gotAwardLv:0,advancedAwardLv:0,passCoin:0,taskInfo:tables.tasks.filter(r=>r.SessionID===cfg.ID).map(r=>({id:r.TaskID,progress:0,completeCount:0,getRewardCount:0})),shopInfo:[],week:week(time),weekExp:0,loginDays:[],weeklyCheckIn:null};}
function weeklyLimit(service,cfg,time){const start=(service.db.eventWindows?.['pass:'+cfg.ID]?.start||cfg.startTime)*1000;return cfg.weekExpLimit[Math.min(cfg.weekExpLimit.length-1,Math.max(0,week(time)-week(start)))];}
function settleWeekly(service,v,time){
 const {cfg,info,defs}=v,cap=weeklyLimit(service,cfg,time);
 for(const t of info.taskInfo){const d=defs.find(d=>d.TaskID===t.id);if(d.Category!==3||service.db.events['pass-task:'+d.ID]===false)continue;
  const completed=Math.min(d.FinishTimes,Math.floor(t.totalProgress/Math.max(1,d.TargetArgs.num)));t.completeCount=Math.max(t.completeCount,completed);
  if(t.completeCount>t.getRewardCount){const xp=Math.min((t.completeCount-t.getRewardCount)*d.RewardNum,Math.max(0,cap-info.taskExp));info.exp=Math.min((cfg.maxLevel-1)*cfg.expLevel,info.exp+xp);info.taskExp+=xp;t.getRewardCount=t.completeCount;}
  t.progress=t.completeCount>=d.FinishTimes?d.TargetArgs.num:t.totalProgress-t.completeCount*Math.max(1,d.TargetArgs.num);
 }
 info.weekExp=info.taskExp;return v;
}
function current(service,p,time=Date.now()){
 const active=service.activePass(),cfg=tables.pass.find(r=>r.ID===active?.id);if(!cfg)return null;
 const info=structuredClone(p.passSeasons?.[cfg.ID]|| (p.passInfo?.seasonId===cfg.ID?p.passInfo:initial(cfg,time)));
 info.advancedAwardLv??=info.advanceType?info.gotAwardLv:0;info.loginDays||=[];
 const defs=tables.tasks.filter(r=>r.SessionID===cfg.ID);
 info.taskInfo=defs.map(d=>{const old=info.taskInfo.find(x=>x.id===d.TaskID)||info.taskInfo.find(x=>x.id===d.ID);const t=old?{...old,id:d.TaskID}:{id:d.TaskID,progress:0,completeCount:0,getRewardCount:0};t.totalProgress??=Math.max(t.progress,t.completeCount*Math.max(1,d.TargetArgs.num));return t;});
 // Older taskExp included season/check-in XP; weekExp was the weekly-only counter.
 info.taskExp=info.mechanicsVersion===61?info.taskExp||0:info.weekExp??Math.min(weeklyLimit(service,cfg,time),info.taskInfo.reduce((n,t)=>n+(defs.find(d=>d.TaskID===t.id).Category===3?t.getRewardCount*defs.find(d=>d.TaskID===t.id).RewardNum:0),0));
 if(info.week!==week(time)){info.week=week(time);info.taskExp=0;for(const t of info.taskInfo)if(defs.find(d=>d.TaskID===t.id)?.Category!==1)Object.assign(t,{totalProgress:0,progress:0,completeCount:0,getRewardCount:0});}
 if(!info.loginDays.includes(day(time))){info.loginDays.push(day(time));for(const t of info.taskInfo){const d=defs.find(d=>d.TaskID===t.id);if(d.TaskType===0&&d.Category!==2&&service.db.events['pass-task:'+d.ID]!==false){t.totalProgress++;t.progress=t.totalProgress;t.completeCount=Math.min(d.FinishTimes,Math.floor(t.totalProgress/Math.max(1,d.TargetArgs.num)));}}}
 const check=info.taskInfo.find(t=>defs.find(d=>d.TaskID===t.id)?.Category===2);if(check){check.completeCount=1;check.progress=1;check.totalProgress=1;}
 info.mechanicsVersion=61;return settleWeekly(service,{cfg,info,defs},time);
}
function store(p,info){p.passSeasons||={};p.passSeasons[info.seasonId]=info;p.passInfo=info;}
function info(service,p,time=Date.now()){const v=current(service,p,time);if(!v)return{seasonId:0,exp:0,taskExp:0,advanceType:0,gotAwardLv:0,passCoin:0,taskInfo:[],shopInfo:[]};return v.info;}
function grant(game,p,pass,id,num){if(!id||!num)return;if(id===15){pass.passCoin+=num;return;}C.grant(game,p,id,num);}
function pairs(ids,counts){return ids.map((id,i)=>({id,num:counts[i]})).filter(x=>x.id&&x.num>0);}
function awardRows(pass,cfg,advanced,from,to){return tables.awards.filter(r=>r.seasonID===cfg.ID&&r.limitLevel>from&&r.limitLevel<=to).flatMap(r=>advanced?pairs(r.advancedItemID,r.advancedItemNum):r.baseItemID?[{id:r.baseItemID,num:r.baseItemNum}]:[]);}
function run(service,state,route,req={},time=Date.now()){
 const p=state.player,v=current(service,p,time);if(!v){if(route.endsWith('.passInfo'))return{code:0,passInfo:info(service,p,time)};throw Error('PASS_NOT_ACTIVE');}const {cfg,info:pass,defs}=v;
 if(route.endsWith('.passInfo')){store(p,pass);return{code:0,passInfo:pass};}
 const rewards=[];let result={code:0};
 if(route.endsWith('.getPassTaskReward')){
  const d=defs.find(r=>r.TaskID===Number(req.id)),t=pass.taskInfo.find(x=>x.id===Number(req.id));if(!d||!t)throw Error('PASS_TASK_NOT_FOUND');if(service.db.events['pass-task:'+d.ID]===false)throw Error('PASS_TASK_DISABLED');
  if(t.completeCount<=t.getRewardCount)throw Error('PASS_TASK_REWARD_UNAVAILABLE');
  if(d.Category===2&&pass.weeklyCheckIn===week(time))throw Error('PASS_TASK_ALREADY_CLAIMED');
  let xp=(t.completeCount-t.getRewardCount)*d.RewardNum;
  if(d.Category===2){pass.weeklyCheckIn=week(time);if(pass.advanceType>0)xp+=cfg.checkInExp;}
  else if(d.Category===3)throw Error('PASS_WEEKLY_REWARD_AUTOMATIC');
  t.getRewardCount=t.completeCount;pass.exp=Math.min((cfg.maxLevel-1)*cfg.expLevel,pass.exp+xp);result={code:0,exp:pass.exp,taskExp:pass.taskExp};
 }else if(route.endsWith('.getPassAward')){
  const lv=level(pass,cfg);rewards.push(...awardRows(pass,cfg,false,pass.gotAwardLv,lv));
  if(pass.advanceType>0)rewards.push(...awardRows(pass,cfg,true,pass.advancedAwardLv,lv));
  if(!rewards.length)throw Error('PASS_REWARD_UNAVAILABLE');pass.gotAwardLv=lv;if(pass.advanceType>0)pass.advancedAwardLv=lv;result={code:0,gotAwardLv:lv,items:rewards};
 }else if(route.endsWith('.buyPassExp')){
  const n=Number(req.buyLv);if(!Number.isSafeInteger(n)||n<1||n>cfg.maxLevel-level(pass,cfg))throw Error('PASS_INVALID_LEVEL_COUNT');
  const cost=n*cfg.expPrice;if((p.diamond||0)<cost)throw Error('NOT_ENOUGH_DIAMOND');p.diamond-=cost;pass.exp=Math.min((cfg.maxLevel-1)*cfg.expLevel,pass.exp+n*cfg.expLevel);result={code:0,exp:pass.exp};
 }else if(route.endsWith('.buyAdvancedPass')){
  const type=Number(req.advanceType);if(![1,2].includes(type)||type<=pass.advanceType)throw Error('PASS_ALREADY_UPGRADED');
  const cost=(type===2?cfg.highPrice:cfg.mediumPrice)-(pass.advanceType===1?cfg.mediumPrice:0);if((p.diamond||0)<cost)throw Error('NOT_ENOUGH_DIAMOND');p.diamond-=cost;
  if(!pass.advanceType)rewards.push(...pairs(cfg.mediumItemID,cfg.mediumItemNum),...awardRows(pass,cfg,true,pass.advancedAwardLv,pass.gotAwardLv));
  if(type===2){rewards.push(...pairs(cfg.highItemID,cfg.highItemNum));pass.exp=Math.min((cfg.maxLevel-1)*cfg.expLevel,pass.exp+cfg.giftExp);}
  pass.advancedAwardLv=Math.max(pass.advancedAwardLv,pass.gotAwardLv);pass.advanceType=type;result={code:0,advanceType:type,items:rewards};
 }else if(route.endsWith('.buyPassShopItem')){
  const row=tables.shop.find(r=>r.ID===Number(req.id)&&r.seasonID===cfg.ID),n=Number(req.count);if(!row||!Number.isSafeInteger(n)||n<1||n>10000)throw Error('PASS_INVALID_SHOP_REQUEST');
  if(service.db.events['pass-shop:'+row.ID]===false)throw Error('PASS_SHOP_DISABLED');
  if(level(pass,cfg)<row.limitLevel)throw Error('PASS_LEVEL_REQUIRED');let bought=pass.shopInfo.find(r=>r.id===row.ID);if((bought?.buyCount||0)+n>row.limitTime)throw Error('PASS_SHOP_LIMIT');
  if(pass.passCoin<row.price*n)throw Error('PASS_SHOP_COIN_NOT_ENOUGH');pass.passCoin-=row.price*n;
  if(!bought){bought={id:row.ID,buyCount:0};pass.shopInfo.push(bought);}bought.buyCount+=n;rewards.push({id:row.itemID,num:row.itemNum*n});result={code:0,passCoin:pass.passCoin,items:rewards};
 }else throw Error('PASS_UNKNOWN_ROUTE');
 for(const r of rewards)grant(service.game,p,pass,r.id,r.num);store(p,pass);return result;
}
function record(service,state,type,amount=1,time=Date.now()){
 if(!service||!Number.isSafeInteger(type)||!Number.isSafeInteger(amount)||amount<=0)return;
 const v=current(service,state.player,time);if(!v)return;
 for(const t of v.info.taskInfo){const d=v.defs.find(d=>d.TaskID===t.id);if(d.TaskType===type&&d.Category!==2&&service.db.events['pass-task:'+d.ID]!==false){t.totalProgress=Math.min(2147483647,t.totalProgress+amount);t.progress=t.totalProgress;t.completeCount=Math.min(d.FinishTimes,Math.floor(t.totalProgress/Math.max(1,d.TargetArgs.num)));}}
 settleWeekly(service,v,time);store(state.player,v.info);
}
function planRecords(service,state,records){if(!service)return[];const copy=structuredClone(state.player),sandbox={...state,player:copy};for(const r of records)record(service,sandbox,r.type,r.amount);return copy.passSeasons?[[state.player,'passSeasons',copy.passSeasons],[state.player,'passInfo',copy.passInfo]]:[];}
function planCoinSpend(service,state,cost,currency='coin'){return currency==='coin'&&Number.isSafeInteger(cost)&&cost>0?planRecords(service,state,[{type:2,amount:cost}]):[];}
function publish(game,state,next){
 const old=state.passDeliverySnapshot;
 if(!old||old.seasonId!==next.seasonId||old.advanceType!==next.advanceType||old.gotAwardLv!==next.gotAwardLv||JSON.stringify(old.shopInfo)!==JSON.stringify(next.shopInfo)){
  game.push(state,'passInfoResetPush',encode('PassInfoResetPush',{passInfo:next}));state.passDeliverySnapshot=structuredClone(next);return;
 }
 // Publish absolute snapshots, so retry is safe and cannot re-grant rewards.
 const sent=structuredClone(old);
 for(const [route,type,keys]of [['passTaskPush','PassTaskPush',['taskInfo']],['passExpPush','PassExpPush',['exp','taskExp']],['passCoinPush','PassCoinPush',['passCoin']]]){
  if(keys.every(k=>JSON.stringify(old[k])===JSON.stringify(next[k])))continue;
  game.push(state,route,encode(type,Object.fromEntries(keys.map(k=>[k,next[k]]))));for(const k of keys)sent[k]=structuredClone(next[k]);state.passDeliverySnapshot=sent;
 }
 state.passDeliverySnapshot=structuredClone(next);
}
function tick(game,time=Date.now()){
 if(time<(game.nextPassSyncAt||0)||!game.adminService)return;game.nextPassSyncAt=time+1000;require('./event-settlement-3127').tick(game);
 for(const state of game.online)if(state.user&&state.player){try{
  const next=info(game.adminService,state.player,time);
  if(next.seasonId&&JSON.stringify(state.player.passInfo)!==JSON.stringify(next)){
   const seasons={...(state.player.passSeasons||{}),[next.seasonId]:next},marker={committed:false};
   try{require('./inventory').commit(game,[[state.player,'passSeasons',seasons],[state.player,'passInfo',next],[marker,'committed',true]],true);}catch(error){if(!marker.committed)throw error;console.warn('[PASS DELIVERY] committed:',error.message);}
  }
  if(state.passClientReady)publish(game,state,next);
 }catch(error){if(!state.passSyncLogAt||time-state.passSyncLogAt>=5000){state.passSyncLogAt=time;console.warn('[PASS SYNC]',error.message);}}}
}
function handle(game,state,m,req){if(!m.route.startsWith('game.passHandler.'))return false;const service=game.adminService;if(!service)return false;
 state.passClientReady=true;const settlement=require('./event-settlement-3127');let result,bytes;
 try{const settled=settlement.settle(game,state,m.route,draft=>run(service,draft,m.route,req));result=settled.result;bytes=settled.bytes;if(!m.route.endsWith('.passInfo')&&settled.changed)settlement.sync(game,state,settled.before);}
 catch(error){result={code:1};bytes=encode(contract.responses[m.route],result);console.warn('[PASS]',m.route,error.message);}
 try{if(m.type===0)game.reply(state,m.id,bytes);if(result.code===0){const next=info(service,state.player);if(m.route.endsWith('.passInfo'))state.passDeliverySnapshot=structuredClone(next);else publish(game,state,next);}}
 catch(error){console.warn('[PASS RESPONSE]',error.message);}return true;
}
module.exports={tables,week,day,initial,current,weeklyLimit,settleWeekly,info,store,grant,level,run,record,planRecords,planCoinSpend,publish,tick,handle};
