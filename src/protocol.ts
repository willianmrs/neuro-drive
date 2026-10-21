import type { Obstacle } from './core/obstacles';
import type { Architecture } from './core/network';
import type { Champion, EvolutionSettings, History, LapElite } from './core/evolution';
import type { TrackId } from './core/track';
import type { Score, EndReason } from './core/simulation';
import type { PopulationMetrics } from './core/metrics';
import type { Aggregate, Evaluation } from './core/evaluation';
import type { DiversityConfig, Scenario } from './core/scenarios';
export interface RankedBrain {id:number;genome:number[];inputs:number[];score:Score;aggregate?:Aggregate}
export interface ValidationView {source:'saved'|'training';training:Evaluation|null;targetLaps:number;generation:number;done:number;total:number;result:Evaluation|null;genomeKey:string}
export interface CarView { id:number;x:number;y:number;angle:number;speed:number;alive:boolean;elapsed:number;reason:EndReason;progress:number;lapsCompleted:number;targetLaps:number;inputs:number[];action:[number,number] }
export interface Snapshot {
  type:'snapshot';architecture:Architecture;epoch:number;running:boolean;generation:number;alive:number;cars:CarView[];leaderId:number;leaderGenome:number[];
  best:Champion|null;history:History[];completedLaps:number;settings:EvolutionSettings;pending:EvolutionSettings|null;simTime:number;bestLapTime:number|null;lapElite:LapElite|null;
  topBrains:RankedBrain[];metrics:PopulationMetrics;
  battery?:{id:string;index:number;total:number;scenario:Scenario;leaderAggregate:Aggregate};validation?:ValidationView;
}
export type WorkerMessage =
  |{type:'init';diversity?:DiversityConfig;obstacles:Obstacle[];architecture:Architecture;epoch:number;track:TrackId;seed:string;settings:EvolutionSettings;running:boolean;speed:number}
  |{type:'layout';epoch:number;obstacles:Obstacle[]}
  |{type:'running';value:boolean}
  |{type:'speed';value:number}
  |{type:'validate';champion:Champion}
  |{type:'settings';value:EvolutionSettings};
