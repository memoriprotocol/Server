'use strict';
const {randomInt,randomUUID}=require('node:crypto');
const inventory=require('./inventory'),{encode}=require('./codec');
const levels=require('../config/schemes/LevelExpScheme.json').LevelExp;
const props=require('../config/schemes/PropLevelsScheme.json').PropLevel;
const deathRows=require('../config/schemes/DropDeathScheme.json').DropDeath;
const groupRows=require('../config/schemes/DropGroupScheme.json').DropGroup;
const groups=new Map(groupRows.map(r=>[r.GroupID,r]));
const jewels=require('../config/schemes/JewelScheme.json').Jewel;
const safeInt=(n,min=0)=>Number.isSafeInteger(n)&&n>=min&&n<=0xffffffff;
function modeOf(state){return state.world?.level==='rookie'?1:0;}
function levelRows(mode=0){const selected=levels.filter(r=>r.GameMode.includes(mode));return (selected.length?selected:levels.filter(r=>r.GameMode.includes(0))).sort((a,b)=>a.level-b.level);}
function totalForLevel(level,mode=0){return levelRows(mode).filter(r=>r.level<level).reduce((n,r)=>n+r.levelUpExp,0);}
function progress(totalExp,mode=0){if(!safeInt(totalExp))throw Error('INVALID_TOTAL_EXP');const rows=levelRows(mode);let remain=totalExp,prevTotalExp=0;for(const row of rows){if(remain<row.levelUpExp||row===rows.at(-1))return {level:row.level,remainExp:remain,maxLevelExp:row.levelUpExp,totalExp,prevTotalExp};remain-=row.levelUpExp;prevTotalExp+=row.levelUpExp;}}
function totalOf(player,mode=0){const value=Number(player.exp)||0;if(!safeInt(value))throw Error('INVALID_STORED_EXP');return player.progressionVersion===40?value:Math.max(value,totalForLevel(Math.min(200,Math.max(1,Number(player.level)||1)),mode));}
function stats(heroId,level=1,star=1){
 const row=props.find(r=>r.PropID===heroId&&r.Star===star&&r.Level<=level&&r.MaxLevel>=level)||props.find(r=>r.PropID===1&&r.Star===1&&r.Level<=level&&r.MaxLevel>=level);if(!row)throw Error('MISSING_HERO_STATS');
 const delta=level-row.Level,p={attack:Math.round(row.Attack+delta*row.AtkGrowth),speed:row.Speed+delta*row.SpeedGrowth,resAbility:row.ResAbility+delta*row.ResAbilityGrowth};
 for(const key of ['Defence','Stamina','StaminaRecover','PhysicalResistance','FireResistance','PoisonResistance','ThunderResistance','IceResistance','DivineResistance','PhysicalMiss','FireMiss','PoisonMiss','ThunderMiss','IceMiss','DivineMiss','Miss','Crit','CritHarm','AttackSpeed','SpeedRate','beCtrlTime','beCtrlTimeRate'])p[key[0].toLowerCase()+key.slice(1)]=row[key]||0;
 const hp=Math.round(row.HP+delta*row.HpGrowth);return {HP:hp,maxHP:hp,level,strength:row.Stamina,maxStrength:row.Stamina,currEnergy:100,maxEnergy:100,property:p};
}
function initial(state,entity){const pr=progress(totalOf(state.player,modeOf(state)),modeOf(state)),h=entity.miscInfo?.heroId||state.player.heroId||1;return {...require('./talents-3127').apply(stats(h,pr.level,entity.miscInfo?.heroStar||1),state.player),exp:pr.remainExp};}
function choose(list,weights,random){if(!list.length)return [];const w=weights.length?weights:list.map(()=>1),total=w.reduce((n,x)=>n+x,0);if(w.length!==list.length||!(total>0))throw Error('INVALID_DROP_WEIGHTS');let roll=random(total);for(let i=0;i<list.length;i++){roll-=w[i];if(roll<0)return [i];}throw Error('DROP_RNG_OUT_OF_RANGE');}
function selected(type,ids,weights,random){if(!ids.length)return [];if(type===1)return ids.map((_,i)=>i);if(type===2){if(ids.length!==weights.length)throw Error('INVALID_INDEPENDENT_DROP_WEIGHTS');return ids.flatMap((_,i)=>random(10000)<weights[i]?[i]:[]);}if(type===0)return choose(ids,weights,random);throw Error('UNKNOWN_DROP_PROBABILITY_MODE');}
const candidateCache=new Map();
function candidateRows(type,grade){
 const key=type+':'+grade;if(candidateCache.has(key))return candidateCache.get(key);
 let rows;
 if(type===6){const defs=new Map(inventory.weapons.filter(w=>w.grade===grade&&w.isValid&&w.level===1).map(w=>[w.weaponID,w]));rows=[...inventory.items.values()].filter(i=>i.itemType===6&&defs.has(i.args?.[0])).map(i=>({itemId:i.ID,weight:defs.get(i.args[0]).Weight}));}
 else if(type===11)rows=[...inventory.equipment.values()].filter(e=>e.Star===grade&&e.isValid&&inventory.items.has(e.ItemID)).map(e=>({itemId:e.ItemID,weight:e.Weight}));
 else if(type===13)rows=jewels.filter(j=>j.Star===grade&&inventory.items.has(j.ID)).map(j=>({itemId:j.ID,weight:j.Weight}));
 else if(type===22||type===23)rows=require('../config/schemes/'+(type===22?'Shards':'PetShards')+'Scheme.json')[type===22?'Shards':'PetShards'].filter(r=>r.Star===grade&&inventory.items.has(r.ID)).map(r=>({itemId:r.ID,weight:r.Weight}));
 else throw Error('UNKNOWN_DROP_ITEM_TYPE '+type);
 const unique=[...new Map(rows.filter(r=>Number.isSafeInteger(r.weight)&&r.weight>0).map(r=>[r.itemId,r])).values()];candidateCache.set(key,unique);return unique;
}
function candidates(type,grade){return candidateRows(type,grade).map(r=>r.itemId);}
function countOf(raw,random){const numbers=String(raw).split(',').map(Number);if(numbers.length>2||numbers.some(n=>!safeInt(n)))throw Error('INVALID_DROP_COUNT');const [lo,hi=lo]=numbers;if(hi<lo)throw Error('INVALID_DROP_RANGE');return lo+(hi>lo?random(hi-lo+1):0);}
function rollGroup(id,random=randomInt,path=[],budget={count:0}){
 if(path.includes(id)||path.length>=32||budget.count++>4096)throw Error('DROP_GROUP_CYCLE_OR_LIMIT');const g=groups.get(id);if(!g)throw Error('MISSING_DROP_GROUP '+id);const out=[];
 if(g.DropType===1){const [type,grade]=g.UDefArgs,pool=candidateRows(type,grade);if(!pool.length)throw Error('EMPTY_DROP_ITEM_POOL '+id);const [index]=choose(pool,pool.map(r=>r.weight),random);return [{itemId:pool[index].itemId,count:1}];}
 if(g.DropType!==0)throw Error('UNSUPPORTED_DROP_TYPE '+g.DropType);
 for(const i of selected(g.ItemProbType,g.ItemIDs,g.ItemWeights,random)){const count=countOf(g.ItemNums[i],random);if(count){if(!inventory.items.has(g.ItemIDs[i]))throw Error('MISSING_DROP_ITEM');out.push({itemId:g.ItemIDs[i],count});}}
 for(const i of selected(g.NestedProbType,g.NestedGroupIDs,g.NestedGroupWeights,random))out.push(...rollGroup(g.NestedGroupIDs[i],random,[...path,id],budget));
 return out;
}
function dropRow(r,map=2){return deathRows.find(d=>d.CreatureID===r.cid&&d.MapID===map&&d.CreatureLevel===r.level)||null;}
function plan(r,map=2,random=randomInt){
 let row=dropRow(r,map),fallback=false;
 if(!row){row=deathRows.filter(d=>d.CreatureID===r.cid&&d.MapID===map&&d.CreatureLevel<=r.level).sort((a,b)=>b.CreatureLevel-a.CreatureLevel)[0];fallback=!!row;}
 if(!row)throw Error('MISSING_CREATURE_DROP_ROW '+r.cid+':'+r.level);
 const personalRewards=row.PersonalDropGroupIDs.flatMap(id=>rollGroup(id,random)),teamRewards=row.TeamDropGroupIDs.flatMap(id=>rollGroup(id,random)),rewards=[...personalRewards,...teamRewards];
 const merged=new Map();for(const reward of rewards)merged.set(reward.itemId,(merged.get(reward.itemId)||0)+reward.count);
 return {personalRewards,teamRewards,rewards:[...merged].map(([itemId,count])=>({itemId,count})),fallback,sourceLevel:row.CreatureLevel,specialGroups:row.SpecialDropGroupIDs,chestGroups:row.ChestDropGroup};
}
function members(game,state,r){const team=game.teams?.teamFor(state.user.id),run=require('./dungeons-3127').runFor(game,state);if(!team&&!run)return [state];const ids=new Set(run?run.members:team.members);const p=r||state.world.entity.physics;return [...game.online].filter(s=>ids.has(s.user?.id)&&s.world?.room===state.world.room&&s.world.sceneReady&&s.world.loadingFinished&&s.world.entity.property.HP>0&&Math.hypot(s.world.entity.physics.x-p.x,s.world.entity.physics.y-p.y)<=4800);}
function nextDropId(game){if(!game.nextDropId){game.nextDropId=1000000000;for(const p of Object.values(game.players.db))for(const d of p.groundDrops||[])game.nextDropId=Math.max(game.nextDropId,d.id+1);}if(game.nextDropId>=2000000000)throw Error('ENTITY_ID_LIMIT');return game.nextDropId++;}
function awardKill(game,state,r){
 if(r.summoned)return {duplicate:false,xp:0,drops:[]};
 r.spawnToken||=randomUUID();const receipt=r.spawnToken,owner=state.player;
 if((owner.killReceipts||[]).includes(receipt))return {duplicate:true,xp:0,drops:[]};
 r.deathLootPlan||=plan(r,state.world.mapId);const roll=r.deathLootPlan;
 if(roll.specialGroups.length)throw Error('UNSUPPORTED_SPECIAL_DEATH_REWARD');
 const chests=require('./dungeons-3127').chestPlans(game,state,r,roll.chestGroups);
 const teamXP=(roll.teamRewards||[]).filter(x=>x.itemId===4).reduce((n,x)=>n+x.count,0),personalXP=(roll.personalRewards||roll.rewards).filter(x=>x.itemId===4).reduce((n,x)=>n+x.count,0);
 if((roll.teamRewards||[]).some(x=>x.itemId!==4))throw Error('UNSUPPORTED_TEAM_ITEM_DISTRIBUTION');
 const recipients=members(game,state,r);if(!recipients.includes(state))recipients.unshift(state);
 const shares=recipients.map((member,index)=>({state:member,xp:Math.floor(teamXP/recipients.length)+(index<teamXP%recipients.length?1:0)+(member===state?personalXP:0)}));
 const coin=roll.rewards.find(x=>x.itemId===109)?.count||0,diamond=roll.rewards.find(x=>x.itemId===111)?.count||0,xp=shares.find(x=>x.state===state).xp;
 const planned=shares.map(({state:member,xp:baseEarned})=>{
  const earned=require('./hero-native-passives-3127').monsterXP(member,baseEarned,r.kind);
  const pr=progress(totalOf(member.player,modeOf(member))+earned,modeOf(member)),world=member.world,old=world.entity.property;
  const base={...require('./talents-3127').apply(stats(world.entity.miscInfo?.heroId||member.player.heroId||1,pr.level,world.entity.miscInfo?.heroStar||1),member.player),exp:pr.remainExp};
  const derived=require('./player-skills-3127').applyProperty(require('./mounts-3127').apply(inventory.equipmentProperty(base,inventory.inventoryOf(member)),member),member);derived.HP=Math.min(derived.maxHP,old.HP+Math.max(0,derived.maxHP-old.maxHP));
  return {member,earned,pr,base,derived,binding:require('./monster-targets-3127').bind(member),oldLevel:old.level||1};
 });
 if((Number(owner.coin)||0)+coin>2147483647||(Number(owner.diamond)||0)+diamond>2147483647)throw Error('CURRENCY_OVERFLOW');
 const loot=roll.rewards.filter(x=>![4,109,111].includes(x.itemId)),ground=[...(owner.groundDrops||[])],drops=[];
 if(inventory.groundRecords(game,state).length+loot.length>4096)throw Error('GROUND_ITEM_LIMIT');
 for(let i=0;i<loot.length;i++){const reward=loot[i],angle=i*2.399963229728653,radius=35+12*Math.sqrt(i),drop={id:nextDropId(game),room:state.world.room,ownerId:state.user.id,item:{uuid:randomUUID(),itemCfgId:reward.itemId,num:reward.count,bagType:inventory.defaultBag(reward.itemId),bagPos:0,extInfo:{}},x:r.x+Math.cos(angle)*radius,y:r.y+Math.sin(angle)*radius,createdAt:Date.now(),sourceCreatureCID:r.cid,sourceBossCID:r.sourceBossCID||(r.kind==='boss'?r.cid:0),sourceLifeToken:r.sourceLifeToken||receipt};ground.push(drop);drops.push(drop);}
 const changes=[[owner,'coin',(Number(owner.coin)||0)+coin],[owner,'diamond',(Number(owner.diamond)||0)+diamond],[owner,'groundDrops',ground],[owner,r.kind==='boss'?'bossKills':r.kind==='chest'?'chestsOpened':'mobKills',(Number(owner[r.kind==='boss'?'bossKills':r.kind==='chest'?'chestsOpened':'mobKills'])||0)+1]];
 for(const {member,earned,pr}of planned){changes.push([member.player,'battleStats',require('./life-3127').rewardStats(member,earned,member===state?coin:0,member===state?r.kind:null)]);changes.push([member.player,'exp',pr.totalExp],[member.player,'level',pr.level],[member.player,'levelExp',pr.remainExp],[member.player,'progressionVersion',40],[member.player,'killReceipts',[...(member.player.killReceipts||[]),receipt].slice(-4096)]);}
 const q=require('./quests-3127'),cfg=require('../config/schemes/MonsterContent.json').MonsterCfg.find(c=>c.CreatureID===r.cid&&c.Level<=r.level&&c.MaxLevel>=r.level),records=[];
 if(r.kind==='mob'||r.kind==='boss')for(const type of [4,5,...(r.kind==='boss'?[13]:cfg?.Graded===3?[14]:[])])records.push({type,data:{cid:r.cid,level:r.level,count:1}});
 else if(r.kind==='chest')records.push({type:9,data:{count:1}});
 for(const {member,pr} of planned)if(member===state)records.push({type:2,data:{level:pr.level}});
 changes.push(...require('./relics-3127').killPlan(game,state,r,Date.now(),[{itemId:4,count:planned.find(j=>j.member===state).earned}]));
 const quests=q.planRecords(state,records);changes.push(...quests.changes);
 if(r.kind==='boss')changes.push(...require('./passes-3127').planRecords(game.adminService,state,[{type:1,amount:1}]));
 inventory.commit(game,changes,true);
 for(const j of planned){j.member.world.baseProperty=j.base;j.member.world.entity.property=j.derived;j.binding=require('./monster-targets-3127').bind(j.member);}
 for(const {member,oldLevel}of planned)require('./level-delivery-3127').track(game,member,oldLevel);
 let delivered=false;const deliver=()=>{if(delivered)return;delivered=true;
 const w=require('./world');if(!require('./monster-targets-3127').matches(planned.find(j=>j.member===state)?.binding,state))return;
 if(quests.events.length)try{w.replicate(game,state,quests.events);}catch{}
 for(const {member,earned,pr:acceptedPr,binding,oldLevel}of planned){
  const world=member.world;if(!world?.sceneReady||world.dead||!require('./monster-targets-3127').matches(binding,member))continue;const pr=progress(totalOf(member.player,modeOf(member)),modeOf(member)),derived=world.entity.property;
  const privateEvents=[['addExp',{remainExp:pr.remainExp,maxLevelExp:pr.maxLevelExp,isLevelUp:pr.level>oldLevel,addedExp:pr.totalExp===acceptedPr.totalExp?earned:0}],['updateTotalExp',{totalExp:pr.totalExp}],['propertyResult',{propRes:derived}]],publicEvents=member===state?[['killMonster',{cid:r.cid}]]:[];
  if(pr.level!==oldLevel)publicEvents.push(['upgradeLevel',{originLevel:oldLevel,currentLevel:pr.level,cid:world.entity.cid}],['setHP',{currentHP:derived.HP,maxHP:derived.maxHP}]);
  w.inventoryPush(game,member,{privateEvents,publicEvents,created:member===state?drops.map(inventory.dropEntity):[],destroyed:[]});
 }
 if(coin)game.push(state,'updateCoin',encode('CoinUpdatePush',{coin:owner.coin}));
 if(diamond)game.push(state,'updateDiamond',encode('DiamondUpdatePush',{diamond:owner.diamond}));
 };
 return {duplicate:false,xp:planned.find(j=>j.member===state).earned,drops,chests,deliver,sourceLevel:roll.sourceLevel,fallback:roll.fallback};
}
module.exports={nextDropId,progress,totalForLevel,totalOf,stats,initial,rollGroup,plan,dropRow,candidates,candidateRows,countOf,awardKill,levelRows,members};
function awardItems(game,state,rewards,extraChanges=[]){
 const p=state.player,next=structuredClone(p),before=inventory.inventoryOf(state);let xp=0;
 for(const r of rewards){if(r.itemId===4)xp+=r.count;else require('./admin-catalog-3127').grant(game,next,r.itemId,r.count);}
 const mode=modeOf(state),pr=progress(totalOf(p,mode)+xp,mode),oldLevel=state.world.entity.property.level;
 if(xp){Object.assign(next,{exp:pr.totalExp,level:pr.level,levelExp:pr.remainExp,progressionVersion:40});next.battleStats=require('./life-3127').rewardStats(state,xp);}
 const changes=Object.entries(next).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(p[k])).map(([k,v])=>[p,k,v]);inventory.commit(game,[...changes,...extraChanges],true);
 state.world.entity.item.items=inventory.inventoryOf(state);if(xp)require('./level-delivery-3127').track(game,state,oldLevel);require('./talents-3127').refresh(game,state);
 const ev=xp?[['addExp',{remainExp:pr.remainExp,maxLevelExp:pr.maxLevelExp,isLevelUp:pr.level>oldLevel,addedExp:xp}],['updateTotalExp',{totalExp:pr.totalExp}]]:[];
 require('./world').inventoryPush(game,state,{privateEvents:[...inventory.resultEvents(before,inventory.inventoryOf(state)),...ev],publicEvents:require('./level-delivery-3127').upgrades(state,oldLevel),created:[],destroyed:[]});
 if(next.coin!==p.coin||rewards.some(r=>r.itemId===109))game.push(state,'updateCoin',encode('CoinUpdatePush',{coin:p.coin||0}));return{xp,progress:pr};
}
module.exports.awardItems=awardItems;
