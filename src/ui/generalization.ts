import type { Snapshot } from '../protocol';
import type { Evaluation } from '../core/evaluation';
import type { Car } from '../core/simulation';
import { escapeHtml } from './text';
export class GeneralizationPanel {
  constructor(private root:HTMLElement){}
  private el(id:string){return this.root.querySelector<HTMLElement>(`#${id}`)!;}
  update(s:Snapshot|null,player:Car|null,testing:boolean,trackLength:number){
    const b=s?.battery,v=s?.validation,t=v?.source==='saved'?(v.training??undefined):s?.best?.evaluation?.training;
    const leader=s?.cars.find(c=>c.id===s.leaderId);
    this.el('battery-current').textContent=b?`Watching run ${b.index+1} / ${b.total} · ${b.scenario.name}`:'Fixed environment · one attempt per driver';
    const last=s?.history.at(-1);
    this.el('battery-progress').textContent=b?`All ${b.total} runs advance together; ${b.finished} finished. Observed leader: ${((leader?.progress??0)*100).toFixed(1)}% · ${leader?.lapsCompleted??0}/${s!.settings.laps} laps · ${leader?.elapsed.toFixed(2)??'0.00'}s · ${leader?.alive?'driving':leader?.reason??'starting'}. Selection waits for every run.${last?.consistentFinishers!==undefined?` Last complete generation: ${last.consistentFinishers}/${last.metrics.population/b.total} drivers finished every scenario.`:''}`:'Fixed mode uses the original single-environment selection.';
    this.el('aggregate-training').textContent=t?`${t.aggregate.completed} / ${t.aggregate.total} finished`:v?.source==='saved'?'Legacy single-environment driver':'Waiting for a complete battery';
    this.el('aggregate-training-detail').textContent=t?`${v?.source==='saved'?'Saved driver':'Training champion'} GEN ${v?.source==='saved'?v.generation:s!.best!.generation} · ${v?.source==='saved'?v.targetLaps:s!.best!.targetLaps} laps/attempt · mean ${(t.aggregate.meanProgress*100).toFixed(1)}% · worst ${(t.aggregate.worstProgress*100).toFixed(1)}%`:v?.source==='saved'?'No original multi-scenario evaluation was recorded for this legacy driver.':'Partial progress still guides selection when nobody finishes.';
    this.el('aggregate-validation').textContent=v?.result?`${v.result.aggregate.completed} / ${v.total} finished`:v?`Testing ${v.done} / ${v.total}`:'Waiting for a frozen champion';
    this.el('aggregate-validation-detail').textContent=v?.result?`${v.source==='saved'?'Saved driver':'Training champion'} GEN ${v.generation} · ${v.targetLaps} laps/attempt · mean ${(v.result.aggregate.meanProgress*100).toFixed(1)}% · worst ${(v.result.aggregate.worstProgress*100).toFixed(1)}%. ${v.source==='training'&&s?.best&&JSON.stringify([s.best.architecture,s.best.targetLaps,s.best.genome])!==v.genomeKey?'Earlier frozen candidate; latest is queued.':'Frozen weights; excluded from selection.'}`:'Reserved scenarios do not choose parents or change weights.';
    this.el('training-scenario-results').innerHTML=this.rows(t);
    this.el('heldout-scenario-results').innerHTML=this.rows(v?.result??undefined);
    this.el('current-transfer-result').textContent=testing&&player?`Frozen current-environment test · ${player.alive?'running':player.reason} · ${(player.furthest/(trackLength*player.targetLaps)*100).toFixed(1)}% progress · ${player.lapsCompleted}/${player.targetLaps} laps · ${player.elapsed.toFixed(2)}s. Training is paused.`:'Use “Test current environment” after saving a champion. Your open layout stays in place; the weights stay frozen.';
  }
  private rows(e?:Evaluation){
    if(!e)return '<tr><td colspan="5">No completed evaluation yet.</td></tr>';
    return e.outcomes.map((o,i)=>`<tr><th scope="row">${escapeHtml(e.scenarios[i].name)}</th><td>${o.score.completed?'✓ finish':o.reason}</td><td>${(o.score.progress*100).toFixed(1)}%</td><td>${o.score.time.toFixed(2)}</td><td>${o.score.completed?(o.score.time/(o.length)*1000).toFixed(2):'—'}</td></tr>`).join('');
  }
}
