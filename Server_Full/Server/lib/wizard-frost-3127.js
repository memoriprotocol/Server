'use strict';
// Native snowstorm182: seven stacks, refresh3000ms; freeze1500ms from6004.
// Binding to generic frozen_1(32), reset-on-freeze and mob applicability are
// reconstruction policies; the original server handler is not in this client.
const cfg=require('../config/schemes/BuffScheme.json').Buff.find(b=>b.type===182);
function put(state,r,skill,id,name,duration,time,stack,events,event){
 const status={id,name,source:state,sourceWorld:state.world,room:state.world.room,sourceMapId:state.world.mapId,spawnToken:r.spawnToken,life:r.spawnToken||r.entity,skill,until:time+duration,nextTick:time+1000,damage:0,slow:1,control:id===32,stackNum:stack};
 r.playerStatuses||=new Map();r.playerStatuses.set(id,status);const wire={type:id,group:0,duration,startTime:time,endTime:time+duration,stackNum:stack,maxStackNum:id===182?cfg.maxStackNum:1,isValid:1,fromEntityType:state.world.entity.type,fromEntitySkinID:state.world.entity.miscInfo.curSkinId};r.entity.buffer.buffs=(r.entity.buffer.buffs||[]).filter(b=>b.type!==id);r.entity.buffer.buffs.push(wire);events.push(event(r.entity,'buffAdd',wire));return status;
}
function onHit(state,r,skill,time,events,event){
 if(skill.ID!==6004||skill.level!==3||r.dead||!['mob','boss'].includes(r.kind)||require('./displacement-3127').immune(r,182,time))return;
 const args=require('./monster-skills-3127').argsOf(skill),old=r.playerStatuses?.get(182),same=old&&old.until>time&&old.life===(r.spawnToken||r.entity)&&require('./mob-control-3127').sourceValid(old,r),count=Math.min(args.freezeNum,(same?old.stackNum:0)+1);
 put(state,r,skill,182,'snowstorm',cfg.duration,time,count,events,event);
 if(count<args.freezeNum)return;r.playerStatuses.delete(182);r.entity.buffer.buffs=r.entity.buffer.buffs.filter(b=>b.type!==182);events.push(event(r.entity,'buffRemove',{type:182}));
 if(require('./displacement-3127').immune(r,32,time))return;put(state,r,skill,32,'frozen_1',args.freezeDuration,time,1,events,event);require('./mob-control-3127').interrupt(r,time,events,event);events.push(event(r.entity,'moveStop',{}));
}
module.exports={cfg,put,onHit};
