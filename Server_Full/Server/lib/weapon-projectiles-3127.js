'use strict';
// Counts/interval/cast time are native. Spread arrangement and random scatter
// are reconstruction policies documented in STAGE52_PROJECTILES.json.
const {randomInt}=require('node:crypto');
const skills=require('../config/schemes/SkillScheme.json').Skill,assets=require('../config/projectile-assets-3127.json');
const weaponIDs=new Set(require('../config/schemes/WeaponScheme.json').Weapon.map(w=>w.skill2));
const profiles=new Map();
for(const s of skills){if(s.level!==1||!weaponIDs.has(s.ID)||![164,305,379,538,548].includes(s.skillType)||!assets[s.ID])continue;const a=require('./monster-skills-3127').argsOf(s),count=Number(a.num)||1;if(!Number.isInteger(count)||count<1||count>256)continue;profiles.set(s.ID,{skill:s,count,angle:a.angle||0,interval:Math.max(0,a.interval||0),pattern:s.skillType===379?'radial':s.skillType===538?'scatter':'fan',capacity:count>64?256:64,pierce:s.skillType===379});}
function profile(skill){return profiles.get(Number(skill?.ID??skill));}
function schedule(game,state,skill,time,events,event){const p=profile(skill);if(!p||state.world.mapId!==2)return false;cancel(state,events,event);const w=state.world;w.weaponProjectileJob={profile:p,skill,weaponID:w.entity.equip.currentItemID,room:w.room,heroID:w.entity.miscInfo.heroId,next:time+Math.max(0,skill.castPointTime||0),releaseAt:time+Math.max(0,skill.castPointTime||0),deadline:time+Math.max(0,skill.castPointTime||0)+p.interval*(p.count-1)+5000,index:0,started:false};return true;}
function cancel(state,events,event){const w=state.world;if(!w?.weaponProjectileJob)return;events.push(event(w.entity,'skillStop',{skillID:w.weaponProjectileJob.skill.ID}));w.weaponProjectileJob=null;}
function directions(p,aim,index,count,rng=()=>randomInt(1000000)/1000000){const out=[];for(let i=0;i<count;i++){const n=index+i,offset=p.pattern==='radial'?n*p.angle:p.pattern==='scatter'?(rng()*2-1)*p.angle:(n-(p.count-1)/2)*p.angle;out.push(((aim+offset)%360+360)%360);}return out;}
function tick(game,state,time,events,event,rng){const w=state.world,j=w?.weaponProjectileJob;if(!j)return;const city=require('./city-3127');
 if(w.dead||w.entity.property.HP<=0||w.monsterStatuses?.get(192)?.until>time||!w.sceneReady||w.room!==j.room||w.mapId!==2||w.entity.equip.currentItemID!==j.weaponID||w.entity.miscInfo.heroId!==j.heroID||require('./player-skills-3127').blocked(state)||city.safePoint(w.entity.physics.x,w.entity.physics.y,w.level,w.mapId)||time>j.deadline){cancel(state,events,event);return;}
 if(time<j.next)return;const p=j.profile,remaining=p.count-j.index,due=p.interval?Math.min(remaining,1+Math.floor((time-j.next)/p.interval)):remaining;
 const capacity=p.capacity-(w.projectiles?.length||0);if(capacity<due){w.projectileThrottled=(w.projectileThrottled||0)+1;return;}
 const aim=require('./combat-input-3127').aim(w),angles=directions(p,aim,j.index,due,rng),made=require('./projectiles-3127').launchVolley(game,state,j.skill,angles,{pierce:p.pierce});
 if(made.length!==due)return;
 if(!j.started){j.started=true;events.push(event(w.entity,'skillCast',{skillID:j.skill.ID,angle:aim,posX:w.entity.physics.x,posY:w.entity.physics.y,targetPos:require('./player-skills-3127').cursor(state,j.skill,aim)}));}
 events.push(require('./world').spawnEvent(made));j.index+=due;j.next+=p.interval*due;
 if(j.index>=p.count){events.push(event(w.entity,'skillStop',{skillID:j.skill.ID}));w.weaponProjectileJob=null;}
}
module.exports={profiles,profile,schedule,cancel,directions,tick};
