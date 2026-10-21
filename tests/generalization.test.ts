import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattery, hasPassage, scenarioTrack, scenarioCar, batteryKey } from '../src/core/scenarios';
import { createTrack, nearestHeading, canPlaceObstacle } from '../src/core/track';
import { DiverseEvolution } from '../src/core/diverse-evolution';
import { Evolution } from '../src/core/evolution';
import { aggregateResults, compareAggregate, FrozenEvaluator } from '../src/core/evaluation';
import { serializeChampion, deserializeChampion } from '../src/core/serialization';
import { testCurrentEnvironment, originalScenario } from '../src/core/transfer';
import { DT, stepCar } from '../src/core/simulation';
const settings={population:20,mutationRate:.14,mutationStrength:.3,laps:1};
const train=makeBattery('test-transfer','train'),reserved=makeBattery('test-transfer','holdout');
test('expanded 5–6-scenario batteries remain reproducible, passable and bounded',()=>{
  for(const count of [5,6]){
    const config={count,difficulty:'wide'} as const,battery=makeBattery('wider','train',config);
    assert.equal(battery.length,count);assert.deepEqual(battery,makeBattery('wider','train',config));
    assert.ok(battery.every(s=>s.obstacles.length>0&&hasPassage(scenarioTrack(s))));
  }
  for(const count of [0,3,7,100])assert.throws(()=>makeBattery('bounds','train',{count,difficulty:'moderate'}));
});
function endScenario(e:DiverseEvolution,progress:(id:number)=>number=()=>0,index=e.runs.findIndex(run=>!run.finished)){
  const run=e.runs[index];
  for(const car of run.cars){const p=progress(car.id);Object.assign(car,{alive:false,completed:p===1,furthest:p*run.track.length*car.targetLaps,elapsed:5+car.id*.1,lapsCompleted:p===1?car.targetLaps:0,bestLapTime:p===1?5+car.id*.1:null,reason:p===1?'completed':'collision'});}
  e.tick();
}
test('batteries are reproducible, split by RNG, cover both tracks/directions and validate joint passage',()=>{
  assert.deepEqual(makeBattery('test-transfer','train'),train);
  assert.notEqual(batteryKey(train,1),batteryKey(reserved,1));
  assert.deepEqual(new Set(train.map(s=>s.track)),new Set(['oval','technical']));
  assert.deepEqual(new Set(train.map(s=>s.reverse)),new Set([false,true]));
  assert.ok(reserved.some(s=>s.scaleX!==1));
  for(const scenario of [...train,...reserved])assert.equal(hasPassage(scenarioTrack(scenario)),true);
  const base=createTrack('oval'),p=base.points[45],heading=nearestHeading(base,p);
  const fence=[-38,0,38].map((offset,id)=>({id,x:p.x-Math.sin(heading)*offset,y:p.y+Math.cos(heading)*offset,angle:heading+Math.PI/2}));
  assert.ok(fence.every(o=>canPlaceObstacle(base,o)),'Each fence piece fits on asphalt');
  assert.equal(hasPassage(createTrack('oval',fence)),false,'Together they block car-width passage');
});
test('all runs start together with independent physical states and shared genome values',()=>{
  const e=new DiverseEvolution('test-transfer',settings,[8,12,2],{count:4,difficulty:'moderate'},train),genomes=e.cars.map(c=>[...c.genome]);
  assert.throws(()=>e.nextGeneration(),/wait/);
  for(const [i,run] of e.runs.entries()){
    assert.deepEqual(run.cars[0],scenarioCar(train[i],genomes[0],0,e.architecture,1,run.track));
    assert.deepEqual(run.cars.map(c=>c.genome),genomes);
    assert.notEqual(run.cars[0].genome,e.runs[(i+1)%4].cars[0].genome);
  }
  e.tick();
  assert.ok(e.runs.every(run=>run.cars.every(car=>car.elapsed===DT)));
  assert.equal(e.cohortMetrics().population,80);assert.equal(e.cohortMetrics().active,80);
});
test('finished runs wait without switching cameras; all scenarios gate breeding even when they finish out of order',()=>{
  const e=new DiverseEvolution('parallel-wait',settings,[8,12,2],{count:4,difficulty:'moderate'},train);
  e.selectScenario(2);const geometry=e.track;
  for(const index of [2,0,3]){
    endScenario(e,()=>.2,index);assert.equal(e.generation,1);assert.equal(e.scenarioIndex,2);assert.equal(e.champion,null);
    assert.equal(e.track,geometry);assert.throws(()=>e.nextGeneration(),/wait/);
  }
  const frozen=structuredClone(e.runs[2].cars);e.tick();assert.deepEqual(e.runs[2].cars,frozen);
  assert.ok(e.results.every(rows=>rows.map(r=>r.scenarioId).join(',')===[train[0],train[2],train[3]].map(s=>s.id).join(',')));
  endScenario(e,()=>.2,1);
  assert.equal(e.generation,2);assert.equal(e.scenarioIndex,2);assert.ok(e.champion?.evaluation);
  assert.deepEqual(e.champion.evaluation.training.outcomes.map(o=>o.scenarioId),train.map(s=>s.id));
  assert.equal(e.history[0].metrics.population,80);assert.equal(e.history[0].metrics.active,0);
  assert.ok(e.runs.every(run=>run.cars.every(car=>car.elapsed===0&&car.nextGate===1)));
  assert.equal(e.track,e.runs[2].track);assert.equal(e.cars,e.runs[2].cars);
  assert.throws(()=>e.selectScenario(-1));assert.throws(()=>e.selectScenario(4));assert.throws(()=>e.selectScenario(NaN));
});
test('camera selection cannot change evolution, clocks, aggregates or randomness across generations',()=>{
  const a=new DiverseEvolution('camera-isolation',settings),b=new DiverseEvolution('camera-isolation',settings);
  let tick=0;
  while(a.generation<3){a.selectScenario(tick++%4);a.tick();b.tick();}
  assert.deepEqual(a.runs,b.runs);assert.deepEqual(a.champion,b.champion);assert.deepEqual(a.history,b.history);
  assert.equal(a.rng.next(),b.rng.next());
});
test('population changes apply to every run together and retain the previous aggregate denominator',()=>{
  const e=new DiverseEvolution('parallel-population',settings);
  e.selectScenario(3);e.queueSettings({...settings,population:30});
  for(let i=0;i<4;i++)endScenario(e,()=>1);
  assert.equal(e.scenarioIndex,3);assert.equal(e.history[0].metrics.population,80);assert.equal(e.history[0].metrics.completed,80);
  assert.equal(e.completedLaps,80);assert.ok(e.runs.every(run=>run.cars.length===30));assert.equal(e.cohortMetrics().population,120);
});
test('champion, unchanged elites and parents use aggregate consistency; no single-lap specialist bonus',()=>{
  const e=new DiverseEvolution('aggregate-selection',settings,[8,12,2],{count:4,difficulty:'moderate'},train),genomes=e.cars.map(c=>[...c.genome]);
  for(let i=0;i<4;i++)endScenario(e,id=>id===0?(i===0?1:.01):id===1?(i===1?1:.5):0);
  assert.deepEqual(e.champion!.genome,genomes[1]);assert.deepEqual(e.cars[0].genome,genomes[1]);assert.equal(e.lapElite,null);
  assert.equal(e.champion!.evaluation!.training.aggregate.completed,1);assert.equal(e.champion!.score.completed,false);
  assert.ok(e.cars.slice(2).some(c=>c.genome.some((w,i)=>w!==genomes[1][i])),'Remaining drivers include mutations');
});
test('aggregate ordering uses mean, worst-case and normalized time and refuses different batteries',()=>{
  const rows=train.map((s,i)=>({scenarioId:s.id,length:1000*(i+1),score:{progress:.5,completed:false,time:10,completedLaps:0,bestLapTime:null},reason:'collision' as const}));
  const a=aggregateResults(train,rows,1),b=structuredClone(a);
  b.worstProgress=.2;assert.ok(compareAggregate(a,b)>0);
  b.worstProgress=a.worstProgress;b.normalizedTime=.02;a.normalizedTime=.01;assert.ok(compareAggregate(a,b)>0);
  assert.throws(()=>compareAggregate(a,aggregateResults(reserved,[],1)),/different/);
  assert.throws(()=>compareAggregate(a,aggregateResults(train,rows,2)),/different/);
});
test('reserved evaluation cannot change training genomes, RNG, selection or champion weights',()=>{
  const a=new DiverseEvolution('isolated',settings),b=new DiverseEvolution('isolated',settings),plain=new Evolution('oval','isolated',settings);
  assert.deepEqual(a.cars.map(c=>c.genome),plain.cars.map(c=>c.genome));
  const frozen=[...a.cars[0].genome],test=new FrozenEvaluator(reserved,frozen,a.architecture,1);
  while(!test.done){test.tick();a.tick();b.tick();}
  assert.deepEqual(test.genome,frozen);assert.deepEqual(frozen,a.generation===1?a.cars[0].genome:frozen);
  assert.deepEqual(a.cars,b.cars);assert.deepEqual(a.champion,b.champion);assert.equal(a.rng.next(),b.rng.next());
  assert.throws(()=>new DiverseEvolution('invalid',settings,[8,12,2],{count:4,difficulty:'moderate'},reserved.slice(0,4)),/Training/);
});
test('different lap goals clear aggregate records at the battery boundary without cross-battery comparison',()=>{
  const e=new DiverseEvolution('goals',settings,[8,12,2],{count:4,difficulty:'moderate'},train);
  for(let i=0;i<4;i++)endScenario(e);assert.ok(e.champion);
  e.queueSettings({...settings,laps:2});for(let i=0;i<4;i++)endScenario(e);
  assert.equal(e.settings.laps,2);assert.equal(e.champion,null);assert.deepEqual(e.history,[]);assert.ok(e.cars.every(c=>c.targetLaps===2));
});
test('version 6 aggregate metadata roundtrips, reproduces every attempt and rejects inconsistent evaluations',()=>{
  const e=new DiverseEvolution('serialization',settings);while(e.generation<2)e.tick();
  const original=e.champion!,probe=new FrozenEvaluator(e.heldout,original.genome,original.architecture,1);while(!probe.done)probe.tick();
  original.evaluation!.holdout=probe.result();const raw=serializeChampion(original),loaded=deserializeChampion(raw);
  assert.deepEqual(loaded,original);
  const replay=new FrozenEvaluator(loaded.evaluation!.training.scenarios,loaded.genome,loaded.architecture,1);while(!replay.done)replay.tick();
  assert.deepEqual(replay.result(),loaded.evaluation!.training);
  for(const corrupt of [(f:any)=>f.champion.evaluation.training.aggregate.meanProgress=.999,(f:any)=>f.champion.evaluation.training.scenarios[0].split='holdout',(f:any)=>f.champion.evaluation.training.outcomes[0].score.progress=NaN]){
    const f=JSON.parse(raw);corrupt(f);assert.throws(()=>deserializeChampion(JSON.stringify(f)));
  }
  const old=new Evolution('oval','old',settings);old.tick();const legacy=JSON.parse(serializeChampion(old.champion!));legacy.version=5;delete legacy.evaluationVersion;
  assert.deepEqual(deserializeChampion(JSON.stringify(legacy)),old.champion);
});
test('testing a frozen champion preserves the edited environment; original replay is explicit and separate',()=>{
  const e=new Evolution('oval','frozen',settings);e.tick();const champion=e.champion!,weights=[...champion.genome];
  const layout=makeBattery('other','holdout')[1],environment=scenarioTrack(layout),before=JSON.stringify(environment.obstacles);
  const car=testCurrentEnvironment(champion,environment,layout);while(car.alive)stepCar(car,environment);
  assert.deepEqual(car.genome,weights);assert.deepEqual(champion.genome,weights);assert.equal(JSON.stringify(environment.obstacles),before);
  assert.equal(environment.id,'technical');assert.equal(originalScenario(champion).track,'oval');
});
