import type { Vec } from './math';
export const MAX_OBSTACLES=24;
export const OBSTACLE_LENGTH=36;
export const OBSTACLE_WIDTH=26;
export const OBSTACLE_KINDS=['barrier','circle','triangle','block','long'] as const;
export type ObstacleKind=typeof OBSTACLE_KINDS[number];
export const OBSTACLE_LABELS:Record<ObstacleKind,string>={barrier:'Striped barrier',circle:'Round bollard',triangle:'Triangle',block:'Square block',long:'Long barrier'};
export interface Obstacle {id:number;x:number;y:number;angle:number;kind?:ObstacleKind}
export function obstacleCorners(o:Obstacle):Vec[]{
  const c=Math.cos(o.angle),s=Math.sin(o.angle),l=OBSTACLE_LENGTH/2,w=OBSTACLE_WIDTH/2;
  const kind=o.kind??'barrier';
  const local=kind==='circle'?Array.from({length:20},(_,i)=>[15*Math.cos(i*Math.PI/10),15*Math.sin(i*Math.PI/10)])
    :kind==='triangle'?[[22,0],[-18,-18],[-18,18]]
    :kind==='block'?[[15,15],[15,-15],[-15,-15],[-15,15]]
    :kind==='long'?[[30,7],[30,-7],[-30,-7],[-30,7]]
    :[[l,w],[l,-w],[-l,-w],[-l,w]];
  return local.map(([a,b])=>({x:o.x+c*a-s*b,y:o.y+s*a+c*b}));
}
export function validateObstacles(value:unknown):Obstacle[]{
  if(!Array.isArray(value)||value.length>MAX_OBSTACLES)throw new Error('Use at most 24 obstacles.');
  const ids=new Set<number>();
  return value.map(item=>{
    if(!item||typeof item!=='object')throw new Error('Invalid obstacle.');
    const {id,x,y,angle,kind}=item as Obstacle;
    if(kind!==undefined&&!OBSTACLE_KINDS.includes(kind))throw new Error('Unknown obstacle shape.');
    if(!Number.isInteger(id)||id<0||id>1e6||ids.has(id)||![x,y,angle].every(n=>typeof n==='number'&&Number.isFinite(n))||x<0||x>1000||y<0||y>700||Math.abs(angle)>Math.PI*2)throw new Error('Obstacle coordinates, angle or ID are invalid.');
    ids.add(id);return kind===undefined?{id,x,y,angle}:{id,x,y,angle,kind};
  });
}
/** Object IDs and array order do not change the physical layout. */
export function layoutKey(obstacles:readonly Obstacle[]):string {
  return JSON.stringify(obstacles.map(({x,y,angle,kind})=>[x,y,angle,kind??'barrier'] as const).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]||a[3].localeCompare(b[3])));
}
