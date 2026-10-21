import type { Car } from './simulation';
import type { Track } from './track';
export interface PopulationMetrics {
  population:number;launched:number;lapCounts:number[];completed:number;collisions:number;stalled:number;timeouts:number;active:number;
  meanProgress:number;progressStd:number;diversity:number;medianTime:number|null;
}
/** Rates use the entire evaluated population, including failed attempts. */
export function populationMetrics(cars:readonly Car[],track:Track):PopulationMetrics {
  const n=cars.length,progress=cars.map(c=>c.furthest/(track.length*c.targetLaps));
  const meanProgress=n?progress.reduce((a,b)=>a+b,0)/n:0;
  const finished=cars.filter(c=>c.completed).map(c=>c.elapsed).sort((a,b)=>a-b);
  const medianTime=finished.length?(finished[Math.floor((finished.length-1)/2)]+finished[Math.floor(finished.length/2)])/2:null;
  // RMS of the population standard deviation of each parameter; not behavioral similarity.
  const weights=cars[0]?.genome.length??0;let variance=0;
  for(let w=0;w<weights;w++){
    let sum=0,squares=0;
    for(const car of cars){const v=car.genome[w];sum+=v;squares+=v*v;}
    variance+=Math.max(0,squares/n-(sum/n)**2);
  }
  return {population:n,launched:cars.filter(c=>c.furthest>=track.length*.05).length,
    lapCounts:Array.from({length:cars[0]?.targetLaps??0},(_,i)=>cars.filter(c=>c.lapsCompleted>=i+1).length),
    completed:finished.length,collisions:cars.filter(c=>c.reason==='collision').length,stalled:cars.filter(c=>c.reason==='stalled').length,
    timeouts:cars.filter(c=>c.reason==='timeout').length,active:cars.filter(c=>c.alive).length,meanProgress,
    progressStd:n?Math.sqrt(progress.reduce((s,p)=>s+(p-meanProgress)**2,0)/n):0,
    diversity:weights?Math.sqrt(variance/weights):0,medianTime};
}
