import { writeFileSync } from 'node:fs';
import { Evolution, DEFAULT_SETTINGS } from '../src/core/evolution';
import { DiverseEvolution } from '../src/core/diverse-evolution';
import { FrozenEvaluator } from '../src/core/evaluation';
import { makeBattery } from '../src/core/scenarios';
import { serializeChampion } from '../src/core/serialization';
const generations=Number(process.argv[2]??24),seeds=(process.argv[3]??'neurodrive,42,2026').split(','),population=Number(process.argv[4]??40);
if(!Number.isInteger(generations)||generations<1||!Number.isInteger(population)||population<20||population>300)throw new Error('Supply generations and population.');
const config={count:4,difficulty:'moderate'} as const,settings={...DEFAULT_SETTINGS,population,laps:1},results=[];
for(const seed of seeds){
  const fileSeed=seed.replace(/[^a-z0-9_-]/gi,'_');
  const sharedTrain=makeBattery(seed,'train',config),holdout=makeBattery(seed,'holdout',config),arms=[];
  for(const method of ['fixed','diverse'] as const){
    const start=performance.now(),e=method==='fixed'?new Evolution('oval',seed,settings):new DiverseEvolution(seed,settings,[8,12,2],config);
    const budget=method==='fixed'?generations*config.count:generations;let carSteps=0;
    while(e.generation<=budget){carSteps+=e.cars.filter(c=>c.alive).length;const before=e.generation;e.tick();if(before!==e.generation&&(before===1||before%12===0))console.log(JSON.stringify({seed,method,generation:before,progress:e.history.at(-1)?.average}));}
    const seconds=(performance.now()-start)/1000,c=e.champion!;
    const probe=(scenarios:typeof holdout)=>{const test=new FrozenEvaluator(scenarios,c.genome,c.architecture,c.targetLaps);while(!test.done)test.tick();return test.result();};
    const held=probe(holdout),shared=probe(sharedTrain),training=e instanceof DiverseEvolution?c.evaluation!.training:undefined;
    if(training)c.evaluation={...c.evaluation!,holdout:held};
    writeFileSync(`results/transfer-${method}-${fileSeed}.json`,serializeChampion(c));
    const record={method,episodes:budget*population*(method==='diverse'?config.count:1),generations:budget,carSteps,seconds,sourceGeneration:c.generation,nativeTrain:training?.aggregate??c.score,sharedTrain:shared,holdout:held,firstGeneration:e.history[0],lastGeneration:e.history.at(-1)};
    arms.push(record);console.log(JSON.stringify({seed,method,episodes:record.episodes,seconds,sharedSuccess:shared.aggregate.completed,holdoutSuccess:held.aggregate.completed,holdoutProgress:held.aggregate.meanProgress}));
  }
  results.push({seed,arms});
  writeFileSync('results/compare-diversity.json',JSON.stringify({recordedAt:new Date().toISOString(),config,settings,generations,results},null,2));
}
