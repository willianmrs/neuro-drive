import type { History } from '../core/evolution';
import type { Snapshot } from '../protocol';
const pct=(count:number,total:number)=>total?count/total*100:0;
export class LearningMetrics {
  private signature='';
  constructor(private root:HTMLElement){}
  private el<T extends HTMLElement=HTMLElement>(id:string){return this.root.querySelector<T>(`#${id}`)!;}
  update(snapshot:Snapshot|null){
    const history=snapshot?.history??[],last=history.at(-1),useCurrent=this.el<HTMLSelectElement>('metrics-cohort').value==='current'||!last;
    const metrics=useCurrent?snapshot?.metrics:last?.metrics;
    const generation=useCurrent?snapshot?.generation:last?.generation;
    const signature=JSON.stringify([metrics,generation,useCurrent,history]);if(signature===this.signature)return;this.signature=signature;
    this.el('metrics-context').textContent=metrics?`GEN ${String(generation).padStart(3,'0')} · ${metrics.population} ${snapshot?.battery?'driver × scenario episodes across all parallel runs':'drivers'} · ${useCurrent?`IN PROGRESS · ${metrics.active} still driving`:'FINAL RESULTS'}`:'Waiting for the first snapshot.';
    this.el('conversion-rate').textContent=metrics?`${pct(metrics.completed,metrics.population).toFixed(1)}%`:'—';
    this.el('conversion-detail').textContent=metrics?`${metrics.completed} / ${metrics.population} finished ${snapshot?.settings.laps??3} laps ${snapshot?.battery?'per scenario':''}`:'All drivers are included';
    this.el('median-run').textContent=metrics?.medianTime!=null?`${metrics.medianTime.toFixed(2)}s`:'—';
    this.el('median-detail').textContent=snapshot?.battery?'Mixed courses: use per-scenario times above':metrics?`Among ${metrics.completed} finishers only`:'Finishers only';
    this.el('mean-progress').textContent=metrics?`${(metrics.meanProgress*100).toFixed(1)}%`:'—';
    this.el('progress-spread').textContent=metrics?`Population spread: ${(metrics.progressStd*100).toFixed(1)} pp`:'Every driver, including failures';
    this.el('collision-rate').textContent=metrics?`${pct(metrics.collisions,metrics.population).toFixed(1)}%`:'—';
    this.el('collision-detail').textContent=metrics?`${metrics.collisions} crashed · ${metrics.stalled} stalled · ${metrics.timeouts} timed out`:'Wall and obstacle collisions';
    const stages=metrics?[['Reached 5% of lap 1',metrics.launched] as const,...metrics.lapCounts.map((n,i)=>[`Completed lap ${i+1}`,n] as const)]:[];
    this.el('conversion-funnel').innerHTML=stages.map(([label,count])=>`<div class="funnel-row"><span>${label}</span><div class="funnel-track"><i style="width:${pct(count,metrics!.population)}%"></i></div><strong>${count}/${metrics!.population} <small>${pct(count,metrics!.population).toFixed(0)}%</small></strong></div>`).join('');
    this.el('diversity-value').textContent=metrics?metrics.diversity.toFixed(3):'—';
    this.el('learning-trend').textContent=this.trend(history);
    this.drawChart(history);
    this.el('generation-table-body').innerHTML=[...history].reverse().slice(0,10).map(h=>`<tr><th scope="row">${String(h.generation).padStart(3,'0')}</th><td>${pct(h.completed,h.metrics.population).toFixed(1)}% <small>(${h.completed}/${h.metrics.population})</small></td><td>${(h.average*100).toFixed(1)}%</td><td>${pct(h.metrics.collisions,h.metrics.population).toFixed(1)}%</td><td>${h.metrics.medianTime?.toFixed(2)??'—'}</td><td>${h.bestTime?.toFixed(2)??'—'}</td><td>${h.metrics.diversity.toFixed(3)}</td></tr>`).join('');
    this.el('metrics-empty').classList.toggle('hidden',history.length>0);
  }
  private trend(history:History[]){
    if(history.length<10)return `Finish ${10-history.length} more generations to compare two windows of 5. Final results only.`;
    const rate=(items:History[])=>items.reduce((sum,h)=>sum+pct(h.completed,h.metrics.population),0)/items.length;
    const previous=rate(history.slice(-10,-5)),recent=rate(history.slice(-5)),delta=recent-previous;
    return `Last 5 generations: ${recent.toFixed(1)}% completion vs ${previous.toFixed(1)}% in the previous 5 (${delta>=0?'+':''}${delta.toFixed(1)} percentage points).`;
  }
  private drawChart(history:History[]){
    let html='';
    for(const value of [0,.5,1]){const y=155-value*135;html+=`<text x="0" y="${y+3}">${value*100}%</text><line x1="37" x2="700" y1="${y}" y2="${y}"/>`;}
    for(const [color,get] of [['#347f98',(h:History)=>h.completed/h.metrics.population],['#7b9953',(h:History)=>h.average],['#c47d4c',(h:History)=>h.metrics.collisions/h.metrics.population]] as const){
      const point=(h:History,i:number)=>`${37+i/Math.max(history.length-1,1)*660},${155-get(h)*135}`;
      html+=`<polyline fill="none" stroke="${color}" stroke-width="2" points="${history.map(point).join(' ')}"/>`;
      if(history.length===1)html+=`<circle fill="${color}" cx="37" cy="${155-get(history[0])*135}" r="3"/>`;
    }
    this.el('learning-chart').innerHTML=html;
    this.el('learning-axis').textContent=history.length?`GEN ${String(history[0].generation).padStart(3,'0')} → ${String(history.at(-1)!.generation).padStart(3,'0')} · ${history.length} completed generations`:'No completed generations yet';
  }
}
