'use strict';
const city=require('./city-3127');
const INTERVAL=1500,SAFE_HEAL=200,FIRE_HEAL=150,FIRE_RADIUS=500;
function tick(game,state,now,events,event){
 const w=state.world,e=w?.entity;
 if(!w?.sceneReady||!e||w.dead||e.property.HP<=0)return;
 const p=e.physics,safe=city.safePoint(p.x,p.y,w.level,w.mapId);
 const fire=!safe&&require('./actions-3127').roomStructures(game,state).some(b=>b.buildID===312&&b.hp>0&&Math.hypot(b.x-p.x,b.y-p.y)<=FIRE_RADIUS);
 const source=safe?'safe':fire?'fire':null;
 if(!source){w.healSource=null;w.nextHealAt=0;return;}
 if(w.healSource!==source){w.healSource=source;w.nextHealAt=now+INTERVAL;return;}
 if(now<w.nextHealAt)return;
 w.nextHealAt=now+INTERVAL;
 const hp=e.property,amount=Math.max(0,Math.min(source==='safe'?SAFE_HEAL:FIRE_HEAL,hp.maxHP-hp.HP));
 if(amount){const q=source==='fire'?require('./quests-3127').planRecords(state,[{type:10,data:{count:amount}}],event):{changes:[],events:[]};require('./inventory').commit(game,[...q.changes,[hp,'HP',hp.HP+amount]],q.changes.length>0&&require('./quests-3127').category(state)===1);events.push(...q.events);events.push(event(e,'addHP',{changeHP:amount,currentHP:hp.HP,maxHP:hp.maxHP}));}
}
module.exports={tick,INTERVAL,SAFE_HEAL,FIRE_HEAL,FIRE_RADIUS};
