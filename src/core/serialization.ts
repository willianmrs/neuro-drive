import { validateObstacles, layoutKey, type Obstacle } from './obstacles';
import { aggregateResults, type Evaluation, type ChampionEvaluation } from './evaluation';
import { validateScenario, scenarioTrack } from './scenarios';
import { createTrack } from './track';
import { ARCHITECTURE, validateArchitecture, weightCount } from './network';
import { DT, PHYSICS, PHYSICS_VERSION, validateLaps } from './simulation';
import { type Champion } from './evolution';
export interface ChampionFile {
  app:'NeuroDrive';version:6;evaluationVersion:1;obstacleLayoutVersion:2;obstacles:Obstacle[];physicsVersion:1;timestep:number;architecture:number[];targetLaps:number;savedAt:string;champion:Champion;
}
export function serializeChampion(champion:Champion):string {
  const file:ChampionFile={app:'NeuroDrive',version:6,evaluationVersion:1,obstacleLayoutVersion:2,obstacles:champion.obstacles,physicsVersion:PHYSICS_VERSION,timestep:DT,architecture:[...champion.architecture],targetLaps:champion.targetLaps,savedAt:new Date().toISOString(),champion};
  return JSON.stringify(file,null,2);
}
export function deserializeChampion(raw:string):Champion {
  if(raw.length>250_000)throw new Error('Champion file is too large (250 KB maximum).');
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{throw new Error('This file is not valid JSON.');}
  const f=parsed as Record<string,unknown>;
  if(!f||typeof f!=='object'||f.app!=='NeuroDrive'||![1,2,3,4,5,6].includes(f.version as number))throw new Error('Expected a NeuroDrive champion file, version 1–6.');
  if(f.physicsVersion!==PHYSICS_VERSION||f.timestep!==DT)throw new Error('This champion uses incompatible physics settings.');
  if(typeof f.savedAt!=='string'||f.savedAt.length>40||!Number.isFinite(Date.parse(f.savedAt)))throw new Error('Champion save date is invalid.');
  const architecture=validateArchitecture(f.architecture),targetLaps=(f.version as number)>=3?validateLaps(f.targetLaps):1;
  if(f.version===1&&JSON.stringify(architecture)!==JSON.stringify(ARCHITECTURE))throw new Error('Version 1 champions must use the original 8 → 12 → 2 network.');
  const c=f.champion as Champion;
  if(!c||typeof c!=='object'||!['oval','technical'].includes(c.track))throw new Error('Champion track is invalid.');
  if(f.version!==1&&JSON.stringify(validateArchitecture(c.architecture))!==JSON.stringify(architecture))throw new Error('Champion architecture does not match the file header.');
  if((f.version as number)>=3&&c.targetLaps!==targetLaps)throw new Error('Champion lap target does not match the file header.');
  const hasLayout=(f.version as number)>=4;
  const obstacles=hasLayout?validateObstacles(c.obstacles):[];
  if(f.version===4&&obstacles.some(o=>o.kind!==undefined&&o.kind!=='barrier'))throw new Error('Version 4 supports rectangular barriers only.');
  if(hasLayout&&(f.obstacleLayoutVersion!==(f.version===4?1:2)||layoutKey(validateObstacles(f.obstacles))!==layoutKey(obstacles)))throw new Error('Champion obstacle layout does not match the file header.');
  if(!c.evaluation)createTrack(c.track,obstacles);
  const count=weightCount(architecture);
  if(!Array.isArray(c.genome)||c.genome.length!==count||!c.genome.every(w=>typeof w==='number'&&Number.isFinite(w)&&Math.abs(w)<=6))throw new Error(`Champion must contain ${count} finite weights in [-6, 6].`);
  if(!Number.isInteger(c.generation)||c.generation<1||c.generation>1e9||typeof c.seed!=='string'||c.seed.length>128)throw new Error('Champion generation or seed is invalid.');
  const s=c.score;
  if(!s||typeof s.progress!=='number'||!Number.isFinite(s.progress)||s.progress<0||s.progress>1||typeof s.completed!=='boolean'||typeof s.time!=='number'||!Number.isFinite(s.time)||s.time<0||s.time>PHYSICS.episodeSeconds*targetLaps+DT*2||(s.completed&&s.progress!==1)||(!s.completed&&s.progress===1))throw new Error('Champion score is invalid.');
  const completedLaps=(f.version as number)>=3?s.completedLaps:s.completed?1:0;
  const bestLapTime=(f.version as number)>=3?s.bestLapTime:s.completed?s.time:null;
  if(!Number.isInteger(completedLaps)||completedLaps!==Math.floor(s.progress*targetLaps+1e-9)||completedLaps<0||completedLaps>targetLaps||(s.completed!==(completedLaps===targetLaps)))throw new Error('Champion lap count is inconsistent with its progress.');
  if(completedLaps===0?bestLapTime!==null:typeof bestLapTime!=='number'||!Number.isFinite(bestLapTime)||bestLapTime<0||bestLapTime>s.time+DT)throw new Error('Champion best lap time is invalid.');
  let evaluation:ChampionEvaluation|undefined;
  if(c.evaluation!==undefined){
    if(f.version!==6||f.evaluationVersion!==1||c.evaluation.version!==1)throw new Error('Incompatible aggregate evaluation version.');
    const training=validateEvaluation(c.evaluation.training,targetLaps,'train');
    const first=training.scenarios[0];
    if(first.track!==c.track||layoutKey(first.obstacles)!==layoutKey(obstacles)||JSON.stringify(training.outcomes[0].score)!==JSON.stringify({progress:s.progress,completed:s.completed,time:s.time,completedLaps,bestLapTime}))throw new Error('Original replay metadata does not match the training evaluation.');
    evaluation={version:1,training};
    if(c.evaluation.holdout)evaluation.holdout=validateEvaluation(c.evaluation.holdout,targetLaps,'holdout');
  }
  return {...(evaluation?{evaluation}:{}),architecture,targetLaps,obstacles,genome:[...c.genome],track:c.track,generation:c.generation,seed:c.seed,score:{progress:s.progress,completed:s.completed,time:s.time,completedLaps,bestLapTime}};
}

function validateEvaluation(value:unknown,laps:number,split:'train'|'holdout'):Evaluation {
  const e=value as Evaluation;
  if(!e||e.version!==1||!Array.isArray(e.scenarios)||e.scenarios.length<1||e.scenarios.length>6||!Array.isArray(e.outcomes)||e.outcomes.length!==e.scenarios.length)throw new Error('Invalid scenario evaluation.');
  const scenarios=e.scenarios.map(validateScenario);
  if(scenarios.some(s=>s.split!==split)||new Set(scenarios.map(s=>s.id)).size!==scenarios.length)throw new Error('Scenario split or IDs are inconsistent.');
  const outcomes=e.outcomes.map((o,i)=>{
    const score=o?.score;
    if(!o||o.scenarioId!==scenarios[i].id||!Number.isFinite(o.length)||Math.abs(o.length-scenarioTrack(scenarios[i]).length)>1e-6||!['collision','stalled','timeout','completed'].includes(o.reason as string)||!score||!Number.isFinite(score.progress)||score.progress<0||score.progress>1||typeof score.completed!=='boolean'||score.completed!==(score.progress===1)||!Number.isFinite(score.time)||score.time<0||score.time>PHYSICS.episodeSeconds*laps+DT*2||!Number.isInteger(score.completedLaps)||score.completedLaps!==Math.floor(score.progress*laps+1e-9)||score.completed!==(o.reason==='completed')||(score.completedLaps===0?score.bestLapTime!==null:!Number.isFinite(score.bestLapTime)||score.bestLapTime!<0||score.bestLapTime!>score.time+DT))throw new Error('Invalid per-scenario outcome.');
    return {scenarioId:o.scenarioId,length:o.length,reason:o.reason,score:{progress:score.progress,completed:score.completed,time:score.time,completedLaps:score.completedLaps,bestLapTime:score.bestLapTime}};
  });
  const aggregate=aggregateResults(scenarios,outcomes,laps);
  if(!e.aggregate||Object.keys(aggregate).some(k=>e.aggregate[k as keyof typeof aggregate]!==aggregate[k as keyof typeof aggregate]))throw new Error('Aggregate score does not match the scenario results.');
  return {version:1,scenarios,outcomes,aggregate};
}
