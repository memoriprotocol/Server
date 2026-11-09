'use strict';
const {PKG,packageEncode,packages,pbV,pbB,pbFields,textField,intField,parseMessage,response,websocketUpgrade}=require('./wire');
const {onWorld,tickWorld,detachWorld}=require('./world');
const {onInitial}=require('./initial');
const {parseClientRequest,rejection}=require('./protocol-3127');
const {onQuery}=require('./query-3127');
const {onBag}=require('./bag');
const commerce=require('./commerce-3127');
const {LocalTeams,onTeam}=require('./team-3127');
const {LocalFriends,onFriends}=require('./friends-3127');
const {HeartbeatTelemetry}=require('./heartbeat');
const concat=(...b)=>Buffer.concat(b.filter(Boolean));
const ok=()=>pbV(1,0),err=(message,code=1)=>concat(pbV(1,code),pbB(2,message));
const {encode,typedError,contract}=require('./codec');
const {profile,heroData}=require('./profile');
function playerInfo(u,p){return encode('PlayerInfo',profile(u,p));}
function loginRsp(u,p){return encode('LoginResp',{code:0,data:profile(u,p),heros:require('./profile').allHeroes(p),host:'127.0.0.1'});}
function serverList(online=0,guideOnly=false){const {LEVELS}=require('./world');return encode('ServersRsp',{code:0,battles:(guideOnly?['guide']:['main','rookie']).map(kind=>{const l=LEVELS[kind];return {id:l.server,roomId:l.roomTag+'#1#1',regionId:'1',serverNames:l.name,num:online,maxNum:128,lang:'all',mode:l.mode,needInviteCode:false,recomLang:'ru',vitality:100,isExist:0};}),regions:[{regionId:'1',host:'127.0.0.1'}]});}
const quietRoutes=new Set(['connector.entryHandler.heartbeat','battle.iob.heartbeat','battle.iob.frame']);
class GameServer{
 constructor(accounts,players,port=11000,host='127.0.0.1'){this.accounts=accounts;this.players=players;this.port=port;this.host=host;this.online=new Set();this.unhandled=new Map();this.commerceErrors=new Map();this.counters={earlyReadResponses:new Map(),queryResponses:new Map(),badProtobuf:new Map(),unsupportedTyped:new Map()};this.heartbeats=new HeartbeatTelemetry();this.teams=new LocalTeams(this);this.friends=new LocalFriends(this);this.worldTimer=setInterval(()=>require('./runtime-tick-3127').tick(this),50);this.worldTimer.unref?.();}
 attach(server){server.on('upgrade',(req,socket)=>{console.info('[GAME WS] upgrade from '+(socket.remoteAddress||'?')+' path='+String(req.url||'/').split('?')[0]);const state={buffer:Buffer.alloc(0),player:null,user:null,handshake:false};const ws=websocketUpgrade(req,socket,chunk=>this.onData(state,chunk),()=>{console.info('[GAME WS] close uid='+(state.user?.id||'guest'));this.heartbeats.unregister(state);this.teams.detach(state);this.online.delete(state);detachWorld(this,state);},pong=>this.heartbeats.pong(state,pong));if(!ws){console.warn('[GAME WS] upgrade refused');return;}state.ws=ws;this.online.add(state);this.heartbeats.register(state);console.info('[GAME WS] connected');});}
 out(state,type,body=Buffer.alloc(0)){state.ws.send(packageEncode(type,body));}
 reply(state,id,data){state.ws.send(response(id,data));}
 push(state,route,data){const r=Buffer.from(route,'utf8');if(r.length>255)throw Error('route too long');const msg=concat(Buffer.from([6,r.length]),r,data);this.out(state,PKG.DATA,msg);}
 onData(state,chunk){try{state.buffer=Buffer.concat([state.buffer,chunk]);if(state.buffer.length>4*1024*1024)throw Error('incoming packet limit');const [packets,left]=packages(state.buffer);state.buffer=left;for(const p of packets)this.onPacket(state,p);}catch(e){console.warn('[game]',e.message);state.ws.close();}}
 onPacket(state,packet){if(packet.type===PKG.HANDSHAKE){console.info('[GAME WS] handshake');state.handshake=true;this.out(state,PKG.HANDSHAKE,Buffer.from(JSON.stringify({code:200,sys:{heartbeat:0,dict:{},protos:{}},user:{local:true}})));return;}
 if(packet.type===PKG.HANDSHAKE_ACK){console.info('[GAME WS] handshake ack uid='+(state.user?.id||'guest'));return;}if(packet.type===PKG.HEARTBEAT){this.out(state,PKG.HEARTBEAT);return;}if(packet.type!==PKG.DATA||!state.handshake)return;
 const m=parseMessage(packet.body);if(m.route==='battle.iob.frame'&&state.user)this.heartbeats.frame(state,m.body.length);if(!quietRoutes.has(m.route))console.info('[GAME ROUTE] '+String(m.route||'?').slice(0,120)+' uid='+(state.user?.id||'guest')+' bytes='+m.body.length);if(m.type!==0&&m.type!==1)return;if(m.route?.startsWith('#')){this.reply(state,m.id,err('COMPRESSED_ROUTE_UNSUPPORTED'));return;}
 let fields;try{fields=pbFields(m.body);}catch(e){this.reply(state,m.id,typedError(m.route,'BAD_PROTOBUF'));return;}
 if(m.route==='connector.entryHandler.heartbeat'){this.heartbeats.heartbeat(state,'connector');this.reply(state,m.id,concat(pbV(1,fields.get(1)?.[0]||BigInt(Date.now())),pbV(2,Date.now()),pbV(3,0)));return;}
 if(m.route==='connector.entryHandler.login'){const token=textField(fields,6),u=this.accounts.identify(token);if(!u){console.warn('[GAME AUTH] login refused (invalid or expired token)');this.reply(state,m.id,err('Авторизуйтесь на сайте и откройте лаунчер.'));return;}
 this.teams.detach(state);detachWorld(this,state);for(const old of this.online)if(old!==state&&old.user?.id===u.id){detachWorld(this,old);old.user=null;old.player=null;old.ws.close();}
 for(const key of ['passClientReady','passDeliverySnapshot','passSyncLogAt','activityClientReady','activityDeliverySignature','activitySyncLogAt','eventRewardSyncPending','eventRewardSyncLogAt','paymentDeliveryPending','itemExchangeDelivery','accountEconomyPending','eventControlPending','rankingClientReady','rankingSnapshot','rankingRequestedUID','roomRankKey','roomRankAt','roomRankLogAt'])delete state[key];
 state.user=u;state.player=this.players.ensure(u);require('./collection-3127').migrate(this,state);require('./dan-3127').migrate(this,state.player);if(state.player.battleStats||state.player.pendingDeath||state.player.exp||state.player.level>1){require('./life-3127').finish(this,{user:u,player:state.player,world:{level:state.player.lastWorld==='rookie'?'rookie':'main'}});}this.reply(state,m.id,loginRsp(u,state.player));console.info('[game] login uid='+u.id+' account='+u.username+' lang='+textField(fields,10));return;}
 if(!state.user){if(m.type===0&&contract.responses[m.route])this.reply(state,m.id,typedError(m.route,'AUTH_REQUIRED',10));else console.warn('[GAME AUTH] Unmapped prelogin route rejected without invented response',String(m.route||'?').slice(0,120));return;}
 const u=state.user,p=state.player;
 if(m.route==='local.payment.ready'&&m.type===1){state.localPaymentReady=true;return;}
 if(m.route==='local.events.ready'&&m.type===1){state.localEventsReady=true;require('./event-window-3127').push(this,state);return;}
 let verified;try{verified=parseClientRequest(m.route,m.body);}catch(e){this.counters.badProtobuf.set(m.route,(this.counters.badProtobuf.get(m.route)||0)+1);if(m.type===0)this.reply(state,m.id,rejection(m.route,'BAD_PROTOBUF',400).bytes||typedError(m.route,'BAD_PROTOBUF'));return;}
 if(m.route==='game.gameHandler.playerInfo'){
  const wanted=Number(verified.value?.uid)||u.id,other=this.accounts.userById(wanted),otherPlayer=this.players.db[wanted];
  const detail=other?{uid:wanted,name:otherPlayer?.name||other.username,showId:String(wanted),totalExp:otherPlayer?.exp||0,titleExp:otherPlayer?.titleExp||0,heroId:otherPlayer?.heroId||1,headId:otherPlayer?.headId||1,headFrameId:otherPlayer?.headFrameId||1,reputation:otherPlayer?.reputation||0,brScore:otherPlayer?.brScore||0,battleId:[...this.online].find(s=>s.user?.id===wanted)?.world?.server||'',roomId:[...this.online].find(s=>s.user?.id===wanted)?.world?.room||'',status:[...this.online].some(s=>s.user?.id===wanted)?1:0}:{};
  if(m.type===0)this.reply(state,m.id,encode('PlayerDetail',detail));return;
 }
 if(m.route==='game.gameHandler.setName'){const name=textField(fields,1).trim();if(name.length<2||name.length>20){this.reply(state,m.id,err('INVALID_NAME'));return;}if(this.players.isNameTaken(name,u.id)){this.reply(state,m.id,err('NAME_TAKEN',21));return;}p.name=name;this.players.save();this.reply(state,m.id,concat(ok(),pbB(3,playerInfo(u,p))));this.push(state,'updatePlayer',playerInfo(u,p));return;}
 if(m.route==='game.gameHandler.getCoin'){this.reply(state,m.id,encode('CoinRsp',{code:0,coin:p.coin||0}));return;}
 if(m.route==='game.gameHandler.getDiamond'){this.reply(state,m.id,encode('DiamondRsp',{code:0,diamond:p.diamond||0}));return;}
 if(m.route==='game.gameHandler.getPets'){if(m.type===0)this.reply(state,m.id,encode('PetsRsp',{pets:(p.pets||[]).filter(x=>Number.isInteger(x.petId)&&x.petId>0)}));return;}
 if(['game.gameHandler.getServers','game.gameHandler.getBatchServers','game.gameHandler.getGuideServers','game.gameHandler.getNominateServer'].includes(m.route)){
  const list=serverList([...this.online].filter(s=>s.user).length,m.route==='game.gameHandler.getGuideServers');
  if(m.route==='game.gameHandler.getNominateServer'){const {decode}=require('./codec');this.reply(state,m.id,encode('NominateRsp',{code:0,nbattles:decode('ServersRsp',serverList()).battles[0]}));return;}
  this.reply(state,m.id,list);
  if(m.route!=='game.gameHandler.getGuideServers')this.push(state,'updateBatches',list);
  return;
 }
 try{if(onWorld(this,state,m,fields))return;}catch(e){console.warn('[WORLD ERROR]',m.route,e.message);if(m.type===0)this.reply(state,m.id,typedError(m.route,'INVALID_WORLD_REQUEST'));return;}
 try{if(onBag(this,state,m))return;}catch(e){if(m.type===0)this.reply(state,m.id,typedError(m.route,'BAD_PROTOBUF'));return;}
 if(require('./dungeons-3127').route(this,state,m,verified.value))return;
 if(onTeam(this,state,m,verified.value))return;
 if(onFriends(this,state,m,verified.value))return;
 if(require('./collection-3127').handle(this,state,m,verified.value))return;
 if(require('./relics-3127').handle(this,state,m,verified.value))return;
 if(require('./newbie-3127').handleRoute(this,state,m,verified.value))return;
 if(require('./talents-3127').handle(this,state,m,verified.value))return;
 if(require('./dan-3127').handle(this,state,m,verified.value))return;
 if(require('./rankings-3127').handle(this,state,m,verified.value))return;
 if(require('./passes-3127').handle(this,state,m,verified.value))return;
 if(require('./activities-3127').handle(this,state,m,verified.value))return;
 if(require('./admin-game-3127').handleGame(this,state,m,verified.value))return;
 if(require('./account-economy-3127').handle(this,state,m,verified.value))return;
 if(require('./payments-3127').handle(this,state,m,verified.value))return;
 if(commerce.handle(this,state,m,verified.value))return;
 if(onInitial(this,state,m,fields))return;
 if(onQuery(this,state,m,verified.value))return;
 const key=m.route||'(unknown)';this.unhandled.set(key,(this.unhandled.get(key)||0)+1);if(this.unhandled.get(key)<=3)console.warn('[UNIMPLEMENTED_ROUTE]',key,'uid='+u.id,'bytes='+m.body.length);
 if(m.type===0){const reject=rejection(key,'NOT_IMPLEMENTED',501);if(reject.bytes&&reject.representable)this.reply(state,m.id,reject.bytes);
  else {this.counters.unsupportedTyped.set(key,(this.counters.unsupportedTyped.get(key)||0)+1);console.warn('[NO_VERIFIED_ERROR_RESPONSE]',key,'uid='+u.id);}}
 }
 routeAudit(){return [...this.unhandled.entries()].sort((a,b)=>b[1]-a[1]).map(([route,hits])=>({route,hits}));}
 broadcastPlayer(uid){for(const s of this.online)if(s.user?.id===Number(uid)&&s.player)this.push(s,'updatePlayer',playerInfo(s.user,s.player));}
}
module.exports={GameServer,playerInfo,loginRsp,serverList,quietRoutes};
