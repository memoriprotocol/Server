'use strict';
// A forced server season must also reach the native client's cached PassManager.
const passes=require('../config/schemes/PassScheme.json').Pass;
function catalog(service,time=Date.now()){
 const controls=service.controls(),now=Math.floor(time/1000),active=service.activePass();
 return{version:1,serverTime:now,passes:passes.map(p=>{const row={...p},c=controls.find(c=>c.key==='pass:'+p.ID);if(c?.forced&&c.enabled&&p.ID===active?.id){const duration=Math.max(86400,p.endTime-p.startTime),anchor=Math.min(now,c.effectiveStart||now),start=anchor+Math.max(0,Math.floor((now-anchor)/duration))*duration;Object.assign(row,{startTime:start,endTime:start+duration,startShow:start-1,endShow:start+duration+86400});}return row;}),disabledTaskIDs:controls.filter(c=>c.kind==='pass-task'&&!c.enabled).map(c=>c.id),disabledShopIDs:controls.filter(c=>c.kind==='pass-shop'&&!c.enabled).map(c=>c.id),forcedPassID:active?.forced?active.id:0};
}
function push(game,state){if(state.localEventsReady&&game.adminService)game.push(state,'localEvents',Buffer.from(JSON.stringify(catalog(game.adminService))));}
function sync(game,state){
 const pending=state.eventControlPending;if(!pending||!game.adminService)return;const {encode}=require('./codec');let ok=true;
 const updates=[()=>push(game,state),...(pending.activity?[()=>game.push(state,'activitypush',encode('ActivityPush',{type:2,id:10001,status:require('./activities-3127').seven(game.adminService,state.player)?1:2}))]:[]),()=>game.push(state,'passInfoResetPush',encode('PassInfoResetPush',{passInfo:game.adminService.passInfo(state.player)}))];
 for(const update of updates)try{update();}catch(error){ok=false;}
 if(ok)delete state.eventControlPending;
}
function changed(game,state,keys){state.eventControlPending={activity:!!state.eventControlPending?.activity||keys.some(k=>k==='activity:10001'||k.startsWith('activity-reward:10001:'))};sync(game,state);}
function tick(game,time=Date.now()){if(time<(game.nextEventControlSyncAt||0))return;game.nextEventControlSyncAt=time+1000;for(const state of game.online)if(state.user&&state.player&&state.eventControlPending)sync(game,state);}
module.exports={catalog,push,changed,sync,tick};
