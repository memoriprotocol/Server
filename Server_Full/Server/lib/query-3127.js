'use strict';
// Read-only route implementations. No fake grants/purchases/achievements.
const {encode,decode,contract}=require('./codec');
const {proto}=require('./proto');
const safe={
 'game.gameHandler.getPets':(g,s)=>({pets:s.player.pets||[]}),
 'game.gameHandler.getDanDaily':()=>({code:0}),
 'game.gameHandler.getCommunitiesUrl':()=>({code:0,infos:[]}),
 'game.gameHandler.checkGameInviteCode':()=>({code:1}),
 'game.activityHandler.getActivityRank':()=>({code:0,rankList:[],meRank:0,meScore:0}),
 'game.activityHandler.getActivityLastInfo':()=>({code:0}),
 'game.activityHandler.getActivityPreview':()=>({code:1}),
 'game.activityHandler.getActivityInfo':(g,s,req)=>({code:1,activityId:req.activityId||0}),
 'game.talentHandler.tdGetRank':()=>({code:0,list:[]}),
 'game.guildHandler.getAllGuilds':()=>({code:0}),
 'game.guildHandler.getGuildInfo':()=>({code:1}),
 'game.guildHandler.getGuildRankDetail':()=>({code:0,normalRank:0,obeliskRank:0,huntRank:0}),
 'game.guildHandler.guildMemberInfo':()=>({code:1}),
 'game.guildHandler.getItemList':()=>({code:0,items:'[]'}),
 'game.friendHandler.loadFriendsChat':()=>({code:0,chatInfos:[]}),
 'game.friendHandler.memberInfo':()=>({code:1}),
 'game.shopHandler.previewGift':(g,s,req)=>({code:1,giftId:req.giftId||0,list:[]}),
 'game.shopHandler.searchPlayer':()=>({code:1}),
 'game.inviteHandler.getInviteRewards':()=>({code:1}),
 'game.gameHandler.queryTracker':()=>({code:0}),
 'battle.iob.queryNearbyPlayers':(g,s)=>({code:0,data:[]} ),
 'battle.iob.killLogs':()=>({code:0}),
 'battle.teamHandler.isInvite':()=>({isInvite:false}),
 'battle.teamHandler.getAudioChannel':()=>({code:1,channelID:'',sign:''}),
};
// No-data operations are intentionally NOT acknowledged with code 0.
function onQuery(game,state,m,request){
 const build=safe[m.route];if(!build)return false;
 const type=contract.responses[m.route];if(!type||!proto[type])return false;
 const result=build(game,state,request||{});
 if(m.type===0)game.reply(state,m.id,encode(type,result));
 game.counters.queryResponses.set(m.route,(game.counters.queryResponses.get(m.route)||0)+1);
 return true;
}
module.exports={onQuery,safe};
