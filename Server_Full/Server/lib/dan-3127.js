'use strict';
// Native Dan thresholds, best10 UI and recordSaveTime. Per-life XP score is
// the retained local result basis, not a recovered retail scoring formula.
const {encode,contract}=require('./codec'),I=require('./inventory'),rows=require('../config/schemes/DanScheme.json').Dan;
const TTL=Number(require('../config/schemes/ConstantsScheme.json').Constants.find(r=>r.name==='recordSaveTime').content[0])*1000;
const integer=(n)=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
function records(p,time=Date.now()){return(p.danRecords||[]).filter(r=>r&&typeof r.id==='string'&&integer(r.score)&&r.score>0&&Number.isSafeInteger(r.at)&&Number.isSafeInteger(r.showTick)&&r.showTick>time).sort((a,b)=>b.score-a.score||b.at-a.at||a.id.localeCompare(b.id));}
function score(p,time=Date.now()){return p.danVersion===84?Math.min(2147483647,records(p,time).slice(0,10).reduce((n,r)=>n+r.score,0)):Math.max(0,Math.min(2147483647,Math.floor(Number(p.score)||0)));}
function rank(value){let row=rows[0];for(const r of rows)if(value>=r.exp)row=r;return row;}
function plan(p,stats,hero,time=Date.now()){let list=records(p,time);const raw=Number(stats.xpEarned)||0,amount=Math.min(2147483647,raw);if(!Number.isSafeInteger(raw)||raw<0||raw>0xffffffff)throw Error('INVALID_DAN_RESULT_SCORE');if(amount&&!list.some(r=>r.id===stats.id))list.push({id:stats.id,score:amount,heroId:hero||1,at:time,showTick:time+TTL});list=list.sort((a,b)=>a.at-b.at).slice(-4096);const next={...p,danVersion:84,danRecords:list};return{score:score(next,time),changes:[[p,'danVersion',84],[p,'danRecords',list],...(p.danVersion===84?[]:[[p,'danLegacyScoreArchive',{score:Number(p.score)||0,at:time,reason:'prior cumulative score; absent match dates cannot be reconstructed'}]])]};}
function migrate(game,p,time=Date.now()){if(p.danVersion===84)return false;const pending=p.pendingDeath,known=pending?.runId&&pending.data?.totalExp>0?{id:pending.runId,xpEarned:pending.data.totalExp}:{id:'migration-empty',xpEarned:0},at=Number.isSafeInteger(pending?.at)?pending.at:time,planned=plan(p,known,p.heroId,at);I.commit(game,[...planned.changes,[p,'score',score({...p,danVersion:84,danRecords:planned.changes.find(([,k])=>k==='danRecords')[2]},time)]],true);return true;}
function snapshot(p,time=Date.now()){return{score:score(p,time),infos:records(p,time).slice(0,10).map(r=>({score:r.score,showTick:r.showTick,heroId:r.heroId})),danInfos:rows.map(r=>({danScore:r.exp,name:r.name,unlockPetNum:r.petNum,dropHeroNum:r.dropHeroNum,dropPetNum:r.dropPetNum}))};}
function handle(game,s,m,req){if(m.route!=='game.gameHandler.reqMineRecords')return false;const wanted=Number(req.uid)||s.user.id,p=game.players.db[wanted];if(m.type===0)game.reply(s,m.id,encode(contract.responses[m.route],p?snapshot(p):{infos:[],danInfos:[],score:0}));return true;}
function tick(game,time=Date.now()){
 if(time<(game.nextDanSyncAt||0))return;game.nextDanSyncAt=time+1000;
 if(!game.danMigrationDone){try{for(const p of Object.values(game.players.db))migrate(game,p,time);game.danMigrationDone=true;}catch{return;}}
 // Offline results expire too: admin data must not retain a stale cached rank.
 // Persist a batch atomically instead of writing the player database per record.
 const changes=[],changed=new Set();
 for(const p of Object.values(game.players.db)){
  if(p.danVersion!==84)continue;
  const live=records(p,time),next=Math.min(2147483647,live.slice(0,10).reduce((n,r)=>n+r.score,0));
  if(next===(p.score||0)&&live.length===(p.danRecords||[]).length)continue;
  changes.push([p,'score',next],[p,'danRecords',live]);changed.add(p);
 }
 if(!changes.length)return;
 try{I.commit(game,changes,true);}catch{return;}
 for(const s of game.online||[])if(changed.has(s.player))try{game.broadcastPlayer?.(s.user.id);}catch{}
}
module.exports={rows,TTL,records,score,rank,plan,migrate,snapshot,handle,tick};
