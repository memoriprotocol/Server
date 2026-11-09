'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {GameServer}=require('../lib/game');
const {onTeam}=require('../lib/team-3127');
const {onFriends}=require('../lib/friends-3127');
const {contract,encode,decode}=require('../lib/codec');
function fixture(){
 const users=[1,2,3,4,5].map(id=>({id,username:'user'+id,role:'user'}));
 const db=Object.fromEntries(users.map(u=>[u.id,{uid:u.id,name:'Player'+u.id,inventory:[]}]));
 let saved=0;
 const accounts={db:{accounts:users},userById(id){return users.find(x=>x.id===Number(id))||null;}};
 const players={db,save(){saved++;},ensure(user){return db[user.id];}};
 const game=new GameServer(accounts,players);
 const replies=[],pushes=[];
 game.reply=(s,id,bytes)=>replies.push({to:s.user.id,id,bytes});
 game.push=(s,route,bytes)=>pushes.push({to:s.user.id,route,bytes});
 const states=users.map(user=>({user,player:db[user.id],world:{room:'room-main',sceneReady:true,mapId:2,server:'battle-local-main',entity:{id:user.id}}}));
 for(const s of states)game.online.add(s);
 let num=0;
 function dispatch(s,route,obj={},service){const requestType=contract.requests[route];assert.ok(requestType,'expected known request: '+route);const responseType=contract.responses[route];const m={route,type:0,id:++num,body:encode(requestType,obj)};const prev=replies.length;const ok=(service==='friends'?onFriends:onTeam)(game,s,m,obj);assert.equal(ok,true,route+' handled');const items=replies.slice(prev);if(responseType){assert.equal(items.length,1,route+' one response');return decode(responseType,items[0].bytes);}assert.equal(items.length,0,route+' notification-only');return null;}
 return {game,users,states,db,replies,pushes,dispatch,saved:()=>saved};
}

test('team: create, list, join, rename, leader change, member list push, leave',()=>{
 const f=fixture(),[a,b,c]=f.states;
 const created=f.dispatch(a,'battle.teamHandler.createTeam',{teamName:'Local team',roomId:'room-main'});assert.equal(created.code,0);assert.ok(created.teamId>0);
 const all=f.dispatch(b,'battle.teamHandler.getAllTeams');assert.equal(all.teams.length,1);assert.equal(all.teams[0].name,'Local team');
 const joined=f.dispatch(b,'battle.teamHandler.joinTeam',{teamId:created.teamId});assert.equal(joined.code,0);
 const my=f.dispatch(b,'battle.teamHandler.getMyTeam');assert.equal(my.membersInfo.length,2);assert.equal(my.captainId,a.user.id);
 const change=f.dispatch(a,'battle.teamHandler.changeTeamLeader',{newTeamLeaderUid:b.user.id});assert.equal(change.code,0);
 assert.notEqual(f.dispatch(a,'battle.teamHandler.changeTeamName',{teamID:created.teamId,teamName:'Forbidden'}).code,0,'former leader cannot rename');
 assert.equal(f.dispatch(b,'battle.teamHandler.changeTeamName',{teamID:created.teamId,teamName:'New name'}).code,0);
 const prev=f.pushes.length; const noRsp=f.dispatch(a,'battle.teamHandler.getTeamMembers',{});assert.equal(noRsp,null);assert.ok(f.pushes.slice(prev).some(p=>p.to===a.user.id&&p.route==='teamMembersUpdatePush'));
 assert.equal(f.dispatch(a,'battle.teamHandler.exitTeam',{teamId:created.teamId}).code,0);
 assert.equal(f.dispatch(b,'battle.teamHandler.getMyTeam').membersInfo.length,1);
 assert.equal(f.dispatch(c,'battle.teamHandler.joinTeam',{teamId:created.teamId}).code,0);
});

test('team: cross-room membership, unsolicited invite and unauthorized kicks are rejected',()=>{
 const f=fixture(),[a,b,c]=f.states;b.world.room='another';
 const team=f.dispatch(a,'battle.teamHandler.createTeam',{teamName:'A',roomId:'room-main'}).teamId;
 assert.notEqual(f.dispatch(b,'battle.teamHandler.joinTeam',{teamId:team}).code,0);
 b.world.room='room-main';
 assert.notEqual(f.dispatch(b,'battle.teamHandler.acceptInviteTeam',{teamId:team}).code,0);
 assert.equal(f.dispatch(a,'battle.teamHandler.inviteJoinTeam',{inviteeUid:b.user.id}).code,0);
 assert.equal(f.dispatch(b,'battle.teamHandler.acceptInviteTeam',{teamId:team}).code,0);
 assert.notEqual(f.dispatch(b,'battle.teamHandler.kickOutTeamMember',{memberUid:a.user.id}).code,0);
 assert.notEqual(f.dispatch(c,'battle.teamHandler.createTeam',{teamName:'',roomId:'room-main'}).code,0);
 assert.equal(f.dispatch(a,'battle.teamHandler.exitTeam',{teamId:team}).code,0);
 assert.equal(f.dispatch(b,'battle.teamHandler.getMyTeam').captainId,b.user.id);
});

test('team: leaving world dissolves membership, no ghost team remains',()=>{
 const f=fixture(),[a,b]=f.states;
 const id=f.dispatch(a,'battle.teamHandler.createTeam',{teamName:'Open',roomId:'room-main'}).teamId;
 f.dispatch(b,'battle.teamHandler.joinTeam',{teamId:id});
 require('../lib/world').detachWorld(f.game,a);
 assert.equal(f.game.teams.teamFor(a.user.id),undefined);
 assert.equal(f.game.teams.teamFor(b.user.id).leader,b.user.id);
});

test('friends: request, accept, list, durable chat/read, remove, block',()=>{
 const f=fixture(),[a,b,c]=f.states;
 let result=f.dispatch(a,'game.friendHandler.addFriend',{info:'2',type:1},'friends');assert.equal(result.code,0);assert.equal(f.saved()>0,true);
 result=f.dispatch(b,'game.friendHandler.loadFriends',{},'friends');assert.equal(result.friends.length,1);
 result=f.dispatch(b,'game.friendHandler.authFriend',{id:1,type:1},'friends');assert.equal(result.code,0);
 const first=f.dispatch(a,'game.friendHandler.loadFriends',{},'friends');assert.equal(first.friends.length,1);
 result=f.dispatch(a,'game.friendHandler.chatFriend',{id:2,contents:'test message'},'friends');assert.equal(result.code,0);assert.equal(result.chatInfo.contents,'test message');
 const history=f.dispatch(b,'game.friendHandler.loadFriendsChat',{id:1,time:0},'friends');assert.equal(history.chatInfos.length,1);assert.equal(history.chatInfos[0].contents,'test message');
 const before=f.saved();f.dispatch(b,'game.friendHandler.readFriendChat',{id:1},'friends');assert.ok(f.saved()>=before);
 assert.equal(f.dispatch(a,'game.friendHandler.delFriend',{id:2},'friends').code,0);
 assert.equal(f.dispatch(a,'game.friendHandler.loadFriends',{},'friends').friends.length,0);
 assert.notEqual(f.dispatch(a,'game.friendHandler.chatFriend',{id:2,contents:'should fail'},'friends').code,0);
 assert.equal(f.dispatch(c,'game.friendHandler.playerBlock',{id:1,type:1},'friends').code,0);
 assert.equal(f.dispatch(c,'game.friendHandler.loadPlayerBlocking',{},'friends').members.length,1);
 assert.notEqual(f.dispatch(a,'game.friendHandler.addFriend',{info:'3',type:1},'friends').code,0);
});

test('friends: cannot look up nonexistent people as success; no fake friendship by online presence',()=>{
 const f=fixture(),[a]=f.states;
 assert.equal(f.dispatch(a,'game.friendHandler.loadFriends',{},'friends').friends.length,0);
 assert.notEqual(f.dispatch(a,'game.friendHandler.addFriend',{info:'999',type:1},'friends').code,0);
 assert.notEqual(f.dispatch(a,'game.friendHandler.chatFriend',{id:2,contents:'no relation'},'friends').code,0);
 assert.equal(f.dispatch(a,'game.friendHandler.memberInfo',{id:2},'friends').member.member.id,2);
});
