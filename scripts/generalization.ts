import { readFileSync, writeFileSync } from 'node:fs';
import { deserializeChampion } from '../src/core/serialization';
import { createTrack } from '../src/core/track';
import { createCar, stepCar, scoreCar } from '../src/core/simulation';
const results=['neurodrive','42','2026'].map(seed=>{
  const champion=deserializeChampion(readFileSync(`results/champion-${seed}.json`,'utf8'));
  const replay=(id:'oval'|'technical')=>{const track=createTrack(id,champion.obstacles),car=createCar(track,champion.genome,0,champion.architecture,champion.targetLaps);while(car.alive)stepCar(car,track);return {...scoreCar(car,track),reason:car.reason};};
  const sameTrack=replay('oval');
  if(Math.abs(sameTrack.progress-champion.score.progress)>1e-10||Math.abs(sameTrack.time-champion.score.time)>1e-10)throw new Error(`Replay mismatch for ${seed}`);
  return {seed,sourceGeneration:champion.generation,sameTrack,untrainedSwitchback:replay('technical')};
});
writeFileSync('results/generalization.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
