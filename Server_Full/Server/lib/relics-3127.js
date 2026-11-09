'use strict';
// Native collection archive, independent of hero/pet ownership in collection-3127.
// See STAGE69_RELIC_ARCHIVE.json for reconstructed policies and unsupported effects.
const {randomInt}=require('node:crypto');
const {encode,contract}=require('./codec');
const collections=require('../config/schemes/CollectionsScheme.json').Collection;
const stars=require('../config/schemes/CollectionStarScheme.json').CollectionStar;
const tasks=require('../config/schemes/CollectionTaskScheme.json').CollectionTask;
const byID=new Map(collections.map(r=>[r.ID,r])),pieces=new Map(collections.map(r=>[r.PiecesID,r.ID]));
const limit=2147483647;
function integer(value){return Number.isSafeInteger(value)&&value>=0&&value<=limit;}
function error(message,code=1){throw Object.assign(Error(message),{code});}
function row(id,star){return byID.has(id)?stars.find(r=>r.CollectionID===id&&r.Star===star):null;}
function task(id,star){return byID.has(id)?tasks.find(r=>r.CollectionID===id&&r.CollectionStar===star):null;}
function entry(p,id){const r=p?.relicArchive?.entries?.[id];return {star:integer(r?.star)&&r.star<=(Math.max(...stars.filter(s=>s.CollectionID===id).map(s=>s.Star)))?r.star:0,pieces:integer(r?.pieces)?r.pieces:0,objNum:integer(r?.objNum)?r.objNum:0,param1:integer(r?.param1)?r.param1:0,finishTime:integer(r?.finishTime)?r.finishTime:0,cycles:integer(r?.cycles)?r.cycles:0};}
function archive(p){return {version:69,entries:Object.fromEntries(collections.map(c=>[c.ID,entry(p,c.ID)])),history:{...(p.relicArchive?.history||{})}};}
function info(p,id){if(!byID.has(id))return null;const r=entry(p,id);return {id,star:r.star,pieces:r.pieces,objNum:r.objNum,param1:r.param1,info:JSON.stringify({finishTime:r.finishTime})};}
function list(p){return collections.map(c=>info(p,c.ID));}
function addPiece(p,itemID,count){const id=pieces.get(itemID);if(!id||!integer(count)||!count)error('INVALID_RELIC_PIECES');const a=archive(p),r=a.entries[id];if(r.pieces+count>limit)error('RELIC_PIECES_OVERFLOW');r.pieces+=count;p.relicArchive=a;}
function normalize(p){const taken=(p.inventory||[]).filter(i=>pieces.has(i.itemCfgId));if(!taken.length)return false;for(const i of taken)addPiece(p,i.itemCfgId,i.num);p.inventory=p.inventory.filter(i=>!pieces.has(i.itemCfgId));return true;}
const fields={1:'bossID',2:'finishedTime',3:'probability',4:'teamMinDan',5:'intervalTime',6:'lastBossID',7:'friendTeam',8:'monsterID',9:'itemID',10:'mapID',11:'taskType',12:'gamePlay',13:'gameLevel',14:'isChenmo',15:'bossUseSkill',16:'gameMode',17:'entityID',18:'levelNumber'};
function compare(a,op,b){if(!Number.isFinite(a)||!Number.isFinite(b))return false;switch(op){case 0:return true;case 1:return a===b;case 2:return a>b;case 3:return a<b;case 4:return a>=b;case 5:return a<=b;case 6:return a!==b;default:return false;}}
function conditions(conditions,ctx){return conditions.every(c=>fields[c.condType]&&Object.hasOwn(ctx,fields[c.condType])&&compare(ctx[fields[c.condType]],c.opType,c.value));}
function matches(t,ctx){return conditions(t.CondArg||[],ctx)||(!!t.CondArg1?.length&&conditions(t.CondArg1,ctx));}
// Returns a draft only. The caller commits it with the action receipt/rewards.
// Repeated goals award one shard per TargetNum; star changes reset the new goal.
function planRecords(state,records,{random=n=>randomInt(n),time=Date.now(),base=state.player}={}){
 if(state.world?.level==='guide')return [];
 const a=archive(base);let changed=false;
 for(const record of records){
  if(!Number.isInteger(record.type)||!integer(record.amount??1)||((record.amount??1)===0&&!record.absolute))continue;
  const ctx={...record.context};
  const relevant=collections.map(c=>task(c.ID,a.entries[c.ID].star)).filter(t=>t?.TriggerEvent===record.type);
  if(relevant.some(t=>[...(t.CondArg||[]),...(t.CondArg1||[])].some(c=>c.condType===3))){const roll=random(10000);if(!Number.isInteger(roll)||roll<0||roll>=10000)error('INVALID_RELIC_RANDOM');ctx.probability=roll+1;}
  for(const t of relevant){
   if(!matches(t,ctx))continue;
   const r=a.entries[t.CollectionID],amount=record.amount??1,progress=record.absolute?amount:r.objNum+amount;
   if(!integer(progress)||!integer(t.TargetNum)||!t.TargetNum)error('RELIC_PROGRESS_OVERFLOW');
   const earned=record.absolute?(progress>=t.TargetNum&&r.cycles===0?1:0):Math.floor(progress/t.TargetNum),cycles=r.cycles+earned,remaining=record.absolute?Math.min(t.TargetNum,progress):progress%t.TargetNum;
   if(!integer(cycles))error('RELIC_PROGRESS_OVERFLOW');
   if(remaining!==r.objNum){r.objNum=remaining;changed=true;}
   if(earned){
    if(t.RewardID.length!==t.RewardNum.length)error('RELIC_REWARD_CONFIG');
    for(let i=0;i<t.RewardID.length;i++){const dest=pieces.get(t.RewardID[i]),count=t.RewardNum[i]*earned;if(!dest||!integer(count)||!count||a.entries[dest].pieces+count>limit)error('RELIC_REWARD_OVERFLOW');a.entries[dest].pieces+=count;}
    r.cycles=cycles;changed=true;
   }
  }
 }
 return changed?[[state.player,'relicArchive',a]]:[];
}
function killPlan(game,state,r,time=Date.now(),earnedItems=[]){
 if(r.summoned||!['mob','boss'].includes(r.kind))return [];
 const old=archive(state.player),h=old.history,ctx={monsterID:r.cid,mapID:state.world.mapId,gameLevel:state.world.entity.property.level};
 if(r.kind==='boss')ctx.bossID=r.cid;
 if(Number.isFinite(r.relicCombatStartedAt)&&time>=r.relicCombatStartedAt)ctx.finishedTime=(time-r.relicCombatStartedAt)/1000;
 if(h.lastBossRoom===state.world.room&&h.lastBossMap===state.world.mapId&&h.lifeStartedAt===state.world.startedAt&&Number.isFinite(h.lastBossAt)&&h.lastBossAt<=time){ctx.lastBossID=h.lastBossID;ctx.intervalTime=(time-h.lastBossAt)/1000;}
 // Mutual friendships only; same-room XP-eligible team members are authoritative.
 const members=require('./progression-3127').members(game,state,r),friends=members.filter(s=>s!==state&&state.player.friends?.[s.user.id]&&s.player.friends?.[state.user.id]&&!state.player.friendBlocks?.[s.user.id]&&!s.player.friendBlocks?.[state.user.id]);ctx.friendTeam=friends.length;
 // Native game mode from the catalog, never inferred from a client's request.
 const definition=require('./navigation-3127').definition(state.world),mode=definition?.mapId===state.world.mapId?definition.mode:undefined;
 if(Number.isInteger(mode))ctx.gameMode=mode;
 const records=[{type:2,context:ctx}];if(r.kind==='boss')records.push({type:1,context:ctx});for(const item of earnedItems)if(item.count>0)records.push({type:4,amount:item.count,context:{itemID:item.itemId,mapID:state.world.mapId}});
 let index=0;r.relicDeathRolls||=[];
 const changes=planRecords(state,records,{time,random:n=>{const i=index++;return r.relicDeathRolls[i]??(r.relicDeathRolls[i]=randomInt(n));}}),next=changes[0]?.[2]||old;
 if(r.kind==='boss'){next.history={lastBossID:r.cid,lastBossAt:time,lastBossRoom:state.world.room,lastBossMap:state.world.mapId,lifeStartedAt:state.world.startedAt};return [[state.player,'relicArchive',next]];}
 return changes;
}
function effects(p){if(!p?.relicArchive)return [];const out=[];for(const c of collections){const r=row(c.ID,entry(p,c.ID).star);if(!r)continue;for(const suffix of ['', '2']){const type=r['EffectType'+suffix];if(type)out.push({id:c.ID,type,args:Object.assign({},...(r['Args'+suffix]||[])),dropID:r['dropID'+suffix]||0});}}return out;}
function outgoing(state,skill,target){if(!target||!['mob','boss'].includes(target.kind))return 1;let percent=0;for(const e of effects(state.player)){const a=e.args;if(e.type===1&&skill?.attribute===a.attr||e.type===6&&state.world.mapId===a.mapID)percent+=a.percent||0;}return 1+percent/100;}
function incoming(state,source,skill,amount){let percent=0;for(const e of effects(state.player)){const a=e.args;if(e.type===2&&skill?.attribute===a.attr||e.type===5&&source.cid===a.monsterID)percent+=a.percent||0;}return Math.floor(amount*Math.max(0,1-Math.min(90,percent)/100));}
function stamina(state){return effects(state.player).filter(e=>e.type===15&&state.world?.mapId===e.args.mapID).reduce((n,e)=>n+(e.args.percent||0),0);}
function upgrade(game,state,id){const next=row(id,entry(state.player,id).star+1);if(!next)error('RELIC_INVALID_OR_MAX');const r=entry(state.player,id);if(r.pieces<next.ItemNums)error('RELIC_PIECES_REQUIRED',30);
 const p=structuredClone(state.player),a=archive(p);a.entries[id]={...r,star:next.Star,pieces:r.pieces-next.ItemNums,objNum:0,cycles:0};p.relicArchive=a;
 // Explicit native GainItemWhenUpStar only. dropID's purpose is not proven.
 let mailed=false;
 for(const s of ['', '2'])if(next['EffectType'+s]===9){
  const args=Object.assign({},...(next['Args'+s]||[]));if(!require('./inventory').items.has(args.itemID)||!integer(args.num)||!args.num)error('RELIC_REWARD_CONFIG');
  const mails=structuredClone(p.mails||[]),used=new Set([...mails,...(game.adminService?.db.mail||[])].map(m=>m.mailId));let mailId=690000000+id*10+next.Star;
  while(used.has(mailId)){mailId++;if(mailId>limit)error('MAIL_ID_OVERFLOW');}
  mails.push({mailId,sendDate:Math.floor(Date.now()/1000),readDate:0,senderUid:0,senderNickname:'Collection Archive',receiverUid:state.user.id,receiverNickname:state.user.username||'',title:'Collection '+id+' - Star '+next.Star,content:'Collection star reward',isExist:0,validPeriod:-1,annex:JSON.stringify([{id:args.itemID,num:args.num}]),remark:'[]',isTqtMail:false,relicUpgradeKey:id+':'+next.Star+':'+s});p.mails=mails;mailed=true;
 }
 const changes=Object.entries(p).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(state.player[k])).map(([k,v])=>[state.player,k,v]);require('./inventory').commit(game,changes,true);if(mailed)state.relicMailPending=true;return info(state.player,id);
}
function notifyInventory(game,p){for(const state of game.online||[]){if(state.player!==p)continue;if(state.world?.entity?.item)state.world.entity.item.items=p.inventory;try{game.push(state,'bagItemUpdatePsh',encode('BagItemUpdatePsh',{list:p.inventory||[]}));}catch{}}}
function sync(game,state,time=Date.now()){
 if(!state.relicArchiveLoaded||time-(state.relicLastAttempt??-Infinity)<1000)return;
 state.relicLastAttempt=time;
 if(state.relicMailPending){game.push(state,'updateMail',encode('MailList',{mails:game.adminService?.nativeMail(state.user.id)||(state.player.mails||[]).filter(m=>!m.deleted)}));state.relicMailPending=false;}
 const rows=list(state.player),signature=JSON.stringify(rows);if(signature===state.relicSignature)return;
 game.push(state,'updateItemsPush',encode('UpdateItemsPush',{itemList:rows.map(r=>({itemId:byID.get(r.id).PiecesID,itemNum:r.pieces}))}));
 game.push(state,'updateTaskPush',encode('UpdateTaskPush',{taskList:rows.flatMap(r=>{const t=task(r.id,r.star);return t?[{id:t.ID,progress:r.objNum,info:r.info}]:[];})}));
 state.relicSignature=signature;
}
function friendCount(game,state){return Object.values(game.players.db).filter(p=>p.uid!==state.user.id&&state.player.friends?.[p.uid]&&p.friends?.[state.user.id]&&!state.player.friendBlocks?.[p.uid]&&!p.friendBlocks?.[state.user.id]).length;}
function reconcileFriends(game,state){if(entry(state.player,5).star!==0)return;const changes=planRecords(state,[{type:3,amount:friendCount(game,state),absolute:true}]);if(changes.length)require('./inventory').commit(game,changes,true);}
function tick(game,time=Date.now()){for(const s of game.online||[])try{if(!s.relicArchiveLoaded)continue;if(time>=(s.relicReconcileAt||0)){s.relicReconcileAt=time+1000;reconcileFriends(game,s);}sync(game,s,time);}catch(e){console.warn('[RELIC DELIVERY] retry:',e.message);}}
function handle(game,state,m,req){if(!m.route.startsWith('game.collectionHandler.'))return false;if(!['loadCollection','upLevelCollection','collectionGetReward'].includes(m.route.split('.').at(-1)))return false;
 let result={code:0};
 try{
  if(m.route.endsWith('.loadCollection')){
   if((state.player.inventory||[]).some(i=>pieces.has(i.itemCfgId)))require('./inventory').commit(game,[[state.player,'inventory',structuredClone(state.player.inventory)]],true);
   reconcileFriends(game,state);
   result.collectionList=list(state.player);state.relicArchiveLoaded=true;state.relicSignature=JSON.stringify(result.collectionList);
  }else if(m.route.endsWith('.upLevelCollection'))result.collection=upgrade(game,state,req.id);
  else error('RELIC_DAILY_ACTIVITY_NOT_RESTORED',1106);
 }catch(e){result={code:e.code||1};}
 if(m.type===0)game.reply(state,m.id,encode(contract.responses[m.route],result));return true;
}
module.exports={collections,stars,tasks,byID,pieces,row,task,entry,info,list,archive,addPiece,normalize,fields,compare,conditions,matches,planRecords,killPlan,effects,outgoing,incoming,stamina,upgrade,notifyInventory,sync,tick,friendCount,reconcileFriends,handle};
