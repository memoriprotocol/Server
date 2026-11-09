'use strict';
// Explicit local placement policy, not claimed to be a recovered retail layout.
const city=require('./city-3127'), water=require('./water-3127');
const regions=require('../config/map2-spawn-regions-3127.json').areas;
const defaults=require('../config/world-content-3127.json');
const production=require('../config/schemes/MapProductionScheme.json').MapProduction;
const bossAreas=[...new Set(production.filter(r=>r.MapID===2&&defaults.bossIds.includes(r.CreatureID)).map(r=>r.AreaID))].flatMap(id=>regions[id]||[]);
const policy=Object.freeze({treeRadius:180,wellRadius:220,wellMinDistance:8000,arenaMargin:4500});
function inside(x,y,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
function segmentDistance(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;const t=len?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/len)):0;return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
const arenaFootprints=require('../config/map2-boss-arena-footprints-3127.json').rects;
function inBossArena(x,y,radius=0){if(arenaFootprints.some(r=>Math.hypot(Math.max(0,Math.abs(x-r.x)-r.w/2),Math.max(0,Math.abs(y-r.y)-r.h/2))<=radius))return true;return bossAreas.some(points=>inside(x,y,points)||points.some((p,i)=>segmentDistance(x,y,p,points[(i+1)%points.length])<=radius+policy.arenaMargin));}
function overlapsWater(x,y,radius){
 // Use the original rectangles, including water hidden under a bridge. Static
 // trees/wells must not be placed on the bridge deck either.
 return water.zones.rects.some(([cx,cy,w,h])=>Math.hypot(Math.max(0,Math.abs(x-cx)-w/2),Math.max(0,Math.abs(y-cy)-h/2))<=radius);
}
function valid(kind,x,y,placed=[]){
 if(!Number.isFinite(x)||!Number.isFinite(y))return false;
 const radius=kind==='tree'?policy.treeRadius:policy.wellRadius;
 if(city.safeOverlapCollider({shape:'circle',x,y,radius})||city.overlapsStatic(x,y,radius)||overlapsWater(x,y,radius)||inBossArena(x,y,radius))return false;
 return kind!=='well'||placed.every(r=>r.kind!=='well'||Math.hypot(r.x-x,r.y-y)>=policy.wellMinDistance);
}
function relocate(rows,random){
 const placed=[],changes=[];
 for(const row of rows){
  if(['tree','well'].includes(row.kind)&&!valid(row.kind,row.x,row.y,placed)){
   const from={x:row.x,y:row.y};let found=false;
   for(let attempt=0;attempt<20000;attempt++){
    const x=(random()*2-1)*24500,y=(random()*2-1)*25500;
    if(valid(row.kind,x,y,placed)){row.x=x;row.y=y;found=true;break;}
   }
   if(!found)throw Error('NO_VALID_STATIC_PLACEMENT '+row.id);
   changes.push({id:row.id,kind:row.kind,from,to:{x:row.x,y:row.y}});
  }
  placed.push(row);
 }
 return changes;
}
module.exports={policy,bossAreas,arenaFootprints,inBossArena,overlapsWater,valid,relocate};
// Operator requested two interactive buff altars per Map2 boss arena.
function arrangeStatues(rows){
 const bosses=rows.filter(r=>r.kind==='boss'),statues=rows.filter(r=>r.kind==='statue');
 if(statues.length!==bosses.length*2)throw Error('INVALID_STATUE_COUNT');const placed=[];
 for(let i=0;i<bosses.length;i++){
  const boss=bosses[i],foot=arenaFootprints.find(r=>r.cid===boss.cid),points=(regions[boss.areaId]||[]).flat();
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const cx=foot?.x??(Math.min(...xs)+Math.max(...xs))/2,cy=foot?.y??(Math.min(...ys)+Math.max(...ys))/2;
  const rx=foot?foot.w/2+700:(Math.max(...xs)-Math.min(...xs))/2+policy.arenaMargin+600;
  const ry=foot?foot.h/2+700:(Math.max(...ys)-Math.min(...ys))/2+policy.arenaMargin+600;
  for(let j=0;j<2;j++){
   let point=null;for(let k=0;k<128;k++){const angle=(j*Math.PI+(k%64)*Math.PI/32),extra=Math.floor(k/64)*500,x=cx+Math.cos(angle)*(rx+extra),y=cy+Math.sin(angle)*(ry+extra);
    if(Math.abs(x)>24500||Math.abs(y)>25500||overlapsWater(x,y,160)||city.safePoint(x,y)||city.overlapsStatic(x,y,180)||placed.some(r=>Math.hypot(r.x-x,r.y-y)<1800))continue;
    point={x,y};break;
   }
   if(!point)throw Error('NO_STATUE_POSITION '+boss.cid);Object.assign(statues[i*2+j],point,{bossArenaCID:boss.cid});placed.push(statues[i*2+j]);
  }
 }
 return placed;
}
module.exports.arrangeStatues=arrangeStatues;
function sampleProduction(row,random,accept){const parts=regions[row.AreaID]||[];if(!parts.length)return null;const pts=parts.flat(),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);for(let n=0;n<4000;n++){const x=loX+random()*(hiX-loX),y=loY+random()*(hiY-loY);if(parts.some(p=>inside(x,y,p))&&accept(x,y))return{x,y};}return null;}
module.exports.sampleProduction=sampleProduction;
