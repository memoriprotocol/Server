'use strict';
class GameOpValidationError extends Error{constructor(code){super(code);this.code=code;}}
const DECORATIVE_TYPES={1:'MartialSoul',2:'Bubble',3:'Action',4:'Emoji',5:'Debut',6:'Defeat',7:'Mount',8:'Jewelry',9:'BodyEffect',10:'WeaponSkin',11:'DamageNumber',12:'Profile',13:'Frame',14:'MountSkin',15:'HeroSkin',16:'Title',17:'JewelrySkin'};
const F={uid:'uid',itemId:'id',amount:'amount',type:'type',x:'number',y:'number',monster:'id',value:'int'};
const COMMAND_SCHEMAS={
 'give-currency':{fields:{uid:F.uid,itemId:F.itemId,amount:F.amount},required:['uid','itemId','amount'],mutating:true,targetRequired:true},
 'give-gold':{fields:{uid:F.uid,amount:F.amount},required:['uid','amount'],mutating:true,targetRequired:true},
 'give-diamond':{fields:{uid:F.uid,amount:F.amount},required:['uid','amount'],mutating:true,targetRequired:true},
 'give-xp':{fields:{uid:F.uid,amount:F.amount},required:['uid','amount'],mutating:true,targetRequired:true},
 'give-item':{fields:{uid:F.uid,itemId:F.itemId,amount:F.amount},required:['uid','itemId','amount'],mutating:true,targetRequired:true},
 'give-weapon':{fields:{uid:F.uid,itemId:F.itemId},required:['uid','itemId'],mutating:true,targetRequired:true},
 'give-equipment':{fields:{uid:F.uid,itemId:F.itemId},required:['uid','itemId'],mutating:true,targetRequired:true},
 'give-card':{fields:{uid:F.uid,itemId:F.itemId},required:['uid','itemId'],mutating:true,targetRequired:true},
 'give-dec':{fields:{uid:F.uid,type:F.type,itemId:F.itemId},required:['uid','type','itemId'],mutating:true,targetRequired:true},
 'teleport':{fields:{uid:F.uid,x:F.x,y:F.y},required:['uid','x','y'],mutating:true,targetRequired:true},
 'teleport-monster':{fields:{uid:F.uid,monster:F.monster},required:['uid','monster'],mutating:true,targetRequired:true},
 'kill-monster':{fields:{uid:F.uid,monster:F.monster},required:['uid','monster'],mutating:true,targetRequired:true},
 'respawn-monster':{fields:{uid:F.uid,monster:F.monster},required:['uid','monster'],mutating:true,targetRequired:true},
 'tutorial-mssing-clear':{fields:{uid:F.uid},required:['uid'],mutating:true,targetRequired:true},
 'guild-level':{fields:{guildId:F.uid,value:F.value},required:['guildId','value'],mutating:true,targetRequired:false,guildRequired:true},
 'guild-territory-level':{fields:{guildId:F.uid,value:F.value},required:['guildId','value'],mutating:true,targetRequired:false,guildRequired:true},
 'guild-contribution':{fields:{guildId:F.uid,value:F.value},required:['guildId','value'],mutating:true,targetRequired:false,guildRequired:true},
 'guild-fund':{fields:{guildId:F.uid,value:F.value},required:['guildId','value'],mutating:true,targetRequired:false,guildRequired:true}
};
function conv(name,type,v){
 if(v===undefined||v===null||v==='')throw new GameOpValidationError('MISSING_'+name.toUpperCase());
 if(type==='number'){const n=Number(v);if(typeof v==='boolean'||typeof v==='object'||!Number.isFinite(n))throw new GameOpValidationError('INVALID_'+name.toUpperCase());return n;}
 const n=Number(v);if(typeof v==='boolean'||typeof v==='object'||!Number.isFinite(n)||!Number.isSafeInteger(n))throw new GameOpValidationError('INVALID_'+name.toUpperCase());
 if(type==='uid'&&n<=0)throw new GameOpValidationError('INVALID_UID');
 if(type==='id'&&n<=0)throw new GameOpValidationError('INVALID_'+name.toUpperCase());
 if(type==='amount'&&(n<=0||n>1000000000))throw new GameOpValidationError('INVALID_AMOUNT');
 if(type==='int'&&n<0)throw new GameOpValidationError('INVALID_'+name.toUpperCase());
 if(type==='type'&&!DECORATIVE_TYPES[n])throw new GameOpValidationError('INVALID_TYPE');
 return n;
}
function normalizeGameOp(input){
 input=input&&typeof input==='object'?input:{};const command=String(input.command||'');const schema=COMMAND_SCHEMAS[command];if(!schema)throw new GameOpValidationError('UNKNOWN_COMMAND');
 const allowed=new Set(['command',...Object.keys(schema.fields)]);for(const k of Object.keys(input))if(!allowed.has(k))throw new GameOpValidationError('UNKNOWN_FIELD');
 const payload={command};for(const f of Object.keys(schema.fields)){if(input[f]!==undefined&&input[f]!==null&&input[f]!=='')payload[f]=conv(f,schema.fields[f],input[f]);}
 for(const f of schema.required)if(payload[f]===undefined)throw new GameOpValidationError('MISSING_'+f.toUpperCase());
 return {command,payload,mutating:!!schema.mutating,targetRequired:!!schema.targetRequired,guildRequired:!!schema.guildRequired};
}
function buildFriendlySummary(command,payload){const out={command};for(const k of Object.keys(payload||{}))if(k!=='command')out[k]=payload[k];return out;}
module.exports={DECORATIVE_TYPES,COMMAND_SCHEMAS,GameOpValidationError,normalizeGameOp,buildFriendlySummary};
