import { Evolution, DEFAULT_SETTINGS, sanitizeSettings, type Champion } from './evolution';
import { aggregateResults, compareAggregate, type Aggregate, type Outcome } from './evaluation';
import { makeBattery, batteryKey, scenarioCar, scenarioTrack, validateDiversity, type DiversityConfig, type Scenario } from './scenarios';
import { ARCHITECTURE, mutate, type Architecture, type Genome } from './network';
import { scoreCar, stepCar, type Car } from './simulation';
import { populationMetrics, type PopulationMetrics } from './metrics';
import type { Track } from './track';
export interface ScenarioRun {scenario:Scenario;track:Track;cars:Car[];finished:boolean}
/** Fixed batteries make scores comparable across generations. Scenario RNG never touches evolution RNG. */
export class DiverseEvolution extends Evolution {
  readonly scenarios:Scenario[];readonly heldout:Scenario[];readonly config:DiversityConfig;
  scenarioIndex=0;results:Outcome[][]=[];runs:ScenarioRun[]=[];
  private key='';
  constructor(seed='neurodrive',settings=DEFAULT_SETTINGS,architecture:Architecture=ARCHITECTURE,config:DiversityConfig={count:4,difficulty:'moderate'},scenarios?:Scenario[]){
    super('oval',seed,settings,architecture);
    this.config=validateDiversity(config);this.scenarios=scenarios?structuredClone(scenarios):makeBattery(seed,'train',config);
    if(this.scenarios.length!==config.count||this.scenarios.some(s=>s.split!=='train')||new Set(this.scenarios.map(s=>s.id)).size!==this.scenarios.length)throw new Error('Training requires distinct training scenarios matching the configured count.');
    this.heldout=makeBattery(seed,'holdout',config);this.resetBattery(this.cars.map(c=>c.genome));
  }
  private resetBattery(genomes:Genome[]){
    this.key=batteryKey(this.scenarios,this.settings.laps);this.results=genomes.map(()=>[]);
    this.runs=this.scenarios.map(scenario=>{
      const track=scenarioTrack(scenario);
      return {scenario,track,cars:genomes.map((g,id)=>scenarioCar(scenario,[...g],id,this.architecture,this.settings.laps,track)),finished:false};
    });
    this.selectScenario(this.scenarioIndex);
  }
  selectScenario(index:number){
    if(!Number.isInteger(index)||index<0||index>=this.runs.length)throw new Error('Unknown training scenario.');
    this.scenarioIndex=index;this.track=this.runs[index].track;this.cars=this.runs[index].cars;
  }
  override setObstacles(){/* The editor is a separate transfer environment. The fixed training battery stays unchanged. */}
  aggregate(car:Car,includeCurrent=true):Aggregate {
    const outcomes=includeCurrent?this.runs.map(run=>this.outcome(run,car.id)):this.results[car.id];
    return aggregateResults(this.scenarios,outcomes,this.settings.laps,this.key);
  }
  private outcome(run:ScenarioRun,id:number):Outcome {const car=run.cars[id];return {scenarioId:run.scenario.id,length:run.track.length,score:scoreCar(car,run.track),reason:car.reason};}
  ranked(){return this.cars.map(car=>({car,aggregate:this.aggregate(car)})).sort((a,b)=>compareAggregate(b.aggregate,a.aggregate)).map(x=>x.car);}
  override leader(){return this.ranked()[0];}
  override tick(){
    let finished=false;
    for(const run of this.runs){
      if(run.finished)continue;
      for(const car of run.cars)stepCar(car,run.track);
      if(run.cars.every(c=>!c.alive)){run.finished=true;finished=true;}
    }
    if(finished)this.results=this.cars.map(car=>this.runs.filter(run=>run.finished).map(run=>this.outcome(run,car.id)));
    if(this.runs.every(run=>run.finished))this.nextGeneration();
  }
  override bestLapTime(){return null;}
  override nextGeneration(){
    if(this.runs.some(run=>!run.finished||run.cars.some(c=>c.alive))||this.results.some(r=>r.length!==this.scenarios.length))throw new Error('Selection must wait for every scenario and every driver.');
    const ranked=this.ranked(),best=ranked[0],evaluation=this.aggregate(best,false);
    if(!this.champion||compareAggregate(evaluation,this.champion.evaluation!.training.aggregate)>1e-9){
      const s=this.scenarios[0];
      this.champion={track:s.track,seed:this.seed,generation:this.generation,architecture:[...this.architecture],genome:[...best.genome],targetLaps:this.settings.laps,obstacles:structuredClone(s.obstacles),score:{...this.results[best.id][0].score},
        evaluation:{version:1,training:{version:1,scenarios:structuredClone(this.scenarios),outcomes:structuredClone(this.results[best.id]),aggregate:evaluation}}};
    }
    const metrics=this.cohortMetrics();
    const completedLaps=metrics.lapCounts.reduce((a,b)=>a+b,0);this.completedLaps+=completedLaps;
    this.history.push({generation:this.generation,best:evaluation.meanProgress,average:metrics.meanProgress,completed:metrics.completed,completedLaps,bestTime:null,bestLapTime:null,metrics,scenarioCount:this.scenarios.length,consistentFinishers:ranked.filter(c=>this.aggregate(c,false).completed===this.scenarios.length).length});
    if(this.history.length>240)this.history.shift();
    if(this.pending){
      const changed=this.pending.laps!==this.settings.laps;this.settings=sanitizeSettings(this.pending);this.pending=null;
      if(changed){this.champion=null;this.history=[];this.completedLaps=0;}
    }
    // There is deliberately no single-lap bonus here. Every elite and parent uses aggregate rank.
    this.lapElite=null;const eliteCount=Math.max(2,Math.round(this.settings.population*.04)),parents=ranked.slice(0,Math.max(eliteCount,Math.ceil(ranked.length*.25)));
    const genomes=Array.from({length:this.settings.population},(_,i)=>{
      if(i<eliteCount)return [...ranked[i%ranked.length].genome];
      const index=Math.min(...Array.from({length:3},()=>Math.floor(this.rng.next()*parents.length)));
      return mutate(parents[index].genome,this.rng,this.settings.mutationRate,this.settings.mutationStrength);
    });
    this.generation++;this.resetBattery(genomes);
  }
  cohortMetrics(rows=this.runs.map(run=>populationMetrics(run.cars,run.track))):PopulationMetrics {
    const n=rows.reduce((s,m)=>s+m.population,0),mean=rows.reduce((s,m)=>s+m.meanProgress*m.population,0)/n;
    const sum=(key:'launched'|'completed'|'collisions'|'stalled'|'timeouts'|'active')=>rows.reduce((s,m)=>s+m[key],0);
    return {population:n,launched:sum('launched'),completed:sum('completed'),collisions:sum('collisions'),stalled:sum('stalled'),timeouts:sum('timeouts'),active:sum('active'),
      lapCounts:Array.from({length:this.settings.laps},(_,i)=>rows.reduce((s,m)=>s+m.lapCounts[i],0)),meanProgress:mean,
      progressStd:Math.sqrt(rows.reduce((s,m)=>s+(m.progressStd**2+(m.meanProgress-mean)**2)*m.population,0)/n),diversity:rows[0].diversity,medianTime:null};
  }
}
