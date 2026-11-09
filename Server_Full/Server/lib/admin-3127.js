'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const P=require('./admin-permissions'),C=require('./admin-catalog-3127'),inventory=require('./inventory');
const {encode,contract}=require('./codec'),{proto}=require('./proto');
const scheme=(f,k)=>require('../config/schemes/'+f+'.json')[k];
const passes=scheme('PassScheme','Pass'),activities=scheme('ActivitiesScheme','Activities');
const int=(v,min=0,max=2147483647)=>{const n=Number(v);if(v===null||v===''||typeof v==='boolean'||!Number.isSafeInteger(n)||n<min||n>max)throw Error('INVALID_ARGUMENTS');return n;};
const page=(rows,b,size=50)=>({total:rows.length,offset:Math.max(0,Number(b.offset)||0),items:rows.slice(Math.max(0,Number(b.offset)||0),Math.max(0,Number(b.offset)||0)+size)});
class AdminService{
 constructor(accounts,players,game){this.accounts=accounts;this.players=players;this.game=game;this.file=path.join(path.dirname(players.file),'admin-state-3127.json');this.db={version:1,events:{},guilds:[],mail:[],mailEvents:[],mailStates:{},requests:{},shop:null,shopHistory:[],shopRevision:1,nextMail:1,nextGuild:1};if(fs.existsSync(this.file))this.db={...this.db,...JSON.parse(fs.readFileSync(this.file))};this.flush();if(this.db.shop)require('./commerce-3127').replaceOffers(this.db.shop);game.adminService=this;}
 flush(){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.db),{mode:0o600});fs.renameSync(tmp,this.file);}
 transaction(fn){const db=structuredClone(this.db),players=structuredClone(this.players.db);try{const r=fn();this.players.save();this.flush();return r;}catch(e){this.db=db;this.players.db=players;for(const s of this.game.online)if(s.user&&players[s.user.id])s.player=players[s.user.id];try{this.players.save();this.flush();}catch(_){}throw e;}}
 dedupe(b,actor,fn){if(!b.requestId)return this.transaction(fn);if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(b.requestId)))throw Error('INVALID_REQUEST_ID');const key=actor.id+':'+b.requestId,hash=C.revision(b),old=this.db.requests[key];if(old){if(old.hash!==hash)throw Error('REQUEST_CONFLICT');return old.result;}return this.transaction(()=>{const result=fn();this.db.requests[key]={hash,result};const keys=Object.keys(this.db.requests);if(keys.length>2000)delete this.db.requests[keys[0]];return result;});}
 target(b){const id=int(b.targetAccountId??b.accountId??b.uid,1),u=this.accounts.userById(id);if(!u)throw Error('TARGET_NOT_FOUND');return {u,p:this.players.ensure(u)};}
 user(u){const p=this.players.db[u.id];return {...this.accounts.public(u),id:u.id,uid:p?u.id:0,gameId:p?String(u.id):'',showId:p?String(u.id):'',gameName:p?.name||u.launcherName||u.username,name:p?.name||u.launcherName||u.username,online:[...this.game.online].some(s=>s.user?.id===u.id)};}
 users(b){const q=String(b.q||'').toLowerCase();return this.accounts.db.accounts.map(u=>this.user(u)).filter(u=>!q||[u.accountId,u.username,u.launcherName,u.gameName].some(x=>String(x).toLowerCase().includes(q)));}
 sync(uid,before){
 const p=this.players.db[uid];if(!p)return;
 for(const s of this.game.online)if(s.user?.id===uid){s.player=p;if(s.world?.entity){const e=s.world.entity;e.item.items=inventory.inventoryOf(s);const ud=JSON.parse(e.ud||'{}');ud.fishRod=p.fishRod||[];e.ud=JSON.stringify(ud);e.miscInfo.name=p.name||s.user.launcherName||s.user.username;e.property.level=p.level||1;e.equip={...e.equip,...inventory.equipData(e.item.items,p.currentWeaponUUID)};if(before){require('./world').inventoryPush(this.game,s,{privateEvents:inventory.resultEvents(before.inventory||[],p.inventory||[]),publicEvents:[],created:[],destroyed:[]});}}
  if(s.world?.entity){const events=[];require('./mounts-3127').sync(this.game,s,events,require('./world').entityEventData);require('./world').inventoryPush(this.game,s,{privateEvents:[],publicEvents:events.map(e=>['changeMount',require('./proto').entityEvent.changeMount.decode(e.data)]),created:[],destroyed:[]});require('./talents-3127').refresh(this.game,s);s.world.entity.talent=require('./talents-3127').info(p);this.game.push(s,'updateTalent',encode('TalentRsp',{code:0,data:require('./talents-3127').info(p)}));}
  if(s.world?.entity){const ev=require('./world').entityEventData(s.world.entity,'updateUserdata',{ud:s.world.entity.ud});this.game.push(s,'rm',encode('ReplicateMsg',{events:[ev]}));}
  require('./collection-3127').push(this.game,s,{heroes:require('./collection-3127').allHeroes(p),pets:p.pets||[]});for(const mountId of require('./mounts-3127').owned(p))this.game.push(s,'mountInfoPush',encode('MountInfoPush',{mount:{mountId}}));
  this.game.push(s,'updateCoin',encode('CoinUpdatePush',{coin:p.coin||0}));this.game.push(s,'updateDiamond',encode('DiamondUpdatePush',{diamond:p.diamond||0}));}
 this.game.broadcastPlayer?.(uid);
 }
 controls(){return require('./activities-3127').controls(this);}
 activePass(){return this.controls().filter(x=>x.kind==='pass'&&x.enabled).sort((a,b)=>b.id-a.id)[0];}
 passInfo(p){return require('./passes-3127').info(this,p);}
 eventControls(b,actor){
  if(!P.canManageEventControls(actor))throw Error('FORBIDDEN');const keys=b.keys||[b.key];
  if(!Array.isArray(keys)||keys.length>500||typeof b.enabled!=='boolean')throw Error('INVALID_EVENT_CONTROL');
  const allowed=new Set(this.controls().map(x=>x.key));for(const k of keys)if(!allowed.has(k))throw Error('UNKNOWN_EVENT_CONTROL');
  for(const k of keys){this.db.events[k]=b.enabled;if(b.enabled){this.db.eventWindows||={};this.db.eventWindows[k]||={start:Math.floor(Date.now()/1000)};if(k.startsWith('pass:'))for(const other of Object.keys(this.db.events))if(other.startsWith('pass:')&&other!==k)this.db.events[other]=false;}}
  this.flush();for(const s of this.game.online)if(s.player){
   require('./event-window-3127').changed(this.game,s,keys);
  }
  this.accounts.audit(actor,'event-controls',{keys,enabled:b.enabled});return {ok:true,controls:this.controls()};
 }
 guildView(g){const rows=g.members.map(m=>{const u=this.accounts.userById(m.uid),p=this.players.db[m.uid];return {...m,showId:String(m.uid),name:p?.name||u?.launcherName||u?.username||String(m.uid),guildId:g.guildId};});return {...g,lv:g.lv||1,homeHallLv:g.homeHallLv||1,wealth:g.wealth||0,fund:g.fund||0,notice:g.notice||'',headId:g.headId||1,levels:scheme('GuildLevelScheme','GuildLevel').map(r=>r.Level||r.level||r.ID),hallLevels:[1,2,3,4,5,6,7,8,9,10],memberNum:rows.length,members:rows,applications:g.applications||[],ownedProfiles:g.ownedProfiles||[],profiles:scheme('GuildBadgeScheme','GuildBadge').map(r=>({id:r.ID,owned:r.ID===1||(g.ownedProfiles||[]).includes(r.ID),equipped:g.headId===r.ID,protected:r.ID===1})),headList:scheme('GuildBadgeScheme','GuildBadge').map(r=>({id:r.ID,unlocked:r.ID===1||(g.ownedProfiles||[]).includes(r.ID),isNew:false})),chairmanId:rows.find(x=>x.position===3)?.uid||0,chairmanName:rows.find(x=>x.position===3)?.name||'',showId:String(g.guildId)};}
 guilds(b,actor){
 const action=b.action==='edit'?'update':b.action==='activate'?'activate-profile':b.action==='deactivate'?'deactivate-profile':b.action||'list';b={...b,...(b.changes||{})};if(action==='activate-profile')b.owned=true;if(action==='deactivate-profile')b.owned=false;P.requirePermission(actor,action==='list'||action==='detail'?'guilds.read':action==='update'?'guilds.edit':['approve','reject'].includes(action)?'guilds.applications':action==='set-position'?'guilds.roles':action==='transfer-leader'?'guilds.leader':action==='remove'?'guilds.members':b.owned||action==='equip'?'guilds.profiles.activate':'guilds.profiles.deactivate');
 if(action==='list')return{ok:true,guilds:this.db.guilds.filter(g=>!b.q||[g.guildId,g.name].some(x=>String(x).toLowerCase().includes(String(b.q).toLowerCase()))).map(g=>this.guildView(g))};
 const g=this.db.guilds.find(x=>x.guildId===int(b.guildId,1));if(!g)throw Error('GUILD_NOT_FOUND');if(action==='detail')return{ok:true,guild:this.guildView(g)};
 if(Number(b.expectedVersion)!==g.version)throw Error('REVISION_CONFLICT');
 if(action==='equip'){const id=int(b.ids?.[0],1);if(b.ids?.length!==1||!(g.ownedProfiles||[1]).includes(id))throw Error('PROFILE_NOT_OWNED');g.headId=id;}
 else if(action==='update'){for(const k of ['lv','homeHallLv','wealth','fund'])if(Object.hasOwn(b,k))g[k]=int(b[k],k==='lv'||k==='homeHallLv'?1:0,k==='lv'||k==='homeHallLv'?100:2147483647);if(Object.hasOwn(b,'notice'))g.notice=String(b.notice).slice(0,2000);}
 else if(action==='remove'){const uid=int(b.uid,1);if(g.members.find(m=>m.uid===uid)?.position===3)throw Error('GUILD_LEADER_PROTECTED');g.members=g.members.filter(m=>m.uid!==uid);if(this.players.db[uid])this.players.db[uid].guildId=0;}
 else if(action==='set-position'){const m=g.members.find(x=>x.uid===Number(b.uid));if(!m||m.position===3||![1,2,4,5,6,7].includes(Number(b.position)))throw Error('INVALID_GUILD_ROLE');m.position=Number(b.position);}
 else if(action==='transfer-leader'){const m=g.members.find(x=>x.uid===Number(b.uid));if(!m)throw Error('GUILD_MEMBER_NOT_FOUND');for(const x of g.members)if(x.position===3)x.position=1;m.position=3;}
 else if(['approve','reject'].includes(action)){const uid=int(b.uid,1),app=g.applications.find(x=>x.uid===uid);if(!app)throw Error('APPLICATION_NOT_FOUND');g.applications=g.applications.filter(x=>x.uid!==uid);if(action==='approve'){const {p}=this.target({uid});if(p.guildId)throw Error('ALREADY_IN_GUILD');g.members.push({uid,position:1});p.guildId=g.guildId;}}
 else if(['profiles','set-profile','profile','activate-profile','deactivate-profile'].includes(action)){const ids=b.ids||[b.headId||b.profileId];if(!ids.length||ids.length>500)throw Error('INVALID_PROFILES');for(const id of ids){int(id,1);if(!scheme('GuildBadgeScheme','GuildBadge').some(r=>r.ID===Number(id)))throw Error('UNKNOWN_PROFILE');}if(!b.owned&&ids.includes(1))throw Error('DEFAULT_PROFILE_PROTECTED');if(!b.owned&&ids.includes(g.headId))g.headId=1;g.ownedProfiles=b.owned?[...new Set([...(g.ownedProfiles||[]),...ids.map(Number)])]:(g.ownedProfiles||[]).filter(x=>!ids.includes(x));}
 else throw Error('INVALID_GUILD_ACTION');g.version++;this.players.save();this.flush();this.accounts.audit(actor,'guild.'+action,{guildId:g.guildId});for(const m of g.members)this.sync(m.uid);return {ok:true,guild:this.guildView(g)};
 }
 command(b,actor){
 const op=require('./admin-gameops-schema').normalizeGameOp(Object.fromEntries(Object.entries(b).filter(([k])=>!['actorToken','targetAccountId'].includes(k))));for(const key of P.commandRequirements(b,inventory.items.get(Number(b.itemId))))P.requirePermission(actor,key);
 if(op.guildRequired){const g=this.db.guilds.find(g=>g.guildId===Number(b.guildId));if(!g)throw Error('GUILD_NOT_FOUND');const field={'guild-level':'lv','guild-territory-level':'homeHallLv','guild-contribution':'wealth','guild-fund':'fund'}[b.command];g[field]=int(b.value,field==='lv'||field==='homeHallLv'?1:0);g.version++;this.flush();this.accounts.audit(actor,b.command,{guildId:g.guildId,value:g[field]});return{ok:true,guild:this.guildView(g)};}
 const {u,p}=this.target(b);if(u.role==='developer'&&actor.role!=='developer')throw Error('PROTECTED_ACCOUNT');const before=structuredClone(p),cmd=b.command;
 const result=this.transaction(()=>{
 if(['give-gold','give-diamond','give-xp'].includes(cmd)){const k=cmd==='give-gold'?'coin':cmd==='give-diamond'?'diamond':'exp';p[k]=int((p[k]||0)+int(b.amount,1,1e9));}
 else if(['give-item','give-currency','give-weapon','give-equipment','give-card'].includes(cmd))C.grant(this.game,p,int(b.itemId,1),b.amount||1);
 else if(cmd==='give-dec'){const id=int(b.itemId,1),cat={2:'bubbles',3:'actions',4:'emojis',12:'profiles',13:'frames',16:'titles'}[Number(b.type)];if(cat){if(!C.tables[cat].some(r=>r.ID===id))throw Error('UNKNOWN_NATIVE_COSMETIC');p.adminOwnership||={};p.adminOwnership[cat]||={};p.adminOwnership[cat][id]=true;}else if(Number(b.type)===7&&C.mounts.some(r=>r.ID===id)){p.mountList=[...new Set([...(p.mountList||[]),id])];}else if(Number(b.type)===15&&C.skins.some(r=>r.ID===id)){p.ownedSkins=[...new Set([...(p.ownedSkins||[]),id])];}else throw Error('COSMETIC_TYPE_ABSENT_IN_CLIENT_3127');}
 else if(cmd==='tutorial-mssing-clear'){p.tutorialCompleted=true;p.nameSet=true;}
 else if(cmd==='teleport'||cmd==='teleport-monster'){
  const state=[...this.game.online].find(x=>x.user?.id===u.id&&x.world?.sceneReady);if(!state)throw Error('PLAYER_OFFLINE');let x=Number(b.x),y=Number(b.y);
  if(cmd==='teleport-monster'){const r=require('./environment-3127').records(this.game,state).find(r=>r.cid===Number(b.monster)&&!r.dead);if(!r)throw Error('MONSTER_NOT_FOUND');x=r.x+250;y=r.y;}
  if(!require('./motion-3127').validPoint(state.world.mapId,x,y))throw Error('INVALID_COORDINATES');state.world.entity.physics.x=state.world.motion.x=x;state.world.entity.physics.y=state.world.motion.y=y;state.world.motion.moving=false;
  const {entityEventData}=require('./world');this.game.push(state,'rm',encode('ReplicateMsg',{events:[entityEventData(state.world.entity,'moveTo',{x,y,direction:1,frequency:1})]}));
 }else if(['kill-monster','respawn-monster'].includes(cmd)){
  const state=[...this.game.online].find(x=>x.user?.id===u.id&&x.world?.sceneReady);if(!state)throw Error('PLAYER_OFFLINE');const env=require('./environment-3127'),rows=env.records(this.game,state).filter(r=>r.cid===Number(b.monster));if(!rows.length)throw Error('MONSTER_NOT_FOUND');for(const r of rows){r.dead=cmd==='kill-monster';r.respawnAt=Date.now()+r.respawnMs;if(!r.dead){r.x=r.homeX;r.y=r.homeY;r.entity=env.entity(r);r.version++;}}
 }else throw Error('UNKNOWN_COMMAND');return{ok:true,command:cmd,targetAccountId:u.id,uid:u.id};
 });this.accounts.audit(actor,cmd,{...op.payload,target:u.id});this.sync(u.id,before);return result;
 }
 async route(route,req,b,secret){
 if(!route.startsWith('/auth/admin/'))return null;
 const owned=['/auth/admin/catalog','/auth/admin/game-ops/users','/auth/admin/event-controls','/auth/admin/guilds','/auth/admin/shop','/auth/admin/mail','/auth/admin/user-ingame','/auth/admin/command'];if(!owned.includes(route))return null;
 if(req.headers['x-local-web-secret']!==secret||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return {ok:false,code:'AUTH_REQUIRED'};
 const actor=this.accounts.asAdmin(b.actorToken);
 // Website GET event-controls has no player token; the trusted localhost secret
 // authenticates this read-only request. POST mutations always require actor.
 if(route==='/auth/admin/event-controls'&&req.method==='GET')return{ok:true,controls:this.controls()};
 if(!actor)return{ok:false,code:'AUTH_REQUIRED'};
 try{
 if(route.endsWith('/game-ops/users')){if(!P.any(actor))throw Error('FORBIDDEN');const rows=this.users(b),pg=Math.max(1,Number(b.page)||1);return{ok:true,users:b.page?rows.slice((pg-1)*10,pg*10):rows,total:rows.length,page:pg,pageSize:10,totalPages:Math.max(1,Math.ceil(rows.length/10))};}
 if(route.endsWith('/catalog')){if(!P.any(actor))throw Error('FORBIDDEN');return{ok:true,items:C.definitions(),cards:[],monsters:[...new Set(require('./environment-3127').templates.map(x=>x.cid))].filter(x=>x>0),permissions:P.CATALOG};}
 if(route.endsWith('/command'))return this.command(b,actor);
 if(route.endsWith('/event-controls'))return this.eventControls(b,actor);
 if(route.endsWith('/guilds'))return this.transaction(()=>this.guilds(b,actor));
 if(route.endsWith('/shop')){P.requirePermission(actor,'shop.manage');return this.shop(b,actor);}
 if(route.endsWith('/mail')){P.requirePermission(actor,'mail.manage');return this.mail(b,actor);}
 if(route.endsWith('/user-ingame')){
  P.requirePermission(actor,'users.manage');const {u,p}=this.target(b);if(['admin','developer'].includes(u.role)&&actor.role!=='developer')throw Error('PROTECTED_ACCOUNT');if(!['read','update','hero-skins.read','hero-skins.update','mounts.read','mounts.update','collections.read','collections.update','presentations.read','presentations.update','decorations.read','decorations.update','weapons.read','weapons.update','equipment.read','equipment.update','misc.read','misc.update'].includes(b.action))throw Error('INVALID_SECTION');const [scope,mode]=b.action.includes('.')?b.action.split('.'):['basic',b.action];if(mode==='read')return{ok:true,player:C.snapshot(this.game,u,p,scope)};
  const before=structuredClone(p);const result=this.dedupe(b,actor,()=>{C.update(this.game,u,p,scope,b);return{ok:true,changed:C.revision(before)!==C.revision(p),player:C.snapshot(this.game,u,p,scope),liveSync:'applied',notificationEvents:[]}});this.sync(u.id,before);this.accounts.audit(actor,'player.'+scope,{target:u.id});return result;
 }
 }catch(e){return{ok:false,code:e.message,httpStatus:e.message==='FORBIDDEN'||e.message==='PROTECTED_ACCOUNT'?403:/CONFLICT/.test(e.message)?409:400};}
 return null;
 }
}
module.exports={AdminService,int,page};
Object.assign(AdminService.prototype,require('./admin-content-3127'));
