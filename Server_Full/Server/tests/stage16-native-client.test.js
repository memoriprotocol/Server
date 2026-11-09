'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const native=require('../config/city-main-3127.json');
const assets=require('../../retail/client-reference/client-native-assets-3127.json');

test('native map2 still preserves 5 safe rectangles and now adds manual perimeter objects',()=>{
 assert.equal(native.mapId,2);assert.equal(native.safeAreas.length,5);
 for(const s of native.safeAreas){assert.ok(s.maxX>s.minX&&s.maxY>s.minY);}
 assert.deepEqual(native.npcs,[]);
 assert.equal(native.townObjects.length,36);
});

test('catalog documents client assets; Stage17 uses only assets available in this client',()=>{
 assert.equal(assets.noPositionInferred,true);assert.equal(assets.assetAvailabilityOnly,true);
 const paths=new Set(require('../config/map2-verified-prefabs-3127.json').prefabs.filter(r=>r.type==='cc.Prefab').map(r=>r.path));
 for(const o of native.townObjects)assert.ok(paths.has(o.prefab_path), o.prefab_path);
});
