import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intersection, Random } from '../src/core/math';
import { createTrack, onRoad, raycast } from '../src/core/track';
import { createCar, stepCar, collides, updateProgress, compareScores, scoreCar, validateLaps, PHYSICS, DT } from '../src/core/simulation';
import { forward, mutate, randomGenome, WEIGHT_COUNT, weightCount, validateArchitecture, activations } from '../src/core/network';
import { Evolution } from '../src/core/evolution';
import { deserializeChampion, serializeChampion } from '../src/core/serialization';
const track=createTrack('oval');
test('segment and ray intersections handle hits, misses, parallel lines and endpoints',()=>{
  assert.equal(intersection({x:0,y:0},{x:10,y:0},{x:5,y:-5},{x:5,y:5}),.5);
  assert.equal(intersection({x:0,y:0},{x:10,y:0},{x:11,y:-5},{x:11,y:5}),null);
  assert.equal(intersection({x:0,y:0},{x:10,y:0},{x:0,y:1},{x:10,y:1}),null);
  assert.equal(intersection({x:0,y:0},{x:10,y:0},{x:10,y:0},{x:10,y:5}),1);
  const hit=raycast(track,track.spawn,Math.PI/2,200);
  assert.ok(Math.abs(hit*200-track.width/2)<.2);
  for(let a=0;a<Math.PI*2;a+=.11) {
    const origin=track.points[13],end={x:origin.x+215*Math.cos(a),y:origin.y+215*Math.sin(a)};
    let brute=1;for(const s of track.boundaries){const t=intersection(origin,end,s.a,s.b);if(t!==null)brute=Math.min(brute,t);}
    assert.ok(Math.abs(raycast(track,origin,a,215)-brute)<1e-8);
  }
});
test('oriented collision catches a corner while center remains on the road, on both tracks',()=>{
  for(const id of ['oval','technical'] as const) {
    const t=createTrack(id),p=t.spawn,angle=t.heading;
    assert.equal(collides(t,p.x,p.y,angle),false);
    const gate=t.gates[0],nx=gate.b.x-p.x,ny=gate.b.y-p.y,len=Math.hypot(nx,ny);
    const x=p.x+nx/len*(t.width/2-3),y=p.y+ny/len*(t.width/2-3);
    assert.equal(onRoad(t,{x,y}),true);
    assert.equal(collides(t,x,y,angle),true);
    assert.equal(collides(t,500,350,0),true);
  }
});
test('stationary steering cannot spin; fixed ticks stop at the boundary',()=>{
  const car=createCar(track);for(let i=0;i<120;i++)stepCar(car,track,[1,0]);
  assert.equal(car.angle,track.heading);assert.equal(car.speed,0);
  const moving=createCar(track);moving.angle=Math.PI/2;moving.speed=195;
  for(let i=0;i<120&&moving.alive;i++)stepCar(moving,track,[0,1]);
  assert.equal(moving.reason,'collision');assert.ok(moving.y<track.spawn.y+track.width/2);
});
test('directional gates reject skipped and reverse checkpoints; oscillation earns no repeated score',()=>{
  const car=createCar(track);
  const place=(node:number)=>{car.x=track.points[node].x;car.y=track.points[node].y;};
  place(20);updateProgress(car,track.points[19],track);assert.equal(car.nextGate,1);assert.ok(car.furthest<track.gates[1].distance);
  place(5);updateProgress(car,track.points[7],track);assert.equal(car.nextGate,1);
  place(7);updateProgress(car,track.points[5],track);assert.equal(car.nextGate,2);
  const best=car.furthest;
  for(let i=0;i<10;i++){place(5);updateProgress(car,track.points[7],track);place(7);updateProgress(car,track.points[5],track);}
  assert.equal(car.nextGate,2);assert.equal(car.furthest,best);
});
test('one lap requires every ordered gate and completion wins before time',()=>{
  const car=createCar(track);
  for(let i=1;i<=16;i++){
    const gate=track.gates[i%16],center=track.points[gate.node];
    const before={x:center.x-gate.forward.x,y:center.y-gate.forward.y};
    car.x=center.x+gate.forward.x;car.y=center.y+gate.forward.y;updateProgress(car,before,track);
  }
  assert.equal(car.completed,true);assert.equal(car.furthest,track.length);assert.equal(car.reason,'completed');
  assert.ok(compareScores({completed:true,progress:1,time:20},{completed:true,progress:1,time:21})>0);
  assert.ok(compareScores({completed:true,progress:1,time:30},{completed:false,progress:.99,time:1})>0);
});
test('a stalled or reversing controller cannot collect a lap or survive forever',()=>{
  for(const action of [[0,0],[0,-1],[1,1]] as [number,number][]) {
    const car=createCar(track);let steps=0;
    while(car.alive&&steps++<2200)stepCar(car,track,action);
    assert.equal(car.alive,false);assert.equal(car.completed,false);assert.ok(car.furthest<track.length*.2);
  }
});
test('network has 134 weights, bounded outputs, and seeded mutation never edits its parent',()=>{
  const rng=new Random('test'),genome=randomGenome(rng);assert.equal(WEIGHT_COUNT,134);
  for(let i=0;i<50;i++){const output=forward(genome,Array.from({length:8},()=>rng.normal()*100));assert.ok(output.every(v=>Number.isFinite(v)&&v>=-1&&v<=1));}
  const before=[...genome];assert.deepEqual(mutate(genome,rng,0,1),genome);
  const mutated=mutate(genome,new Random('m'),1,.3);assert.notDeepEqual(mutated,genome);assert.deepEqual(genome,before);
  assert.deepEqual(mutated,mutate(genome,new Random('m'),1,.3));
});
test('evolution preserves elites unchanged, applies pending settings at the generation boundary, and is reproducible',()=>{
  const e=new Evolution('oval','elites',{population:20,mutationRate:1,mutationStrength:1,laps:1});
  e.cars[7].furthest=100;e.cars[3].furthest=80;
  const first=[...e.cars[7].genome],second=[...e.cars[3].genome];
  e.queueSettings({population:30,mutationRate:.2,mutationStrength:.4,laps:1});assert.equal(e.cars.length,20);
  e.nextGeneration();assert.equal(e.cars.length,30);assert.deepEqual(e.cars[0].genome,first);assert.deepEqual(e.cars[1].genome,second);assert.equal(e.pending,null);
  const a=new Evolution('oval','repeat',{population:20,mutationRate:.14,mutationStrength:.3,laps:1});
  const b=new Evolution('oval','repeat',{population:20,mutationRate:.14,mutationStrength:.3,laps:1});
  for(let i=0;i<600;i++){a.tick();b.tick();}assert.deepEqual(a.cars,b.cars);assert.deepEqual(a.champion,b.champion);
});
test('versioned champion roundtrips and deterministically replays; malformed data is rejected',()=>{
  const e=new Evolution('oval','save',{population:20,mutationRate:.14,mutationStrength:.3,laps:1});
  for(let i=0;i<100;i++)e.tick();const original=e.champion!;
  const raw=serializeChampion(original),loaded=deserializeChampion(raw);assert.deepEqual(loaded,original);
  const a=createCar(track,original.genome),b=createCar(track,loaded.genome);for(let i=0;i<600;i++){stepCar(a,track);stepCar(b,track);}assert.deepEqual(a,b);
  for(const edit of [(f:any)=>f.version=99,(f:any)=>f.champion.genome[0]='bad',(f:any)=>f.champion.genome.pop(),(f:any)=>f.champion.score.progress=10,(f:any)=>f.timestep=DT*2,(f:any)=>f.champion.track='unknown',(f:any)=>f.champion.score.completed=true,(f:any)=>f.savedAt='invalid',(f:any)=>f.architecture=[8,25,2]]){const file=JSON.parse(raw);edit(file);assert.throws(()=>deserializeChampion(JSON.stringify(file)));}
  assert.throws(()=>deserializeChampion('null'));assert.throws(()=>deserializeChampion('{'));
});
test('configurable networks support 1–4 hidden layers and their diagrams report real activations',()=>{
  for(const shape of [[8,1,2],[8,6,9,2],[8,24,24,24,24,2]]){
    validateArchitecture(shape);const weights=randomGenome(new Random('layers'),shape),inputs=[.1,.2,.3,.4,.5,.6,.7,.8];
    assert.equal(weights.length,weightCount(shape));
    const result=forward(weights,inputs,shape),trace=activations(weights,inputs,shape);
    assert.deepEqual(trace.map(a=>a.length),shape);assert.deepEqual(trace.at(-1),result);
    assert.ok(trace.flat().every(v=>Number.isFinite(v)&&v>=-1&&v<=1));
  }
  assert.equal(weightCount([8,12,12,2]),290);assert.equal(weightCount([8,24,24,24,24,2]),2066);
  for(const invalid of [[8,2],[7,12,2],[8,0,2],[8,25,2],[8,12,3],[8,12.5,2],[8,1,1,1,1,1,2],null])assert.throws(()=>validateArchitecture(invalid));
});
test('custom-architecture champions retain their network through evolution, serialization and replay',()=>{
  const shape=[8,7,5,2],e=new Evolution('oval','custom',{population:20,mutationRate:.14,mutationStrength:.3,laps:1},shape);
  while(e.generation<3)e.tick();
  assert.deepEqual(e.architecture,shape);assert.ok(e.cars.every(c=>c.genome.length===weightCount(shape)));
  const champion=e.champion!,saved=deserializeChampion(serializeChampion(champion));assert.deepEqual(saved,champion);
  const original=createCar(track,champion.genome,0,champion.architecture),loaded=createCar(track,saved.genome,0,saved.architecture);
  while(original.alive){stepCar(original,track);stepCar(loaded,track);}assert.deepEqual(loaded,original);
  const mismatch=JSON.parse(serializeChampion(champion));mismatch.champion.architecture=[8,12,2];assert.throws(()=>deserializeChampion(JSON.stringify(mismatch)));
});
test('legacy version 1 champions migrate to the original architecture',()=>{
  const e=new Evolution('oval','legacy',{population:20,mutationRate:.14,mutationStrength:.3,laps:1});for(let i=0;i<20;i++)e.tick();
  const file=JSON.parse(serializeChampion(e.champion!));file.version=1;delete file.champion.architecture;
  const loaded=deserializeChampion(JSON.stringify(file));assert.deepEqual(loaded.architecture,[8,12,2]);assert.deepEqual(loaded.genome,e.champion!.genome);
});
function crossGate(car:ReturnType<typeof createCar>,gateIndex:number,elapsed:number){
  const gate=track.gates[gateIndex%track.gates.length],center=track.points[gate.node];
  const before={x:center.x-gate.forward.x,y:center.y-gate.forward.y};
  car.elapsed=elapsed;car.x=center.x+gate.forward.x;car.y=center.y+gate.forward.y;
  updateProgress(car,before,track);
}
test('three laps require three complete ordered circuits and keep movement across the finish line',()=>{
  const car=createCar(track,[],0,[8,12,2],3);car.speed=120;
  for(let lap=0;lap<3;lap++){
    for(let gate=1;gate<=16;gate++)crossGate(car,gate,lap*16+gate);
    assert.equal(car.lapsCompleted,lap+1);assert.equal(car.nextGate,1+(lap+1)*16);
    assert.equal(car.speed,120);assert.notDeepEqual({x:car.x,y:car.y},track.spawn);
    assert.equal(car.alive,lap<2);assert.equal(car.completed,lap===2);
    assert.ok(Math.abs(scoreCar(car,track).progress-(lap+1)/3)<.01);
  }
  assert.deepEqual(car.lapTimes,[16,16,16]);assert.equal(car.bestLapTime,16);
  assert.equal(car.furthest,track.length*3);assert.equal(car.reason,'completed');
});
test('finish-line oscillation, reverse gates, skipped gates and wrapped positions cannot farm another lap',()=>{
  const car=createCar(track,[],0,[8,12,2],3);
  for(let gate=1;gate<=16;gate++)crossGate(car,gate,gate);
  const best=car.furthest;
  for(let repeat=0;repeat<10;repeat++){
    crossGate(car,0,17);crossGate(car,0,18);crossGate(car,5,19);
    assert.equal(car.lapsCompleted,1);assert.equal(car.nextGate,17);
  }
  // Projection within the first interval can advance only toward its next gate, never grant a lap.
  assert.ok(car.furthest<track.length+track.gates[1].distance);
  assert.ok(car.furthest>=best);
  const gate=track.gates[1],center=track.points[gate.node];
  car.x=center.x-gate.forward.x;car.y=center.y-gate.forward.y;
  updateProgress(car,{x:center.x+gate.forward.x,y:center.y+gate.forward.y},track);
  assert.equal(car.nextGate,17);assert.equal(car.lapsCompleted,1);
});
test('progress in the second lap outranks a fast first lap, and full runs use total time',()=>{
  const first=createCar(track,[],0,[8,12,2],3),second=createCar(track,[],1,[8,12,2],3);
  for(let gate=1;gate<=16;gate++){crossGate(first,gate,gate);crossGate(second,gate,gate*2);}
  crossGate(second,1,34);
  assert.ok(compareScores(scoreCar(second,track),scoreCar(first,track))>0);
  assert.equal(second.completed,false);assert.equal(second.alive,true);
  const full={...scoreCar(first,track),completed:true,progress:1,time:40};
  assert.ok(compareScores(full,{...full,time:41})>0);
});
test('time budgets scale with the lap target while stalling still stops an attempt',()=>{
  const one=createCar(track),three=createCar(track,[],0,[8,12,2],3);
  for(const car of [one,three]){car.elapsed=PHYSICS.episodeSeconds;car.lastProgressTime=car.elapsed;stepCar(car,track,[0,0]);}
  assert.equal(one.reason,'timeout');assert.equal(three.alive,true);
  three.elapsed=PHYSICS.episodeSeconds*3;three.lastProgressTime=three.elapsed;stepCar(three,track,[0,0]);assert.equal(three.reason,'timeout');
  const stalled=createCar(track,[],0,[8,12,2],10);for(let i=0;i<300;i++)stepCar(stalled,track,[0,0]);assert.equal(stalled.reason,'stalled');
  for(const invalid of [0,11,-1,1.5,NaN,'3'])assert.throws(()=>validateLaps(invalid));
});
test('changing the lap target waits for the boundary, preserves elites, and resets comparable scores',()=>{
  const e=new Evolution('oval','lap-settings',{population:20,mutationRate:.14,mutationStrength:.3,laps:1});
  for(let i=0;i<50;i++)e.tick();const genome=[...e.leader().genome];
  e.queueSettings({...e.settings,laps:5});assert.equal(e.settings.laps,1);assert.ok(e.cars.every(c=>c.targetLaps===1));
  e.nextGeneration();assert.equal(e.settings.laps,5);assert.deepEqual(e.cars[0].genome,genome);
  assert.ok(e.cars.every(c=>c.targetLaps===5));assert.equal(e.champion,null);assert.deepEqual(e.history,[]);assert.equal(e.completedLaps,0);assert.equal(e.bestLapTime(),null);
});
test('version 3 preserves multi-lap races, validates lap metadata, and version 2 migrates to one lap',()=>{
  const e=new Evolution('oval','multi-save',{population:20,mutationRate:.14,mutationStrength:.3,laps:3});
  while(e.generation<3)e.tick();const champion=e.champion!;
  const saved=deserializeChampion(serializeChampion(champion));assert.equal(saved.targetLaps,3);assert.deepEqual(saved,champion);
  const a=createCar(track,champion.genome,0,champion.architecture,champion.targetLaps),b=createCar(track,saved.genome,0,saved.architecture,saved.targetLaps);
  while(a.alive){stepCar(a,track);stepCar(b,track);}assert.deepEqual(a,b);
  assert.deepEqual(scoreCar(a,track),champion.score);
  for(const edit of [(f:any)=>f.targetLaps=11,(f:any)=>f.champion.targetLaps=1,(f:any)=>f.champion.score.completedLaps=10,(f:any)=>f.champion.score.bestLapTime=-1]){const f=JSON.parse(serializeChampion(champion));edit(f);assert.throws(()=>deserializeChampion(JSON.stringify(f)));}
  const old=new Evolution('oval','old',{population:20,mutationRate:.14,mutationStrength:.3,laps:1});for(let i=0;i<100;i++)old.tick();
  const legacy=JSON.parse(serializeChampion(old.champion!));legacy.version=2;delete legacy.targetLaps;delete legacy.champion.targetLaps;delete legacy.champion.score.completedLaps;delete legacy.champion.score.bestLapTime;
  const migrated=deserializeChampion(JSON.stringify(legacy));assert.equal(migrated.targetLaps,1);assert.deepEqual(migrated,old.champion);
});
function finishRun(e:Evolution,id:number,total:number,bestLap:number){
  const car=e.cars[id];
  Object.assign(car,{alive:false,completed:true,reason:'completed',furthest:e.track.length*e.settings.laps,elapsed:total,lapsCompleted:e.settings.laps,bestLapTime:bestLap});
  return car;
}
test('fast-lap finisher outside the normal elite/parent pool survives and can breed while total-time leaders stay elite',()=>{
  const e=new Evolution('oval','lap-bonus',{population:100,mutationRate:.01,mutationStrength:.3,laps:3});
  for(let i=0;i<30;i++)finishRun(e,i,24+i*.1,7.5);
  const lapWinner=finishRun(e,99,30,7.1),fastGenome=[...lapWinner.genome],normalElites=e.cars.slice(0,4).map(c=>[...c.genome]);
  // Isolate the bonus branch: 0.05 chooses its 10% parent path and exceeds the 1% mutation probability.
  e.rng.next=()=>.05;
  e.nextGeneration();
  for(let i=0;i<4;i++)assert.deepEqual(e.cars[i].genome,normalElites[i]);
  assert.deepEqual(e.cars[4].genome,fastGenome);assert.equal(e.cars.length,100);
  assert.ok(e.cars.slice(5).every(c=>JSON.stringify(c.genome)===JSON.stringify(fastGenome)));
  assert.deepEqual(e.lapElite,{generation:1,lapTime:7.1,totalTime:30});
});
test('a fast lap followed by a crash cannot earn the fast-lap bonus or outrank a completed run',()=>{
  const e=new Evolution('oval','crash-bonus',{population:20,mutationRate:.14,mutationStrength:.3,laps:3});
  const complete=finishRun(e,0,25,7.5),crashed=e.cars[19];
  Object.assign(crashed,{alive:false,completed:false,reason:'collision',furthest:e.track.length*2.5,elapsed:20,lapsCompleted:2,bestLapTime:6.9});
  assert.ok(compareScores(scoreCar(complete,e.track),scoreCar(crashed,e.track))>0);
  e.nextGeneration();assert.equal(e.lapElite?.lapTime,7.5);assert.equal(e.lapElite?.totalTime,25);
  const partial=new Evolution('oval','no-bonus',{population:20,mutationRate:.14,mutationStrength:.3,laps:3});
  Object.assign(partial.cars[0],{alive:false,completed:false,furthest:partial.track.length*2,elapsed:18,lapsCompleted:2,bestLapTime:7});
  partial.nextGeneration();assert.equal(partial.lapElite,null);
});
test('equal fastest laps favor the faster total run and lap-target changes clear the old bonus',()=>{
  const e=new Evolution('oval','bonus-reset',{population:20,mutationRate:.14,mutationStrength:.3,laps:3});
  finishRun(e,0,26,7.3);finishRun(e,1,24,7.3);e.nextGeneration();
  assert.deepEqual(e.lapElite,{generation:1,lapTime:7.3,totalTime:24});
  finishRun(e,0,25,7.2);e.queueSettings({...e.settings,laps:5});e.nextGeneration();
  assert.equal(e.lapElite,null);assert.ok(e.cars.every(c=>c.targetLaps===5));
});
