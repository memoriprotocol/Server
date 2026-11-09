'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const geo=require('../lib/geometry-3127');
const motion=require('../lib/motion-3127');
const {buildingCollider}=require('../lib/actions-3127');
const families=require('../lib/weapon-family-3127');
const inventory=require('../lib/inventory');
test('2024 wall rectangular footprint: a walk along the side passes and direct collision blocks',()=>{
 const wall=buildingCollider({buildID:327,x:300,y:0},0);
 assert.equal(wall.shape,'rect');assert.equal(wall.halfW,80);assert.equal(wall.halfH,45);
 // On the northern side, rectangle is narrow in Y; old circle approximation wrongly blocked.
 assert.equal(geo.firstCollision(0,110,500,110,[wall]),null);
 assert.ok(geo.firstCollision(0,0,500,0,[wall])!==null);
 const m=motion.createMotion({physics:{x:0,y:0}});motion.rotate(m,0);motion.start(m,true,100);
 for(let i=0;i<8;i++)motion.step(m,2,.1,700,[buildingCollider({buildID:327,x:300,y:0},32)]);
 assert.ok(m.x>=185&&m.x<=188,'avatar stops before wall with collision margin');
});
test('real client dimensions are used in overlap preview, with circle rectangle contact',()=>{
 const wall=geo.collider(0,0,[160,90]),fire=geo.collider(0,0,[100]);
 assert.equal(geo.overlap(wall,geo.collider(0,100,[100])),false);
 assert.equal(geo.overlap(wall,geo.collider(0,90,[100])),true);
 assert.equal(geo.overlap(wall,geo.collider(0,0,[160,90])),true);
 assert.equal(geo.overlap(wall,geo.collider(350,0,[160,90])),false);
 assert.equal(geo.overlap(wall,fire),true);
});
test('collision is swept without teleportation and allows escape from an old overlap',()=>{
 const wall=geo.collider(30,0,[12,100]);
 const f=geo.firstCollision(0,0,100,0,[wall]);assert.ok(f>0&&f<1);
 assert.equal(geo.firstCollision(30,0,100,0,[wall]),null);
 assert.equal(geo.firstCollision(0,100,100,100,[wall]),null);
});
test('2024 oriWeaponID identifies one family across upgrades, without late-only IDs',()=>{
 assert.equal(families.family(617400),families.family(617402));
 assert.notEqual(families.family(617400),families.family(617800));
 assert.equal(families.family(99999999),0);
 const older={uuid:'one',itemCfgId:617400,bagType:2,bagPos:0,num:1,extInfo:{}};
 const newer={uuid:'two',itemCfgId:617402,bagType:1,bagPos:2,num:1,extInfo:{}};
 assert.equal(families.duplicateInQuickbar([older,newer],newer,2),older);
 assert.throws(()=>inventory.move([older,newer],newer,2,2),/WEAPON_FAMILY_ALREADY_EQUIPPED/);
 assert.equal(newer.bagType,1,'a rejected move must not mutate the bag');
});
test('no client mouse click can start movement after adding geometry adapter',()=>{
 const m=motion.createMotion({physics:{x:0,y:0}});
 assert.equal(motion.moveTo(m,2,600,0),'ignored');assert.equal(m.moving,false);
 motion.start(m,true,100);motion.moveTo(m,2,700,0);assert.equal(m.moving,true);assert.equal(m.target,null);
});
