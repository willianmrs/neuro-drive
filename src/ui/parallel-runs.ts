import type { Snapshot } from '../protocol';
import { scenarioTrack } from '../core/scenarios';
import { TrackRenderer } from './render';
import { escapeHtml } from './text';

/** Selecting a card only changes the observed world; every world keeps running. */
export class ParallelRuns {
  private key='';
  private cards:{button:HTMLButtonElement;renderer:TrackRenderer}[]=[];
  constructor(private root:HTMLElement,private select:(index:number)=>void){}
  update(snapshot:Snapshot|null,visible:boolean,running:boolean){
    this.root.classList.toggle('hidden',!visible);
    if(!visible)return;
    const battery=snapshot?.battery,grid=this.root.querySelector<HTMLElement>('#run-grid')!,summary=this.root.querySelector<HTMLElement>('#runs-summary')!;
    if(!battery||!snapshot){
      summary.textContent='Preparing parallel runs…';grid.replaceChildren();this.key='';this.cards=[];return;
    }
    const key=JSON.stringify([battery.id,battery.runs.map(run=>run.scenario)]);
    if(key!==this.key){
      this.key=key;
      grid.style.setProperty('--runs',String(battery.total));
      grid.innerHTML=battery.runs.map((run,i)=>`<button class="run-card" type="button" aria-pressed="false" data-run="${i}"><span class="run-card-top"><b>RUN ${String(i+1).padStart(2,'0')}</b><span class="run-state"></span></span><canvas aria-hidden="true"></canvas><span class="run-name">${escapeHtml(run.scenario.name)}</span><span class="run-counts"></span><span class="run-progress"><i></i></span></button>`).join('');
      this.cards=battery.runs.map((run,i)=>{
        const button=grid.children[i] as HTMLButtonElement;
        button.onclick=()=>this.select(i);
        return {button,renderer:new TrackRenderer(button.querySelector('canvas')!,scenarioTrack(run.scenario),.5)};
      });
    }
    summary.textContent=`GEN ${String(snapshot.generation).padStart(3,'0')} · ${battery.finished}/${battery.total} runs finished · ${battery.alive} cars driving${running?'':' · PAUSED'}`;
    battery.runs.forEach((run,i)=>{
      const {button,renderer}=this.cards[i],selected=i===battery.index;
      button.classList.toggle('selected',selected);button.classList.toggle('finished',run.finished);
      button.setAttribute('aria-pressed',String(selected));
      button.setAttribute('aria-label',`Watch run ${i+1}: ${run.scenario.name}. ${run.alive} driving, ${run.completed} finished.${selected?' Currently selected.':''}`);
      button.querySelector('.run-state')!.textContent=run.finished?'WAITING':running?'LIVE':'PAUSED';
      button.querySelector('.run-counts')!.textContent=`${run.alive} driving · ${run.completed}/${run.cars.length} finished · ${(run.meanProgress*100).toFixed(0)}% mean`;
      (button.querySelector('.run-progress i') as HTMLElement).style.width=`${run.meanProgress*100}%`;
      renderer.draw({cars:run.cars,leaderId:snapshot.leaderId,sensors:false,leaderOnly:false,manual:null,ghost:null,mode:'train',generation:snapshot.generation});
    });
  }
}
