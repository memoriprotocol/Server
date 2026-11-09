'use strict';
const {createHash}=require('node:crypto');
const inventory=require('./inventory');
const metadata=require('../config/admin-item-metadata-3127.json');
const load=(f,k)=>require('../config/schemes/'+f+'.json')[k];
const heroes=load('HeroScheme','Hero'),skins=load('SkinScheme','Skin'),mounts=load('MountScheme','Mount');
const tables={emojis:load('EmojiScheme','Emoji'),actions:load('PlayerActionScheme','PlayerAction'),bubbles:load('BubbleScheme','Bubble'),profiles:load('PlayerHeadScheme','PlayerHead'),frames:load('PlayerHeadFrameScheme','PlayerHeadFrame'),titles:load('DesignationScheme','Designation')};
// Later-version cosmetics have no native definitions in this client. Keep their
// explicit empty catalogs rather than turning a later-version ID into an item.
for(const k of ['kill-effects','entry-notices','cards','crit-fonts','decorations'])tables[k]=[];
const revision=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const entry=(r,id=r.ID)=>({id,itemId:r.ItemID||r.ID,sourceName:r.Name||r.name||metadata[r.ItemID]?.sourceName||String(id),name:r.Name||r.name||metadata[r.ItemID]?.sourceName||String(id),names:metadata[r.ItemID]?.names||{zh:r.Name||r.name||String(id)},icon:metadata[r.ItemID]?.icon||'',nativeIcon:r.Icon||r.Path||'',valid:r.isValid!==false,protected:false,variants:[],forms:[]});
function itemDef(item){return {...metadata[item.ID],id:item.ID,itemId:item.ID,name:item.name||String(item.ID),itemName:item.name||String(item.ID),names:metadata[item.ID]?.names||{zh:item.name},itemType:item.itemType,icon:metadata[item.ID]?.icon||'',nativeIcon:item.icon,storage:inventory.defaultBag(item.ID),supported:true,nativeId:item.ID,nativeType:'ItemScheme'};}
function definitions(q='',ids){const query=String(q).toLowerCase();return [...inventory.items.values()].filter(x=>ids?ids.includes(x.ID):!query||String(x.ID).includes(query)||[x.name,...Object.values(metadata[x.ID]?.names||{})].join(' ').toLowerCase().includes(query)).map(itemDef);}
function levelRules(){let total=0;return load('LevelExpScheme','LevelExp').filter(r=>r.GameMode.includes(0)).map((r,i,rows)=>{const start=total;total+=r.levelUpExp;return{level:r.level,minimum:start,maximum:i===rows.length-1?4294967295:total-1}});}
function itemQuantity(p,id){return inventory.canonicalInventory(p.inventory||[]).filter(i=>i.itemCfgId===id).reduce((n,i)=>n+i.num,0);}
function snapshot(game,u,p,section='basic'){
 const base={accountId:u.id,uid:u.id,gameId:String(u.id),showId:String(u.id),online:[...game.online].some(s=>s.user?.id===u.id),revision:revision(p),serverTime:Date.now()};
 if(section==='basic')return {...base,basic:{name:p.name||u.launcherName||u.username,coin:p.coin||0,diamond:p.diamond||0,mysteryShards:itemQuantity(p,112),level:require('./progression-3127').progress(require('./progression-3127').totalOf(p)).level,experience:require('./progression-3127').totalOf(p),bossKills:p.bossKills||0,mobKills:p.mobKills||0,titleExp:p.titleExp||0,reputation:p.reputation||0,brScore:p.brScore||0},rules:{levels:levelRules(),numberMax:4294967295,currencyMax:2147483647,shardMax:1000000}};
 if(section==='hero-skins'){
  const defaults=new Set(heroes.map(h=>h.Skins[0]));return {...base,activeHeroId:p.heroId||1,activeSkinId:p.curSkinId||heroes.find(h=>h.ID===(p.heroId||1))?.Skins[0],heroes:heroes.map(h=>({id:h.ID,name:h.Name,names:{en:h.Name},defaultSkinId:h.Skins[0],skins:skins.filter(s=>h.Skins.includes(s.ID)).map(r=>({...entry(r),heroId:h.ID,kind:r.ID===h.Skins[0]?'default':'base',protected:defaults.has(r.ID),forms:[],variants:[]}))})),ownership:Object.fromEntries([...defaults,...(p.ownedSkins||[])].map(id=>[id,true]))};
 }
 if(section==='mounts'){
  const owned=[...require('./mounts-3127').owned(p)],ownership=Object.fromEntries(owned.map(id=>[id,true]));
  for(const row of mounts)for(const index of row.Skins||[])ownership[index]=owned.includes(row.ID);
  const nativeSkin=require('./mounts-3127').snapshot(p,null).currSkinId;
  return {...base,equippedMountId:p.mountNow||0,equippedSkinId:nativeSkin||p.mountNow||0,ownedMounts:owned,mounts:mounts.map(r=>({id:r.ID,name:r.Name,names:{zh:r.Name},defaultSkinId:r.ID,skins:[{...entry(r),icon:metadata[r.ID]?.clientIcon===r.Icon?metadata[r.ID].icon||'':'',nativeSkinId:0,mountId:r.ID,kind:'default',variants:(r.Skins||[]).map(index=>({...entry(r,index),icon:'',nativeIcon:r.Icon.replace('/spriteFrame','_'+String(index).padStart(2,'0')+'/spriteFrame'),nativeSkinId:index,itemId:r.ID,name:r.Name+' · '+index,names:{zh:r.Name+' · '+index},mountId:r.ID,parentId:r.ID,kind:'dye',protected:true,bundledWithMount:true,variants:[]}))}]})),ownership};
 }
 if(['weapons','equipment','misc'].includes(section)){
  const which=id=>inventory.weapons.some(w=>w.ItemID===id||w.weaponID===id)?'weapons':inventory.equipment.has(id)?'equipment':'items';
  return {...base,items:inventory.canonicalInventory(p.inventory||[]).filter(i=>which(i.itemCfgId)===(section==='misc'?'items':section)).map(i=>({...itemDef(inventory.items.get(i.itemCfgId)),uuid:i.uuid,quantity:i.num,maxQuantity:2147483647,bagType:i.bagType,bagPos:i.bagPos,category:which(i.itemCfgId),canRemove:true,canSetQuantity:section==='misc',capKnown:true,sourceName:inventory.items.get(i.itemCfgId)?.name||String(i.itemCfgId),equipped:[2,4].includes(i.bagType),selected:p.currentWeaponUUID===i.uuid,extInfo:i.extInfo}))};
 }
 const cats=section==='collections'?['emojis','actions','bubbles','profiles','frames']:section==='presentations'?['titles','kill-effects','entry-notices','cards','crit-fonts']:['decorations'];
 const catalog={},ownership={},expires={},usable={},selected={};
 for(const cat of cats){catalog[cat]=(tables[cat]||[]).map(r=>({...entry(r),protected:[r.EmojiType,r.ActionType,r.BubbleType,r.HeadType,r.HeadFrameType].some(a=>a?.includes(0))||cat==='titles'&&r.ID===1}));ownership[cat]={...(p.adminOwnership?.[cat]||{})};for(const r of catalog[cat])if(r.protected)ownership[cat][r.id]=true;expires[cat]={};usable[cat]={...ownership[cat]};selected[cat]=[];}
 return {...base,catalog,ownership,expires,usable,selected};
}
function grant(game,p,itemId,count=1){
 const id=Number(itemId),n=Number(count);if(!Number.isSafeInteger(n)||n<1||n>1000000)throw Error('INVALID_AMOUNT');
 const item=inventory.items.get(id);if(!item)throw Error('UNKNOWN_ITEM_CONFIG');
 if(require('./relics-3127').pieces.has(id)){require('./relics-3127').addPiece(p,id,n);return;}
 if(id===109||id===111){const key=id===109?'coin':'diamond';if((p[key]||0)+n>2147483647)throw Error('CURRENCY_OVERFLOW');p[key]=(p[key]||0)+n;return;}
 const skin=item.itemType===27?skins.find(r=>r.ID===id||(item.args||[]).includes(r.ID)):null;
 if(item.itemType===50){p.fishRod=[...new Set([...(p.fishRod||[]),id])];return;}
 if(skin){p.ownedSkins=[...new Set([...(p.ownedSkins||[]),skin.ID])];return;}
 if(require('./collection-3127').isShard(id)){require('./collection-3127').grant(p,id,n);return;}
 const mount=mounts.find(r=>r.ID===id);if(mount){p.mountList=[...new Set([...require('./mounts-3127').owned(p),mount.ID])];return;}
 for(const [category,rows]of Object.entries(tables)){const r=rows.find(r=>r.ItemID===id);if(r){p.adminOwnership||={};p.adminOwnership[category]||={};p.adminOwnership[category][r.ID]=true;p.personalItems||=[];if(!p.personalItems.some(x=>x.id===id))p.personalItems.push({id,num:1});return;}}
 p.inventory=require('./commerce-3127').afterGrant(inventory.canonicalInventory(p.inventory||[]),id,n);
}
function update(game,u,p,section,b){
 if(Number(b.uid)!==u.id)throw Error('TARGET_MISMATCH');if(b.expectedRevision!==revision(p))throw Error('REVISION_CONFLICT');
 if(section==='basic'){
  const map={experience:'exp'},allowed=['name','coin','diamond','mysteryShards','level','experience','bossKills','mobKills','titleExp','reputation','brScore'];
  const changes=b.changes||{};if('experience' in changes||'level' in changes){const pr=require('./progression-3127'),xp='experience' in changes?changes.experience:pr.totalForLevel(changes.level);if(!Number.isSafeInteger(xp)||xp<0||xp>4294967295)throw Error('INVALID_VALUE');const next=pr.progress(xp);if('level' in changes&&changes.level!==next.level)throw Error('LEVEL_EXPERIENCE_MISMATCH');p.exp=xp;p.level=next.level;p.levelExp=next.remainExp;p.progressionVersion=40;}
  for(const [k,v]of Object.entries(b.changes||{})){
   if(!allowed.includes(k))throw Error('INVALID_FIELD');
   if(k==='name'){if(typeof v!=='string'||v.trim().length<1||v.length>32||game.players.isNameTaken(v,u.id))throw Error('INVALID_NAME');p.name=v.trim();}
   else if(k==='mysteryShards'){if(!Number.isSafeInteger(v)||v<0||v>1000000)throw Error('INVALID_VALUE');const old=inventory.canonicalInventory(p.inventory||[]),have=itemQuantity(p,112);if(v>have)p.inventory=require('./commerce-3127').afterGrant(old,112,v-have);else{let take=have-v;for(const item of old)if(item.itemCfgId===112){const n=Math.min(take,item.num);item.num-=n;take-=n;}p.inventory=old.filter(i=>i.num>0);}}
   else{if(['level','experience'].includes(k))continue;if(k==='level'&&!levelRules().some(r=>r.level===v))throw Error('INVALID_LEVEL');if(!Number.isSafeInteger(v)||v<0||v>2147483647)throw Error('INVALID_VALUE');p[map[k]||k]=v;}
  }
 }else if(section==='hero-skins'){
  const h=heroes.find(x=>x.ID===Number(b.heroId)),id=Number(b.skinId);if(!h||!h.Skins.includes(id)||h.Skins[0]===id||typeof b.owned!=='boolean')throw Error('INVALID_SKIN');
  p.ownedSkins=[...new Set(b.owned?[...(p.ownedSkins||[]),id]:(p.ownedSkins||[]).filter(x=>x!==id))];if(!b.owned&&p.curSkinId===id)p.curSkinId=h.Skins[0];
 }else if(section==='mounts'){
  const id=Number(b.mountId),skin=Number(b.skinId),def=mounts.find(r=>r.ID===id);if(!def||typeof b.owned!=='boolean')throw Error('INVALID_MOUNT');
  if(skin!==id&&skin!==0)throw Error('MOUNT_VARIANT_INCLUDED_WITH_PARENT');
  const owned=[...require('./mounts-3127').owned(p)];p.mountList=b.owned?[...new Set([...owned,id])]:owned.filter(x=>x!==id);if(!b.owned&&p.mountNow===id){p.mountNow=0;p.mountSkinNow=0;}
 }else if(['weapons','equipment','misc'].includes(section)){
  const visible=snapshot(game,u,p,section).items;if(!visible.some(x=>x.uuid===b.uuid))throw Error('ITEM_NOT_OWNED');
  const items=inventory.canonicalInventory(p.inventory||[]),item=items.find(x=>x.uuid===b.uuid);
  if(section==='misc'&&b.operation!=='remove'){
   if(b.operation!=='quantity'||!Number.isSafeInteger(b.quantity)||b.quantity<0||b.quantity>1000000)throw Error('INVALID_QUANTITY');item.num=b.quantity;p.inventory=items.filter(x=>x.num>0);
  }else{p.inventory=items.filter(x=>x!==item);if(p.currentWeaponUUID===item.uuid)p.currentWeaponUUID='';}
 }else{
  const category=String(b.category);const allowed=section==='collections'?['emojis','actions','bubbles','profiles','frames']:section==='presentations'?['titles','kill-effects','entry-notices','cards','crit-fonts']:['decorations'];if(!allowed.includes(category))throw Error('INVALID_CATEGORY');const row=(tables[category]||[]).find(r=>r.ID===Number(b.id));
  if(row&&snapshot(game,u,p,section).catalog[category].find(x=>x.id===row.ID)?.protected&&!b.owned)throw Error('DEFAULT_PROFILE_PROTECTED');
  if(!row||typeof b.owned!=='boolean')throw Error('UNKNOWN_NATIVE_COSMETIC');
  p.adminOwnership||={};p.adminOwnership[category]||={};p.adminOwnership[category][row.ID]=b.owned;
  p.personalItems=(p.personalItems||[]).filter(x=>x.id!==row.ItemID);if(b.owned&&row.ItemID)p.personalItems.push({id:row.ItemID,num:1});
 }
}
module.exports={revision,definitions,levelRules,snapshot,grant,update,tables,heroes,skins,mounts};
