'use strict';
const {encode}=require('./codec'),settlement=require('./event-settlement-3127');
const exchanges=require('../config/schemes/ExchangeScheme.json').Exchange,awards=require('../config/schemes/ReputationAwardScheme.json').ReputationAward;
function number(n){return Number.isSafeInteger(n)&&n>=0&&n<=2147483647;}
function gold(p,request){
 const row=exchanges.find(r=>r.ID===Number(request.id));if(!row)throw Error('UNKNOWN_GOLD_EXCHANGE');
 // Native StoreView.exchangeGold sends num:0 for one configured pack.
 if(Number(request.num)!==0)throw Error('INVALID_GOLD_EXCHANGE_QUANTITY');
 if(row.ItemID!==21||row.SaleItemID!==25)throw Error('UNVERIFIED_GOLD_EXCHANGE_CURRENCY');
 const cost=row.SaleItemNum,gain=row.ItemNum+row.Extra,diamond=Number(p.diamond)||0,coin=Number(p.coin)||0;
 if(!number(cost)||!cost||!number(gain)||!gain||!number(diamond)||!number(coin))throw Error('INVALID_CURRENCY_BALANCE');
 if(diamond<cost)throw Error('NOT_ENOUGH_DIAMOND');if(!number(coin+gain))throw Error('COIN_BALANCE_OVERFLOW');
 p.diamond=diamond-cost;p.coin=coin+gain;return{code:0,id:row.ID,items:[{id:109,num:gain}]};
}
function reputation(p,request){
 const row=awards.find(r=>r.ID===Number(request.id));if(!row)throw Error('UNKNOWN_REPUTATION_REWARD');
 if((Number(p.reputation)||0)<row.Score)throw Error('REPUTATION_REQUIRED');
 const claimed=p.reputationReward||[];if(claimed.includes(row.ID))throw Error('REPUTATION_REWARD_ALREADY_CLAIMED');
 const items=row.AwardIDs.map((id,i)=>({id,num:row.AwardNums[i]}));
 for(const item of items){if(item.id!==109||!number(item.num)||!item.num)throw Error('UNVERIFIED_REPUTATION_REWARD');if(!number((Number(p.coin)||0)+item.num))throw Error('COIN_BALANCE_OVERFLOW');p.coin=(Number(p.coin)||0)+item.num;}
 p.reputationReward=[...claimed,row.ID];return{code:0,id:row.ID,items};
}
function notify(game,state){
 if(!state.accountEconomyPending)return;let ok=true;
 for(const [route,type,data]of [['updateCoin','CoinUpdatePush',{coin:state.player.coin||0}],['updateDiamond','DiamondUpdatePush',{diamond:state.player.diamond||0}],['reputationPush','ReputationPush',{num:state.player.reputation||0}]])try{game.push(state,route,encode(type,data));}catch(error){ok=false;}
 try{game.broadcastPlayer?.(state.user.id);}catch(error){ok=false;}
 if(ok)delete state.accountEconomyPending;
}
function tick(game,time=Date.now()){if(time<(game.nextEconomySyncAt||0))return;game.nextEconomySyncAt=time+1000;for(const state of game.online)if(state.user&&state.player&&state.accountEconomyPending)notify(game,state);}
function handle(game,state,m,request){
 const run=m.route==='game.marketHandler.buyItem'?gold:m.route==='game.talentHandler.reputationGetReward'?reputation:null;if(!run)return false;
 let bytes;try{if(m.type!==0)throw Error('REQUEST_REQUIRED');const result=settlement.settle(game,state,m.route,draft=>run(draft.player,request));bytes=result.bytes;state.accountEconomyPending=true;notify(game,state);}
 catch(error){bytes=encode(require('./codec').contract.responses[m.route],{code:1,message:error.message});console.warn('[ACCOUNT ECONOMY]',m.route,error.message);}
 if(m.type===0)try{game.reply(state,m.id,bytes);}catch(error){console.warn('[ACCOUNT ECONOMY RESPONSE]',error.message);}return true;
}
module.exports={exchanges,awards,gold,reputation,notify,tick,handle};
