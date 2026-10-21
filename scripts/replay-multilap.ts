import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { deserializeChampion } from '../src/core/serialization';
import { createTrack } from '../src/core/track';
import { createCar, stepCar, scoreCar } from '../src/core/simulation';
const variant=process.argv[2]??'original';
if(!['original','fastlap','barriers'].includes(variant))throw new Error('Use original, fastlap or barriers.');
const suffix=variant==='original'?'':variant==='fastlap'?'-fastlap':'-fastlap-barriers';
const results=['neurodrive','42','2026'].map(seed=>{
  const champion=deserializeChampion(readFileSync(`results/champion-${seed}-laps3${suffix}.json`,'utf8'));
  const track=createTrack(champion.track,champion.obstacles);
  const replay=(laps:number)=>{
    const car=createCar(track,champion.genome,0,champion.architecture,laps);
    while(car.alive)stepCar(car,track);
    return {score:scoreCar(car,track),lapTimes:car.lapTimes,reason:car.reason};
  };
  const original=replay(champion.targetLaps);assert.deepEqual(original.score,champion.score);
  return {seed,obstacles:champion.obstacles,sourceGeneration:champion.generation,targetLaps:champion.targetLaps,original,extendedToTenLaps:replay(10)};
});
writeFileSync(`results/replay-multilap${suffix}.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
