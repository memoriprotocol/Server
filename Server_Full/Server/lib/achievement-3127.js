'use strict';
// 2024 AchievementScheme is the authoritative catalog (not the later server).
const rows=require('../config/schemes/AchievementScheme.json').Achievement;
const byType=new Map();
for(const item of rows){const type=Number(item.AchievementType),stage=Number(item.Stage);
 if(Number.isInteger(type)&&type>0&&Number.isInteger(stage)&&stage>0){
  const list=byType.get(type)||new Set();list.add(stage);byType.set(type,list);
 }}
const types=[...byType.keys()].sort((a,b)=>a-b);
function asAchievement(player){
 const saved=player?.achievements;
 const entries=Array.isArray(saved)?saved:Array.isArray(saved?.achievementInfos)?saved.achievementInfos:[];
 const lookup=new Map(entries.filter(x=>x&&Number.isInteger(Number(x.type))).map(x=>[Number(x.type),x]));
 return {achievementInfos:types.map(type=>{
  const previous=lookup.get(type)||{},known=byType.get(type);
  const stage=Number(previous.stage);
  return {type,stage:known.has(stage)?stage:Math.min(...known),progress:Math.max(0,Math.trunc(Number(previous.progress)||0)),
   steamProgress:Math.max(0,Math.trunc(Number(previous.steamProgress)||0)),logTime:Math.max(0,Math.trunc(Number(previous.logTime)||0))};
 })};
}
module.exports={asAchievement,types};
