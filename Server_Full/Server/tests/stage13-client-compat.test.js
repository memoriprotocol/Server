'use strict';
const assert=require('node:assert/strict');const test=require('node:test');
const {asAchievement,types}=require('../lib/achievement-3127');
const {profile}=require('../lib/profile');const {avatar,LEVELS}=require('../lib/world');
const {encode,decode}=require('../lib/codec');
test('2024 achievement catalog yields one existing first stage per type',()=>{
 const a=asAchievement({});assert.equal(a.achievementInfos.length,62);
 assert.equal(new Set(a.achievementInfos.map(x=>x.type)).size,62);
 assert(a.achievementInfos.every(x=>x.stage>=1&&x.progress===0));
 assert.equal(types.length,62);
});
test('saved legitimate progress survives, missing values default without completing',()=>{
 const a=asAchievement({achievements:[{type:1,stage:2,progress:9},{type:2,stage:999,progress:1}]});
 assert.equal(a.achievementInfos.find(x=>x.type===1).stage,2);
 assert.equal(a.achievementInfos.find(x=>x.type===1).progress,9);
 assert.equal(a.achievementInfos.find(x=>x.type===2).stage,1);
});
test('LoginResp and AchievementRsp serialize typed achievement data',()=>{
 const p={uid:2,createdAt:'2024-02-22',coin:0,diamond:0};const u={id:2,username:'test'};
 const packet=decode('LoginResp',encode('LoginResp',{code:0,data:profile(u,p)}));
 assert.equal(packet.data.achievement.achievementInfos.length,62);
 const reply=decode('AchievementRsp',encode('AchievementRsp',{code:0,data:asAchievement(p).achievementInfos}));
 assert.equal(reply.data.length,62);
});
test('player EntityInfo contains valid building and settle components for 2024 client UI',()=>{
 const fake={user:{id:2,username:'test'},player:{uid:2,inventory:[]},world:{level:'main',currentWeaponUUID:null}};
 const entity=avatar(fake);const wire=decode('EntityInfo',encode('EntityInfo',entity));
 assert(wire.building,'buildings protobuf component must exist');assert(Array.isArray(wire.building.buildings));
 assert(wire.settle,'killCount protobuf component must exist');assert.equal(wire.settle.killCount,0);
});
