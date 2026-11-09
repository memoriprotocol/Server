'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const city=require('../lib/city-3127');

test('stage17 no longer quarantines city entirely; old off flag still disables objects',()=>{
 const saveMode=process.env.HEROS_CITY_SPAWN_MODE,saveObj=process.env.HEROS_CITY_OBJECTS_ENABLED,saveNpc=process.env.HEROS_CITY_NPCS_ENABLED;
 try{
   delete process.env.HEROS_CITY_SPAWN_MODE; delete process.env.HEROS_CITY_OBJECTS_ENABLED;delete process.env.HEROS_CITY_NPCS_ENABLED;
   assert.equal(city.entitiesFor('main',2).length,58);
   process.env.HEROS_CITY_OBJECTS_ENABLED='0';process.env.HEROS_CITY_NPCS_ENABLED='0';
   assert.equal(city.entitiesFor('main',2).length,0);
   assert.equal(city.collidersFor('main',2).length,0);
 }finally{
   saveMode===undefined?delete process.env.HEROS_CITY_SPAWN_MODE:process.env.HEROS_CITY_SPAWN_MODE=saveMode;
   saveObj===undefined?delete process.env.HEROS_CITY_OBJECTS_ENABLED:process.env.HEROS_CITY_OBJECTS_ENABLED=saveObj;saveNpc===undefined?delete process.env.HEROS_CITY_NPCS_ENABLED:process.env.HEROS_CITY_NPCS_ENABLED=saveNpc;
 }
});
