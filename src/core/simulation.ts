import { clamp, distance, intersection, pointInPolygon, type Vec } from './math';
import { ARCHITECTURE, forward, type Architecture, type Genome } from './network';
import { nearbyBoundaries, onRoad, raycast, type Track } from './track';
export const DT=1/60;
export const PHYSICS_VERSION=1;
export const DEFAULT_LAPS=3;
export const MAX_LAPS=10;
export function validateLaps(value:unknown):number {
  if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>MAX_LAPS)throw new Error('Laps per attempt must be an integer from 1 to 10.');
  return value;
}
export const PHYSICS={maxSpeed:195,maxReverse:55,acceleration:145,braking:230,drag:.46,rolling:5,turnRate:2.65,length:23,width:12,sensorRange:215,episodeSeconds:34,stallSeconds:4.5} as const;
export const SENSOR_ANGLES=[-Math.PI*.5,-Math.PI/3,-Math.PI/6,0,Math.PI/6,Math.PI/3,Math.PI*.5];
export type EndReason='collision'|'stalled'|'timeout'|'completed'|null;
export interface Car extends Vec {
  id:number; angle:number; speed:number; alive:boolean; elapsed:number; nextGate:number;
  furthest:number; lastProgressTime:number; completed:boolean; reason:EndReason;
  targetLaps:number;lapsCompleted:number;lapStartedAt:number;bestLapTime:number|null;lapTimes:number[];
  inputs:number[]; action:[number,number]; genome:Genome;architecture:Architecture;
}
export function createCar(track:Track,genome:Genome=[],id=0,architecture:Architecture=ARCHITECTURE,targetLaps=1):Car {
  return {id,x:track.spawn.x,y:track.spawn.y,angle:track.heading,speed:0,alive:true,elapsed:0,nextGate:1,furthest:0,lastProgressTime:0,completed:false,reason:null,inputs:Array(8).fill(0),action:[0,0],genome,architecture,targetLaps:validateLaps(targetLaps),lapsCompleted:0,lapStartedAt:0,bestLapTime:null,lapTimes:[]};
}
export function cornersAt(x:number,y:number,angle:number):Vec[] {
  const c=Math.cos(angle),s=Math.sin(angle),l=PHYSICS.length/2,w=PHYSICS.width/2;
  return [[l,w],[l,-w],[-l,-w],[-l,w]].map(([a,b])=>({x:x+c*a-s*b,y:y+s*a+c*b}));
}
export function collides(track:Track,x:number,y:number,angle:number) {
  const corners=cornersAt(x,y,angle);
  // Local boundary crossings catch sides as well as corners. The center test handles fully off-road shapes.
  if(!onRoad(track,{x,y}))return true;
  if(track.obstaclePolygons.some(p=>pointInPolygon({x,y},p)||pointInPolygon(p[0],corners)))return true;
  for(const edge of nearbyBoundaries(track,corners))for(let i=0;i<4;i++)if(intersection(corners[i],corners[(i+1)%4],edge.a,edge.b)!==null)return true;
  return false;
}
export function sense(car:Car,track:Track):number[] {
  return [...SENSOR_ANGLES.map(offset=>raycast(track,car,car.angle+offset,PHYSICS.sensorRange)),clamp(car.speed/PHYSICS.maxSpeed)];
}
/** Ordered gates continue across laps; distance never wraps, so reversing cannot farm progress. */
export function updateProgress(car:Car,previous:Vec,track:Track) {
  if(car.completed)return;
  const gateCount=track.gates.length,gate=track.gates[car.nextGate%gateCount];
  const movement={x:car.x-previous.x,y:car.y-previous.y};
  const crossed=intersection(previous,car,gate.a,gate.b)!==null;
  if(crossed && movement.x*gate.forward.x+movement.y*gate.forward.y>1e-6) {
    const finishLine=car.nextGate%gateCount===0;
    car.nextGate++;
    if(finishLine){
      const lapTime=car.elapsed-car.lapStartedAt;
      car.lapsCompleted++;car.lapTimes.push(lapTime);car.lapStartedAt=car.elapsed;
      car.bestLapTime=car.bestLapTime===null?lapTime:Math.min(car.bestLapTime,lapTime);
      car.furthest=Math.max(car.furthest,car.lapsCompleted*track.length);car.lastProgressTime=car.elapsed;
      if(car.lapsCompleted>=car.targetLaps){car.completed=true;car.alive=false;car.reason='completed';return;}
    }
  }
  const lastGate=car.nextGate-1,lap=Math.floor(lastGate/gateCount),index=lastGate%gateCount;
  const start=track.gates[index].node,nodeCount=track.points.length;
  const nextIndex=(index+1)%gateCount,end=start+(track.gates[nextIndex].node-start+nodeCount)%nodeCount;
  const lower=track.gates[index].distance,upper=nextIndex===0?track.length:track.gates[nextIndex].distance;
  let nearest=Infinity,arc=lower;
  for(let k=start;k<end;k++) {
    const i=k%nodeCount,a=track.points[i],b=track.points[(i+1)%nodeCount],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    const t=clamp(((car.x-a.x)*dx+(car.y-a.y)*dy)/(len*len),0,1);
    const d=Math.hypot(car.x-a.x-dx*t,car.y-a.y-dy*t);
    if(d<nearest){nearest=d;arc=track.distances[i]+len*t;}
  }
  const valid=lap*track.length+(nearest<=track.width/2?clamp(arc,lower,upper-.001):lower);
  if(valid>car.furthest+.08){car.furthest=valid;car.lastProgressTime=car.elapsed;}
}
/** One fixed tick. Movement is swept in <= 3-unit / 0.04-radian substeps. */
export function stepCar(car:Car,track:Track,manualAction?:[number,number]) {
  if(!car.alive)return;
  car.inputs=sense(car,track);
  const action=manualAction??forward(car.genome,car.inputs,car.architecture);
  car.action=[clamp(action[0]),clamp(action[1])];
  const [steer,throttle]=car.action;
  const braking=throttle<0&&car.speed>0;
  const force=throttle*(braking?PHYSICS.braking:PHYSICS.acceleration)-PHYSICS.drag*car.speed;
  car.speed=clamp(car.speed+force*DT,-PHYSICS.maxReverse,PHYSICS.maxSpeed);
  const friction=PHYSICS.rolling*DT;
  car.speed=Math.abs(car.speed)<friction?0:car.speed-Math.sign(car.speed)*friction;
  const turn=steer*PHYSICS.turnRate*(car.speed/PHYSICS.maxSpeed)*DT;
  const travel=car.speed*DT;
  const substeps=Math.max(1,Math.ceil(Math.abs(travel)/3),Math.ceil(Math.abs(turn)/.04));
  car.elapsed+=DT;
  for(let i=0;i<substeps;i++) {
    const previous={x:car.x,y:car.y};
    const angle=car.angle+turn/substeps;
    const x=car.x+Math.cos((car.angle+angle)/2)*travel/substeps,y=car.y+Math.sin((car.angle+angle)/2)*travel/substeps;
    if(collides(track,x,y,angle)) {car.alive=false;car.reason='collision';break;}
    car.x=x;car.y=y;car.angle=angle;
    updateProgress(car,previous,track);
    if(!car.alive)break;
  }
  if(car.alive && car.elapsed-car.lastProgressTime>=PHYSICS.stallSeconds){car.alive=false;car.reason='stalled';}
  if(car.alive && car.elapsed>=PHYSICS.episodeSeconds*car.targetLaps){car.alive=false;car.reason='timeout';}
}
export interface Score {progress:number;completed:boolean;time:number;completedLaps:number;bestLapTime:number|null}
export const scoreCar=(car:Car,track:Track):Score=>({progress:car.furthest/(track.length*car.targetLaps),completed:car.completed,time:car.elapsed,completedLaps:car.lapsCompleted,bestLapTime:car.bestLapTime});
export function compareScores(a:Pick<Score,'progress'|'completed'|'time'>,b:Pick<Score,'progress'|'completed'|'time'>) {
  if(a.completed!==b.completed)return a.completed?1:-1;
  if(a.completed&&b.completed)return b.time-a.time;
  return a.progress-b.progress;
}
export const distanceToSpawn=(car:Car,track:Track)=>distance(car,track.spawn);
