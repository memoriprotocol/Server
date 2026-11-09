'use strict';
// Client supplies HP events, not the authoritative leash-healing schedule.
// Configured10%/1000ms is provisional server policy, not proven retail data.
const config=require('../config/map2-monster-recovery-3127.json');
const token=r=>r.spawnToken||r.entity;
function stop(r){r.leashRecovery=null;}
function active(r){return ['mob','boss'].includes(r.kind)&&(r.mapId||2)===2&&!r.summoned&&!r.dead&&r.hp>0;}
function interval(){return Math.max(250,Number(config.intervalMs)||1000);}
function update(r,decision,time){
 if(!active(r)||decision.target||r.brain?.targetUid){stop(r);return 0;}
 let rec=r.leashRecovery;if(rec&&rec.life!==token(r)){stop(r);rec=null;}
 if(!rec&&(decision.reset||decision.state===7))rec=r.leashRecovery={life:token(r),next:time+interval()};
 if(!rec)return 0;if(r.hp>=r.maxHP){stop(r);return 0;}if(time<rec.next)return 0;
 // No lag/offline burst: one observed tick grants at most one bounded step.
 rec.next=time+interval();const percent=Math.min(100,Math.max(0,Number(config.maxHPPercent)||0));if(percent<=0)return 0;
 const gain=Math.min(r.maxHP-r.hp,Math.max(1,Math.floor(r.maxHP*percent/100)));
 r.hp+=gain;r.entity.property.HP=r.hp;if(r.hp>=r.maxHP){stop(r);r.relicCombatStartedAt=null;}return gain;
}
function publish(game,r,peers,gain,event){
 if(!gain)return;const {encode}=require('./codec');r.recoveryCorrections||=new Map();
 for(const p of peers){if(!p.world.environmentSeen?.has(r.id))continue;
  try{game.push(p,'rm',encode('ReplicateMsg',{events:[event(r.entity,'addHP',{changeHP:gain,currentHP:r.hp,maxHP:r.maxHP})]}));r.recoveryCorrections.delete(p);}
  catch(error){r.recoveryCorrections.set(p,{world:p.world,life:token(r)});}
 }
}
function flush(game,r,peers,event){
 if(!r.recoveryCorrections?.size)return;const {encode}=require('./codec');
 for(const [p,c]of r.recoveryCorrections){
  if(r.dead||c.life!==token(r)||p.world!==c.world||!peers.includes(p)||!p.world.environmentSeen?.has(r.id)){r.recoveryCorrections.delete(p);continue;}
  try{game.push(p,'rm',encode('ReplicateMsg',{events:[event(r.entity,'setHP',{currentHP:r.hp,maxHP:r.maxHP})]}));r.recoveryCorrections.delete(p);}catch(error){}
 }
}
function pause(r,time){r.recoveryCorrections?.clear();if(r.leashRecovery)r.leashRecovery.next=time+interval();}
module.exports={config,stop,active,update,publish,flush,pause};
