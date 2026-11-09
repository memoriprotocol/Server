'use strict';
const C=require('./admin-catalog-3127'),inventory=require('./inventory'),{encode}=require('./codec');
const commerce=require('./commerce-3127');
const safeInt=(v,min=0,max=2147483647)=>{const n=Number(v);if(typeof v==='boolean'||!Number.isSafeInteger(n)||n<min||n>max)throw Error('INVALID_ARGUMENTS');return n;};
const filter=(rows,b)=>rows.filter(r=>!b.q||JSON.stringify(r).toLowerCase().includes(String(b.q).toLowerCase()));
function shop(b,actor){
 if(b.action==='definitions'){const all=C.definitions(b.q,b.ids);const offset=Number(b.offset)||0;return {ok:true,total:all.length,items:all.slice(offset,offset+60)};}
 const rows=commerce.config.shopOffers;
 const products=()=>rows.map(r=>({...C.definitions('',[r.itemId])[0],...r,catalogKey:String(r.id),shopTypes:r.shopTypes||[r.shopType],itemName:inventory.items.get(r.itemId)?.name,personalLimit:r.personalLimit||0,globalLimit:r.globalLimit||0,cycleType:r.cycleType||0,cycleLimit:r.cycleLimit||0,enabled:r.enabled!==false,present:!!r.giftable,salesStart:r.salesStart||0,salesEnd:r.salesEnd||0,subType:r.subType||0,editRevision:this.db.shopRevision,sold:(this.db.shopHistory||[]).filter(x=>x.action==='purchase'&&x.productId===r.id).reduce((n,x)=>n+x.count,0)}));
 if(b.action==='list')return {ok:true,changed:Number(b.revision)!==this.db.shopRevision,revision:this.db.shopRevision,editRevision:this.db.shopRevision,capabilities:{clientVersion:'3.12.7',shopTypes:[1,2,3,4,5,7,8,9],currencies:[109,111]},products:products(),history:this.db.shopHistory.slice(-500).reverse()};
 if(!['create','update','delete'].includes(b.action))throw Error('SHOP_INVALID_ACTION');if(Number(b.expectedRevision)!==this.db.shopRevision)throw Error('SHOP_REVISION_CONFLICT');
 const oldRows=structuredClone(rows);
 try{return this.transaction(()=>{
  const before=rows.find(r=>r.id===Number(b.id)||String(r.id)===String(b.catalogKey));let after;
  if(b.action==='delete'){if(!before)throw Error('SHOP_PRODUCT_NOT_FOUND');rows.splice(rows.indexOf(before),1);}
  else{
   if(b.action==='update'&&!before)throw Error('SHOP_PRODUCT_NOT_FOUND');const data=b.product||{},itemId=safeInt(data.itemId,1);if(!inventory.items.has(itemId))throw Error('SHOP_UNKNOWN_ITEM');
   const shopTypes=data.shopTypes;if(!Array.isArray(shopTypes)||!shopTypes.length||shopTypes.some(x=>!Number.isInteger(x)||x<1||x>9||x===6))throw Error('SHOP_INVALID_GROUPS');
   const costId=safeInt(data.costId,1);if(![109,111].includes(costId))throw Error('SHOP_UNKNOWN_CURRENCY');
   const id=before?.id||Math.max(30000000,...rows.map(x=>x.id))+1;
   const item=inventory.items.get(itemId),isMount=C.mounts.some(m=>m.ID===itemId),skin=C.skins.find(s=>item.itemType===27&&(s.ID===itemId||(item.args||[]).includes(s.ID)));
   after={...before,id,itemId,count:safeInt(data.count,1,1000000),shopType:shopTypes[0],shopTypes:[...new Set(shopTypes)],costId,price:safeInt(data.price),name:String(data.name||item.name).slice(0,160),enabled:!!data.enabled,giftable:!!data.present,presentPrice:safeInt(data.price),personalLimit:safeInt(data.personalLimit),globalLimit:safeInt(data.globalLimit),cycleType:safeInt(data.cycleType,0,3),cycleLimit:safeInt(data.cycleLimit),salesStart:safeInt(data.salesStart),salesEnd:safeInt(data.salesEnd),sort:safeInt(data.sort),subType:safeInt(data.subType)};
   if(after.salesStart&&after.salesEnd&&after.salesEnd<=after.salesStart)throw Error('SHOP_INVALID_DATES');
   if(isMount){after.grantType='mount';after.count=1;}if(skin){after.skinId=skin.ID;after.count=1;}
   if(after.giftable&&costId!==111)throw Error('GIFT_REQUIRES_DIAMONDS');if(after.giftable&&!isMount&&!skin)throw Error('SHOP_GIFT_UNSUPPORTED');
   const sold=this.db.shopHistory.filter(x=>x.action==='purchase'&&x.productId===id).reduce((n,x)=>n+x.count,0);if(after.globalLimit&&after.globalLimit<sold)throw Error('SHOP_LIMIT_BELOW_SOLD');
   if(before)rows[rows.indexOf(before)]=after;else rows.push(after);
  }
  this.db.shop=structuredClone(rows);this.db.shopRevision++;
  this.db.shopHistory.push({id:Date.now(),at:new Date().toISOString(),action:b.action,productId:after?.id||before.id,itemId:after?.itemId||before.itemId,actorId:actor.id,before:before||null,after:after||null});
  commerce.replaceOffers(rows);for(const state of this.game.online)this.game.push(state,'shopItemUpdatedPsh',encode('ShopItemUpdatedPsh',{}));this.accounts.audit(actor,'shop.'+b.action,{id:after?.id||before?.id});return {ok:true,editRevision:this.db.shopRevision,revision:this.db.shopRevision,product:after};
 });}catch(e){commerce.replaceOffers(oldRows);throw e;}
}
function checkPurchase(state,offer,count){
 const time=Math.floor(Date.now()/1000);if(offer.enabled===false||offer.salesStart&&time<offer.salesStart||offer.salesEnd&&time>offer.salesEnd)throw Error('SHOP_SALE_OFF');
 const purchases=state.player.shopPurchases||[],current=purchases.filter(x=>x.id===offer.id).reduce((n,x)=>n+x.count,0);
 if(offer.personalLimit&&current+count>offer.personalLimit)throw Error('SHOP_PERSONAL_LIMIT');
 const sold=this.db.shopHistory.filter(x=>x.action==='purchase'&&x.productId===offer.id).reduce((n,x)=>n+x.count,0);if(offer.globalLimit&&sold+count>offer.globalLimit)throw Error('SHOP_SOLD_OUT');
 const cycle=offer.cycleType===1?86400:offer.cycleType===2?604800:offer.cycleType===3?2592000:0;
 if(cycle&&offer.cycleLimit){const start=Math.floor(time/cycle)*cycle,used=purchases.filter(x=>x.id===offer.id&&x.at>=start).reduce((n,x)=>n+x.count,0);if(used+count>offer.cycleLimit)throw Error('SHOP_CYCLE_LIMIT');}
}
function recordPurchase(state,offer,count){const at=Math.floor(Date.now()/1000);state.player.shopPurchases||=[];state.player.shopPurchases.push({id:offer.id,count,at});this.db.shopHistory.push({id:Date.now(),at:new Date().toISOString(),action:'purchase',productId:offer.id,catalogKey:String(offer.id),itemId:offer.itemId,buyerGameId:String(state.user.id),count,amount:offer.price*count,costId:offer.costId,rewardCount:offer.count*count});this.db.shopRevision++;this.players.save();this.flush();}
function mail(b,actor){
 if(b.action==='definitions'){const rows=C.definitions(b.q,b.ids),offset=Number(b.offset)||0;return{ok:true,items:rows.slice(offset,offset+30).map(x=>({...x,single:x.itemType===27||C.mounts.some(m=>m.ID===x.itemId)})),total:rows.length,offset};}
 if(b.action==='targets'){const rows=this.users(b).filter(u=>u.uid);return{ok:true,users:rows.slice(Number(b.offset)||0,(Number(b.offset)||0)+20),total:rows.length};}
 if(b.action==='stats'){
  const delivered=this.db.mail.flatMap(m=>m.targets.map(uid=>({m,s:this.db.mailStates[uid+':'+m.mailId]||{}})));const time=Date.now();return{ok:true,asOf:new Date().toISOString(),fixedActive:this.db.mail.filter(m=>m.kind==='fixed'&&!m.recalled).length,sentTotal:this.db.mail.length,recipientTotal:delivered.length,unread:delivered.filter(x=>!x.s.readDate).length,read:delivered.filter(x=>x.s.readDate).length,pending:delivered.filter(x=>x.m.attachments.length&&!x.s.claimed&&!x.m.recalled&&(!x.m.expiresAt||x.m.expiresAt>time)).length,claimed:delivered.filter(x=>x.s.claimed).length,expired:delivered.filter(x=>x.m.expiresAt&&x.m.expiresAt<=time).length,recalled:this.db.mail.filter(m=>m.recalled).length};
 }
 if(b.action==='logs'){const rows=filter(this.db.mailEvents.slice().reverse().filter(x=>!b.filterAction||x.action===b.filterAction),b),offset=Number(b.offset)||0;return{ok:true,events:rows.slice(offset,offset+50),total:rows.length,offset};}
 if(b.action==='list'){const rows=filter(this.db.mail.filter(m=>!b.kind||m.kind===b.kind&&!m.recalled).slice().reverse(),b),offset=Number(b.offset)||0;return{ok:true,mails:rows.slice(offset,offset+50).map(m=>({...m,recipientCount:m.targets.length})),total:rows.length,offset};}
 const result=this.dedupe(b,actor,()=>{
  let m,before=null;
  if(b.action==='send'){
   if(!['normal','fixed'].includes(b.kind)||!['user','all'].includes(b.audience))throw Error('MAIL_INVALID_AUDIENCE');
   const targets=b.audience==='all'?this.accounts.db.accounts.map(x=>x.id):[this.target({uid:b.targetUid}).u.id];
   const attachments=b.kind==='fixed'?[]:b.attachments||[];if(!Array.isArray(attachments)||attachments.length>32)throw Error('MAIL_INVALID_ATTACHMENTS');
   for(const a of attachments){if(!inventory.items.has(safeInt(a.itemId,1)))throw Error('MAIL_UNKNOWN_ITEM');safeInt(a.count,1,1000000);}
   const duration=b.kind==='fixed'?0:safeInt(b.durationSeconds??Number(b.validPeriod)*3600,1,315360000);
   m={mailId:this.db.nextMail++,revision:1,kind:b.kind,targets,title:String(b.title||''),content:String(b.content||''),attachments:structuredClone(attachments),senderUid:actor.id,senderNickname:actor.launcherName||actor.username,sendDate:Math.floor(Date.now()/1000),durationSeconds:duration,validPeriod:b.kind==='fixed'?-1:duration/3600,expiresAt:duration?Date.now()+duration*1000:0,recalled:false};this.db.mail.push(m);
  }else{
   m=this.db.mail.find(m=>m.mailId===Number(b.mailId));if(!m||m.kind!=='fixed'||m.recalled)throw Error('MAIL_NOT_FOUND');if(m.revision!==Number(b.expectedRevision))throw Error('REVISION_CONFLICT');before=structuredClone(m);
   if(b.action==='update'){m.title=String(b.title||'');m.content=String(b.content||'');m.updatedAt=Date.now();}else if(b.action==='recall')m.recalled=true;else throw Error('MAIL_INVALID_ACTION');m.revision++;
  }
  if(!m.title||m.title.length>160||!m.content||m.content.length>12000)throw Error('MAIL_INVALID_CONTENT');
  this.db.mailEvents.push({id:this.db.mailEvents.length+1,at:new Date().toISOString(),action:b.action,actorId:actor.id,actorName:actor.launcherName||actor.username,mailId:m.mailId,before,after:structuredClone({...m,recipientCount:m.targets.length})});
  return{ok:true,mail:{...m,recipientCount:m.targets.length},recipientCount:m.targets.length};
 });for(const state of this.game.online)if(state.user)this.game.push(state,'updateMail',encode('MailList',{mails:this.nativeMail(state.user.id)}));return result;
}
function mailTime(v){const t=Number(v)||0;return t>100000000000?Math.floor(t/1000):Math.floor(t);}
function nativeMail(uid){
 const now=Date.now();
 const active=this.db.mail.filter(m=>m.targets.includes(uid)&&!m.recalled&&(!m.expiresAt||m.expiresAt>now)&&!this.db.mailStates[uid+':'+m.mailId]?.deleted).map(m=>{
  const s=this.db.mailStates[uid+':'+m.mailId]||{};
  return {mailId:m.mailId,sendDate:mailTime(m.sendDate),readDate:mailTime(s.readDate),senderUid:m.senderUid,senderNickname:m.senderNickname,receiverUid:uid,receiverNickname:this.accounts.userById(uid)?.username||'',title:m.title,content:m.content,isExist:0,validPeriod:m.validPeriod,annex:JSON.stringify(m.attachments.map(a=>({id:a.itemId,num:a.count}))),remark:s.claimed?JSON.stringify(m.attachments.map(a=>({id:a.itemId,num:a.count}))):'[]',isTqtMail:m.kind==='fixed'};
 });
 // Preserve old server-side inboxes created before the admin mailing module existed.
 const player=this.players.db[uid]||this.players.db[String(uid)];
 const old=(Array.isArray(player?.mails)?player.mails:[]).filter(m=>!m.deleted&&Number(m.isExist)!==1).map(m=>({
  mailId:Number(m.mailId)||0,sendDate:mailTime(m.sendDate),readDate:mailTime(m.readDate),senderUid:Number(m.senderUid)||0,senderNickname:String(m.senderNickname||''),receiverUid:uid,receiverNickname:String(m.receiverNickname||player?.name||''),title:String(m.title||''),content:String(m.content||''),isExist:0,validPeriod:Number(m.validPeriod)||0,annex:typeof m.annex==='string'?m.annex:JSON.stringify(m.annex||[]),remark:typeof m.remark==='string'?m.remark:JSON.stringify(m.remark||[]),isTqtMail:!!m.isTqtMail
 }));
 const seen=new Set(active.map(m=>String(m.mailId)));
 return [...active,...old.filter(m=>!seen.has(String(m.mailId)))].sort((a,b)=>b.sendDate-a.sendDate);
}
function mailOp(state,req){
 const ids=[...new Set((req.mailIds||[]).map(Number))];if(ids.length>500||![1,2,3].includes(req.opType))throw Error('MAIL_INVALID_OPERATION');
 const visible=new Set(this.nativeMail(state.user.id).map(x=>Number(x.mailId))),before=structuredClone(state.player);
 const result=this.transaction(()=>{for(const id of ids){if(!visible.has(id))throw Error('MAIL_NOT_FOUND');const key=state.user.id+':'+id,s=this.db.mailStates[key]||{},m=this.db.mail.find(x=>x.mailId===id&&x.targets.includes(state.user.id));
  if(!m){const legacy=(state.player.mails||[]).find(x=>Number(x.mailId)===id&&!x.deleted);if(!legacy)throw Error('MAIL_NOT_FOUND');
   if(req.opType===1)legacy.readDate||=Math.floor(Date.now()/1000);
   if(req.opType===2){let annex=[];try{annex=typeof legacy.annex==='string'?JSON.parse(legacy.annex):legacy.annex||[];}catch{throw Error('MAIL_INVALID_ATTACHMENTS');}
    let claimed=[];try{claimed=typeof legacy.remark==='string'?JSON.parse(legacy.remark):legacy.remark||[];}catch{}
    for(const a of annex)if(!claimed.some(x=>Number(x.id)===Number(a.id))){C.grant(this.game,state.player,Number(a.id),Number(a.num));claimed.push({id:Number(a.id),num:Number(a.num)});}
    legacy.remark=JSON.stringify(claimed);legacy.readDate||=Math.floor(Date.now()/1000);
   }
   if(req.opType===3){if(legacy.isTqtMail)throw Error('MAIL_FIXED_PROTECTED');legacy.deleted=true;}
   this.players.save();continue;
  }
  if(req.opType===1)s.readDate||=Math.floor(Date.now()/1000);
  if(req.opType===2&&!s.claimed){for(const a of m.attachments)C.grant(this.game,state.player,a.itemId,a.count);s.claimed=true;s.readDate||=Math.floor(Date.now()/1000);}
  if(req.opType===3){if(m.kind==='fixed')throw Error('MAIL_FIXED_PROTECTED');if(m.attachments.length&&!s.claimed)throw Error('MAIL_ATTACHMENTS_NOT_CLAIMED');s.deleted=true;}
  this.db.mailStates[key]=s;
 }return{code:0,data:{mails:this.nativeMail(state.user.id)}};});this.sync(state.user.id,before);if(state?.user)this.game.push(state,'updateMail',encode('MailList',{mails:this.nativeMail(state.user.id)}));return result;
}
module.exports={shop,checkPurchase,recordPurchase,mail,nativeMail,mailOp};
