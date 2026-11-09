'use strict';
const {encode,contract}=require('./codec'),C=require('./admin-catalog-3127');
const activities=require('../config/schemes/ActivitiesScheme.json').Activities,passes=require('../config/schemes/PassScheme.json').Pass;
const tasks=require('../config/schemes/PassTaskScheme.json').PassTask,shop=require('../config/schemes/PassShopScheme.json').PassShop;
const rewards=require('../config/schemes/RewardSevenDayScheme.json').RewardSevenDay;
const names=['Default','SevenDayLoad','KillBoss','Box','GuildObelisk','Feast','WeaponEnhance','Firework','Youtube','Lantern'];
function controls(service,time=Date.now()){
 const rows=[...activities.map(r=>({key:'activity:'+r.ID,id:r.ID,kind:'activity',source:'ActivitiesScheme',name:r.name,activityType:r.activityType,startTime:0,endTime:0,implemented:r.activityType===1})),...rewards.map((r,i)=>({key:'activity-reward:10001:'+i,id:r.ID,kind:'activity-reward',source:'RewardSevenDayScheme',name:'SevenDay · Day '+r.day,activityId:10001,index:i,startTime:0,endTime:0,implemented:true})),...names.slice(2).map((name,i)=>({key:'activity-type:'+(i+2),id:i+2,kind:'activity-type',source:'3.12.7 Activities.ActivityType',name,activityType:i+2,startTime:0,endTime:0,implemented:false,needsConfiguration:true})),...passes.map(r=>({key:'pass:'+r.ID,id:r.ID,kind:'pass',source:'PassScheme',name:'Pass '+r.ID,startTime:r.startTime,endTime:r.endTime,implemented:true})),...tasks.map(r=>({key:'pass-task:'+r.ID,id:r.ID,kind:'pass-task',source:'PassTaskScheme',name:'Pass '+r.SessionID+' · Task '+r.TaskID,passId:r.SessionID,category:r.Category,startTime:0,endTime:0,implemented:true})),...shop.map(r=>({key:'pass-shop:'+r.ID,id:r.ID,kind:'pass-shop',source:'PassShopScheme',name:'Pass '+r.seasonID+' · Shop '+r.ID,passId:r.seasonID,startTime:0,endTime:0,implemented:true}))];
 return rows.map(r=>{const override=Object.hasOwn(service.db.events,r.key),enabled=override?!!service.db.events[r.key]:['pass-task','pass-shop','activity-reward'].includes(r.kind)||r.startTime>0&&r.startTime<=time/1000&&r.endTime>=time/1000,window=service.db.eventWindows?.[r.key];return{...r,expired:r.endTime>0&&r.endTime<time/1000,override,enabled,forced:override&&enabled,effectiveStart:window?.start||r.startTime,effectiveEnd:override&&enabled?0:r.endTime};});
}
function enabled(service,key){return service.db.events[key]!==false;}
function seven(service,p,time=Date.now()){
 const control=service.controls().find(r=>r.key==='activity:10001'&&r.enabled);if(!control)return null;
 const old=p.activityProgress?.['10001'],progress=old?structuredClone(old):{start:Math.floor(time/1000),loginDays:[],claimed:[]};
 const day=Math.floor(time/86400000);if(!progress.loginDays.includes(day))progress.loginDays.push(day);
 const days=activities.find(a=>a.ID===10001)?.days||30,rest=control.forced?days*86400:Math.max(0,progress.start+days*86400-Math.floor(time/1000));
 return{progress,unit:{id:10001,restTime:rest,awardList:rewards.map((r,i)=>({index:i,awardStatus:progress.claimed.includes(i)?2:enabled(service,'activity-reward:10001:'+i)&&rest>0&&progress.loginDays.length>=r.day?1:0,itemList:r.rewardID.map((itemId,j)=>({itemId,itemNum:r.rewardNum[j],itemNo:0}))}))}};
}
function run(service,state,route,req={},time=Date.now()){
 const p=state.player,s=seven(service,p,time);if(s){p.activityProgress||={};p.activityProgress['10001']=s.progress;}
 if(route.endsWith('.loadActivity'))return{code:0,activityList:s?[s.unit]:[]};
 if(route.endsWith('.getActivitys'))return{list:[]}; // legacy SevenDay uses loadActivity, not server-param panels
 if(route.endsWith('.getActivitysRedDot'))return{list:[]};
 if(route.endsWith('.getActivityAwards')){
  if(Number(req.id)!==10001||!s)throw Error('ACTIVITY_NOT_ACTIVE');const i=Number(req.index),award=s.unit.awardList.find(x=>x.index===i);if(!award||award.awardStatus!==1)throw Error('ACTIVITY_REWARD_UNAVAILABLE');
  for(const item of award.itemList)C.grant(service.game,p,item.itemId,item.itemNum);
  s.progress.claimed.push(i);return{code:0,id:10001,index:i,awards:award.itemList};
 }
 throw Error('ACTIVITY_PARAMETERS_NOT_RECOVERED');
}
function signature(service,p,time=Date.now()){const v=seven(service,p,time);return JSON.stringify([Math.floor(time/86400000),!!v,v?.progress.loginDays,v?.progress.claimed,v?.unit.awardList.map(a=>a.awardStatus)]);}
function tick(game,time=Date.now()){
 if(time<(game.nextActivitySyncAt||0)||!game.adminService)return;game.nextActivitySyncAt=time+1000;
 const service=game.adminService;for(const state of game.online)if(state.user&&state.player){try{
  const v=seven(service,state.player,time);if(v&&JSON.stringify(state.player.activityProgress?.['10001'])!==JSON.stringify(v.progress))require('./inventory').commit(game,[[state.player,'activityProgress',{...(state.player.activityProgress||{}),'10001':v.progress}]],true);
  const next=signature(service,state.player,time);if(state.activityClientReady&&state.activityDeliverySignature!==next){game.push(state,'activitypush',encode('ActivityPush',{type:2,id:10001,status:v?1:2}));state.activityDeliverySignature=next;}
 }catch(error){if(!state.activitySyncLogAt||time-state.activitySyncLogAt>=5000){state.activitySyncLogAt=time;console.warn('[ACTIVITY SYNC]',error.message);}}}
}
function handle(game,state,m,req){if(!m.route.startsWith('game.activityHandler.')||m.route.endsWith('.getActivityRank'))return false;
 const service=game.adminService;if(!service)return false;const settlement=require('./event-settlement-3127');let result,bytes;
 try{const settled=settlement.settle(game,state,m.route,draft=>run(service,draft,m.route,req));result=settled.result;bytes=settled.bytes;if(m.route.endsWith('.getActivityAwards')&&settled.changed)settlement.sync(game,state,settled.before);}
 catch(error){result={code:1,activityId:String(req?.activityId||0)};bytes=encode(contract.responses[m.route],result);console.warn('[ACTIVITY]',m.route,error.message);}
 try{if(m.type===0)game.reply(state,m.id,bytes);if(m.route.endsWith('.loadActivity')&&result.code===0){state.activityClientReady=true;state.activityDeliverySignature=signature(service,state.player);}}
 catch(error){console.warn('[ACTIVITY RESPONSE]',error.message);}return true;
}
module.exports={controls,enabled,seven,run,signature,tick,handle,names};
