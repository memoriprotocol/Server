'use strict';
const {systemEvent}=require('./proto'),{encode}=require('./codec'),enums=require('../CLIENT_ENUMS_3127.json');
function snapshot(game,state){const w=state.world,peers=[...game.online].filter(s=>s.user&&s.world?.sceneReady&&s.world.loadingFinished&&s.world.entity&&s.world.room===w.room&&s.world.mapId===w.mapId);
 const players=peers.map(s=>({uid:s.user.id,name:s.player.name||s.user.launcherName||s.user.username,exp:require('./progression-3127').totalOf(s.player,s.world.level==='rookie'?1:0),killCount:s.player.battleStats?.playerKills||0,rankScore:require('./dan-3127').score(s.player)})).sort((a,b)=>b.exp-a.exp||b.killCount-a.killCount||a.uid-b.uid);
 return{players:players.slice(0,50),totalNum:players.length};
}
function publish(game,state,time=Date.now(),force=false){
 const w=state.world;if(!state.user||!w?.sceneReady||!w.loadingFinished||!w.entity||w.level==='guide')return false;
 try{const body=snapshot(game,state),key=JSON.stringify([w.room,w.mapId,w.entity.id,body]);if(!force&&state.roomRankKey===key&&time-(state.roomRankAt||0)<5000)return false;
  const error=systemEvent.updateRank.verify(body);if(error)throw Error(error);
  game.push(state,'rm',encode('ReplicateMsg',{events:[{entityID:-1,systemType:enums.SystemType.rank,eventType:enums.SystemEvent.updateRank,data:Buffer.from(systemEvent.updateRank.encode(body).finish())}]}));state.roomRankKey=key;state.roomRankAt=time;return true;
 }catch(error){if(!state.roomRankLogAt||time-state.roomRankLogAt>=5000){state.roomRankLogAt=time;console.warn('[ROOM RANK]',error.message);}return false;}
}
function tick(game,time=Date.now()){
 if(time<(game.nextRoomRankAt||0))return;game.nextRoomRankAt=time+1000;
 for(const state of game.online)publish(game,state,time);
}
module.exports={snapshot,publish,tick};
