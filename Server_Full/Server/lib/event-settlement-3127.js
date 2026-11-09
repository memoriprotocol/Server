'use strict';
// These routes mutate only one player. Do not roll back every online account
// or rewrite admin-state after a reward has already reached players.json.
const inventory=require('./inventory'),{encode,contract}=require('./codec');
function settle(game,state,route,run){
 const before=structuredClone(state.player),draft={...state,player:structuredClone(state.player)},result=run(draft);
 const bytes=encode(contract.responses[route],result); // Reject invalid output before a write.
 const changes=Object.entries(draft.player).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(state.player[k])).map(([k,v])=>[state.player,k,v]);
 if(changes.length){const marker={committed:false};try{inventory.commit(game,[...changes,[marker,'committed',true]],true);}catch(error){if(!marker.committed)throw error;console.warn('[EVENT REWARD DELIVERY] committed:',error.message);}}
 return{before,result,bytes,changed:changes.length>0};
}
function sync(game,state,before){
 state.eventRewardSyncPending??=before;
 try{game.adminService.sync(state.user.id,state.eventRewardSyncPending);delete state.eventRewardSyncPending;return true;}
 catch(error){if(!state.eventRewardSyncLogAt||Date.now()-state.eventRewardSyncLogAt>=5000){state.eventRewardSyncLogAt=Date.now();console.warn('[EVENT REWARD SYNC]',error.message);}return false;}
}
function tick(game){for(const state of game.online)if(state.user&&state.player&&state.eventRewardSyncPending)sync(game,state,state.eventRewardSyncPending);}
module.exports={settle,sync,tick};
