import type { Champion } from './evolution';
import { createCar } from './simulation';
import { scenarioCar, type Scenario } from './scenarios';
import type { Track } from './track';
/** A new physical attempt with copied, frozen weights. Never restores or edits the environment. */
export function testCurrentEnvironment(champion:Champion,environment:Track,start?:Scenario|null){
  return start?scenarioCar(start,[...champion.genome],0,champion.architecture,champion.targetLaps,environment)
    :createCar(environment,[...champion.genome],0,champion.architecture,champion.targetLaps);
}
export function originalScenario(champion:Champion,index=0):Scenario {
  const scenario=champion.evaluation?.training.scenarios[index];if(scenario)return structuredClone(scenario);
  return {id:'legacy-original',name:'Original saved environment',split:'train',track:champion.track,reverse:false,startNode:0,lateral:0,headingOffset:0,scaleX:1,scaleY:1,obstacles:structuredClone(champion.obstacles)};
}
