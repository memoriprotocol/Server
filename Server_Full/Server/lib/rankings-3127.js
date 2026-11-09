'use strict';
const {encode,contract}=require('./codec');
const num=v=>Math.max(0,Math.min(2147483647,Math.floor(Number(v)||0)));
function players(game){return Object.entries(game.players.db).flatMap(([id,p])=>{const uid=Number(p.uid||id),u=game.accounts.userById(uid);return !u||u.status==='banned'?[]:[{...p,score:require('./dan-3127').score(p),uid,name:p.name||u.launcherName||u.username,headId:p.headId||1,headFrameId:p.headFrameId||1}];});}
function sorted(rows,score,id='uid'){return rows.sort((a,b)=>score(b)-score(a)||Number(a[id])-Number(b[id])).map((p,i)=>({...p,rank:i+1}));}
function guilds(service,key='wealth'){return sorted((service?.db.guilds||[]).slice(),g=>num(g[key]),'guildId');}
function build(game,state,route,req={}){
 const uid=Number(state.user.id),rows=players(game);
 if(route==='game.gameHandler.reqRanking'){
  // Native legacy ranking uses the account score. Battle XP is session data.
  const ranked=sorted(rows,p=>num(p.score)),view=p=>({uid:p.uid,name:p.name,position:p.rank,value:num(p.score),headId:p.headId,headFrameId:p.headFrameId});
  const me=ranked.find(p=>p.uid===(Number(req.uid)||uid));return{infos:ranked.slice(0,100).map(view),...(me?{self:view(me)}:{})};
 }
 if(['game.talentHandler.brScoreGetRank','game.talentHandler.reputationGetRank'].includes(route)){
  const br=route.includes('brScore'),key=br?'brScore':'reputation',ranked=sorted(rows,p=>num(p[key]));return{code:0,meRank:ranked.find(p=>p.uid===uid)?.rank||0,[br?'meBrScore':'meReputation']:num(state.player[key]),list:ranked.slice(0,100).map(p=>({uid:p.uid,name:p.name,rank:p.rank,headId:p.headId,headFrameId:p.headFrameId,[key]:num(p[key]),...(!br?{score:num(p.score)}:{})}))};
 }
 if(route==='game.talentHandler.tdGetRank'){
  const ranked=sorted(rows.filter(p=>num(p.tdLevel)>0),p=>num(p.tdLevel));return{code:0,list:ranked.slice(0,100).map(p=>({rank:p.rank,tdLevel:num(p.tdLevel),playerList:[{uid:p.uid,name:p.name,headId:p.headId,headFrameId:p.headFrameId}]}))};
 }
 if(route==='game.guildHandler.getGuildRank')return{code:0,data:guilds(game.adminService).slice(0,100).map(g=>({...game.adminService.guildView(g),ranking:g.rank}))};
 if(route==='game.guildHandler.getGuildRankDetail'){
  // Generated 3.12.7 schema incorrectly assigns field 0 to code. Omit it;
  // the client's default code remains zero and all rank fields are valid.
  const id=Number(req.guildId)||state.player.guildId;return Object.fromEntries([['normalRank','wealth'],['obeliskRank','obeliskScore'],['huntRank','huntScore']].map(([field,key])=>[field,guilds(game.adminService,key).find(g=>g.guildId===id)?.rank||0]));
 }
 if(route==='game.activityHandler.getActivityRank'){
  const key=String(req.activityId),type=Number(req.type)||0,score=p=>num(p.activityStats?.[key]?.scores?.[type]??p.activityStats?.[key]?.score),ranked=sorted(rows.filter(p=>p.activityStats?.[key]),score);
  return{code:0,meRank:ranked.find(p=>p.uid===uid)?.rank||0,meScore:score(state.player),rankList:ranked.slice(0,100).map(p=>({id:p.uid,name:p.name,score:score(p),param1:p.rank,param2:0,headId:p.headId,headFrameId:p.headFrameId}))};
 }
 return null;
}
function handle(game,state,m,req={}){const result=build(game,state,m.route,req);if(!result)return false;if(m.type===0){game.reply(state,m.id,encode(contract.responses[m.route],result));if(m.route==='game.gameHandler.reqRanking'){state.rankingRequestedUID=Number(req.uid)||state.user.id;state.rankingSnapshot=JSON.stringify(result);state.rankingClientReady=true;}}return true;}
// The original RankNetWork explicitly listens to updateRankings. Refresh its
// saved model only for clients that have already requested the native panel.
function tick(game,time=Date.now()){
 if(time<(game.nextAccountRankAt||0))return;game.nextAccountRankAt=time+1000;
 for(const state of game.online)if(state.user&&state.player&&state.rankingClientReady){try{const result=build(game,state,'game.gameHandler.reqRanking',{uid:state.rankingRequestedUID}),key=JSON.stringify(result);if(key===state.rankingSnapshot)continue;game.push(state,'updateRankings',encode('RankingRsp',result));state.rankingSnapshot=key;}catch(error){/* Latest saved model is retried on the next tick. */}}
}
module.exports={players,sorted,guilds,build,handle,tick};
