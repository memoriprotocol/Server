'use strict';
const inventory=require('./inventory');
function begin(state,time=Date.now()){if(state.world?.sceneReady&&state.player&&state.world.playtimeSince==null)state.world.playtimeSince=time;}
function elapsed(state,time=Date.now()){const since=state.world?.playtimeSince;return since==null?0:Math.max(0,time-since);}
function checkpoint(game,state,time=Date.now(),force=false){
 const w=state.world;if(!w||w.playtimeSince==null)return false;const delta=elapsed(state,time);if(!force&&delta<60000)return false;
 const total=Number(state.player.playtimeTotalMs)||0;if(!Number.isSafeInteger(total+delta))throw Error('INVALID_PLAYTIME');
 if(delta)inventory.commit(game,[[state.player,'playtimeTotalMs',total+delta]],true);w.playtimeSince=Math.max(time,w.playtimeSince);return true;
}
function snapshot(game,token,time=Date.now()){
 const user=game.accounts.profile(token);if(!user.ok)return user;const p=game.players.ensure(game.accounts.userById(user.accountId)),sessions=[...game.online].filter(s=>s.user?.id===user.accountId&&s.world?.sceneReady);
 const total=(Number(p.playtimeTotalMs)||0)+sessions.reduce((n,s)=>n+elapsed(s,time),0);
 const service=game.friends?.service||require('./friend-state-3127').createFriendService({data:{players:game.players.db},save:()=>game.players.save()});
 const friends=service.rows(p).filter(row=>row.status!==0).map(row=>{const u=game.accounts.userById(row.player.uid);return{uid:row.player.uid,accountId:row.player.uid,gameId:String(row.player.uid),name:row.player.name||u?.launcherName||u?.username||'',role:u?.role||'user',online:[...game.online].some(s=>s.user?.id===row.player.uid)};});
 return{ok:true,user,playtime:{totalSeconds:Math.floor(total/1000),online:sessions.length>0,sessionSeconds:Math.floor(sessions.reduce((n,s)=>n+elapsed(s,time),0)/1000)},friends,stats:{mobKills:p.mobKills||0,bossKills:p.bossKills||0,deathCount:p.deathCount||0},events:{source:'independent-3127',items:[],nextCursor:0,hasMore:false}};
}
module.exports={begin,elapsed,checkpoint,snapshot};
