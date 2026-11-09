'use strict';
// CookBookScheme overrides obsolete descriptions; replacement/stacking and
// PvE evasion curve are reconstruction policies documented in Stage68.
const {randomUUID,randomInt}=require('node:crypto');
const recipes=new Map(require('../config/schemes/CookBookScheme.json').Food.filter(f=>f.isValid).map(f=>[f.ID,f]));
const constants=new Map(require('../config/schemes/ConstantsScheme.json').Constants.map(r=>[r.name,r.content]));
const sharedCD=Number(constants.get('useFoodInterval')[0]),statFields={47:'speed',150:'attack',176:'crit',126:'miss'};
function live(state,id,time=Date.now()){const w=state.world,b=w?.foodBuffs?.get(id);return w?.sceneReady&&!w.dead&&w.entity?.property?.HP>0&&b?.until>time?b:null;}
function apply(property,state,time=Date.now()){const out=structuredClone(property);for(const[type,field]of Object.entries(statFields)){const b=live(state,Number(type),time);if(b)out.property[field]=(out.property[field]||0)+b.value;}return out;}
function gather(state,time=Date.now()){return(live(state,78,time)?.value||0)+(state.world?.entity?.miscInfo?.heroId===17?10000:0);}
function reduction(state,time=Date.now()){return live(state,130,time)?.value||0;}
function collisionless(state,time=Date.now()){return !!live(state,96,time);}
function immuneControl(state,time=Date.now()){return !!live(state,125,time);}
function evade(state,rng=()=>randomInt(1000000)/1000000,time=Date.now()){const b=live(state,126,time);if(!b)return false;const params=constants.get('missExpression'),chance=Math.min(Number(params[1]),b.value/(Number(params[0])+b.value)),roll=rng();if(!Number.isFinite(roll)||roll<0||roll>=1)throw Error('INVALID_COMBAT_RANDOM');return roll<chance;}
function plan(state,id,time=Date.now(),source={}){
 const f=recipes.get(id),w=state.world,e=w?.entity;if(!f)throw Error('UNKNOWN_FOOD');if(!w?.sceneReady||w.dead||!e||e.property.HP<=0)throw Error('PLAYER_DEAD');if(require('./player-skills-3127').blocked(state,time)||w.monsterStatuses?.get(192)?.until>time)throw Error('CANNOT_EAT_WHILE_CONTROLLED');if(time<(w.nextFoodAt||0))throw Error('FOOD_COOLDOWN');
 const I=require('./inventory'),S=require('./player-skills-3127'),foodBuffs=new Map(w.foodBuffs||[]),changes=[],events=[],base=w.baseProperty||structuredClone(e.property),baseHP=source.baseHP??e.property.maxHP;
 if(!w.baseProperty)changes.push([w,'baseProperty',base]);let heal=Number(f.HP)||0,shield=null,until=0,shieldToken=null;const removed=[],buffs=[];
 for(let n=0;n<f.BuffIDs.length;n++){const type=f.BuffIDs[n],[duration,value=0]=f.BuffArgs[n].split('|').map(Number);if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(value))throw Error('INVALID_FOOD_SCHEME');
  if(type===128)heal+=Math.floor(baseHP*value/100);if(type===405){const amount=Math.floor(baseHP*value/100);if(amount<(e.property.shield||0))continue;shield=amount;until=time+duration;shieldToken=randomUUID();}
  const b={type,value,until:time+duration,next:time+1000,id,skinID:source.skinID||(type===405?1701:e.miscInfo.curSkinId),...(type===405?{shieldToken}: {})};foodBuffs.set(type,b);buffs.push({type,group:0,duration,startTime:time,endTime:b.until,stackNum:1,maxStackNum:1,isValid:1,propValue:value,fromEntityType:e.type,fromEntitySkinID:b.skinID});
 }
 if(shield!==null){for(const id of [271,323,324])if((e.buffer?.buffs||[]).some(b=>b.type===id))removed.push(id);changes.push([w,'frozenArmor',null],[w,'playerShield',{kind:'food',token:shieldToken,until}]);}
 const shadow={...state,world:{...w,foodBuffs}},derived=S.applyProperty(require('./mounts-3127').apply(I.equipmentProperty(base,I.inventoryOf(state)),shadow),shadow,time),property={...e.property,maxHP:derived.maxHP,property:derived.property};
 const gain=Math.max(0,Math.min(property.maxHP-property.HP,heal));property.HP=Math.min(property.maxHP,property.HP+gain);if(shield!==null)property.shield=shield;
 const replaced=new Set([...removed,...buffs.map(b=>b.type)]),buffer={...e.buffer,buffs:[...(e.buffer?.buffs||[]).filter(b=>!replaced.has(b.type)),...buffs]};
 changes.push([w,'foodBuffs',foodBuffs],[w,'nextFoodAt',time+Math.max(sharedCD,f.CD)],[e,'property',property],[e,'buffer',buffer]);
 for(const type of removed)events.push(['buffRemove',{type}]);for(const b of buffs)events.push(['buffAdd',b]);if(gain)events.push(['addHP',{changeHP:gain,currentHP:property.HP,maxHP:property.maxHP}]);if(shield!==null)events.push(['changeShield',{changeShield:shield-(e.property.shield||0),currentShield:shield}]);events.push(['propertyResult',{propRes:property}],['useFood',{itemID:id}]);return{changes,events,food:f};
}
function handle(game,state,name,raw,events,event){if(name!=='useItem')return false;const I=require('./inventory'),c=require('./proto').commands.CommandUseItem.decode(raw),before=I.inventoryOf(state),item=before.find(i=>i.uuid===c.uuid&&i.bagType===c.bagType);if(!item||!recipes.has(item.itemCfgId))return false;if(c.count&&c.count!==1)throw Error('FOOD_SINGLE_USE_ONLY');if(item.extInfo.il===1)throw Error('ITEM_LOCKED');
 const p=plan(state,item.itemCfgId),after=structuredClone(before),row=after.find(i=>i.uuid===item.uuid);row.num--;if(!row.num)after.splice(after.indexOf(row),1);const owner=state.world.level==='guide'?state.world:state.player;I.commit(game,[[owner,'inventory',after],...p.changes],state.world.level!=='guide');state.world.entity.item.items=after;
 require('./world').inventoryPush(game,state,{privateEvents:I.resultEvents(before,after),publicEvents:p.events,created:[],destroyed:[]});return true;
}
function onHit(state,hit,actor,events,event){const b=live(state,149),e=state.world?.entity;if(!b||actor.id!==e.id||hit.noBuff||!['mob','boss','player'].includes(hit.kind)||hit.damage<=0)return;const amount=Math.max(0,Math.min(e.property.maxHP-e.property.HP,Math.floor(hit.damage*b.value/100)));if(amount){e.property.HP+=amount;events.push(event(e,'addHP',{changeHP:amount,currentHP:e.property.HP,maxHP:e.property.maxHP}));}}
function tick(game,state,time,events,event){const w=state.world;if(!w)return;let stats=false;for(const[type,b]of w.foodBuffs||[]){if(w.dead||time>=b.until||type===405&&(w.playerShield?.token!==b.shieldToken||w.entity.property.shield<=0)){w.foodBuffs.delete(type);w.entity.buffer.buffs=w.entity.buffer.buffs.filter(x=>x.type!==type);events.push(event(w.entity,'buffRemove',{type}));stats||=!!statFields[type];if(type===405&&w.playerShield?.token===b.shieldToken){const old=w.entity.property.shield||0;w.playerShield=null;w.entity.property.shield=0;if(old)events.push(event(w.entity,'changeShield',{changeShield:-old,currentShield:0}));}continue;}
  if(type===16&&time>=b.next){b.next=time+1000;const gain=Math.max(0,Math.min(w.entity.property.maxHP-w.entity.property.HP,b.value));if(gain){w.entity.property.HP+=gain;events.push(event(w.entity,'addHP',{changeHP:gain,currentHP:w.entity.property.HP,maxHP:w.entity.property.maxHP}));}}
 }if(stats&&!w.dead)require('./talents-3127').refresh(game,state);
}
function clear(state,events,event){const w=state.world;if(!w)return false;const changed=[...(w.foodBuffs?.keys()||[])].some(id=>statFields[id]);for(const type of w.foodBuffs?.keys()||[]){w.entity.buffer.buffs=w.entity.buffer.buffs.filter(b=>b.type!==type);if(event)events.push(event(w.entity,'buffRemove',{type}));}w.foodBuffs?.clear();w.nextFoodAt=0;if(w.playerShield?.kind==='food'){w.playerShield=null;w.entity.property.shield=0;}return changed;}
module.exports={recipes,constants,sharedCD,statFields,live,apply,gather,reduction,collisionless,immuneControl,evade,plan,handle,onHit,tick,clear};
