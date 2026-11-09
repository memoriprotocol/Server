'use strict';
const {randomInt}=require('node:crypto');
// Original 3.12 CommType.DamageType, consumed by Blood.onSubHP. A critical
// amount without dmgType=2 is rendered as ordinary damage by the client.
const TYPE=Object.freeze({none:0,normal:1,crit:2,poison:3,continueDmg:4,miss:5,resCollect:6,shieldResist:7,specialShieldResist:8});
const random=()=>randomInt(1000000)/1000000;
function critical(property,canCrit,rng=random){
 const chance=Math.min(100,Math.max(0,Number(property?.crit)||0));
 if(!canCrit||chance<=0)return false;
 const roll=rng();if(!Number.isFinite(roll)||roll<0||roll>=1)throw Error('INVALID_COMBAT_RANDOM');
 return roll*100<chance;
}
function calculate(property,skill,{rng=random,fixedAmount=null,fixedType=TYPE.poison,allowCrit=true,targetProperty=null}={}){
 const p=property||{};
 if(fixedAmount!==null){if(!Number.isFinite(fixedAmount)||fixedAmount<0)throw Error('INVALID_DAMAGE');return {amount:Math.floor(fixedAmount),critical:false,dmgType:fixedType};}
 const args={};for(const str of skill?.args||[]){const [key,val]=String(str).replace(/：/g,':').split(':');if(Number.isFinite(Number(val)))args[key]=Number(val);}
 const damage=args.damage??Number(skill?.damaga??0),atkArgs=args.atkArgs??Number(skill?.atkargs??0),attack=Number(p.attack)||0;
 let amount=Math.max(0,Math.floor(damage/100+attack*atkArgs/10000));
 const crit=critical(p,allowCrit&&!!skill?.canCrit,rng),multiplier=Math.max(100,Number.isFinite(Number(p.critHarm))?Number(p.critHarm):150);
 if(crit)amount=Math.floor(amount*multiplier/100);
 const element=Number(skill?.attribute)||1;const names={1:'physical',2:'fire',3:'thunder',4:'poison',5:'ice',6:'divine'};
 if(names[element]){const boost=Number(p[names[element]+'IncrPer'])||0;amount=Math.floor(amount*Math.max(0,1+boost/100));}
 if(targetProperty&&names[element]){const resistance=Number(targetProperty[names[element]+'Resistance'])||0;amount=Math.floor(amount*resistanceMultiplier(resistance));}
 if(!Number.isSafeInteger(amount)||amount>2147483647)throw Error('DAMAGE_OVERFLOW');
 return {amount,critical:crit,dmgType:crit?TYPE.crit:TYPE.normal};
}
// Local curve using native resistantExpression constants (300, .9, 300).
// The client exports resistance values but not the retail server formula.
function resistanceMultiplier(value){const params=require('../config/schemes/ConstantsScheme.json').Constants.find(r=>r.name==='resistantExpression')?.content||[300,.9,300];const scale=Number(params[0])||300,cap=Number(params[1])||.9,negativeScale=Number(params[2])||scale;return value>=0?1-Math.min(cap,value/(scale+value)):1+Math.min(cap,-value/(negativeScale-value));}
module.exports={TYPE,critical,calculate,resistanceMultiplier};
