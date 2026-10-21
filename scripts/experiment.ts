import { createTrack, defaultObstacles } from '../src/core/track';
import { writeFileSync } from 'node:fs';
import { DEFAULT_LAPS, validateLaps } from '../src/core/simulation';
import { Evolution, DEFAULT_SETTINGS, EVOLUTION_POLICY } from '../src/core/evolution';
import { validateArchitecture } from '../src/core/network';
import type { TrackId } from '../src/core/track';
import { serializeChampion } from '../src/core/serialization';
const args=process.argv.slice(2),generations=Number(args[0]??40),seeds=(args[1]??'neurodrive,42,2026').split(',');
const trackId=(args[2]??'oval') as TrackId;
const architecture=validateArchitecture([8,...(args[3]??'12').split(',').map(Number),2]);
const laps=validateLaps(args[4]===undefined?DEFAULT_LAPS:Number(args[4]));
const settings={...DEFAULT_SETTINGS,laps};
if(args[5]!==undefined&&!['clear','barriers'].includes(args[5]))throw new Error('Obstacle layout must be clear or barriers.');
const obstacles=args[5]==='barriers'?defaultObstacles(createTrack(trackId)):[];
const obstacleSuffix=obstacles.length?'-barriers':'';
const policySuffix='-fastlap';
const lapsSuffix=laps===1?'':`-laps${laps}`;
const networkSuffix=architecture.join(',')==='8,12,2'?'':`-net${architecture.slice(1,-1).join('x')}`;
if(!['oval','technical'].includes(trackId))throw new Error('Track must be oval or technical.');
if(!Number.isInteger(generations)||generations<1)throw new Error('Supply a positive generation count.');
const results=[];
for(const seed of seeds) {
  const start=performance.now(),e=new Evolution(trackId,seed,settings,architecture,obstacles);
  const history:typeof e.history=[];
  while(e.generation<=generations) {
    const gen=e.generation;
    e.tick();
    if(e.generation!==gen){
      history.push({...e.history.at(-1)!});
      if(gen===1||gen%10===0)console.log(JSON.stringify({seed,...history.at(-1)}));
    }
  }
  const result={obstacles,evolutionPolicy:EVOLUTION_POLICY,lapElite:e.lapElite,seed,track:trackId,settings,architecture:e.architecture,generations,firstGeneration:history[0],finalGeneration:history.at(-1),champion:e.champion?.score,completedLaps:e.completedLaps,history,seconds:Number(((performance.now()-start)/1000).toFixed(2))};
  results.push(result);console.log(JSON.stringify(result,null,2));
  if(e.champion)writeFileSync(`results/champion-${trackId==='oval'?'':trackId+'-'}${seed.replace(/[^a-z0-9_-]/gi,'_')}${networkSuffix}${lapsSuffix}${policySuffix}${obstacleSuffix}.json`,serializeChampion(e.champion));
}
writeFileSync(`results/experiments${trackId==='oval'?'':'-'+trackId}${networkSuffix}${lapsSuffix}${policySuffix}${obstacleSuffix}.json`,JSON.stringify({recordedAt:new Date().toISOString(),generations,results},null,2));
