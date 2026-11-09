'use strict';
// One explicit catalog is shared by auth, commands and the website. No wildcards.
const COMMANDS={
 'give-gold':['재화','골드 지급'], 'give-diamond':['재화','다이아 지급'], 'give-currency':['재화','커스텀 재화 지급'], 'give-xp':['재화','경험치 지급'],
 'give-item':['아이템','아이템 지급'], 'give-weapon':['아이템','무기 지급'], 'give-equipment':['아이템','장비 지급'], 'give-dec':['아이템','외형 지급'], 'give-card':['아이템','명함 지급'],
 'guild-level':['길드','길드 레벨'], 'guild-territory-level':['길드','길드 영지 레벨'], 'guild-contribution':['길드','길드 공헌도'], 'guild-fund':['길드','길드 기금'],
 'teleport-monster':['몬스터','몬스터 위치로 이동'], 'kill-monster':['몬스터','몬스터 처치'], 'respawn-monster':['몬스터','몬스터 재생성'],
 'teleport':['ETC','좌표 이동'], 'tutorial-mssing-clear':['ETC','튜토리얼 상태 초기화']
};
const CATALOG=[
 ['users.manage','사이트','유저 관리'],['site.manage','사이트','사이트 관리'],['posts.manage','사이트','게시글 관리'],['comments.manage','사이트','댓글 관리'],['shop.manage','사이트','상점 관리'],['mail.manage','메일','메일 관리'],['audit.read','로그','관리 기록 조회'],['ops.logs','로그','명령 실행기록 조회'],
 ['guilds.read','길드2','길드 목록 조회'],['guilds.edit','길드2','길드 정보 수정'],['guilds.members','길드2','가입 유저 탈퇴'],['guilds.roles','길드2','길드 직위 변경'],['guilds.leader','길드2','길드장 위임'],['guilds.applications','길드2','가입 신청 승인·거절'],['guilds.profiles.activate','길드2','길드 프로필 활성화'],['guilds.profiles.deactivate','길드2','길드 프로필 비활성화'],
 ...Object.entries(COMMANDS).map(([k,v])=>['ops.'+k,v[0],v[1]])
].map(([key,group,label])=>Object.freeze({key,group,label}));
const KEYS=new Set(CATALOG.map(x=>x.key));
const role=a=>a&&['admin','developer'].includes(a.role)?a.role:'user';
const clean=p=>[...new Set((Array.isArray(p)?p:[]).filter(x=>typeof x==='string'&&KEYS.has(x)))].sort();
function has(a,k){return !!a&&a.authorizationFresh!==false&&(a.status==null||a.status==='active')&&(role(a)==='developer'||role(a)==='admin'&&KEYS.has(k)&&Array.isArray(a.permissions)&&a.permissions.includes(k));}
function canAssign(a){return role(a)==='developer'&&a.authorizationFresh!==false&&(a.status==null||a.status==='active');}
function any(a){return canAssign(a)||CATALOG.some(x=>has(a,x.key));}
function canOperate(a){return has(a,'shop.manage')||Object.keys(COMMANDS).some(k=>has(a,'ops.'+k))||CATALOG.some(x=>x.key.startsWith('guilds.')&&has(a,x.key))||has(a,'ops.logs')||has(a,'mail.manage');}
function canManageEventControls(a){return canAssign(a)||has(a,'shop.manage')||Object.keys(COMMANDS).some(k=>has(a,'ops.'+k))||CATALOG.some(x=>x.key.startsWith('guilds.')&&has(a,x.key))||has(a,'ops.logs');}
function commandRequirements(input,item){
 const cmd=String(input&&input.command||'');if(!Object.prototype.hasOwnProperty.call(COMMANDS,cmd))throw Object.assign(Error('UNKNOWN_COMMAND'),{code:'UNKNOWN_COMMAND'});
 const needs=['ops.'+cmd];
 if(['give-item','give-currency','give-weapon','give-equipment','give-card'].includes(cmd)){
  const id=Number(input.itemId),type=Number(item&&item.itemType);
  if(id===109||type===21)needs.push('ops.give-gold');else if(id===111||type===25||type===55)needs.push('ops.give-diamond');
  else if(type===1)needs.push('ops.give-xp');
  else if(type===224)needs.push('ops.give-card');
  else if(item&&item.__weapon)needs.push('ops.give-weapon');
  else if(item&&item.__equipment)needs.push('ops.give-equipment');
  else if(item&&item.__cosmetic)needs.push('ops.give-dec');
  else if(cmd==='give-currency'&&item&&!item.__currency)needs.push('ops.give-item');
 }
 return [...new Set(needs)];
}
function requirePermission(a,key){if(!has(a,key))throw Object.assign(Error('FORBIDDEN'),{code:'FORBIDDEN',status:403});}
function webScope(p){
 if(/^\/admin\/users?$/.test(p)||p.startsWith('/admin/user/')||p.startsWith('/api/admin/user-icons/'))return 'users.manage';
 if(p==='/admin/site'||/^\/api\/admin\/(site-|launcher-links|translate|boards|board-categories)/.test(p))return 'site.manage';
 if(p==='/admin/posts'||/^\/api\/post\/\d+\/pin$/.test(p))return 'posts.manage';
 if(p==='/admin/comments')return 'comments.manage';
 if(p==='/admin/logs')return 'audit.read';
 if(p.startsWith('/admin/mail')||p.startsWith('/api/admin/mail'))return 'mail.manage';
 if(p.startsWith('/admin/shop')||p.startsWith('/api/admin/shop'))return 'shop.manage';
 return null;
}
module.exports={COMMANDS,CATALOG,clean,role,has,canAssign,any,canOperate,canManageEventControls,commandRequirements,requirePermission,webScope};
