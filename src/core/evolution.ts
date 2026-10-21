import type { Obstacle } from './obstacles';
import type { ChampionEvaluation } from './evaluation';
import { populationMetrics, type PopulationMetrics } from './metrics';
import { clamp, Random } from './math';
import { ARCHITECTURE, validateArchitecture, mutate, randomGenome, type Architecture, type Genome } from './network';
import { createCar, stepCar, scoreCar, compareScores, DEFAULT_LAPS, MAX_LAPS, type Car, type Score } from './simulation';
import { createTrack, type Track, type TrackId } from './track';
export interface EvolutionSettings {population:number;mutationRate:number;mutationStrength:number;laps:number}
export const DEFAULT_SETTINGS:EvolutionSettings={population:100,mutationRate:.14,mutationStrength:.3,laps:DEFAULT_LAPS};
export const FAST_LAP_PARENT_CHANCE=.1;
export const EVOLUTION_POLICY={version:2,fastLapElite:true,fastLapParentChance:FAST_LAP_PARENT_CHANCE,requiresCompletedRun:true} as const;
export interface LapElite {generation:number;lapTime:number;totalTime:number}
export interface Champion {evaluation?:ChampionEvaluation;obstacles:Obstacle[];targetLaps:number;architecture:Architecture;genome:Genome;score:Score;generation:number;track:TrackId;seed:string}
export interface History {generation:number;best:number;average:number;completed:number;completedLaps:number;bestTime:number|null;bestLapTime:number|null;metrics:PopulationMetrics;scenarioCount?:number;consistentFinishers?:number}
export function sanitizeSettings(s:EvolutionSettings):EvolutionSettings {
  return {population:Math.round(clamp(s.population,20,300)),mutationRate:clamp(s.mutationRate,.01,1),mutationStrength:clamp(s.mutationStrength,.01,1.5),laps:Number.isFinite(s.laps)?Math.round(clamp(s.laps,1,MAX_LAPS)):DEFAULT_LAPS};
}
export class Evolution {
  architecture:Architecture;track:Track;settings:EvolutionSettings;pending:EvolutionSettings|null=null;rng:Random;seed:string;
  lapElite:LapElite|null=null;bestLap:number|null=null;generation=1;cars:Car[];champion:Champion|null=null;history:History[]=[];completedLaps=0;
  constructor(track:TrackId='oval',seed='neurodrive',settings=DEFAULT_SETTINGS,architecture:Architecture=ARCHITECTURE,obstacles:readonly Obstacle[]=[]) {
    this.architecture=validateArchitecture(architecture);
    this.track=createTrack(track,obstacles);this.seed=seed;this.rng=new Random(seed);this.settings=sanitizeSettings(settings);
    this.cars=Array.from({length:this.settings.population},(_,id)=>createCar(this.track,randomGenome(this.rng,this.architecture),id,this.architecture,this.settings.laps));
  }
  setObstacles(obstacles:readonly Obstacle[]){
    const track=createTrack(this.track.id,obstacles);
    this.track=track;
    this.cars=this.cars.map((car,id)=>createCar(track,[...car.genome],id,this.architecture,this.settings.laps));
    this.champion=null;this.bestLap=null;this.lapElite=null;this.history=[];this.completedLaps=0;
  }
  queueSettings(settings:EvolutionSettings){this.pending=sanitizeSettings(settings);}
  tick() {
    for(const car of this.cars){
      stepCar(car,this.track);
      if(car.bestLapTime!==null&&(this.bestLap===null||car.bestLapTime<this.bestLap))this.bestLap=car.bestLapTime;
    }
    const leader=this.leader();
    const score=scoreCar(leader,this.track);
    if(!this.champion||compareScores(score,this.champion.score)>1e-9) {
      this.champion={obstacles:this.track.obstacles.map(o=>({...o})),targetLaps:this.settings.laps,architecture:[...this.architecture],genome:[...leader.genome],score,generation:this.generation,track:this.track.id,seed:this.seed};
    }
    if(this.cars.every(car=>!car.alive))this.nextGeneration();
  }
  bestLapTime(){return this.bestLap;}
  leader(){return this.cars.reduce((best,car)=>compareScores(scoreCar(car,this.track),scoreCar(best,this.track))>0?car:best);}
  nextGeneration() {
    const ranked=[...this.cars].sort((a,b)=>compareScores(scoreCar(b,this.track),scoreCar(a,this.track)));
    // A quick lap qualifies for the bonus only after completing the whole lap target.
    const lapWinner=ranked.filter(c=>c.completed&&c.bestLapTime!==null).reduce<Car|null>((best,c)=>!best||c.bestLapTime!<best.bestLapTime!-1e-9?c:best,null);
    this.lapElite=lapWinner?{generation:this.generation,lapTime:lapWinner.bestLapTime!,totalTime:lapWinner.elapsed}:null;
    const scores=ranked.map(car=>scoreCar(car,this.track));
    const completed=scores.filter(s=>s.completed).length;
    const completedLaps=scores.reduce((sum,s)=>sum+s.completedLaps,0);
    this.completedLaps+=completedLaps;
    this.history.push({generation:this.generation,best:scores[0].progress,average:scores.reduce((n,s)=>n+s.progress,0)/scores.length,completed,completedLaps,bestLapTime:this.bestLapTime(),bestTime:completed?Math.min(...scores.filter(s=>s.completed).map(s=>s.time)):null,metrics:populationMetrics(this.cars,this.track)});
    if(this.history.length>240)this.history.shift();
    if(this.pending){
      const lapsChanged=this.pending.laps!==this.settings.laps;
      this.settings=this.pending;this.pending=null;
      if(lapsChanged){this.lapElite=null;this.bestLap=null;this.champion=null;this.history=[];this.completedLaps=0;}
    }
    const eliteCount=Math.max(2,Math.round(this.settings.population*.04));
    const elites=ranked.slice(0,eliteCount);
    if(lapWinner&&!elites.includes(lapWinner))elites.push(lapWinner);
    const parents=ranked.slice(0,Math.max(eliteCount,Math.ceil(ranked.length*.25)));
    const genomes:Genome[]=[];
    for(let i=0;i<this.settings.population;i++) {
      if(i<elites.length)genomes.push([...elites[i].genome]);
      else {
        let parent:Car;
        if(lapWinner&&this.rng.next()<FAST_LAP_PARENT_CHANCE)parent=lapWinner;
        else {
          // Rank tournament keeps legitimate progress and total race time as the main objective.
          const index=Math.min(...Array.from({length:3},()=>Math.floor(this.rng.next()*parents.length)));
          parent=parents[index];
        }
        genomes.push(mutate(parent.genome,this.rng,this.settings.mutationRate,this.settings.mutationStrength));
      }
    }
    this.generation++;
    this.cars=genomes.map((g,id)=>createCar(this.track,g,id,this.architecture,this.settings.laps));
  }
}
