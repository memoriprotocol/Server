'use strict';
const {commands}=require('./proto'),inventory=require('./inventory');
const rows=require('../config/schemes/MountScheme.json').Mount,byId=new Map(rows.map(r=>[r.ID,r]));
function owned(p){return new Set((p.mountList||[]).map(m=>Number(m.mountId||m.id||m)).filter(id=>byId.has(id)));}
function skinOf(id,skin,p){const def=byId.get(id);return!!def&&owned(p).has(id)&&(skin===0||(def.Skins||[]).includes(skin));}
function snapshot(p,w){const id=owned(p).has(p.mountNow)&&byId.has(p.mountNow)?p.mountNow:0,skin=skinOf(id,p.mountSkinNow,p)?p.mountSkinNow:0;return{mountList:[...owned(p)].filter(id=>byId.has(id)).map(mountId=>({mountId})),curMountId:id,currSkinId:skin,isMount:!!(id&&w?.isMounted)};}
function visualPath(id,skin=0){const cfg=byId.get(id);if(!cfg||!(skin===0||cfg.Skins.includes(skin)))return null;const name=cfg.Mount+(skin?'_'+String(skin).padStart(2,'0'):'');return 'arena/player/mount/'+name+'/'+name;}
function apply(property,state){
 const mount=snapshot(state.player,state.world);if(!mount.isMount)return property;
 const def=byId.get(mount.currSkinId)||byId.get(mount.curMountId),result=structuredClone(property);
 def.AttributeType.forEach((type,i)=>{const value=def.AttributeArgs[i]/100;if(type===24)result.property.speed=value;else if(type===1){result.maxHP+=value;result.HP=Math.min(result.maxHP,result.HP);}else if(type===54)result.property.iceIncrPer=(result.property.iceIncrPer||0)+value;else if(type===55)result.property.fireIncrPer=(result.property.fireIncrPer||0)+value;});
 return result;
}
const RIDING=626;
function sync(game,state,events,event){const w=state.world,e=w.entity,next=snapshot(state.player,w);if(!next.curMountId)w.isMounted=false;e.mount={...next,isMount:!!w.isMounted};e.buffer||={};e.buffer.buffs||=[];
 const had=e.buffer.buffs.some(b=>b.type===RIDING);e.buffer.buffs=e.buffer.buffs.filter(b=>b.type!==RIDING);
 if(w.isMounted){const buff={type:RIDING,group:0,duration:-1,startTime:Date.now(),endTime:0,stackNum:1,maxStackNum:1,isValid:1};e.buffer.buffs.push(buff);if(!had)events?.push(event(e,'buffAdd',buff));}else if(had)events?.push(event(e,'buffRemove',{type:RIDING}));
 events?.push(event(e,'changeMount',{mountId:next.curMountId,skinId:next.currSkinId,isMount:!!w.isMounted}));}
function dismount(game,state,events,event){if(!state.world?.isMounted&&!state.world?.entity?.mount?.isMount)return false;state.world.isMounted=false;sync(game,state,events,event);require('./talents-3127').refresh(game,state);return true;}

function notifyOwned(game,state,mountId){if(!byId.has(mountId)||!owned(state.player).has(mountId))return;const {encode}=require('./codec');game.push?.(state,'mountInfoPush',encode('MountInfoPush',{mount:{mountId}}));if(state.world?.sceneReady){const world=require('./world'),events=[];sync(game,state,events,world.entityEventData);const body=encode('ReplicateMsg',{events});for(const peer of world.roomPeers(game,state))game.push?.(peer,'rm',body);}game.push?.(state,'updatePlayer',encode('PlayerInfo',require('./profile').profile(state.user,state.player,state.world)));}
function handle(game,state,name,raw,events,event){
 if(!['setMount','reqMount','switchMountSkin','mountMusic','mountEvent'].includes(name))return false;
 const w=state.world,p=state.player,e=w.entity,req=commands['Command'+name[0].toUpperCase()+name.slice(1)].decode(raw||Buffer.alloc(0));
 if(name==='setMount'){
  const id=Number(req.mountID),skin=Number(req.skinID)||0;if(id&&(!owned(p).has(id)||!skinOf(id,skin,p)))throw Error('MOUNT_NOT_OWNED');
  inventory.commit(game,[[p,'mountNow',id],[p,'mountSkinNow',id?skin:0]],w.level!=='guide');w.isMounted=false;
 }else if(name==='reqMount'){
  if(!snapshot(p,w).curMountId)throw Error('MOUNT_NOT_SELECTED');if(Date.now()-(w.lastMountToggle||0)<300)throw Error('MOUNT_TOGGLE_COOLDOWN');w.lastMountToggle=Date.now();w.isMounted=!w.isMounted;
 }else if(name==='switchMountSkin'){
  const id=Number(req.mountId),skin=Number(req.skinId);if(id!==p.mountNow||!owned(p).has(id)||!skinOf(id,skin,p))throw Error('MOUNT_SKIN_NOT_OWNED');inventory.commit(game,[[p,'mountSkinNow',skin]],true);events.push(event(e,'changeMountSkin',{curSkinId:skin,scale:byId.get(skin)?.SkinScale||1}));
 }else if(name==='mountMusic'){
  if(!w.isMounted&&req.animIdx!==-1||![-1,0].includes(req.animIdx))throw Error('INVALID_MOUNT_ANIMATION');events.push(event(e,'playMountMusic',{animIdx:req.animIdx}));return true;
 }else{
  if(!w.isMounted||typeof req.json!=='string'||req.json.length>2048)throw Error('INVALID_MOUNT_EVENT');JSON.parse(req.json);events.push(event(e,'mountEvent',{json:req.json}));return true;
 }
 sync(game,state,events,event);require('./talents-3127').refresh(game,state);return true;
}
module.exports={RIDING,dismount,rows,byId,owned,skinOf,snapshot,visualPath,apply,sync,notifyOwned,handle};
