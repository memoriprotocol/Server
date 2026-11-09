'use strict';
// 2024 client battle.teamHandler: rooms, teams, membership, invites and roster pushes.
// All data are scoped to the current in-world room. No synthetic guild/loot grants.
const {encode,contract}=require('./codec');
const PREFIX='battle.teamHandler.';
const SUPPORTED=new Set(['createTeam','getAllTeams','getMyTeam','joinTeam','exitTeam','changeTeamLeader','changeTeamName','kickOutTeamMember','inviteJoinTeam','acceptInviteTeam','refuseInviteTeam','blockInviteTeam','applyTeam','acceptJoinTeam','refuseJoinTeam','isInvite','getTeamMembers']);
class LocalTeams{
 constructor(game){this.game=game;this.next=1;this.teams=new Map();this.invites=new Map();this.applications=new Map();this.blocked=new Map();}
 online(uid){return [...this.game.online].find(s=>s.user?.id===uid&&s.world?.sceneReady);}
 teamFor(uid){return [...this.teams.values()].find(t=>t.members.includes(uid));}
 roomMembers(t){return t.members.map(uid=>this.online(uid)).filter(s=>s&&s.world.room===t.room);}
 person(uid){const s=this.online(uid),u=s?.user,p=s?.player;return s?{uid,name:p?.name||u.username,level:1,skinId:p?.skinId||0,index:0,showId:String(uid)}:null;}
 snapshot(t){return {teamMembers:t.members.map((id,i)=>({...this.person(id),index:i})).filter(x=>x.uid),teamLeaderUid:t.leader,teamName:t.name,teamUuid:String(t.id)};}
 broadcast(t){const snap=this.snapshot(t);for(const s of this.roomMembers(t))this.game.push(s,'teamMembersUpdatePush',encode('TeamMembersUpdatePush',snap));}
 list(room){return [...this.teams.values()].filter(t=>t.room===room).map(t=>({id:t.id,name:t.name,membersNum:t.members.length,membersMaxNum:4,skinId:this.person(t.leader)?.skinId||0}));}
 leave(uid){const t=this.teamFor(uid);if(!t)return; t.members=t.members.filter(id=>id!==uid);if(t.leader===uid)t.leader=t.members[0]||0;
  if(!t.members.length)this.teams.delete(t.id);else this.broadcast(t);
  for(const [key,inv]of this.invites)if(inv.teamId===t.id||inv.to===uid)this.invites.delete(key);
  for(const [key,req]of this.applications)if(req.teamId===t.id||req.uid===uid)this.applications.delete(key);
 }
 detach(state){if(state.user)this.leave(state.user.id);}
 reject(route,code=1){const type=contract.responses[route];return type?encode(type,{code}):null;}
 handle(state,m,req){if(!m.route?.startsWith(PREFIX))return false;
  const action=m.route.slice(PREFIX.length);if(!SUPPORTED.has(action))return false;
  const id=state.user.id,room=state.world?.sceneReady?state.world.room:null,team=this.teamFor(id);
  const respond=(data)=>{if(m.type===0)this.game.reply(state,m.id,encode(contract.responses[m.route],data));};
  const error=(code=1)=>{respond({code});return true;};
  if(action==='getAllTeams'){respond({teams:room?this.list(room):[]});return true;}
  if(action==='getMyTeam'){respond(team?{membersInfo:this.snapshot(team).teamMembers,captainId:team.leader,teamName:team.name}:{membersInfo:[],captainId:0,teamName:''});return true;}
  if(action==='getTeamMembers'){if(team)this.game.push(state,'teamMembersUpdatePush',encode('TeamMembersUpdatePush',this.snapshot(team)));return true;}
  if(action==='isInvite'){respond({isInvite:!![...this.invites.values()].find(v=>v.to===id)});return true;}
  // Leaving a local team is allowed even if world/room is transitioning.
  // The February-2024 client sends teamId=0 on some exit paths.
  if(action==='exitTeam'){
   if(!team){respond({code:0});this.game.push(state,'teamMembersUpdatePush',encode('TeamMembersUpdatePush',{teamMembers:[],teamLeaderUid:0,teamName:'',teamUuid:''}));return true;}
   const requested=Number(req.teamId)||0;
   if(requested&&requested!==team.id)return error(15);
   respond({code:0});this.leave(id);this.game.push(state,'teamMembersUpdatePush',encode('TeamMembersUpdatePush',{teamMembers:[],teamLeaderUid:0,teamName:'',teamUuid:''}));return true;
  }
  if(!room)return error(11);
  if(action==='createTeam'){
   if(team)return error(12);
   if(req.roomId&&req.roomId!==room)return error(13);
   const name=String(req.teamName||'').trim();if(!name||name.length>32)return error(14);
   const t={id:this.next++,room,name,leader:id,members:[id]};this.teams.set(t.id,t);respond({code:0,teamId:t.id});this.broadcast(t);return true;
  }
  if(action==='joinTeam'||action==='acceptInviteTeam'){
   if(team)return error(12);
   const t=this.teams.get(Number(req.teamId));if(!t||t.room!==room)return error(15);
   if(t.members.length>=4)return error(16);
   if(action==='acceptInviteTeam'&&(!this.invites.has(`${id}:${t.id}`)||this.invites.get(`${id}:${t.id}`).expires<Date.now()))return error(17);
   if(this.blocked.get(id)?.has(t.leader)||this.blocked.get(t.leader)?.has(id))return error(18);
   t.members.push(id);this.invites.delete(`${id}:${t.id}`);respond({code:0});this.broadcast(t);return true;
  }
  if(action==='changeTeamLeader'){
   if(!team||team.leader!==id||!team.members.includes(Number(req.newTeamLeaderUid)))return error(19);
   team.leader=Number(req.newTeamLeaderUid);respond({code:0});this.broadcast(team);return true;
  }
  if(action==='changeTeamName'){
   const name=String(req.teamName||'').trim();if(!team||team.leader!==id||Number(req.teamID)!==team.id||!name||name.length>32)return error(19);
   team.name=name;respond({code:0});this.broadcast(team);return true;
  }
  if(action==='kickOutTeamMember'){
   const target=Number(req.memberUid);if(!team||team.leader!==id||target===id||!team.members.includes(target))return error(19);
   this.leave(target);respond({code:0});this.broadcast(team);return true;
  }
  if(action==='inviteJoinTeam'){
   const to=Number(req.inviteeUid),peer=this.online(to);
   if(!team||team.leader!==id||!peer||peer.world.room!==room||team.members.length>=4||this.teamFor(to)||this.blocked.get(to)?.has(id))return error(18);
   this.invites.set(`${to}:${team.id}`,{to,teamId:team.id,from:id,expires:Date.now()+120000});respond({code:0});
   this.game.push(peer,'inviteJoinTeamPush',encode('InviteJoinTeamPush',{teamId:team.id,inviterUid:id,inviterName:this.person(id)?.name||'',inviterSkinId:this.person(id)?.skinId||0}));return true;
  }
  if(action==='refuseInviteTeam'){
   const key=`${id}:${Number(req.teamId)}`;if(!this.invites.has(key))return error(17);this.invites.delete(key);respond({code:0});return true;
  }
  if(action==='blockInviteTeam'){
   const source=Number(req.inviterUid);if(!this.online(source))return error(15);
   if(!this.blocked.has(id))this.blocked.set(id,new Set());this.blocked.get(id).add(source);
   for(const [key,v]of this.invites)if(v.to===id&&v.from===source)this.invites.delete(key);
   respond({code:0});return true;
  }
  if(action==='applyTeam'){
   const leader=this.online(Number(req.uid)),t=leader&&this.teamFor(leader.user.id);
   if(team||!t||t.leader!==leader.user.id||t.room!==room||t.members.length>=4)return error(15);
   this.applications.set(`${t.id}:${id}`,{uid:id,teamId:t.id,expires:Date.now()+120000});respond({code:0});
   this.game.push(leader,'joinTeamPush',encode('JoinTeamPush',{teamId:t.id,reqPlayerUid:id,reqPlayerAccount:state.user.username,reqPlayerName:state.player?.name||state.user.username,reqPlayerSkinId:0}));return true;
  }
  if(action==='acceptJoinTeam'||action==='refuseJoinTeam'){
   const uid=Number(req.reqPlayerUid),key=`${Number(req.teamId)}:${uid}`,application=this.applications.get(key);
   if(!team||team.leader!==id||!application||application.teamId!==team.id||application.expires<Date.now())return error(19);
   this.applications.delete(key);
   if(action==='refuseJoinTeam'){respond({code:0});return true;}
   const peer=this.online(uid);if(!peer||peer.world.room!==room||this.teamFor(uid)||team.members.length>=4)return error(15);
   team.members.push(uid);respond({code:0});this.broadcast(team);return true;
  }
  return false;
 }
}
function onTeam(game,state,m,request){if(!game.teams||!state.user)return false;return game.teams.handle(state,m,request||{});}
module.exports={LocalTeams,onTeam,SUPPORTED};
