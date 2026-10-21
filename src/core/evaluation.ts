import { batteryKey, scenarioCar, scenarioTrack, type Scenario } from './scenarios';
import { scoreCar, stepCar, type EndReason, type Score } from './simulation';
import type { Architecture, Genome } from './network';
export interface Outcome {scenarioId:string;length:number;score:Score;reason:EndReason}
export interface Aggregate {batteryKey:string;completed:number;total:number;completionRate:number;meanProgress:number;worstProgress:number;normalizedTime:number|null}
export interface Evaluation {version:1;scenarios:Scenario[];outcomes:Outcome[];aggregate:Aggregate}
export interface ChampionEvaluation {version:1;training:Evaluation;holdout?:Evaluation}
export function aggregateResults(scenarios:Scenario[],outcomes:Outcome[],laps:number,key=batteryKey(scenarios,laps)):Aggregate {
  const completed=outcomes.filter(o=>o.score.completed),progress=scenarios.map(s=>outcomes.find(o=>o.scenarioId===s.id)?.score.progress??0);
  return {batteryKey:key,completed:completed.length,total:scenarios.length,completionRate:completed.length/scenarios.length,
    meanProgress:progress.reduce((a,b)=>a+b,0)/scenarios.length,worstProgress:Math.min(...progress),
    normalizedTime:completed.length?completed.reduce((sum,o)=>sum+o.score.time/(o.length*laps),0)/completed.length:null};
}
export function compareAggregate(a:Aggregate,b:Aggregate){
  if(a.batteryKey!==b.batteryKey)throw new Error('Cannot compare results from different scenario batteries.');
  for(const key of ['completionRate','meanProgress','worstProgress'] as const){const d=a[key]-b[key];if(Math.abs(d)>1e-9)return d;}
  return a.normalizedTime!==null&&b.normalizedTime!==null?b.normalizedTime-a.normalizedTime:0;
}
export class FrozenEvaluator {
  readonly genome:Genome;index=0;outcomes:Outcome[]=[];private track;private car;
  private cached:Evaluation|null=null;
  constructor(readonly scenarios:Scenario[],genome:Genome,readonly architecture:Architecture,readonly laps:number){
    this.genome=[...genome];this.track=scenarioTrack(scenarios[0]);this.car=scenarioCar(scenarios[0],this.genome,0,architecture,laps,this.track);
  }
  get done(){return this.index===this.scenarios.length;}
  tick(){
    if(this.done)return;stepCar(this.car,this.track);
    if(!this.car.alive){
      this.outcomes.push({scenarioId:this.scenarios[this.index].id,length:this.track.length,score:scoreCar(this.car,this.track),reason:this.car.reason});this.index++;
      if(!this.done){this.track=scenarioTrack(this.scenarios[this.index]);this.car=scenarioCar(this.scenarios[this.index],this.genome,0,this.architecture,this.laps,this.track);}
    }
  }
  result():Evaluation {if(!this.done)throw new Error('Evaluation is still running.');return this.cached??= {version:1,scenarios:structuredClone(this.scenarios),outcomes:structuredClone(this.outcomes),aggregate:aggregateResults(this.scenarios,this.outcomes,this.laps)};}
}
