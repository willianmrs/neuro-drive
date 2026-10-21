import { Random, distance, hashSeed } from './math';
import { validateObstacles, type Obstacle, type ObstacleKind } from './obstacles';
import { createTrack, canPlaceObstacle, nearestHeading, type Track, type TrackId } from './track';
import { collides, createCar } from './simulation';
import type { Architecture, Genome } from './network';
export interface Scenario {
  id:string;name:string;split:'train'|'holdout';track:TrackId;reverse:boolean;startNode:number;
  lateral:number;headingOffset:number;scaleX:number;scaleY:number;obstacles:Obstacle[];
}
export interface DiversityConfig {count:number;difficulty:'moderate'|'wide'}
export const DEFAULT_DIVERSITY:DiversityConfig={count:4,difficulty:'moderate'};
export function validateDiversity(c:DiversityConfig):DiversityConfig {
  if(!c||!Number.isInteger(c.count)||c.count<4||c.count>6||!['moderate','wide'].includes(c.difficulty))throw new Error('Use 4–6 training scenarios and moderate or wide diversity.');
  return {count:c.count,difficulty:c.difficulty};
}
export function scenarioTrack(s:Scenario):Track {
  const t=createTrack(s.track,s.obstacles,{scaleX:s.scaleX,scaleY:s.scaleY});
  const source=t.points,points=source.map((_,i)=>source[(s.startNode+(s.reverse?-i:i)+96)%96]);
  const distances=[0];for(let i=1;i<96;i++)distances.push(distances[i-1]+distance(points[i-1],points[i]));
  t.points=points;t.distances=distances;t.length=distances[95]+distance(points[95],points[0]);
  t.gates=Array.from({length:16},(_,i)=>{
    const node=i*6,original=(s.startNode+(s.reverse?-node:node)+96)%96,a=points[(node+95)%96],b=points[(node+1)%96],d=distance(a,b);
    return {node,distance:distances[node],a:t.inner[original],b:t.outer[original],forward:{x:(b.x-a.x)/d,y:(b.y-a.y)/d}};
  });
  t.spawn={...points[0]};t.heading=Math.atan2(t.gates[0].forward.y,t.gates[0].forward.x);return t;
}
export function scenarioCar(s:Scenario,genome:Genome,id:number,architecture:Architecture,laps:number,track=scenarioTrack(s)) {
  const c=createCar(track,genome,id,architecture,laps);
  c.x-=Math.sin(track.heading)*s.lateral;c.y+=Math.cos(track.heading)*s.lateral;c.angle+=s.headingOffset;return c;
}
/** A conservative closed collision-free corridor. Checks combinations, not obstacles in isolation.
 * This establishes geometric clearance, not that every neural controller can drive the route. */
export function hasPassage(track:Track):boolean {
  const offsets=Array.from({length:9},(_,i)=>(i-4)*(track.width/2-20)/4);
  const poses=Array.from({length:192},(_,i)=>{
    const node=Math.floor(i/2),a=track.points[node],b=track.points[(node+1)%96],f=(i%2)/2;
    const angle=Math.atan2(b.y-a.y,b.x-a.x),x=a.x+(b.x-a.x)*f,y=a.y+(b.y-a.y)*f;
    return offsets.map(offset=>({x:x-Math.sin(angle)*offset,y:y+Math.cos(angle)*offset,angle}));
  });
  let reachable=new Set([4]);
  for(let i=1;i<=poses.length;i++){
    const row=poses[i%poses.length],previous=poses[i-1],next=new Set<number>();
    for(let j=0;j<row.length;j++){
      if(i===poses.length&&j!==4)continue;
      if(collides(track,row[j].x,row[j].y,row[j].angle))continue;
      for(const k of reachable){
        if(Math.abs(j-k)>1)continue;
        const a=previous[k],b=row[j],steps=Math.ceil(distance(a,b)/3);let clear=true;
        let turn=(b.angle-a.angle+Math.PI*3)%(Math.PI*2)-Math.PI;
        for(let n=1;n<=steps;n++){const f=n/steps;if(collides(track,a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f,a.angle+turn*f)){clear=false;break;}}
        if(clear){next.add(j);break;}
      }
    }
    reachable=next;if(!reachable.size)return false;
  }
  return reachable.has(4);
}
export function batteryKey(scenarios:readonly Scenario[],laps:number){
  // Canonical physical conditions, independent of JSON object key order and editor IDs.
  return JSON.stringify({version:1,laps,scenarios:scenarios.map(s=>[s.id,s.split,s.track,s.reverse,s.startNode,s.lateral,s.headingOffset,s.scaleX,s.scaleY,
    s.obstacles.map(o=>[o.x,o.y,o.angle,o.kind??'barrier'] as const).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]||a[3].localeCompare(b[3]))])});
}
export function batteryId(scenarios:readonly Scenario[],laps:number){return hashSeed(batteryKey(scenarios,laps)).toString(16).padStart(8,'0');}
export function makeBattery(seed:string,split:'train'|'holdout',config:DiversityConfig=DEFAULT_DIVERSITY):Scenario[]{
  validateDiversity(config);
  const rng=new Random(`scenarios-v1:${split}:${seed}:${config.difficulty}`),count=split==='holdout'?6:config.count;
  return Array.from({length:count},(_,i)=>{
    const track:TrackId=i%2===0?'oval':'technical',reverse=i%4>=2,wide=config.difficulty==='wide';
    const varied=split==='holdout'||wide;
    const scaleX=varied?.94+rng.next()*.1:1,scaleY=varied?.95+rng.next()*.08:1;
    const startNode=i===0&&split==='train'?0:Math.floor(rng.next()*16)*6;
    const s:Scenario={id:`${split}-${i+1}`,name:`${track==='oval'?'Oval':'Switchback'} ${reverse?'CW':'CCW'} · ${split} ${i+1}`,split,track,reverse,startNode,
      lateral:(rng.next()-.5)*(wide?12:6),headingOffset:(rng.next()-.5)*(wide?.14:.08),scaleX,scaleY,obstacles:[]};
    // First pair is forgiving; later scenarios add separated, rotated obstacles.
    const desired=split==='train'&&i<2&&!wide?0:wide?3:2;
    const bare=scenarioTrack(s),kinds:ObstacleKind[]=['barrier','circle','triangle','block'];
    for(let attempt=0;attempt<32&&s.obstacles.length<desired;attempt++){
      const node=Math.floor(rng.next()*96),p=bare.points[node],heading=nearestHeading(bare,p),offset=(rng.next()<.5?-1:1)*(bare.width*.28);
      const o:Obstacle={id:s.obstacles.length,kind:kinds[Math.floor(rng.next()*kinds.length)],x:p.x-Math.sin(heading)*offset,y:p.y+Math.cos(heading)*offset,angle:heading+(rng.next()-.5)*.7};
      if(distance(o,bare.spawn)<100||s.obstacles.some(b=>distance(o,b)<180)||!canPlaceObstacle(bare,o))continue;
      const candidate={...s,obstacles:[...s.obstacles,o]};
      try{if(hasPassage(scenarioTrack(candidate)))s.obstacles.push(o);}catch{/* Retry a valid candidate. */}
    }
    const t=scenarioTrack(s),car=scenarioCar(s,[],0,[8,12,2],1,t);
    if(collides(t,car.x,car.y,car.angle)||!hasPassage(t))throw new Error('Scenario has no validated passage.');
    return s;
  });
}
export function validateScenario(value:unknown):Scenario {
  const s=value as Scenario;
  if(!s||typeof s!=='object'||typeof s.id!=='string'||s.id.length>64||typeof s.name!=='string'||s.name.length>100||!['train','holdout'].includes(s.split)||!['oval','technical'].includes(s.track)||typeof s.reverse!=='boolean'||!Number.isInteger(s.startNode)||s.startNode<0||s.startNode>=96||s.startNode%6||!Number.isFinite(s.lateral)||Math.abs(s.lateral)>12||!Number.isFinite(s.headingOffset)||Math.abs(s.headingOffset)>.2||![s.scaleX,s.scaleY].every(x=>Number.isFinite(x)&&x>=.9&&x<=1.08))throw new Error('Invalid evaluation scenario.');
  const result={id:s.id,name:s.name,split:s.split,track:s.track,reverse:s.reverse,startNode:s.startNode,lateral:s.lateral,headingOffset:s.headingOffset,scaleX:s.scaleX,scaleY:s.scaleY,obstacles:validateObstacles(s.obstacles)};
  const t=scenarioTrack(result),c=scenarioCar(result,[],0,[8,12,2],1,t);
  if(collides(t,c.x,c.y,c.angle)||!hasPassage(t))throw new Error('Evaluation scenario lacks a valid start or passage.');
  return result;
}
