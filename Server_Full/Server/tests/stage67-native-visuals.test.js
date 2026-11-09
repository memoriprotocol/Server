'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{native}=require('./helpers/stage67-native');
const skins=require('../config/schemes/SkinScheme.json').Skin.filter(s=>s.HeroId===25),assets=require('../../retail/client-reference/stage67/swordsman-assets.json'),paths=new Set(assets.map(a=>a.path));
for(const skin of skins)for(const star of [1,2,3])for(let index=0;index<star;index++)test('native CCSwordQi selects skin'+skin.ID+' star'+star+' wave'+index+' prefab and first-wave sound',()=>{
 const create=native('CCSwordQi',"['create']=function",{_0x46de56:()=>{},_0x125418:{prototype:{create:()=>true}},_0x3e0914:{Instance:{getSkinByID:id=>skins.find(s=>s.ID===id)}}}),seen=[];
 const input={ud:{skinID:skin.ID,index,skillLv:star,angle:225}};assert.equal(create.call({playEffect:(p,a)=>seen.push({kind:'effect',p,a}),playSound:p=>seen.push({kind:'sound',p})},null,input),true);
 const prefix='arena/heroskill/302500_skill_tx_'+(skin.Effect?skin.ID:2501)+'/prefab/';assert.equal(seen[0].p,prefix+'302500_skill_tx_0'+(index+1));assert.equal(seen[0].a,225);assert.ok(paths.has(seen[0].p));assert.equal(seen.length,index===0?2:1);if(index===0){assert.equal(seen[1].p,prefix+'sound_'+star);assert.ok(paths.has(seen[1].p));}
});
test('native swordQi numeric entity type is1208 and all24 original prefab imports are identified',()=>{const source=fs.readFileSync(path.join(__dirname,'../../retail/client-reference/stage67/Creatures.ts'),'utf8');assert.ok(source.includes('"swordQi"]=0x4b8'));assert.equal(assets.length,24);assert.ok(assets.every(a=>a.importSHA256.length===64));});
