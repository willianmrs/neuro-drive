import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBSTACLE_KINDS, obstacleCorners, validateObstacles, layoutKey } from '../src/core/obstacles';
import { createTrack, defaultObstacles, canPlaceObstacle, raycast } from '../src/core/track';
import { collides, createCar, stepCar, PHYSICS } from '../src/core/simulation';
import { serializeChampion, deserializeChampion } from '../src/core/serialization';
import { Evolution } from '../src/core/evolution';
import { parameterLayers, forward, activations } from '../src/core/network';
import { populationMetrics } from '../src/core/metrics';
const bare=createTrack('oval'),site=defaultObstacles(bare)[1];
test('all five shapes have consistent sensor and collision footprints, including rotated obstacles',()=>{
  for(const kind of OBSTACLE_KINDS)for(const rotation of [0,Math.PI/4]){
    const o={...site,...bare.points[45],kind,angle:site.angle+rotation},track=createTrack('oval',[o]);
    assert.equal(canPlaceObstacle(track,o),true);
    const corners=obstacleCorners(o);assert.equal(corners.length,kind==='circle'?20:kind==='triangle'?3:4);
    const start={x:o.x-Math.cos(o.angle)*60,y:o.y-Math.sin(o.angle)*60};
    const radius=kind==='long'?30:kind==='barrier'||kind==='triangle'?18:15;
    assert.ok(Math.abs(raycast(track,start,o.angle,100)*100-(60-radius))<1e-7,kind);
    assert.equal(raycast(track,o,o.angle,100),0);assert.equal(collides(track,o.x,o.y,o.angle),true);
    const car=createCar(track);Object.assign(car,{...start,angle:o.angle,speed:PHYSICS.maxSpeed});
    for(let i=0;i<30&&car.alive;i++)stepCar(car,track,[0,1]);
    assert.equal(car.reason,'collision',kind);assert.equal(collides(track,car.x,car.y,car.angle),false);
  }
});
test('shapes affect layout identity and survive version 5 exports while legacy rectangular saves still work',()=>{
  const e=new Evolution('oval','shapes',{population:20,mutationRate:.14,mutationStrength:.3,laps:3});e.tick();
  for(const kind of OBSTACLE_KINDS){
    const champion={...e.champion!,obstacles:[{...site,kind}]},raw=serializeChampion(champion);
    assert.equal(JSON.parse(raw).version,6);assert.deepEqual(deserializeChampion(raw),champion);
  }
  assert.notEqual(layoutKey([{...site,kind:'triangle'}]),layoutKey([site]));
  assert.equal(layoutKey([{...site,kind:'barrier'}]),layoutKey([site]));
  assert.throws(()=>validateObstacles([{...site,kind:'unknown'}]));
  const old=JSON.parse(serializeChampion({...e.champion!,obstacles:[site]}));old.version=4;old.obstacleLayoutVersion=1;
  assert.deepEqual(deserializeChampion(JSON.stringify(old)).obstacles,[site]);
  old.champion.obstacles[0].kind='circle';old.obstacles[0].kind='circle';assert.throws(()=>deserializeChampion(JSON.stringify(old)));
});
test('inspection matrices use the exact weights and bias order of feedforward decisions in every layer',()=>{
  const architecture=[8,3,2,2],genome=Array.from({length:41},(_,i)=>(i%11-5)/10);
  const count=parameterLayers(genome,architecture).reduce((s,l)=>s+l.rows.length*(l.inputCount+1),0);
  assert.equal(count,41);
  const inputs=[0,.1,.2,.3,.4,.5,.6,.7],trace=activations(genome,inputs,architecture);
  const layers=parameterLayers(genome,architecture);
  assert.deepEqual(layers.flatMap(l=>l.rows.flatMap(r=>[...r.weights,r.bias])),genome);
  for(let l=0;l<layers.length;l++)for(let n=0;n<layers[l].rows.length;n++){
    const row=layers[l].rows[n],sum=row.weights.reduce((s,w,i)=>s+w*trace[l][i],0)+row.bias;
    assert.equal(trace[l+1][n],Math.tanh(sum));
  }
  assert.deepEqual(trace.at(-1),forward(genome,inputs,architecture));
});
test('conversion includes failed drivers, uses ordered laps and computes finisher-only median and weight spread',()=>{
  const cars=Array.from({length:4},(_,id)=>createCar(bare,[id,id],id,[8,1,2],3));
  const progress=[0,.2,2/3,1];cars.forEach((c,i)=>{c.furthest=progress[i]*bare.length*3;c.lapsCompleted=[0,0,2,3][i];});
  cars[0].alive=false;cars[0].reason='stalled';cars[1].alive=false;cars[1].reason='collision';
  cars[2].alive=false;cars[2].reason='timeout';cars[3].alive=false;cars[3].reason='completed';cars[3].completed=true;cars[3].elapsed=24;
  const m=populationMetrics(cars,bare);
  assert.equal(m.population,4);assert.equal(m.launched,3);assert.deepEqual(m.lapCounts,[2,2,1]);assert.equal(m.completed,1);
  assert.equal(m.collisions,1);assert.equal(m.stalled,1);assert.equal(m.timeouts,1);assert.equal(m.active,0);
  assert.equal(m.medianTime,24);assert.ok(Math.abs(m.meanProgress-(0+.2+2/3+1)/4)<1e-9);assert.equal(m.diversity,Math.sqrt(1.25));
  cars[2].completed=true;cars[2].elapsed=22;assert.equal(populationMetrics(cars,bare).medianTime,23);
  for(const c of cars)c.genome=[1,1];assert.equal(populationMetrics(cars,bare).diversity,0);
  assert.equal(populationMetrics([],bare).medianTime,null);
});
test('final cohort metrics retain the evaluated population size before pending settings are applied',()=>{
  const e=new Evolution('oval','cohort',{population:20,mutationRate:.14,mutationStrength:.3,laps:3});
  e.queueSettings({...e.settings,population:40});
  for(const c of e.cars){c.alive=false;c.reason='collision';}
  e.tick();assert.equal(e.settings.population,40);assert.equal(e.history.at(-1)!.metrics.population,20);
  assert.equal(e.history.at(-1)!.metrics.collisions,20);assert.equal(e.history.at(-1)!.metrics.active,0);
  e.setObstacles([{...site,kind:'circle'}]);assert.deepEqual(e.history,[]);assert.equal(populationMetrics(e.cars,e.track).population,40);
});
