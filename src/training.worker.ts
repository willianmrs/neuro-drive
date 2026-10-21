/// <reference lib="webworker" />
import { Evolution, type Champion } from './core/evolution';
import { DiverseEvolution } from './core/diverse-evolution';
import { FrozenEvaluator } from './core/evaluation';
import { batteryId, makeBattery } from './core/scenarios';
import { DT, compareScores, scoreCar } from './core/simulation';
import { populationMetrics } from './core/metrics';
import type { Snapshot, WorkerMessage } from './protocol';
let evolution:Evolution|null=null,running=false,speed=1,epoch=0,credit=0,last=performance.now(),lastSend=0;
let validation:{evaluator:FrozenEvaluator;training:Champion['evaluation'];generation:number;genomeKey:string}|null=null,manualValidation=false;
const scope=self as DedicatedWorkerGlobalScope;
const genomeKey=(c:Champion)=>JSON.stringify([c.architecture,c.targetLaps,c.genome]);
function startValidation(c:Champion){
  const scenarios=c.evaluation?.holdout?.scenarios??(evolution instanceof DiverseEvolution?evolution.heldout:makeBattery(c.seed,'holdout'));
  validation={evaluator:new FrozenEvaluator(scenarios,c.genome,c.architecture,c.targetLaps),training:c.evaluation,generation:c.generation,genomeKey:genomeKey(c)};
}
function send() {
  if(!evolution)return;
  const e=evolution,d=e instanceof DiverseEvolution?e:null,leader=e.leader();
  if(d?.champion&&!manualValidation&&(!validation||validation.evaluator.done&&validation.genomeKey!==genomeKey(d.champion)))startValidation(d.champion);
  const v=validation,validationView=v?{source:manualValidation?'saved' as const:'training' as const,training:v.training?.training??null,targetLaps:v.evaluator.laps,generation:v.generation,done:v.evaluator.index,total:v.evaluator.scenarios.length,result:v.evaluator.done?v.evaluator.result():null,genomeKey:v.genomeKey}:undefined;
  let best=e.champion;
  if(best?.evaluation&&validationView?.result&&validationView.genomeKey===genomeKey(best))best={...best,evaluation:{...best.evaluation,holdout:validationView.result}};
  const ranked=d?d.ranked():[...e.cars].sort((a,b)=>compareScores(scoreCar(b,e.track),scoreCar(a,e.track)));
  const snapshot:Snapshot={type:'snapshot',architecture:e.architecture,epoch,running,generation:e.generation,alive:e.cars.filter(c=>c.alive).length,
    cars:e.cars.map(c=>({id:c.id,x:c.x,y:c.y,angle:c.angle,speed:c.speed,alive:c.alive,elapsed:c.elapsed,reason:c.reason,progress:c.furthest/(e.track.length*c.targetLaps),lapsCompleted:c.lapsCompleted,targetLaps:c.targetLaps,inputs:c.inputs,action:c.action})),
    topBrains:ranked.slice(0,3).map(c=>({id:c.id,genome:c.genome,inputs:c.inputs,score:scoreCar(c,e.track),...(d?{aggregate:d.aggregate(c)}:{})})),
    metrics:populationMetrics(e.cars,e.track),
    leaderId:leader.id,leaderGenome:leader.genome,best,history:e.history,completedLaps:e.completedLaps,settings:e.settings,pending:e.pending,bestLapTime:e.bestLapTime(),lapElite:e.lapElite,simTime:Math.max(...e.cars.map(c=>c.elapsed)),
    ...(d?{battery:{id:batteryId(d.scenarios,e.settings.laps),index:d.scenarioIndex,total:d.scenarios.length,scenario:d.scenarios[d.scenarioIndex],leaderAggregate:d.aggregate(leader)}}:{}),
    ...(validationView?{validation:validationView}:{})};
  scope.postMessage(snapshot);
}
scope.onmessage=(event:MessageEvent<WorkerMessage>)=>{
  try{
    const m=event.data;
    if(m.type==='init') {evolution=m.diversity?new DiverseEvolution(m.seed,m.settings,m.architecture,m.diversity):new Evolution(m.track,m.seed,m.settings,m.architecture,m.obstacles);validation=null;manualValidation=false;running=m.running;speed=m.speed;epoch=m.epoch;credit=0;last=performance.now();send();}
    if(m.type==='layout'){evolution?.setObstacles(m.obstacles);epoch=m.epoch;credit=0;last=performance.now();send();}
    if(m.type==='running'){running=m.value;credit=0;last=performance.now();send();}
    if(m.type==='speed')speed=Math.max(1,Math.min(32,m.value));
    if(m.type==='settings'){evolution?.queueSettings(m.value);send();}
    if(m.type==='validate'){manualValidation=true;startValidation(m.champion);send();}
  }catch(error){throw error;}
};
function pump() {
  const now=performance.now(),delta=Math.min((now-last)/1000,.1);last=now;
  if(evolution&&running) {
    credit=Math.min(credit+delta*speed,.5*speed);
    const budget=performance.now()+8;
    while(credit>=DT&&performance.now()<budget){evolution.tick();credit-=DT;}
  }
  if(validation&&!validation.evaluator.done){const budget=performance.now()+3;while(!validation.evaluator.done&&performance.now()<budget)validation.evaluator.tick();}
  if(evolution&&(running||validation)&&now-lastSend>100){send();lastSend=now;}
  setTimeout(pump,4);
}
pump();
