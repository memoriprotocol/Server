'use strict';
const crypto=require('node:crypto');
const env=require('../lib/environment-3127'),placement=require('../lib/placement-3127'),skills=require('../lib/monster-skills-3127'),city=require('../lib/city-3127'),progress=require('../lib/progression-3127');
const {proto,systemEvent,entityEvent}=require('../lib/proto'),enums=require('../CLIENT_ENUMS_3127.json');
const baseline=require('../tests/fixtures/stage30-boss-baseline.json');
const rows=env.templates,actors=rows.filter(r=>['mob','boss'].includes(r.kind)),wells=rows.filter(r=>r.kind==='well');
const invalid=rows.filter(r=>['tree','well'].includes(r.kind)&&!placement.valid(r.kind,r.x,r.y,rows.filter(x=>x.id!==r.id))).map(r=>r.id);
let minWellDistance=Infinity;for(let i=0;i<wells.length;i++)for(let j=0;j<i;j++)minWellDistance=Math.min(minWellDistance,Math.hypot(wells[i].x-wells[j].x,wells[i].y-wells[j].y));
const bossChecks=actors.filter(r=>r.kind==='boss').map(r=>({cid:r.cid,id:r.id,wireMatchesOriginal:crypto.createHash('sha256').update(Buffer.from(proto.EntityInfo.encode(env.entity({...r})).finish())).digest('hex')===baseline.bosses.find(b=>b.data.id===r.id)?.entityWireSha256}));
const errors=[],fallbacks=[],reachable=new Set(),groups=new Map(require('../config/schemes/DropGroupScheme.json').DropGroup.map(g=>[g.GroupID,g]));
function visit(id){if(reachable.has(id))return;reachable.add(id);const g=groups.get(id);if(!g){errors.push('MISSING_GROUP:'+id);return;}for(const nested of g.NestedGroupIDs)visit(nested);}
for(const r of actors){
 try{for(const random of [()=>0,n=>n-1])progress.plan(r,2,random);const plan=progress.plan(r,2,()=>0);if(plan.fallback)fallbacks.push({id:r.id,cid:r.cid,level:r.level,sourceLevel:plan.sourceLevel});
 const row=progress.dropRow({...r,level:plan.sourceLevel},2);for(const id of [...row.PersonalDropGroupIDs,...row.TeamDropGroupIDs])visit(id);
 }catch(e){errors.push({id:r.id,cid:r.cid,error:e.message});}
}
const actorSkills=skills.audit(rows),effectStatuses={};for(const r of actorSkills)for(const s of r.skills)effectStatuses[s.effects]=(effectStatuses[s.effects]||0)+1;
const highTotal=progress.totalForLevel(200),xpWire=entityEvent.updateTotalExp.decode(entityEvent.updateTotalExp.encode({totalExp:highTotal}).finish()).totalExp;
const report={stage:40,fullRestoration1to1:false,clientRenderVerified:false,
 placement:{policy:placement.policy,invalidIDs:invalid,minWellDistance,counts:rows.reduce((out,r)=>(out[r.kind]=(out[r.kind]||0)+1,out),{}),note:'Stage39 correction retained; local positions, not a retail scene export'},
 bossChecks,actorSkills,effectStatuses,
 drops:{actors:actors.length,reachableGroups:reachable.size,errors,fallbacks,categorySelection:'Native Weight, positive-weight eligible item configs; level-1 weapon rows',teamPolicy:'Personal XP to killer; team XP split among loaded living teammates within 4800 of corpse; other loot reserved for killer before public pickup',teamPolicyRetailVerified:false,atomicPersistence:true,summonRewards:false},
 progression:{tables:['LevelExpScheme','PropLevelsScheme'],levelCap:200,totalToLevel200:highTotal,unsignedXPEventRoundTrip:xpWire===highTotal,propertyCompCumulativeXP:'Omitted because signed int32; restored privately with updateTotalExp at loading completion',hero1Level1:progress.stats(1)},
 announcements:{systemType:enums.SystemType.msg,systemEvent:enums.SystemEvent.systemMsg,foreign715SystemType:25,systemMessageSchema:systemEvent.systemMsg.name,types:['kill_boss','boss_alert','get_valuable'],respawn:{systemType:enums.SystemType.mapResources,eventType:enums.SystemEvent.createBoss,asNew:true},pickupTrigger:'Only committed pickup of boss-origin weapon grade>=6 or equipment Star>=6; no notice on roll, failed pickup, ordinary items or manual drops',scope:'Same room, sceneReady'},
 city:{changed:false,eligibleEntities:city.entitiesFor('main',2).length,layoutStatus:'UNRESOLVED_RETAIL_PLACEMENT',manualLayout:true},
 unresolved:['Exact retail mitigation, resistance, critical-damage rules and AI skill ordering','Ordinary fox/hamster projectile visual contract','Mushroom real/fake damage-transfer and flower combat modifiers','Retail acid spread, poison/gas damage cadence and hurricane lifetime','Native player death, settlement, death loot and respawn flow','Exact retail town placement and remaining unsupported routes','Rendering and full sessions in Windows client'],
 routeCoverage:require('../lib/coverage-3127').audit().counters};
console.log(JSON.stringify(report,null,2));
if(invalid.length||errors.length||!bossChecks.every(r=>r.wireMatchesOriginal)||xpWire!==highTotal||Object.hasOwn(effectStatuses,'NOT_IMPLEMENTED'))process.exitCode=1;
