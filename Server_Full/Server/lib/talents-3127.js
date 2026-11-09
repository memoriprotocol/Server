'use strict';
const {encode,contract}=require('./codec'),inventory=require('./inventory');
const rows=require('../config/schemes/TalentScheme.json').Talent,byId=new Map(rows.map(r=>[r.ID,r]));
const buffs=require('../config/schemes/TalentBuffScheme.json').TalentBuff,titles=require('../config/schemes/TitleScheme.json').Title;
const constants=new Map(require('../config/schemes/ConstantsScheme.json').Constants.map(r=>[r.name,r.content]));
function totalPoints(p){let exp=Math.max(0,p.titleExp||0),index=0;while(index<titles.length-1&&exp>=titles[index].exp){exp-=titles[index].exp;index++;}return titles.slice(0,index+1).reduce((n,r)=>n+r.talentPoints,0);}
function owned(p){return (p.talents||p.talent?.talents||[]).map(t=>({id:Number(t.id),level:Number(t.level)})).filter(t=>byId.has(t.id)&&Number.isInteger(t.level)&&t.level>0&&t.level<=byId.get(t.id).maxLevel);}
function info(p){const talents=owned(p),spent=talents.reduce((n,t)=>n+byId.get(t.id).points*t.level,0);return{talents,talentPoints:Math.max(0,totalPoints(p)-spent)};}
function modifiers(p){const out={};for(const t of owned(p)){const b=buffs.find(b=>b.ID===byId.get(t.id).buffID&&b.level===t.level);if(b)out[b.ID]=(out[b.ID]||0)+b.arg;}return out;}
// Native buffs 27/30 are petMaxHP/petAttack, not hero stats.
function apply(base,p){return structuredClone(base);}
function run(game,state,route,id){
 const p=state.player,view=info(p),talents=view.talents,def=byId.get(Number(id)),node=talents.find(t=>t.id===Number(id));let coin=p.coin||0;
 if(route.endsWith('.resetAll')){if(!talents.length)throw Error('NO_TALENTS');const cost=Number(constants.get('resetTalentCost')?.[0]);if(!Number.isSafeInteger(cost)||cost<0)throw Error('INVALID_RESET_COST');if(coin<cost)throw Error('NOT_ENOUGH_COIN');coin-=cost;talents.length=0;}
 else if(!def)throw Error('UNKNOWN_TALENT');
 else if(route.endsWith('.unlock')){
  if(view.talentPoints<def.points)throw Error('NOT_ENOUGH_TALENT_POINTS');if((node?.level||0)>=def.maxLevel)throw Error('TALENT_MAX_LEVEL');
  for(const parent of def.parentID)if(!talents.some(t=>t.id===parent&&t.level>0))throw Error('TALENT_PARENT_REQUIRED');
  if(def.parentID.length===1&&byId.get(def.parentID[0])?.single&&talents.some(t=>t.id!==def.ID&&byId.get(t.id)?.parentID.includes(def.parentID[0])))throw Error('TALENT_BRANCH_CONFLICT');
  if(node)node.level++;else talents.push({id:def.ID,level:1});
 }else if(route.endsWith('.cancel')){
  if(!node)throw Error('TALENT_NOT_UNLOCKED');if(node.level===1&&talents.some(t=>byId.get(t.id)?.parentID.includes(def.ID)))throw Error('TALENT_HAS_CHILDREN');node.level--;if(!node.level)talents.splice(talents.indexOf(node),1);
 }else throw Error('UNKNOWN_TALENT_ROUTE');
 inventory.commit(game,[[p,'talents',talents],[p,'coin',coin],...require('./passes-3127').planCoinSpend(game.adminService,state,(p.coin||0)-coin)],true);return{code:0,data:info(p)};
}
function refresh(game,state,time=Date.now()){
 if(!state.world?.entity||state.world.dead)return;
 const w=state.world,e=w.entity,pr=require('./progression-3127'),progress=pr.progress(pr.totalOf(state.player,w.level==='rookie'?1:0),w.level==='rookie'?1:0),base={...apply(pr.stats(e.miscInfo.heroId||state.player.heroId||1,progress.level,e.miscInfo.heroStar||1),state.player),exp:progress.remainExp};
 const next=require('./player-skills-3127').applyProperty(require('./mounts-3127').apply(inventory.equipmentProperty(base,inventory.inventoryOf(state)),state),state,time);next.HP=Math.min(next.maxHP,e.property.HP);for(const [value,max]of [['strength','maxStrength'],['currEnergy','maxEnergy']])if(Number.isFinite(e.property[value]))next[value]=Math.min(next[max]??e.property[value],e.property[value]);if(Number.isFinite(e.property.shield))next.shield=Math.max(0,e.property.shield);w.baseProperty=base;e.property=next;e.talent=info(state.player);require('./world').inventoryPush(game,state,{privateEvents:[['propertyResult',{propRes:next}]],publicEvents:[],created:[],destroyed:[]});
}
function handle(game,state,m,req){if(!['game.talentHandler.unlock','game.talentHandler.cancel','game.talentHandler.resetAll'].includes(m.route))return false;let result;
 try{result=run(game,state,m.route,req.id);}catch(e){result={code:1,message:e.message};}
 if(m.type===0)game.reply(state,m.id,encode(contract.responses[m.route],result));if(!result.code){refresh(game,state);require('./pets-3127').refresh(game,state);game.push(state,'updateTalent',encode('TalentRsp',result));game.broadcastPlayer?.(state.user.id);}return true;
}
module.exports={rows,byId,totalPoints,owned,info,modifiers,apply,run,refresh,handle};
