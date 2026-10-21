import { activations, parameterLayers, type Architecture } from '../core/network';
import type { Champion } from '../core/evolution';
import type { Aggregate } from '../core/evaluation';
import type { Score } from '../core/simulation';
import type { Snapshot } from '../protocol';
interface Brain {genome:number[];architecture:Architecture;generation:number;label:string;score:Score;aggregate?:Aggregate;inputs?:number[]}
const inputNames=['Ray −90°','Ray −60°','Ray −30°','Ray 0°','Ray +30°','Ray +60°','Ray +90°','Speed'];
const signed=(n:number,digits=2)=>`${n>=0?'+':''}${n.toFixed(digits)}`;
export class NetworkInspector {
  private frozen:Brain|null=null;private brain:Brain|null=null;private signature='';private selected:[number,number]=[0,0];
  private visible=true;private epoch=-1;
  constructor(private root:HTMLElement){
    const observer=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;},{rootMargin:'200px'});observer.observe(root);
    this.el<HTMLSelectElement>('brain-source').onchange=()=>{this.frozen=null;this.signature='';};
    this.el('brain-freeze').onclick=()=>{this.frozen=this.frozen?null:this.brain?structuredClone(this.brain):null;this.signature='';this.draw(this.brain);};
    this.el('weight-matrices').onclick=event=>{
      const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-neuron]');if(!button)return;
      this.selected=button.dataset.neuron!.split(',').map(Number) as [number,number];this.signature='';this.draw(this.brain);
    };
  }
  private el<T extends HTMLElement=HTMLElement>(id:string){return this.root.querySelector<T>(`#${id}`)!;}
  update(snapshot:Snapshot|null,saved:Champion|null){
    if(snapshot&&snapshot.epoch!==this.epoch){this.epoch=snapshot.epoch;this.frozen=null;this.signature='';}
    if(!this.visible)return;
    this.el<HTMLOptionElement>('brain-saved-option').disabled=!saved;
    const source=this.el<HTMLSelectElement>('brain-source').value;
    let brain:Brain|null=null;
    if(source==='saved'||source==='best'){
      const c=source==='saved'?saved:snapshot?.best;
      if(c)brain={...c,aggregate:c.evaluation?.training.aggregate,label:source==='saved'?'Saved champion':'Best result so far'};
    }else{
      const rank=Number(source),c=snapshot?.topBrains[rank];
      if(c&&snapshot)brain={...c,architecture:snapshot.architecture,generation:snapshot.generation,label:`Rank ${rank+1} · car ${String(c.id+1).padStart(3,'0')}`};
    }
    this.draw(this.frozen??brain);
  }
  private draw(brain:Brain|null){
    this.brain=brain;
    this.el('brain-freeze').textContent=this.frozen?'Follow live':'Freeze view';
    this.el<HTMLButtonElement>('brain-freeze').disabled=!brain;
    if(!brain){this.el('brain-meta').textContent='Waiting for a result from this source.';this.el('weight-matrices').innerHTML='';this.el('neuron-detail').textContent='Choose a driver to inspect its parameters.';this.signature='';return;}
    const {genome,architecture,generation,score}=brain;
    this.el('brain-meta').textContent=`${this.frozen?'FROZEN · ':''}${brain.label} · GEN ${String(generation).padStart(3,'0')} · ${architecture.join(' → ')} · ${brain.aggregate?`${brain.aggregate.completed}/${brain.aggregate.total} scenarios · ${(brain.aggregate.meanProgress*100).toFixed(1)}% mean${brain.inputs?' · provisional':''}`:score.completed?`${score.time.toFixed(2)}s total`:`${(score.progress*100).toFixed(1)}% progress`}`;
    const layers=parameterLayers(genome,architecture),scale=Math.max(.001,...genome.map(Math.abs));
    const signature=JSON.stringify([genome,architecture,this.selected]);
    if(signature!==this.signature){
      this.signature=signature;
      this.el('weight-scale').textContent=`Color scale: −${scale.toFixed(2)} to +${scale.toFixed(2)} · ${genome.length} parameters`;
      const cell=(v:number,index:number,bias=false)=>{
        const alpha=.07+.7*Math.abs(v)/scale,color=v>=0?'38,118,148':'193,106,48';
        return `<td class="${bias?'bias-cell':''}" style="background:rgba(${color},${alpha});color:#12221c" title="Parameter ${index+1}: ${signed(v,6)}">${signed(v)}</td>`;
      };
      this.el('weight-matrices').innerHTML=layers.map((layer,l)=>{
        const final=l===layers.length-1,name=final?'Actions':`Hidden ${l+1}`;
        return `<section class="matrix-layer"><div class="matrix-heading"><h3>${l===0?'Inputs':`Hidden ${l}`} → ${name}</h3><span>Rows receive · columns send · click a neuron</span></div><div class="table-scroll" tabindex="0" role="region" aria-label="Weights into ${name}"><table class="weight-table"><caption class="sr-only">Weights and biases into ${name}. Positive blue, negative orange.</caption><thead><tr><th scope="col">To ↓ / From →</th>${Array.from({length:layer.inputCount},(_,i)=>`<th scope="col">${l===0?inputNames[i]:`H${l}.${i+1}`}</th>`).join('')}<th scope="col">Bias</th></tr></thead><tbody>${layer.rows.map((row,n)=>`<tr class="${this.selected[0]===l&&this.selected[1]===n?'selected-neuron':''}"><th scope="row"><button data-neuron="${l},${n}">${final?['Steering','Throttle'][n]:`H${l+1}.${n+1}`}</button></th>${row.weights.map((v,i)=>cell(v,row.offset+i)).join('')}${cell(row.bias,row.offset+layer.inputCount,true)}</tr>`).join('')}</tbody></table></div></section>`;
      }).join('');
    }
    const l=Math.min(this.selected[0],layers.length-1),n=Math.min(this.selected[1],layers[l].rows.length-1),row=layers[l].rows[n];
    const name=l===layers.length-1?['Steering','Throttle'][n]:`H${l+1}.${n+1}`;
    if(brain.inputs){
      const trace=activations(genome,brain.inputs,architecture),values=trace[l],sum=row.weights.reduce((s,w,i)=>s+w*values[i],0)+row.bias;
      const strongest=row.weights.map((w,i)=>({i,value:w*values[i]})).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,3);
      this.el('neuron-detail').textContent=`${name}: tanh(Σ input × weight + bias ${signed(row.bias,3)}) = tanh(${signed(sum,3)}) = ${signed(Math.tanh(sum),3)}. Largest current contributions: ${strongest.map(c=>`${l===0?inputNames[c.i]:`H${l}.${c.i+1}`} ${signed(c.value,3)}`).join(' · ')}. Inputs are from this driver's most recent decision.`;
    }else this.el('neuron-detail').textContent=`${name}: output = tanh(Σ input × weight + bias ${signed(row.bias,3)}). This stored result has no live input trace. Select a current rank to see its latest decision.`;
  }
}
