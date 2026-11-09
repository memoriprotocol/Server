'use strict';
// Reuse the later server's family-deduplication concept, but resolve every
// family through the *2024* WeaponScheme's oriWeaponID and owned ItemScheme.
const rows=require('../config/schemes/WeaponScheme.json').Weapon;
const byWeapon=new Map();
for(const row of rows)if(!byWeapon.has(Number(row.weaponID))||Number(row.level)===1)byWeapon.set(Number(row.weaponID),row);
function family(id){
 const row=byWeapon.get(Number(id));
 return row?Number(row.oriWeaponID||row.weaponID):0;
}
function duplicateInQuickbar(inventory,candidate,oldPosition){
 const familyId=family(candidate.itemCfgId);
 if(!familyId)return null;
 return inventory.find(item=>item!==candidate&&item.uuid!==candidate.uuid&&Number(item.bagType)===2&&Number(item.bagPos)!==Number(oldPosition)&&family(item.itemCfgId)===familyId)||null;
}
module.exports={family,duplicateInQuickbar};
