'use strict';
// Server reconstruction: bounded combat contacts, not a native threat table.
// Native HateTime controls leases; HateTyp describes roles, not damage ranking.
const uid=p=>p?.user?.id||p?.world?.entity?.id;
function life(p){return (p?.heroSummon?.owner||p?.battlePet?.owner||p)?.player?.battleStats?.id;}
function bind(p){return {uid:uid(p),world:p.world,actor:p.world.entity,room:p.world.room,mapId:p.world.mapId,life:life(p)};}
function matches(b,p){return !!(b&&p&&b.uid===uid(p)&&b.world===p.world&&b.actor===p.world?.entity&&b.room===p.world.room&&b.mapId===p.world.mapId&&(b.life==null||b.life===life(p)));}
function inRoom(r,p){const w=p?.world;return !!(w&&(w.mapId==null||(r.mapId||2)===w.mapId)&&(r.room==null||r.room===w.room)&&(!r.brain?.combatRoom||r.brain.combatRoom===w.room));}
function physical(p){const w=p?.world,e=w?.entity;return !!(w?.sceneReady&&w.loadingFinished!==false&&!w.dead&&e?.property?.HP>0&&Number.isFinite(e.physics?.x)&&Number.isFinite(e.physics?.y));}
function remember(b,p,time,ttl){b.contacts||=new Map();const id=uid(p);b.contacts.set(id,{...bind(p),until:time+ttl,hitAt:time});b.combatRoom??=p.world.room;
 while(b.contacts.size>32){const oldest=[...b.contacts.values()].filter(c=>c.uid!==b.targetUid).sort((a,c)=>a.hitAt-c.hitAt||a.uid-c.uid)[0];if(!oldest)break;b.contacts.delete(oldest.uid);}
 return b.contacts.get(id);
}
function lock(b,p,time,ttl){b.targetUid=uid(p);b.targetBinding=bind(p);b.hateUntil=time+ttl;b.combatRoom??=p.world.room;b.returning=false;b.destination=null;}
function refresh(b,time,ttl){b.hateUntil=time+ttl;const c=b.contacts?.get(b.targetUid);if(c)c.until=b.hateUntil;}
function prune(b,peers,time,eligible){if(!b.contacts)return;for(const [id,c]of b.contacts){const p=peers.find(p=>uid(p)===id);if(time>c.until||!matches(c,p)||!eligible(p))b.contacts.delete(id);}}
function replacement(b,peers,r){return [...(b.contacts?.values()||[])].sort((a,c)=>c.hitAt-a.hitAt||Math.hypot(a.actor.physics.x-r.x,a.actor.physics.y-r.y)-Math.hypot(c.actor.physics.x-r.x,c.actor.physics.y-r.y)||a.uid-c.uid).map(c=>peers.find(p=>matches(c,p))).find(Boolean);}
function clear(b){b.targetUid=0;b.targetBinding=null;b.targetState=null;b.contacts?.clear();}
module.exports={uid,life,bind,matches,inRoom,physical,remember,lock,refresh,prune,replacement,clear};
