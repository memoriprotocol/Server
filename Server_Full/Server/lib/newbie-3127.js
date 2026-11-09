'use strict';
const {encode,contract}=require('./codec'),{commands}=require('./proto'),inventory=require('./inventory'),motion=require('./motion-3127');
const maps=require('../config/schemes/MapScheme.json').Map;
const DAILY_COUNT=3,day=time=>Math.floor(time/86400000);
function remaining(p,time=Date.now()){return Math.max(0,DAILY_COUNT-(p.peaceGuardDay===day(time)?p.peaceGuardCount||0:0));}
function info(state,time=Date.now()){return{hadKillOther:false,skillInitMillis:state.world?.startedAt||time,lastUseSkillMillis:state.player.lastPeaceGuardMillis||0,dmgToOther:0,curLv:state.world?.entity?.property.level||1,curLimitLv:200,curDanID:0,leftTime:remaining(state.player,time)};}
function handleRoute(game,state,m,req){if(!['game.gameHandler.chooseIsBeginner','game.gameHandler.giveUpBeginner'].includes(m.route))return false;let result;
 try{const value=m.route.endsWith('giveUpBeginner')?2:Number(req.isBeginner);if(![1,2].includes(value))throw Error('INVALID_BEGINNER_TYPE');if(state.player.beginnerType===2&&value===1)throw Error('BEGINNER_ALREADY_GIVEN_UP');inventory.commit(game,[[state.player,'beginnerType',value]],true);result={code:0,isBeginner:value};if(value===2)game.push(state,'beginnerEndPush',encode('BeginnerEndPush',{}));game.broadcastPlayer?.(state.user.id);}catch(e){result={code:1};}
 if(m.type===0)game.reply(state,m.id,encode(contract.responses[m.route],result));return true;
}
function use(game,state,name,raw,events,event){if(name!=='useSkill')return false;const req=commands.CommandUseSkill.decode(raw);if(![46,47].includes(Number(req.id)))return false;
 const w=state.world,time=Date.now();if(w.dead||w.level==='guide'||w.mapId!==2)throw Error('PEACE_GUARD_MAP_UNAVAILABLE');if(w.peaceCast)throw Error('PEACE_GUARD_ALREADY_CASTING');if(!remaining(state.player,time))throw Error('PEACE_GUARD_DAILY_LIMIT');if(time-(state.player.lastPeaceGuardMillis||0)<3500)throw Error('PEACE_GUARD_COOLDOWN');
 require('./mounts-3127').dismount(game,state,events,event);for(const type of [248,697])require('./hero-vfx-3127').addBuff(state,type,3000,time,events,event);w.peaceCast={readyAt:time+3000,id:req.id};w.protectedUntil=Math.max(w.protectedUntil||0,time+3000);w.protectionBuffSent=false;motion.stop(w.motion);events.push(event(w.entity,'moveStop',{}),event(w.entity,'useSkill',{skillID:req.id,skillCD:3500,skillLevel:1,curMillis:time,toggleState:false}),event(w.entity,'skillCast',{skillID:req.id,angle:0,posX:w.entity.physics.x,posY:w.entity.physics.y}));return true;
}
function tick(game,state,time,events,event){
 const w=state.world;if(!w?.entity||w.dead||w.level==='guide')return;
 if(w.peaceCast&&time>=w.peaceCast.readyAt){
  const p=state.player,used=p.peaceGuardDay===day(time)?p.peaceGuardCount||0:0;if(used>=DAILY_COUNT){w.peaceCast=null;return;}
  inventory.commit(game,[[p,'peaceGuardDay',day(time)],[p,'peaceGuardCount',used+1],[p,'lastPeaceGuardMillis',time]],true);
  const born=maps.find(m=>m.ID===w.mapId).Born;w.entity.physics.x=born[2];w.entity.physics.y=born[3];w.motion=motion.createMotion(w.entity);w.peaceCast=null;
  events.push(event(w.entity,'moveTo',{x:born[2],y:born[3],direction:1,frequency:1}));require('./quests-3127').record(game,state,17,{},events,event);
 }
 if(w.peaceInfoDay!==day(time)||!w.lastPeaceInfoAt||time-w.lastPeaceInfoAt>=5000){w.peaceInfoDay=day(time);w.lastPeaceInfoAt=time;events.push(event(w.entity,'newbieSkillInfo',info(state,time)));}
}
module.exports={DAILY_COUNT,day,remaining,info,handleRoute,use,tick};
