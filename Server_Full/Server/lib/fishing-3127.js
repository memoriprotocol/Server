'use strict';
const {randomInt}=require('node:crypto'),water=require('./water-3127'),{commands}=require('./proto');
const ingredients=require('../config/schemes/IngredientsScheme.json').Ingredients;
const buffRows=new Map(require('../config/schemes/BuffScheme.json').Buff.map(b=>[b.type,b]));
const BASE_INTERVAL=12000,FISHING_BUFF=66,RESULT_BUFFS=[84,85,86],ROD_GROUP=170;
// Shore placements, the base wait and Star->small/big selection are local policy.
// Native CCBuffComp maps 66/84/85/86 to diaoyu/diaoyu2/diaoyu3/diaoyu4.
function shore(state){const w=state.world,p=w.entity.physics;if(w.mapId!==2||water.waterAt(p.x,p.y))return false;for(let i=0;i<16;i++){const a=i*Math.PI/8;for(const d of [80,150,220])if(water.waterAt(p.x+Math.cos(a)*d,p.y+Math.sin(a)*d))return true;}return false;}
function add(state,type,time,events,event){const e=state.world.entity,duration=buffRows.get(type).duration,buff={type,group:[713,714].includes(type)?ROD_GROUP:0,duration,startTime:time,endTime:duration<0?0:time+duration,stackNum:1,maxStackNum:1,isValid:1};e.buffer||={buffs:[]};e.buffer.buffs=(e.buffer.buffs||[]).filter(b=>b.type!==type);e.buffer.buffs.push(buff);events.push(event(e,'buffAdd',buff));}
function remove(state,type,events,event){const e=state.world.entity;if(!e.buffer?.buffs?.some(b=>b.type===type))return;e.buffer.buffs=e.buffer.buffs.filter(b=>b.type!==type);events.push(event(e,'buffRemove',{type}));}
function stop(state,events,event){const w=state.world,f=w?.fishing;if(!f)return;w.fishing=null;for(const type of RESULT_BUFFS)remove(state,type,events,event);remove(state,FISHING_BUFF,events,event);if(f.rodBuff)remove(state,f.rodBuff,events,event);events.push(event(w.entity,'fishing',{type:false}));}
function handle(game,state,name,raw,events,event){
 if(name!=='startFishing')return false;const w=state.world;if(w.fishing){stop(state,events,event);return true;}
 const req=commands.CommandStartFishing.decode(raw),rod=Number(req.fishingRodIdx)||0,item=rod&&require('./inventory').items.get(rod),rodBuff=item?.args?.[0];
 if(rod&&(!(state.player.fishRod||[]).includes(rod)||item?.itemType!==50||![713,714].includes(rodBuff)))throw Error('FISHING_ROD_NOT_OWNED');
 if(w.dead||w.entity.property.HP<=0||!shore(state)||w.motion?.moving||w.isMounted||require('./player-skills-3127').blocked(state))throw Error('NOT_IN_FISHING_AREA');
 const modifier=require('./talents-3127').modifiers(state.player)[21]||0,interval=Math.max(1000,Math.round(BASE_INTERVAL*(1-Math.min(90,modifier)/100)/(rod?1.2:1))),time=Date.now();
 w.fishing={phase:'waiting',nextCatch:time+interval,interval,rod,rodBuff:rodBuff||0,x:w.entity.physics.x,y:w.entity.physics.y,world:w,actor:w.entity,room:w.room,mapId:w.mapId,heroID:w.entity.miscInfo?.heroId,skinID:w.entity.miscInfo?.curSkinId};
 if(rodBuff)add(state,rodBuff,time,events,event);add(state,FISHING_BUFF,time,events,event);events.push(event(w.entity,'fishing',{type:true}));return true;
}
function result(state,ingredient,time,events,event){const f=state.world.fishing,type=!ingredient?86:ingredient.Star>=2?85:84;f.phase='result';f.resultBuff=type;f.resumeAt=time+buffRows.get(type).duration;f.nextCatch=f.resumeAt+f.interval;add(state,type,time,events,event);}
function tick(game,state,time,events,event){
 const w=state.world;if(w.level==='guide'||w.mapId!==2){stop(state,events,event);return;}const owned=(state.player.fishRod||[]).filter(id=>[500001,500002].includes(id)),ud=JSON.parse(w.entity.ud||'{}');if(JSON.stringify(ud.fishRod||[])!==JSON.stringify(owned)){ud.fishRod=owned;w.entity.ud=JSON.stringify(ud);events.push(event(w.entity,'updateUserdata',{ud:w.entity.ud}));}const inArea=shore(state);
 if(w.inFishArea!==inArea){w.inFishArea=inArea;const ud=JSON.parse(w.entity.ud||'{}');ud.inArea=inArea;w.entity.ud=JSON.stringify(ud);events.push(event(w.entity,inArea?'enterFishArea':'leaveFishArea',inArea?{areaDirection:'left'}:{}));}
 const f=w.fishing;if(!f)return;if(w.dead||w.entity.property.HP<=0||w.motion?.moving||w.isMounted||!inArea||Math.hypot(w.entity.physics.x-f.x,w.entity.physics.y-f.y)>10||f.world&&(f.world!==w||f.actor!==w.entity||f.room!==w.room||f.mapId!==w.mapId||f.heroID!==w.entity.miscInfo?.heroId||f.skinID!==w.entity.miscInfo?.curSkinId)||f.rod&&!(state.player.fishRod||[]).includes(f.rod)||require('./player-skills-3127').blocked(state,time)||w.monsterStatuses?.get(192)?.until>time){stop(state,events,event);return;}
 if(f.phase==='result'){
  if(time<f.resumeAt)return;remove(state,f.resultBuff,events,event);f.resultBuff=0;f.phase='waiting';
  // The native animation completion callback returns diaoyu2/3/4 to diaoyu.
  // Keep66 and the rod installed; removing66 restores the combat weapon.
  f.nextCatch=time+f.interval;return;
 }
 if(time<f.nextCatch)return;
 if(time<(f.retryAt||0))return;
 if(!f.catchPlan){
  const pool=ingredients.filter(r=>r.UnlockLv<=w.entity.property.level&&r.ObtainProb>0),total=pool.reduce((n,r)=>n+r.ObtainProb,0);
  if(!total){result(state,null,time,events,event);return;}
  let roll=randomInt(total);const caught=pool.find(r=>(roll-=r.ObtainProb)<0);if(!caught)throw Error('EMPTY_FISH_POOL');
  const rewards=[{itemId:caught.ItemID,count:1},{itemId:4,count:caught.Exp}],bonus=require('./talents-3127').modifiers(state.player)[15]||0;
  if(bonus&&randomInt(10000)<bonus*100)rewards.push(...require('./progression-3127').rollGroup(10001));
  f.catchPlan={caught,rewards,committed:false};
 }
 const plan=f.catchPlan,pr=require('./progression-3127'),mode=w.level==='rookie'?1:0,level=pr.progress(pr.totalOf(state.player,mode)+plan.rewards.filter(r=>r.itemId===4).reduce((n,r)=>n+r.count,0),mode).level;
 const quests=require('./quests-3127').planRecords(state,[{type:8,data:{itemID:plan.caught.ItemID,count:1}},{type:2,data:{level}}],event),passes=require('./passes-3127').planRecords(game.adminService,state,[{type:7,amount:1}]);
 try{pr.awardItems(game,state,plan.rewards,[...quests.changes,...passes,[plan,'committed',true]]);}
 catch(error){if(!plan.committed){f.retryAt=time+1000;if(!f.lastFailureLog||time-f.lastFailureLog>=5000){f.lastFailureLog=time;console.warn('[FISHING REWARD RETRY]',error.message);}return;}console.warn('[FISHING REWARD DELIVERY] committed:',error.message);}
 // Reward, pass progress, quest progress and marker committed in one save.
 events.push(...quests.events);result(state,plan.caught,time,events,event);f.catchPlan=null;f.retryAt=0;

}
module.exports={BASE_INTERVAL,FISHING_BUFF,RESULT_BUFFS,ROD_GROUP,shore,stop,handle,result,tick};
