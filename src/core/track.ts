import { obstacleCorners, validateObstacles, type Obstacle } from './obstacles';
import { distance, intersection, pointInPolygon, type Vec } from './math';
export type TrackId = 'oval' | 'technical';
export interface Segment { a: Vec; b: Vec }
export interface Gate extends Segment { forward: Vec; node: number; distance: number }
export interface Track {
  id: TrackId; name: string; description: string; width: number; points: Vec[]; outer: Vec[]; inner: Vec[];
  boundaries: Segment[]; grid: Map<string, Segment[]>; gates: Gate[]; distances: number[]; length: number;
  spawn: Vec; heading: number;obstacles:Obstacle[];obstaclePolygons:Vec[][];
}
export const CELL = 90;
function catmull(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const f = (a: number, b: number, c: number, d: number) => .5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t);
  return { x: f(p0.x,p1.x,p2.x,p3.x), y: f(p0.y,p1.y,p2.y,p3.y) };
}
function resample(raw: Vec[], count: number): Vec[] {
  const lengths = [0];
  for (let i=1;i<=raw.length;i++) lengths.push(lengths[i-1] + distance(raw[i-1],raw[i % raw.length]));
  let j=0;
  return Array.from({length:count},(_,i)=>{
    const d=i*lengths[raw.length]/count;
    while(lengths[j+1]<d) j++;
    const a=raw[j],b=raw[(j+1)%raw.length],t=(d-lengths[j])/(lengths[j+1]-lengths[j]);
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  });
}
export function createTrack(id: TrackId,obstacleInput:readonly Obstacle[]=[],shape={scaleX:1,scaleY:1}): Track {
  let raw: Vec[]=[];
  const width=id==='oval'?122:96;
  if(id==='oval') {
    raw=Array.from({length:256},(_,i)=>{ const a=Math.PI/2+i/256*Math.PI*2;return {x:500+330*Math.cos(a),y:350+198*Math.sin(a)}; });
  } else {
    const controls=[{x:535,y:561},{x:240,y:556},{x:137,y:385},{x:225,y:177},{x:463,y:159},{x:542,y:328},{x:745,y:190},{x:866,y:332},{x:821,y:518}];
    for(let i=0;i<controls.length;i++)for(let j=0;j<32;j++)raw.push(catmull(controls[(i+controls.length-1)%controls.length],controls[i],controls[(i+1)%controls.length],controls[(i+2)%controls.length],j/32));
  }
  if(shape.scaleX!==1||shape.scaleY!==1)raw=raw.map(p=>({x:500+(p.x-500)*shape.scaleX,y:350+(p.y-350)*shape.scaleY}));
  const points=resample(raw,96),outer:Vec[]=[],inner:Vec[]=[],boundaries:Segment[]=[],distances=[0];
  for(let i=0;i<points.length;i++) {
    const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
    const dx=next.x-prev.x,dy=next.y-prev.y,len=Math.hypot(dx,dy),nx=dy/len,ny=-dx/len;
    outer.push({x:points[i].x+nx*width/2,y:points[i].y+ny*width/2});
    inner.push({x:points[i].x-nx*width/2,y:points[i].y-ny*width/2});
    if(i>0)distances.push(distances[i-1]+distance(points[i-1],points[i]));
  }
  const length=distances[95]+distance(points[95],points[0]);
  for(let i=0;i<96;i++)for(const edge of [outer,inner])boundaries.push({a:edge[i],b:edge[(i+1)%96]});
  const obstacles=validateObstacles(obstacleInput),obstaclePolygons=obstacles.map(obstacleCorners);
  for(const polygon of obstaclePolygons)for(let i=0;i<polygon.length;i++)boundaries.push({a:polygon[i],b:polygon[(i+1)%polygon.length]});
  const grid=new Map<string,Segment[]>();
  for(const seg of boundaries) {
    for(let x=Math.floor(Math.min(seg.a.x,seg.b.x)/CELL);x<=Math.floor(Math.max(seg.a.x,seg.b.x)/CELL);x++)
      for(let y=Math.floor(Math.min(seg.a.y,seg.b.y)/CELL);y<=Math.floor(Math.max(seg.a.y,seg.b.y)/CELL);y++) {
        const key=`${x},${y}`,arr=grid.get(key)??[];arr.push(seg);grid.set(key,arr);
      }
  }
  const gates=Array.from({length:16},(_,i)=>{
    const node=i*6,p=points[(node+1)%96],q=points[(node+95)%96],d=distance(p,q);
    return {a:inner[node],b:outer[node],forward:{x:(p.x-q.x)/d,y:(p.y-q.y)/d},node,distance:distances[node]};
  });
  const heading=Math.atan2(gates[0].forward.y,gates[0].forward.x);
  const track:Track={id,name:id==='oval'?'The Oval':'Switchback',description:id==='oval'?'A little room to learn.':'Tighter turns. A new test.',width,points,outer,inner,boundaries,grid,gates,distances,length,spawn:{...points[0]},heading,obstacles,obstaclePolygons};
  if(obstacles.some(o=>!canPlaceObstacle(track,o)))throw new Error('Keep obstacles fully on the asphalt and at least 55 units from the starting grid.');
  return track;
}
export function onRoad(track:Track,p:Vec) { return pointInPolygon(p,track.outer) && !pointInPolygon(p,track.inner); }
export function canPlaceObstacle(track:Track,o:Obstacle){
  const corners=obstacleCorners(o);
  if(distance(o,track.spawn)<55||!corners.every(p=>onRoad(track,p)))return false;
  for(const edge of [track.outer,track.inner])for(let i=0;i<edge.length;i++)for(let j=0;j<corners.length;j++)
    if(intersection(corners[j],corners[(j+1)%corners.length],edge[i],edge[(i+1)%edge.length])!==null)return false;
  return true;
}
export function nearestHeading(track:Track,p:Vec){
  let best=Infinity,angle=track.heading;
  for(let i=0;i<track.points.length;i++){
    const a=track.points[i],b=track.points[(i+1)%track.points.length],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
    const d=Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
    if(d<best){best=d;angle=Math.atan2(dy,dx);}
  }
  return angle;
}
export function defaultObstacles(track:Track):Obstacle[]{
  return [14,45,75].map((node,id)=>{
    const p=track.points[node],angle=nearestHeading(track,p),offset=id%2? -20:20;
    const o={id,x:p.x-Math.sin(angle)*offset,y:p.y+Math.cos(angle)*offset,angle};
    return canPlaceObstacle(track,o)?o:{...o,x:p.x,y:p.y};
  }).filter(o=>canPlaceObstacle(track,o));
}
/** Grid traversal tests only boundary segments in cells crossed by the ray. */
export function raycast(track:Track,origin:Vec,angle:number,range:number) {
  if(track.obstaclePolygons.some(p=>pointInPolygon(origin,p)))return 0;
  const dx=Math.cos(angle),dy=Math.sin(angle),end={x:origin.x+dx*range,y:origin.y+dy*range};
  let x=Math.floor(origin.x/CELL),y=Math.floor(origin.y/CELL),nearest=1;
  const sx=dx>=0?1:-1,sy=dy>=0?1:-1;
  let tx=Math.abs(dx)<1e-9?Infinity:((x+(sx>0?1:0))*CELL-origin.x)/dx;
  let ty=Math.abs(dy)<1e-9?Infinity:((y+(sy>0?1:0))*CELL-origin.y)/dy;
  const stepx=CELL/Math.abs(dx),stepy=CELL/Math.abs(dy);
  for(let n=0;n<32;n++) {
    for(const seg of track.grid.get(`${x},${y}`)??[]) {
      const t=intersection(origin,end,seg.a,seg.b);if(t!==null&&t<nearest)nearest=t;
    }
    if(nearest*range<=Math.min(tx,ty)||Math.min(tx,ty)>range)break;
    if(tx<ty){x+=sx;tx+=stepx;}else{y+=sy;ty+=stepy;}
  }
  return nearest;
}
export function nearbyBoundaries(track:Track,corners:Vec[]) {
  const minX=Math.floor(Math.min(...corners.map(p=>p.x))/CELL),maxX=Math.floor(Math.max(...corners.map(p=>p.x))/CELL);
  const minY=Math.floor(Math.min(...corners.map(p=>p.y))/CELL),maxY=Math.floor(Math.max(...corners.map(p=>p.y))/CELL);
  const found=new Set<Segment>();
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)for(const s of track.grid.get(`${x},${y}`)??[])found.add(s);
  return found;
}
