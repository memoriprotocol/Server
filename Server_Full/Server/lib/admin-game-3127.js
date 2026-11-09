'use strict';
const {encode,contract}=require('./codec'),{proto}=require('./proto'),C=require('./admin-catalog-3127');
function handleGame(game,state,m,req={}){
 const service=game.adminService;if(!service)return false;
 const route=m.route,reply=data=>{const type=contract.responses[route];if(m.type===0&&type)game.reply(state,m.id,encode(type,data));};
 try{
 if(route==='game.mailHandler.mailQuery'){reply({code:0,data:{mails:service.nativeMail(state.user.id)}});return true;}
 if(route==='game.mailHandler.mailOp'){reply(service.mailOp(state,req));return true;}
 if(route==='game.passHandler.passInfo'){reply({code:0,passInfo:service.passInfo(state.player)});return true;}
 if(route==='game.activityHandler.getActivitys'){
  const t=Math.floor(Date.now()/1000);reply({list:service.controls().filter(x=>x.kind==='activity'&&x.enabled).map(x=>({activityId:x.id,activityName:x.name,activityType:x.activityType,startShowTime:t-60,startTime:t-60,endTime:t+86400*30,endShowTime:t+86400*30,sortNum:0,showType:0}))});return true;
 }
 if(route==='game.activityHandler.loadActivity'){reply({code:0,activityList:service.controls().filter(x=>x.kind==='activity'&&x.enabled).map(x=>({id:x.id,restTime:86400*30,awardList:[]}))});return true;}
 if(route==='game.activityHandler.getActivitysRedDot'){reply({list:[]});return true;}
 if(route==='game.playerHandler.getPlayerHeadInfo'){
  const owned=state.player.adminOwnership||{};reply({code:0,headList:C.tables.profiles.map(r=>({id:r.ID,unlocked:r.HeadType?.includes(0)||!!owned.profiles?.[r.ID],isNew:false})),headFrameList:C.tables.frames.map(r=>({id:r.ID,unlocked:r.HeadFrameType?.includes(0)||!!owned.frames?.[r.ID],isNew:false})),designationList:C.tables.titles.map(r=>({id:r.ID,unlocked:r.ID===1||!!owned.titles?.[r.ID],isNew:false}))});return true;
 }
 if(route==='game.playerHandler.personalItemInfo'){
  reply({code:0,personalItemInfo:personal(state.player)});return true;
 }
 if(route==='game.playerHandler.checkPersonalItem'){reply({code:0});return true;}
 if(route==='game.playerHandler.equipPersonalItem'){
  const type=Number(req.type),id=Number(req.id);if(!personal(state.player).some(x=>x.id===id&&x.type===type&&x.unlocked))throw Error('PERSONAL_ITEM_NOT_OWNED');if(type===2)state.player.bubbleId=id;service.players.save();service.sync(state.user.id);reply({code:0});return true;
 }
 if(route.startsWith('game.guildHandler.'))return guild(service,game,state,m,req,reply);
 }catch(e){reply({code:1,message:e.message});return true;}
 return false;
}
function personal(p){const out=[];for(const [category,type]of [['emojis',1],['bubbles',2]])for(const r of C.tables[category])out.push({type,id:r.ID,unlocked:!!p.adminOwnership?.[category]?.[r.ID]||r[category==='emojis'?'EmojiType':'BubbleType']?.includes(0),isNew:false});return out;}
function guild(service,game,state,m,req,reply){
 let g=service.db.guilds.find(x=>x.guildId===state.player.guildId);const route=m.route;
 if(route.endsWith('.getAllGuilds')||route.endsWith('.getGuildRank')){reply({code:0,data:service.db.guilds.map(x=>service.guildView(x))});return true;}
 if(route.endsWith('.guildInfo')||route.endsWith('.getGuildInfo')){if(req.guildId)g=service.db.guilds.find(x=>x.guildId===Number(req.guildId));reply({code:0,data:g?[service.guildView(g)]:[]});return true;}
 if(route.endsWith('.guildMemberInfo')){reply({code:0,memberInfo:g?service.guildView(g).members.find(m=>m.uid===state.user.id):undefined});return true;}
 if(!route.endsWith('.guildOp'))return false;
 const op=Number(req.typ);let payload={};try{payload=JSON.parse(req.param2||'{}');}catch{throw Error('GUILD_INVALID_PARAMS');}
 service.transaction(()=>{
 if(op===0){if(g)throw Error('ALREADY_IN_GUILD');const name=String(payload.name||'').trim();if(!name||name.length>30||service.db.guilds.some(x=>x.name===name))throw Error('INVALID_GUILD_NAME');g={guildId:service.db.nextGuild++,name,lv:1,homeHallLv:1,wealth:0,fund:0,notice:String(payload.notice||'').slice(0,2000),autoAllow:payload.autoAllow?1:0,members:[{uid:state.user.id,position:3}],applications:[],ownedProfiles:[1],headId:1,version:1};service.db.guilds.push(g);state.player.guildId=g.guildId;
 }else if(op===1){const target=service.db.guilds.find(x=>x.guildId===Number(req.param1));if(g||!target)throw Error('INVALID_GUILD_APPLICATION');if(target.autoAllow){target.members.push({uid:state.user.id,position:1});state.player.guildId=target.guildId;g=target;}else if(!target.applications.some(x=>x.uid===state.user.id))target.applications.push({uid:state.user.id});target.version++;
 }else if(op===2){if(!g)throw Error('NOT_IN_GUILD');if(g.members.find(m=>m.uid===state.user.id)?.position===3)throw Error('TRANSFER_LEADER_FIRST');g.members=g.members.filter(x=>x.uid!==state.user.id);state.player.guildId=0;g.version++;
 }else throw Error('GUILD_OPERATION_NOT_AVAILABLE');
 });reply({code:0,typ:op,data:g?service.guildView(g):undefined});service.sync(state.user.id);return true;
}
module.exports={handleGame,personal};
