'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const city=require('../lib/city-3127');

test('current operator city preserves 22 NPC/guards and 32 fences on Map2',()=>{
 assert.equal(city.npcRecords.length,22);
 assert.equal(city.townRecords.length,36);
 assert.equal(city.entitiesFor('main',2).length,58);
 assert.equal(city.entitiesFor('rookie',2).length,58);
 assert.equal(city.entitiesFor('guide',99).length,0);
 assert.equal(city.collidersFor('main',2).length,32);
 assert.equal(city.diagnostics().wallCount,32);
 assert.equal(city.diagnostics().bridgeCount,4);
});

test('stage17 keeps original 2024 safe rectangles and adds central gates',()=>{
 assert.equal(city.layout.safeAreas.length,5);
 assert.equal(city.safePoint(0,0,'main',2),true);
 assert.equal(city.safePoint(7500,0,'main',2),false);
 assert.equal(city.overlapsStatic(0, city.layout.safeAreas[0].maxY), false, 'north gate center should remain open');
 assert.equal(city.overlapsStatic(city.layout.safeAreas[0].minX, 0), false, 'west gate center should remain open');
 assert.equal(city.overlapsStatic(-2500, city.layout.safeAreas[0].maxY), true, 'north-west wall blocks');
 assert.equal(city.overlapsStatic(city.layout.safeAreas[0].minX, -2200), true, 'west-south wall blocks');
 assert.equal(city.diagnostics().layoutStatus,'STAGE26_OPERATOR_MAINCITY_LAYOUT');
});
