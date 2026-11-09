'use strict';
const {encode,decode,contract,typedError}=require('./codec');
const {proto}=require('./proto');
const {profile}=require('./profile');
const inventory=require('./inventory');
const {asAchievement}=require('./achievement-3127');
const names=['game.gameHandler.reqCheckDanDaily','game.shopHandler.getGiftNames','game.activityHandler.loadActivity','game.playerHandler.getPlayerHeadInfo','game.playerHandler.personalItemInfo','game.collectionHandler.loadCollection','game.activityHandler.getActivitysRedDot','game.activityHandler.getActivitys','game.shopHandler.queryShopItem','game.challengeHandler.challengeConfig','game.challengeHandler.getGlobalConfig','game.passHandler.passInfo','game.friendHandler.loadFriends','game.friendHandler.loadPlayerBlocking','game.drawHandler.getWeapons','game.surveyHandler.loadSurvey','game.announcementHandler.loadAnnouncements','game.inviteHandler.loadInviteRewards','game.mailHandler.mailQuery','game.shopHandler.queryPresent','game.gameHandler.reqRanking','game.gameHandler.reqMineRecords','game.guildHandler.guildInfo','game.bagHandler.bagItems','game.talentHandler.brScoreGetRank','game.talentHandler.reputationGetRank','game.guildHandler.getGuildRank','game.achievementHandler.storeSteam'];
const responseTypes=Object.fromEntries(names.map(route=>[route,contract.responses[route]]));
function onInitial(game,state,m){const type=responseTypes[m.route];if(!type)return false;const p=state.player;let data={};
 switch(m.route){
 case 'game.mailHandler.mailQuery':data={code:0,data:{mails:p.mails||[]}};break;
 case 'game.passHandler.passInfo':data={code:0,passInfo:p.passInfo||{seasonId:0,taskInfo:[],shopInfo:[]}};break;
 case 'game.challengeHandler.getGlobalConfig':data={code:0,configIndex:1,config:{brReward:{},shopBanner:[],lvBanner:{},itemRewardWeight:[],activityShowParam:[]}};break;
 case 'game.bagHandler.bagItems':{
  let owned;try{owned=inventory.inventoryOf(state);}catch(e){game.reply(state,m.id,typedError(m.route,e.message));return true;}
  const bags=new Map();for(const item of owned){const type=item.bagType||0;if(!bags.has(type))bags.set(type,[]);bags.get(type).push(item);}data={code:0,list:[...bags].map(([bagType,items])=>({bagType,capSize:inventory.capacity(bagType),items}))};break;
 }
 case 'game.talentHandler.brScoreGetRank':case 'game.talentHandler.reputationGetRank':{
  const br=m.route.endsWith('brScoreGetRank'),key=br?'brScore':'reputation';const rows=Object.values(game.players.db).map(x=>({uid:x.uid,name:x.name||game.accounts.userById(x.uid)?.username||String(x.uid),headId:x.headId||1,headFrameId:x.headFrameId||1,[key]:x[key]||0})).sort((a,b)=>b[key]-a[key]||a.uid-b.uid).map((x,i)=>({...x,rank:i+1}));
  data={code:0,meRank:rows.find(x=>x.uid===state.user.id)?.rank||0,[br?'meBrScore':'meReputation']:p[key]||0,list:rows.slice(0,100)};break;
 }
 case 'game.achievementHandler.storeSteam':{
  // Local achievement sync acknowledgement; no official Steam write occurs.
  data={code:0,data:asAchievement(p).achievementInfos};break;
 }
 default:if('code' in proto[type].prototype)data.code=0;
 }
 const bytes=encode(type,data);game.reply(state,m.id,bytes);game.counters.earlyReadResponses.set(m.route,(game.counters.earlyReadResponses.get(m.route)||0)+1);return true;
}
module.exports={onInitial,responseTypes};
