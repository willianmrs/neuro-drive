import { clamp, Random } from './math';
export const ARCHITECTURE = [8,12,2] as const;
export const MAX_HIDDEN_LAYERS=4;
export const MAX_NEURONS=24;
export type Architecture=readonly number[];
export type Genome=number[];
export function validateArchitecture(value:unknown):number[] {
  if(!Array.isArray(value)||value.length<3||value.length>MAX_HIDDEN_LAYERS+2||value[0]!==8||value.at(-1)!==2||!Array.from(value.slice(1,-1)).every(n=>Number.isInteger(n)&&n>=1&&n<=MAX_NEURONS))throw new Error('Network must have 8 inputs, 2 outputs, and 1–4 hidden layers of 1–24 neurons.');
  return [...value];
}
export function weightCount(architecture:Architecture=ARCHITECTURE){
  let count=0;for(let l=1;l<architecture.length;l++)count+=(architecture[l-1]+1)*architecture[l];return count;
}
export const WEIGHT_COUNT=weightCount();
export interface ParameterLayer {inputCount:number;rows:{weights:number[];bias:number;offset:number}[]}
/** The same destination-major order consumed by forward(), with the bias last. */
export function parameterLayers(genome:readonly number[],architecture:Architecture):ParameterLayer[]{
  let offset=0;
  return architecture.slice(1).map((count,l)=>({inputCount:architecture[l],rows:Array.from({length:count},()=>{
    const start=offset;offset+=architecture[l]+1;
    return {weights:genome.slice(start,start+architecture[l]),bias:genome[start+architecture[l]],offset:start};
  })}));
}
export function randomGenome(rng:Random,architecture:Architecture=ARCHITECTURE):Genome {
  const genome:Genome=[];
  for(let l=1;l<architecture.length;l++) {
    const final=l===architecture.length-1;
    const scale=(final?.32:.45)*Math.sqrt((final?12:8)/architecture[l-1]);
    for(let i=0;i<(architecture[l-1]+1)*architecture[l];i++)genome.push(clamp(rng.normal()*scale,-6,6));
  }
  return genome;
}
/** Row-major input weights followed by a bias for every neuron in every layer. */
export function forward(weights:Genome,inputs:readonly number[],architecture:Architecture=ARCHITECTURE):[number,number] {
  let values:ArrayLike<number>=inputs,w=0;
  for(let l=1;l<architecture.length;l++){
    const next=new Float64Array(architecture[l]);
    for(let neuron=0;neuron<architecture[l];neuron++){
      let sum=0;for(let i=0;i<architecture[l-1];i++)sum+=clamp(values[i])*weights[w++];
      next[neuron]=Math.tanh(sum+weights[w++]);
    }
    values=next;
  }
  return [clamp(values[0]),clamp(values[1])];
}
/** Full activation trace for the network diagram; training uses forward(). */
export function activations(weights:Genome,inputs:readonly number[],architecture:Architecture=ARCHITECTURE):number[][] {
  const layers=[Array.from(inputs)];let w=0;
  for(let l=1;l<architecture.length;l++){
    const values=Array.from({length:architecture[l]},()=>{
      let sum=0;for(let i=0;i<architecture[l-1];i++)sum+=clamp(layers[l-1][i])*weights[w++];
      return Math.tanh(sum+weights[w++]);
    });layers.push(values);
  }
  return layers;
}
export function mutate(parent:Genome,rng:Random,probability:number,strength:number):Genome {
  return parent.map(w=>rng.next()<probability?clamp(w+rng.normal()*strength,-6,6):w);
}
