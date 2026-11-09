'use strict';
const inventory=require('./inventory'),{commands}=require('./proto');
const definitions=require('../config/schemes/TaskScheme.json').Task,byId=new Map(definitions.map(r=>[r.ID,r]));
const argsOf=r=>Object.assign({},...(r.TargetArgs||[]));
function category(state){return state.world?.questCategory??(state.world?.level==='rookie'?1:0);}
function tasks(state){const w=state.world;return w.questTasks||=(category(state)===1?structuredClone(state.player.rookieTasks||[]):[]);}
function active(state,rows=tasks(state)){
 const cat=category(state),out=structuredClone(rows),at=Date.now();for(const row of definitions){if(row.Category!==cat||row.isDelete||out.some(t=>t.id===row.ID))continue;
 if((row.PreTask||[]).some(id=>!byId.get(id)?.isDelete&&!out.some(t=>t.id===id&&t.state===2)))continue;
 out.push({id:row.ID,progress:0,state:0,receiveTime:at,finishTime:0});}
 return out;
}
function snapshot(state){if(state.world?.level==='guide')return{tasks:[],category:0};state.world.questTasks=active(state);return{tasks:state.world.questTasks,category:category(state)};}
function planRecord(state,type,data={},event=require('./world').entityEventData){
 if(!state.world?.sceneReady||state.world.level==='guide'||state.world.dead)return false;
 const old=state.world.questTasks??(category(state)===1?structuredClone(state.player.rookieTasks||[]):[]),next=active(state,old),changes=[];for(const task of next){const row=byId.get(task.id);if(!row||row.Category!==category(state)||row.isDelete||task.state!==0||row.TaskType!==type)continue;const args=argsOf(row);
 if(args.cid&&Number(data.cid)!==args.cid||args.itemID&&Number(data.itemID)!==args.itemID||args.talkGroupID&&Number(data.talkGroupID)!==args.talkGroupID||args.min&&!(Number(data.level)>=args.min)||args.max&&!(Number(data.level)<=args.max)||args.star&&!(Number(data.star)>=args.star)||args.mapID&&Number(data.mapID)!==args.mapID)continue;
 if(data.count!==undefined&&(!Number.isSafeInteger(data.count)||(data.absolute?data.count<0:data.count<=0)))throw Error('INVALID_QUEST_INCREMENT');
 const target=args.num||args.level||1;task.progress=Math.min(target,type===2?Number(data.level)||0:data.absolute?Number(data.count)||0:task.progress+(data.count||1));if(task.progress>=target){task.state=1;task.finishTime=Date.now();}
 }
 for(const task of next){const previous=old.find(t=>t.id===task.id);if(JSON.stringify(previous)!==JSON.stringify(task))changes.push([previous?'taskUpdated':'taskAdded',{task}]);}
 if(!changes.length)return false;
 const commits=[[state.world,'questTasks',next],[state.world.entity,'task',{tasks:next,category:category(state)}]];if(category(state)===1)commits.push([state.player,'rookieTasks',next]);return{changes:commits,events:changes.map(([name,data])=>event(state.world.entity,name,data))};
}
function planRecords(state,records,event=require('./world').entityEventData){
 const draft={...state,player:structuredClone(state.player),world:{...state.world,questTasks:structuredClone(state.world.questTasks??(category(state)===1?state.player.rookieTasks||[]:[])),entity:{...state.world.entity}}},events=[];let changed=false;
 for(const r of records){const p=planRecord(draft,r.type,r.data||{},event);if(!p)continue;changed=true;for(const [o,k,v]of p.changes)o[k]=v;events.push(...p.events);}
 if(!changed)return{changes:[],events:[]};const next=draft.world.questTasks;return{changes:[[state.world,'questTasks',next],[state.world.entity,'task',{tasks:next,category:category(state)}],...(category(state)===1?[[state.player,'rookieTasks',next]]:[])],events};
}
function record(game,state,type,data={},events=[],event=require('./world').entityEventData){const p=planRecord(state,type,data,event);if(!p)return false;inventory.commit(game,p.changes,category(state)===1);events.push(...p.events);return true;}
function submit(game,state,id){
 const oldLevel=state.world.entity.property.level||1,before=inventory.inventoryOf(state),old=tasks(state),nextTasks=active(state),task=nextTasks.find(t=>t.id===id),row=byId.get(id);if(!task||!row||row.isDelete||task.state!==1)throw Error('TASK_NOT_COMPLETED');
 const p=state.player,next=structuredClone(p),rewards=(row.RewardID||[]).map((itemId,i)=>({itemId,count:row.RewardNum[i]}));if(row.dropID)rewards.push(...require('./progression-3127').rollGroup(row.dropID));
 let xp=0;for(const reward of rewards){if(reward.itemId===4)xp+=reward.count;else require('./admin-catalog-3127').grant(game,next,reward.itemId,reward.count);}
 const pr=require('./progression-3127'),mode=state.world.level==='rookie'?1:0,progress=pr.progress(pr.totalOf(p,mode)+xp,mode);Object.assign(next,{exp:progress.totalExp,level:progress.level,levelExp:progress.remainExp,progressionVersion:40});
 if(xp)next.battleStats=require('./life-3127').rewardStats(state,xp);
 task.state=2;task.finishTime=Date.now();const unlocked=active(state,nextTasks);for(const t of unlocked){const d=byId.get(t.id),target=argsOf(d).level;if(t.state===0&&d.TaskType===2&&target){t.progress=Math.min(target,progress.level);if(t.progress>=target){t.state=1;t.finishTime=Date.now();}}}nextTasks.splice(0,nextTasks.length,...unlocked);if(category(state)===1)next.rookieTasks=nextTasks;
 const commits=Object.entries(next).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(p[k])).map(([k,v])=>[p,k,v]);commits.push([state.world,'questTasks',nextTasks],[state.world.entity,'task',{tasks:nextTasks,category:category(state)}]);inventory.commit(game,commits,true);
 state.world.entity.item.items=inventory.inventoryOf(state);if(xp)require('./level-delivery-3127').track(game,state,oldLevel);require('./talents-3127').refresh(game,state);
 const taskEvents=nextTasks.filter(t=>JSON.stringify(old.find(x=>x.id===t.id))!==JSON.stringify(t)).map(t=>[old.some(x=>x.id===t.id)?'taskUpdated':'taskAdded',{task:t}]);const events=[...taskEvents,['addExp',{remainExp:progress.remainExp,maxLevelExp:progress.maxLevelExp,isLevelUp:progress.level>oldLevel,addedExp:xp}],['updateTotalExp',{totalExp:progress.totalExp}]];
 require('./world').inventoryPush(game,state,{privateEvents:[...inventory.resultEvents(before,inventory.inventoryOf(state)),...events],publicEvents:require('./level-delivery-3127').upgrades(state,oldLevel),created:[],destroyed:[]});
 state.world.entity.task={tasks:nextTasks,category:category(state)};return rewards;
}
function handle(game,state,name,raw){if(name!=='submitTask')return false;const req=commands.CommandSubmitTask.decode(raw);submit(game,state,Number(req.taskID));return true;}
module.exports={definitions,argsOf,category,tasks,active,snapshot,planRecord,planRecords,record,submit,handle};

function objectiveRecords(game,state){
 const e=state.world.entity,items=inventory.inventoryOf(state),gear=items.filter(i=>i.bagType===4).map(i=>inventory.equipment.get(i.itemCfgId)).filter(Boolean),weapon=inventory.weapons.find(r=>r.weaponID===e.equip.currentItemID&&r.level===1),families=new Set(gear.map(r=>r.ID));
 const suits=require('../config/schemes/SuitScheme.json').SuitContent,suit=suits.some(r=>{const n=r.SuitParts.filter(id=>families.has(id)).length;return [...(r.PartsNumber||[]),...(r.SpecialNumbers||[]),...(r.skillNumbers?[r.skillNumbers]:[])].some(need=>need>0&&n>=need);});
 const records=[{type:2,data:{level:e.property.level}},{type:15,data:{count:gear.length,absolute:true}}];
 records.push({type:3,data:{count:suit?1:0,absolute:true}});
 if(weapon)records.push({type:6,data:{star:weapon.grade,count:1,absolute:true}});
 for(const star of [1,2,3,4,5,6,7])records.push({type:7,data:{star,count:gear.filter(r=>r.Star>=star).length,absolute:true}});
 const team=game.teams?.teamFor?.(state.user.id);if(team?.members.length>=2)records.push({type:11,data:{count:1,absolute:true}});
 return records;
}
function reconcile(game,state,events=[],event=require('./world').entityEventData){
 const w=state.world;if(!w?.sceneReady||!w.entity||w.dead||w.level==='guide')return;
 const key=JSON.stringify([w.entity.property.level,w.entity.equip.currentItemID,inventory.inventoryOf(state).filter(i=>i.bagType===4).map(i=>[i.uuid,i.itemCfgId]),game.teams?.teamFor?.(state.user.id)?.members.length||0,(w.questTasks||[]).map(t=>[t.id,t.state])]);if(w.questObjectiveKey===key)return;
 const records=objectiveRecords(game,state),planned=planRecords(state,records,event);
 if(planned.changes.length){inventory.commit(game,planned.changes,category(state)===1);events.push(...planned.events);}w.questObjectiveKey=key;
}
function sync(game,state,time=Date.now()){
 const w=state.world;if(!w?.sceneReady||!w.loadingFinished||!w.entity||w.level==='guide'||time<(w.nextQuestSyncAt||0))return;
 w.nextQuestSyncAt=time+1000;const rows=w.questTasks||[],previous=w.questClientRows||new Map(),events=[],event=require('./world').entityEventData;
 for(const task of rows)if(JSON.stringify(task)!==previous.get(task.id))events.push(event(w.entity,previous.has(task.id)?'taskUpdated':'taskAdded',{task}));
 if(!events.length)return;
 try{require('./world').replicate(game,state,events);w.questClientRows=new Map(rows.map(t=>[t.id,JSON.stringify(t)]));}catch(error){/* Latest persisted tasks are retried, without replaying the reward. */}
}
module.exports.objectiveRecords=objectiveRecords;module.exports.reconcile=reconcile;module.exports.sync=sync;
