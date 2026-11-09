'use strict';
// Geometry algorithm adapted from the later server's world-motion.js.
// IMPORTANT: shapes/sizes are derived EXCLUSIVELY from the 2024 BuildingScheme,
// never from the later client's map capture or updated asset IDs.
const finite=Number.isFinite;
function collider(x,y,dimensions,margin=0){
 if(!finite(x)||!finite(y))throw Error('BAD_COLLIDER_COORDS');
 const sizes=(dimensions||[]).map(Number);
 if(!sizes.length||sizes.some(n=>!finite(n)||n<=0||n>20000))throw Error('INVALID_COLLIDER_SIZE');
 if(sizes.length===1)return {shape:'circle',x,y,radius:sizes[0]/2+margin};
 return {shape:'rect',x,y,halfW:sizes[0]/2+margin,halfH:sizes[1]/2+margin};
}
function circleEntry(x0,y0,x1,y1,cx,cy,r){
 const dx=x1-x0,dy=y1-y0,fx=x0-cx,fy=y0-cy;
 if(fx*fx+fy*fy<r*r-1e-6)return null; // movement out of pre-existing overlap
 const a=dx*dx+dy*dy;if(a<1e-12)return null;
 const b=2*(fx*dx+fy*dy),c=fx*fx+fy*fy-r*r,dis=b*b-4*a*c;
 if(dis<0)return null;
 const t=(-b-Math.sqrt(dis))/(2*a);
 return t>=0&&t<=1?t:null;
}
function rectContains(x,y,b){return x>b.x-b.halfW&&x<b.x+b.halfW&&y>b.y-b.halfH&&y<b.y+b.halfH;}
// Slab raycast for axis-aligned 2024 building prefabs (the build command has no rotation).
function rectEntry(x0,y0,x1,y1,b){
 if(rectContains(x0,y0,b))return null;
 let low=0,high=1;
 for(const [origin,delta,min,max] of [
  [x0,x1-x0,b.x-b.halfW,b.x+b.halfW],
  [y0,y1-y0,b.y-b.halfH,b.y+b.halfH]]){
  if(Math.abs(delta)<1e-12){if(origin<min||origin>max)return null;continue;}
  const t1=(min-origin)/delta,t2=(max-origin)/delta;
  low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));
  if(low>high)return null;
 }
 return low>=0&&low<=1?low:null;
}
function normalize(body){
 if(body.shape==='rect'){if(![body.x,body.y,body.halfW,body.halfH].every(finite))return null;return body;}
 if(body.shape==='circle'){if(![body.x,body.y,body.radius].every(finite))return null;return body;}
 if([body.x,body.y,body.radius].every(finite))return {...body,shape:'circle'};
 return null;
}
function firstCollision(x0,y0,x1,y1,bodies=[]){
 let first=null;
 for(const entry of bodies){const b=normalize(entry);if(!b)continue;
  const t=b.shape==='rect'?rectEntry(x0,y0,x1,y1,b):circleEntry(x0,y0,x1,y1,b.x,b.y,b.radius);
  if(t!==null&&(first===null||t<first))first=t;
 }
 return first;
}
function overlap(a,b,margin=0){
 const x=normalize(a),y=normalize(b);if(!x||!y)return false;
 if(x.shape==='circle'&&y.shape==='circle')return Math.hypot(x.x-y.x,x.y-y.y)<x.radius+y.radius+margin;
 if(x.shape==='rect'&&y.shape==='rect')return Math.abs(x.x-y.x)<x.halfW+y.halfW+margin&&Math.abs(x.y-y.y)<x.halfH+y.halfH+margin;
 const c=x.shape==='circle'?x:y,r=x.shape==='rect'?x:y;
 const dx=Math.max(Math.abs(c.x-r.x)-r.halfW,0),dy=Math.max(Math.abs(c.y-r.y)-r.halfH,0);
 return Math.hypot(dx,dy)<c.radius+margin;
}
module.exports={collider,circleEntry,rectEntry,firstCollision,overlap};
