'use strict';
const {createFriendService}=require('./friend-state-3127');
const {encode,contract}=require('./codec');
const ACTIONS=new Set(['memberInfo','loadFriends','loadPlayerBlocking','addFriend','authFriend','delFriend','playerBlock','friendStatusSwitching','loadFriendsChat','chatFriend','readFriendChat']);
class LocalFriends{
 constructor(game){this.game=game;this.service=createFriendService({data:{players:game.players.db},save:()=>game.players.save()});}
 find(id){return this.game.players.db[Number(id)]||null;}
 member(p,status=1){if(!p)return null;const online=[...this.game.online].find(s=>s.user?.id===p.uid);return {id:p.uid,name:p.name||this.game.accounts.userById(p.uid)?.username||String(p.uid),status:status===0?0:online?1:0,head:'',battle:online?.world?.server||'',mapId:online?.world?.mapId||0,redDot:0,showId:String(p.uid),headId:p.headId||1,headFrameId:p.headFrameId||1,designationId:0};}
 detail(p){if(!p)return null;return {member:this.member(p),totalExp:p.exp||0,titleExp:p.exp||0,heroId:p.heroId||1,skinId:p.skinId||0,reputation:p.reputation||0,brScore:p.brScore||0};}
 findTarget(info,type){const query=String(info).trim();if(![1,2,3].includes(Number(type))||query.length>80||!query) return null;
  if(type===1){const uid=Number(query);return Number.isSafeInteger(uid)?this.find(uid):null;}
  const user=this.game.accounts.db.accounts.find(u=>String(type===2?u.username:(this.game.players.db[u.id]?.name||u.username)).toLowerCase()===query.toLowerCase());return user?this.game.players.ensure(user):null;
 }
 push(uid,route,obj){for(const s of this.game.online)if(s.user?.id===uid){this.game.push(s,route,encode(contract.responses[route],obj));}}
 publish(result){for(const e of result?.events||[]){const person=this.member(e.player,e.status);if(!person)continue;
  if(e.kind==='request')this.push(e.to,'addFriendPush',{friend:person});
  if(e.kind==='auth')this.push(e.to,'authFriendPush',{type:e.type,friend:person});
  if(e.kind==='delete')this.push(e.to,'delFriendPush',{id:e.id});
  if(e.kind==='status')this.push(e.to,'friendStatusPush',{friend:person});
 }}
 handle(state,m,req){const route=m.route||'';if(!route.startsWith('game.friendHandler.'))return false;
  const op=route.split('.').at(-1);if(!ACTIONS.has(op))return false;
  const own=state.player,svc=this.service;let data={code:0},events=null,chatPush=null;
  try{
   switch(op){
    case 'memberInfo':{const p=this.find(req.id);if(!p)throw Object.assign(Error('NOT_FOUND'),{code:1001});data.member=this.detail(p);break;}
    case 'loadFriends':data.friends=svc.rows(own).map(r=>({...this.member(r.player,r.status),redDot:Number(r.status===0||svc.unread(own,r.player)>0)}));data.status=own.friendStatus||0;break;
    case 'loadPlayerBlocking':data.members=svc.blockedPlayers(own).map(p=>this.member(p));break;
    case 'addFriend':{const t=this.findTarget(req.info,req.type);if(!t)throw Object.assign(Error('NOT_FOUND'),{code:1001});events=svc.request(own,t,req.type);data.info=String(req.info);data.type=req.type;break;}
    case 'authFriend':{const p=this.find(req.id);events=svc.authorize(own,p,req.type);data.friend=this.member(p);data.type=req.type;break;}
    case 'delFriend':events=svc.remove(own,this.find(req.id));data.id=req.id;break;
    case 'playerBlock':{const p=this.find(req.id);events=svc.block(own,p,req.type);data.member=this.member(p);data.type=req.type;break;}
    case 'friendStatusSwitching':events=svc.setStatus(own,req.type);data.type=req.type;break;
    case 'loadFriendsChat':data.chatInfos=svc.messages(own,this.find(req.id),Number(req.time)||0);break;
    case 'chatFriend':{const target=this.find(req.id),msg=svc.chat(own,target,req);data.chatInfo=msg;chatPush={to:req.id,msg};break;}
    case 'readFriendChat':{const mark=svc.markRead(own,this.find(req.id));data={code:0,...mark};break;}
   }
  }catch(e){data={code:Number.isSafeInteger(e.code)?e.code:500,message:String(e.message||'FAILED').slice(0,120)};events=null;chatPush=null;}
  if(m.type===0)this.game.reply(state,m.id,encode(contract.responses[route],data));
  if(events)this.publish(events);
  if(chatPush)this.push(chatPush.to,'chatFriendPush',{chatInfo:chatPush.msg});
  return true;
 }
}
function onFriends(game,state,m,request){return game.friends?.handle(state,m,request||{})||false;}
module.exports={LocalFriends,onFriends,ACTIONS};
