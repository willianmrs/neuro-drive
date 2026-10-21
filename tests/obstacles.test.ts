import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrack, defaultObstacles, canPlaceObstacle, raycast, onRoad } from '../src/core/track';
import { OBSTACLE_LENGTH, OBSTACLE_WIDTH, MAX_OBSTACLES, layoutKey, validateObstacles } from '../src/core/obstacles';
import { collides, createCar, PHYSICS, stepCar } from '../src/core/simulation';
import { Evolution } from '../src/core/evolution';
import { serializeChampion, deserializeChampion } from '../src/core/serialization';
const base=createTrack('oval'),obstacles=defaultObstacles(base),track=createTrack('oval',obstacles);
test('default barriers fit both tracks, leave the starting grid clear, and allow cars to pass on at least one side',()=>{
  for(const id of ['oval','technical'] as const){
    const bare=createTrack(id),layout=defaultObstacles(bare),t=createTrack(id,layout);
    assert.equal(layout.length,3);assert.equal(collides(t,t.spawn.x,t.spawn.y,t.heading),false);
    for(const o of layout){
      assert.equal(canPlaceObstacle(t,o),true);
      const passable=[-1,1].some(sign=>{const offset=sign*(OBSTACLE_WIDTH/2+PHYSICS.width/2+4);return !collides(t,o.x-Math.sin(o.angle)*offset,o.y+Math.cos(o.angle)*offset,o.angle);});
      assert.equal(passable,true);
    }
  }
});
test('ray sensors detect the closest barrier face and report zero inside a barrier',()=>{
  const o=obstacles[0],gap=50+OBSTACLE_LENGTH/2;
  const origin={x:o.x-Math.cos(o.angle)*gap,y:o.y-Math.sin(o.angle)*gap};
  assert.equal(onRoad(track,origin),true);
  const hit=raycast(track,origin,o.angle,215);
  assert.ok(Math.abs(hit*215-50)<1e-8);assert.ok(hit<raycast(base,origin,o.angle,215));
  assert.equal(raycast(track,o,o.angle,215),0);
});
test('oriented car collision catches center, front and side overlap with a barrier',()=>{
  const o=obstacles[0];assert.equal(collides(track,o.x,o.y,o.angle),true);
  for(const [along,across] of [[OBSTACLE_LENGTH/2+PHYSICS.length/2-1,0],[0,OBSTACLE_WIDTH/2+PHYSICS.width/2-1]]){
    const x=o.x+Math.cos(o.angle)*along-Math.sin(o.angle)*across,y=o.y+Math.sin(o.angle)*along+Math.cos(o.angle)*across;
    assert.equal(collides(base,x,y,o.angle),false);assert.equal(collides(track,x,y,o.angle),true);
  }
});
test('a fast-moving car stops at the barrier rather than tunneling through it',()=>{
  const o=obstacles[0],gap=OBSTACLE_LENGTH/2+PHYSICS.length/2+4,car=createCar(track);
  car.x=o.x-Math.cos(o.angle)*gap;car.y=o.y-Math.sin(o.angle)*gap;car.angle=o.angle;car.speed=PHYSICS.maxSpeed;
  for(let i=0;i<10&&car.alive;i++)stepCar(car,track,[0,1]);
  assert.equal(car.reason,'collision');assert.equal(car.lapsCompleted,0);
  assert.equal(collides(track,car.x,car.y,car.angle),false);
});
test('moving or removing barriers rebuilds sensor geometry without stale hits',()=>{
  const o=obstacles[0],p={x:o.x-Math.cos(o.angle)*80,y:o.y-Math.sin(o.angle)*80};
  const before=raycast(track,p,o.angle,215),removed=createTrack('oval',[]);
  assert.ok(before<raycast(removed,p,o.angle,215));
  const moved={...o,x:o.x-Math.sin(o.angle)*20,y:o.y+Math.cos(o.angle)*20};
  if(canPlaceObstacle(base,moved))assert.notEqual(raycast(createTrack('oval',[moved]),p,o.angle,215),before);
  assert.equal(raycast(removed,p,o.angle,215),raycast(base,p,o.angle,215));
});
test('applying an edited layout keeps every brain and RNG state but resets attempts, scores and history',()=>{
  const settings={population:20,mutationRate:.14,mutationStrength:.3,laps:3};
  const e=new Evolution('oval','layout',settings),control=new Evolution('oval','layout',settings);
  for(let i=0;i<60;i++){e.tick();control.tick();}
  const genomes=e.cars.map(c=>[...c.genome]),generation=e.generation;
  e.setObstacles(obstacles);
  assert.deepEqual(e.cars.map(c=>c.genome),genomes);assert.equal(e.generation,generation);assert.equal(e.rng.next(),control.rng.next());
  assert.ok(e.cars.every(c=>c.elapsed===0&&c.alive&&c.x===e.track.spawn.x&&c.y===e.track.spawn.y));
  assert.equal(e.champion,null);assert.equal(e.bestLapTime(),null);assert.equal(e.lapElite,null);assert.deepEqual(e.history,[]);assert.equal(e.completedLaps,0);
  e.setObstacles([]);assert.equal(e.track.obstacles.length,0);assert.deepEqual(e.cars.map(c=>c.genome),genomes);
});
test('obstacle validation bounds the count, rejects duplicate IDs, off-track placements and blocked spawn',()=>{
  assert.deepEqual(validateObstacles([]),[]);
  assert.equal(validateObstacles(Array.from({length:MAX_OBSTACLES},(_,id)=>({...obstacles[0],id}))).length,MAX_OBSTACLES);
  for(const invalid of [null,Array(25).fill(obstacles[0]),[obstacles[0],obstacles[0]],[{...obstacles[0],x:NaN}],[{...obstacles[0],id:-1}],[{...obstacles[0],angle:99}]])assert.throws(()=>validateObstacles(invalid));
  assert.throws(()=>createTrack('oval',[{id:0,x:500,y:350,angle:0}]));
  assert.throws(()=>createTrack('oval',[{id:0,...base.spawn,angle:base.heading}]));
  assert.equal(layoutKey(obstacles),layoutKey([...obstacles].reverse().map((o,i)=>({...o,id:i+100}))));
});
test('version 4 champions reproduce the saved obstacle layout, reject mismatches, and migrate old clear tracks',()=>{
  const e=new Evolution('oval','obstacle-save',{population:20,mutationRate:.14,mutationStrength:.3,laps:1},[8,12,2],obstacles);
  while(e.generation<3)e.tick();const original=e.champion!,saved=deserializeChampion(serializeChampion(original));
  assert.deepEqual(saved,original);assert.deepEqual(saved.obstacles,obstacles);
  const a=createCar(track,original.genome,0,original.architecture,original.targetLaps),t=createTrack(saved.track,saved.obstacles),b=createCar(t,saved.genome,0,saved.architecture,saved.targetLaps);
  while(a.alive){stepCar(a,track);stepCar(b,t);}assert.deepEqual(a,b);
  for(const edit of [(f:any)=>f.obstacles=[],(f:any)=>f.obstacleLayoutVersion=99,(f:any)=>f.champion.obstacles[0].x=500]){const f=JSON.parse(serializeChampion(original));edit(f);assert.throws(()=>deserializeChampion(JSON.stringify(f)));}
  const old=new Evolution('oval','legacy-obstacles',{population:20,mutationRate:.14,mutationStrength:.3,laps:3});old.tick();
  const f=JSON.parse(serializeChampion(old.champion!));f.version=3;delete f.obstacles;delete f.champion.obstacles;delete f.obstacleLayoutVersion;
  assert.deepEqual(deserializeChampion(JSON.stringify(f)),old.champion);
});
