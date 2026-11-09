'use strict';
const {commands}=require('./proto'),{encode}=require('./codec'),city=require('./city-3127'),inventory=require('./inventory'),collection=require('./collection-3127');
const constants=new Map(require('../config/schemes/ConstantsScheme.json').Constants.map(r=>[r.name,r.content]));
const cooldown=Number(constants.get('changeHeroCD')[0])*1000,cost=Number(constants.get('changeHeroCoin')[0]);
// Original npc-0 sensor radius=600; player_uni sensor radius=50.
const interactionRadius=600,playerRadius=50,resetCost=Number(constants.get('resetChangeHeroCDCost')[0]);
const skins=new Map(require('../config/schemes/SkinScheme.json').Skin.map(s=>[s.ID,s]));
function nearMaster(state){const w=state.world,e=w?.entity;if(!e||!city.active(w.level,w.mapId)||process.env.HEROS_CITY_NPCS_ENABLED==='0')return false;const reach=interactionRadius+playerRadius*(skins.get(e.equip.curSkinID)?.SkinScale||1);return city.npcRecords.some(n=>n.cid===421&&Math.hypot(n.x-e.physics.x,n.y-e.physics.y)<=reach);}
function remaining(p,time=Date.now()){return Math.max(0,(p.lastSwitchHeroAt||0)+cooldown-time);}
function handle(game,state,name,raw,events,event){
 if(name==='getSwitchHeroCD'){collection.push(game,state,{heroes:collection.allHeroes(state.player),pets:state.player.pets||[]});events.push(event(state.world.entity,'switchHeroCD',{remainCDTime:remaining(state.player)}));return true;}
 if(name==='resetSwitchHeroCD'){
  if(state.world.dead||!nearMaster(state))throw Error('HERO_MASTER_TOO_FAR');
  const time=Date.now(),left=remaining(state.player,time),price=Math.ceil(left/60000)*resetCost;
  if(!Number.isSafeInteger(price)||price<0)throw Error('INVALID_RESET_COST');
  if((state.player.diamond||0)<price)throw Error('NOT_ENOUGH_DIAMOND');
  if(left){inventory.commit(game,[[state.player,'diamond',state.player.diamond-price],[state.player,'lastSwitchHeroAt',0]],true);game.push(state,'updateDiamond',encode('DiamondUpdatePush',{diamond:state.player.diamond}));}
  events.push(event(state.world.entity,'switchHeroCD',{remainCDTime:0}));return true;
 }
 if(name!=='switchHero')return false;
 const w=state.world,e=w.entity,p=state.player,req=commands.CommandSwitchHero.decode(raw),hero=collection.heroes.find(h=>h.ID===req.heroId),progress=hero&&collection.heroState(p,hero.ID);
 if(w.dead||!hero||!progress||progress.lv<1)throw Error('HERO_LOCKED');
 if(!nearMaster(state))throw Error('HERO_MASTER_TOO_FAR');
 const skin=Number(req.skinId)||hero.Skins[0];if(!hero.Skins.includes(skin)||![hero.Skins[0],...(p.ownedSkins||[])].includes(skin))throw Error('SKIN_NOT_OWNED');
 const changing=hero.ID!==e.miscInfo.heroId,time=Date.now();if(!changing&&skin===e.miscInfo.curSkinId)return true;
 if(changing&&remaining(p,time)>0)throw Error('HERO_CHANGE_COOLDOWN');if(changing&&(p.coin||0)<cost)throw Error('NOT_ENOUGH_COIN');
 const changes=[[p,'heroId',hero.ID],[p,'curSkinId',skin],[p,'heroSkinSelections',{...(p.heroSkinSelections||{}),[hero.ID]:skin}]];
 const quests=changing?require('./quests-3127').planRecords(state,[{type:20,data:{count:1}}]):{changes:[],events:[]};changes.push(...quests.changes);
 if(changing)changes.push([p,'coin',p.coin-cost],[p,'lastSwitchHeroAt',time],...require('./passes-3127').planCoinSpend(game.adminService,state,cost));inventory.commit(game,changes,true);
 require('./mounts-3127').dismount(game,state,events,event);require('./hero-vfx-3127').clear(game,state);w.playerSkillJobs=[];w.selfSkillBuffs?.clear();w.playerShield=null;w.heroChannelUntil=0;w.heroInvulnerableUntil=0;e.property.shield=0;w.combatInput=null;
 const oldHP=e.property.HP,base=require('./talents-3127').apply(require('./progression-3127').stats(hero.ID,e.property.level,progress.lv),p);base.exp=e.property.exp||0;w.baseProperty=base;e.property=inventory.equipmentProperty(base,inventory.inventoryOf(state));e.property.HP=Math.min(e.property.maxHP,oldHP);
 Object.assign(e.miscInfo,{heroId:hero.ID,heroStar:progress.lv,heroName:hero.Name,curSkinId:skin});e.property=require('./player-skills-3127').applyProperty(e.property,state);e.property.HP=Math.min(e.property.HP,e.property.maxHP);e.equip.curSkinID=skin;
 const scale=require('../config/schemes/SkinScheme.json').Skin.find(s=>s.ID===skin)?.SkinScale||1;
 events.push(event(e,'changeHero',{id:hero.ID,star:progress.lv,skinId:skin,lastSwitchHeroTime:p.lastSwitchHeroAt||0}),event(e,'changeSkin',{curSkinId:skin,scale}),event(e,'propertyResult',{propRes:e.property}),event(e,'setHP',{currentHP:e.property.HP,maxHP:e.property.maxHP}),event(e,'switchHeroCD',{remainCDTime:remaining(p,time)}));
 events.push(...quests.events);collection.push(game,state,{heroes:collection.allHeroes(p),pets:p.pets||[]});game.push(state,'updateHeroInUse',encode('UpdateHeroInUsePush',{hero:collection.heroInfo(p,hero.ID)}));game.push(state,'updateCoin',encode('CoinUpdatePush',{coin:p.coin||0}));return true;
}
module.exports={handle,remaining,cooldown,cost,resetCost,interactionRadius,playerRadius,nearMaster};
