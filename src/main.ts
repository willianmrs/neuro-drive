import './style.css';
import { ARCHITECTURE, MAX_HIDDEN_LAYERS, MAX_NEURONS, activations, validateArchitecture, weightCount, type Architecture } from './core/network';
import { createTrack, defaultObstacles, type TrackId } from './core/track';
import { MAX_OBSTACLES, validateObstacles, layoutKey, type Obstacle, type ObstacleKind } from './core/obstacles';
import { scenarioTrack, scenarioCar, DEFAULT_DIVERSITY, type Scenario, type DiversityConfig } from './core/scenarios';
import { testCurrentEnvironment, originalScenario } from './core/transfer';
import { GeneralizationPanel } from './ui/generalization';
import { escapeHtml } from './ui/text';
import { NetworkInspector } from './ui/inspector';
import { LearningMetrics } from './ui/learning-metrics';
import { ObstacleEditor } from './ui/obstacle-editor';
import { DEFAULT_SETTINGS, type Champion, type EvolutionSettings } from './core/evolution';
import { createCar, DT, stepCar, type Car } from './core/simulation';
import { deserializeChampion, serializeChampion } from './core/serialization';
import { TrackRenderer } from './ui/render';
import type { Snapshot, WorkerMessage } from './protocol';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const worker=new Worker(new URL('./training.worker.ts',import.meta.url),{type:'module'});
const post=(message:WorkerMessage)=>worker.postMessage(message);
const canvas=$<HTMLCanvasElement>('track-canvas');
let trackId:TrackId='oval',track=createTrack(trackId),mode:'train'|'drive'|'test'='train',running=true,speed=1,epoch=0;
let diversityEnabled=true,diversityConfig:DiversityConfig={...DEFAULT_DIVERSITY},openScenario:Scenario|null=null,sceneKey='';
let architecture:Architecture=[...ARCHITECTURE];
let settings:EvolutionSettings={...DEFAULT_SETTINGS},snapshot:Snapshot|null=null,savedChampion:Champion|null=null;
let player:Car|null=null,ghost:Car|null=null,ghostWait=0,previousTime=performance.now(),accumulator=0,uiTime=0,trainWasRunning=true;
const keys=new Set<string>();
const renderer=new TrackRenderer(canvas,track);
const generalizationPanel=new GeneralizationPanel($('generalization-panel'));
const networkInspector=new NetworkInspector($('network-inspector'));
const learningMetrics=new LearningMetrics($('learning-metrics'));
let detailTime=0;
let toastTimer=0,neuronTimer=0,resumeAfterEdit=false;
const obstacleEditor=new ObstacleEditor(canvas,()=>track,updateObstacleEditor,message=>toast(message,true));
function toast(message:string,error=false){const t=$('toast');t.textContent=message;t.className=`show${error?' error':''}`;clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>t.className='',4500);}
function readLayout(id:TrackId):Obstacle[]{
  const base=createTrack(id);
  try{const raw=localStorage.getItem(`neurodrive.layout.v1.${id}`);return raw?createTrack(id,validateObstacles(JSON.parse(raw))).obstacles:defaultObstacles(base);}
  catch{toast('Could not read the saved layout. Using the default barriers.',true);return defaultObstacles(base);}
}
function installLayout(obstacles:Obstacle[]){
  const next=openScenario?scenarioTrack({...openScenario,obstacles}):createTrack(trackId,obstacles),changed=layoutKey(next.obstacles)!==layoutKey(track.obstacles);
  track=next;if(openScenario)openScenario={...openScenario,obstacles:structuredClone(obstacles)};sceneKey='';
  try{if(!openScenario)localStorage.setItem(`neurodrive.layout.v1.${trackId}`,JSON.stringify(track.obstacles));}catch{toast('Layout is active for this session. Browser storage is unavailable.',true);}
  if(changed){epoch++;snapshot=null;post({type:'layout',epoch,obstacles:track.obstacles});}
  if(mode!=='train')restartDrive();
  restartGhost();updateChampionCard();updateMetrics();updateObstacleEditor();syncScene();
}
function syncScene(){
  const scenario=mode==='train'&&!obstacleEditor.active?snapshot?.battery?.scenario:null;
  const key=scenario?JSON.stringify(scenario):JSON.stringify([trackId,track.obstacles,openScenario]);
  if(key!==sceneKey){renderer.setTrack(scenario?scenarioTrack(scenario):track);sceneKey=key;}
  $('track-label').textContent=(scenario?(scenario.track==='oval'?'THE OVAL':'SWITCHBACK'):track.name.toUpperCase());
  $('scenario-status').textContent=obstacleEditor.active?'CURRENT TEST ENVIRONMENT · training battery is unchanged':scenario?`TRAINING SCENARIO ${snapshot!.battery!.index+1}/${snapshot!.battery!.total} · ${scenario.name}`:mode==='test'?'FROZEN WEIGHTS · CURRENT ENVIRONMENT · no training':mode==='drive'?'MANUAL DRIVE · CURRENT ENVIRONMENT':diversityEnabled&&!snapshot?'PREPARING THE TRAINING BATTERY…':'FIXED TRAINING ENVIRONMENT';
}
function activateChampion(c:Champion){
  savedChampion=c;openScenario=originalScenario(c,Number($<HTMLSelectElement>('replay-scenario').value)||0);
  trackId=openScenario.track;track=scenarioTrack(openScenario);sceneKey='';
  document.querySelectorAll<HTMLElement>('[data-track]').forEach(b=>b.classList.toggle('active',b.dataset.track===trackId));
  setMode('test');restartDrive();syncScene();updateChampionCard();
}
function updateObstacleEditor(){
  const active=obstacleEditor.active;
  $('obstacle-toolbar').classList.toggle('hidden',!active);
  $('obstacle-rotation').classList.toggle('hidden',!active);
  $('obstacle-help').classList.toggle('hidden',!active);
  canvas.classList.toggle('editing-obstacles',active);canvas.classList.toggle('adding-obstacles',active&&obstacleEditor.adding);
  $('obstacle-apply').textContent=resumeAfterEdit?'Apply & resume':'Apply layout';
  $('obstacle-add').classList.toggle('active',obstacleEditor.adding);
  $<HTMLButtonElement>('obstacle-add').disabled=obstacleEditor.draft.length>=MAX_OBSTACLES;
  $<HTMLButtonElement>('obstacle-remove').disabled=obstacleEditor.selected===null;
  const selected=obstacleEditor.draft.find(o=>o.id===obstacleEditor.selected);
  for(const id of ['obstacle-rotate','obstacle-rotate-back','obstacle-angle','obstacle-angle-value'])$<HTMLInputElement>(id).disabled=!selected;
  const degrees=selected?Math.round((selected.angle*180/Math.PI%360+360)%360)%360:0;
  for(const id of ['obstacle-angle','obstacle-angle-value'])$<HTMLInputElement>(id).value=String(degrees);
  $('obstacle-angle').style.setProperty('--range',`${degrees/359*100}%`);
  $('obstacle-selection').textContent=selected?`OBSTACLE ${selected.id+1}`:'Select an obstacle on the track';
  $('obstacle-count').textContent=`${active?obstacleEditor.draft.length:track.obstacles.length} / ${MAX_OBSTACLES}`;
  $('edit-obstacles').textContent=active?'Editing obstacles':'Edit obstacles';
  $<HTMLButtonElement>('edit-obstacles').disabled=active;
  document.querySelectorAll<HTMLElement>('.control-panel,.transport,.mode-switch,.insights-grid').forEach(el=>el.inert=active);
  syncScene();
  if(active){$('pause-overlay').classList.add('hidden');$('drive-overlay').classList.add('hidden');$('status-text').textContent='EDITING';}
}
function beginObstacleEdit(){
  if(obstacleEditor.active)return;
  resumeAfterEdit=running;setRunning(false);keys.clear();obstacleEditor.begin();canvas.focus({preventScroll:true});
}
function finishObstacleEdit(apply:boolean){
  if(!obstacleEditor.active)return;
  if(apply){try{installLayout(validateObstacles(obstacleEditor.draft));}catch(error){toast(error instanceof Error?error.message:'Invalid layout.',true);return;}}
  obstacleEditor.end();setRunning(resumeAfterEdit);
  if(apply)toast(diversityEnabled?'Current test layout applied. Training battery and brains preserved.':'Layout applied. Attempts and scores restarted; brains preserved.');
}
const storageKey=(id:TrackId)=>`neurodrive.champion.v1.${id}`;
function readSaved(id:TrackId):Champion|null {
  try{const raw=localStorage.getItem(storageKey(id));return raw?deserializeChampion(raw):null;}catch{toast('Browser storage is unavailable or its champion is invalid. JSON import/export still works.',true);return null;}
}
function restartGhost(){
  if(mode==='drive'&&savedChampion&&player&&player.targetLaps!==savedChampion.targetLaps)player=createCar(track,[],0,architecture,savedChampion.targetLaps);
  ghost=savedChampion?(openScenario?scenarioCar(openScenario,savedChampion.genome,-2,savedChampion.architecture,savedChampion.targetLaps,track):createCar(track,savedChampion.genome,-2,savedChampion.architecture,savedChampion.targetLaps)):null;ghostWait=0;}
function updateChampionCard(){
  const c=savedChampion,has=Boolean(c);
  if(c){
    const transfer=c.track!==trackId,layoutChanged=layoutKey(c.obstacles)!==layoutKey(track.obstacles);
    $('champion-title').textContent=transfer?`Transfer test · trained on ${c.track==='oval'?'The Oval':'Switchback'}`:layoutChanged?`Layout test · saved with ${c.obstacles.length} barriers`:`Generation ${String(c.generation).padStart(3,'0')} · ${c.score.completed?`${c.targetLaps} ${c.targetLaps===1?'lap':'laps'} · ${c.score.time.toFixed(2)}s total`:`${c.score.completedLaps}/${c.targetLaps} laps · ${(c.score.progress*100).toFixed(1)}%`}`;
    $('champion-detail').textContent=transfer?'Scores stay on the track where they were earned.':layoutChanged?'Load saved restores the original layout for an exact replay.':`Saved locally · ${c.architecture.join(' → ')} · seed “${c.seed}”`;
    if(c.evaluation){const a=c.evaluation.training.aggregate;$('champion-title').textContent=`GEN ${c.generation} · ${a.completed}/${a.total} training scenarios · ${(a.meanProgress*100).toFixed(1)}% mean`;$('champion-detail').textContent='Aggregate champion · frozen replay and transfer are separate operations.';}
  }else{$('champion-title').textContent='A champion in the making.';$('champion-detail').textContent='Save your best driver. Take it for another lap.';}
  $<HTMLButtonElement>('export-button').disabled=!has;
  $<HTMLButtonElement>('transfer-button').disabled=!has;
  $<HTMLButtonElement>('load-button').disabled=!has;
  for(const id of ['test-current','test-heldout'])$<HTMLButtonElement>(id).disabled=!has;
  const select=$<HTMLSelectElement>('replay-scenario'),previous=select.value;
  select.innerHTML=c?.evaluation?c.evaluation.training.scenarios.map((s,i)=>`<option value="${i}">${escapeHtml(s.name)}</option>`).join(''):'<option value="0">Original saved scenario</option>';
  select.value=select.querySelector(`option[value="${previous}"]`)?previous:'0';select.disabled=!has;
  $('champion-legend').style.opacity=has&&$<HTMLInputElement>('ghost-toggle').checked?'1':'.35';
}
function seed(){return $<HTMLInputElement>('seed-input').value.trim()||'2026';}
function initTraining(){
  epoch++;snapshot=null;
  post({type:'init',...(diversityEnabled?{diversity:diversityConfig}:{}),obstacles:track.obstacles,architecture,epoch,track:trackId,seed:seed(),settings,running:running&&mode==='train',speed});
  updateMetrics();
}
function updateTransport(){
  $('experiment-title').textContent=mode!=='train'?'Training on hold':'The experiment';
  $('experiment-badge').textContent=running&&mode==='train'?'LIVE':'PAUSED';
  $('play-label').textContent=running?(mode==='train'?'Pause training':'Pause run'):(mode==='train'?'Start training':'Resume run');
  $('play-icon').textContent=running?'Ⅱ':'▶';
  $('status-text').textContent=running?(mode==='train'?'EVOLVING':mode==='test'?'FROZEN TEST':'MANUAL DRIVE'):'PAUSED';
  $('status-dot').classList.toggle('paused',!running);
  $('pause-overlay').classList.toggle('hidden',running);
  $('drive-overlay').classList.toggle('hidden',mode!=='drive');
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b=>b.disabled=mode!=='train');
  $('stage-mode').textContent=mode==='train'?(trackId==='oval'?'TRAINING GROUND 01':'TRAINING GROUND 02'):'MANUAL / RACE THE GHOST';
}
function setRunning(value:boolean){running=value;accumulator=0;post({type:'running',value:running&&mode==='train'});updateTransport();}
function restartDrive(){player=mode==='test'&&savedChampion?testCurrentEnvironment(savedChampion,track,openScenario):openScenario?scenarioCar(openScenario,[],0,architecture,savedChampion?.targetLaps??settings.laps,track):createCar(track,[],0,architecture,savedChampion?.targetLaps??snapshot?.settings.laps??settings.laps);restartGhost();keys.clear();accumulator=0;canvas.focus({preventScroll:true});if(mode!=='train'){running=true;updateTransport();}}
function setMode(value:'train'|'drive'|'test'){
  if(value===mode)return;
  if(value==='train'&&!diversityEnabled&&openScenario){openScenario=null;track=createTrack(trackId,readLayout(trackId));initTraining();}
  if(value!=='train'){if(mode==='train')trainWasRunning=running;mode=value;running=true;restartDrive();}else{mode=value;running=trainWasRunning;player=null;restartGhost();}
  keys.clear();accumulator=0;
  $('train-mode').classList.toggle('active',value==='train');$('drive-mode').classList.toggle('active',value==='drive');$('test-mode').classList.toggle('active',value==='test');
  post({type:'running',value:running&&mode==='train'});updateTransport();updateMetrics();syncScene();
}
function switchTrack(id:TrackId,transfer?:Champion){
  if(trackId===id&&!transfer)return;
  trackId=id;openScenario=null;track=createTrack(id,readLayout(id));sceneKey='';
  document.querySelectorAll<HTMLElement>('[data-track]').forEach(b=>b.classList.toggle('active',b.dataset.track===id));
  $('track-label').textContent=track.name.toUpperCase();
  savedChampion=transfer??readSaved(id);restartGhost();if(mode!=='train')restartDrive();
  if(!diversityEnabled)initTraining();updateChampionCard();updateTransport();syncScene();
  updateObstacleEditor();
  if(transfer)toast(`Testing the ${transfer.track==='oval'?'Oval':'Switchback'} brain on ${track.name}. Target-track scores start fresh.`);
}
function updateMetrics(){
  const s=snapshot,best=s?.best,progress=(best?.evaluation?.training.aggregate.meanProgress??best?.score.progress??0)*100;
  $('best-progress-label').textContent=s?.battery?'Champion mean progress':'Best-ever progress';
  $('generation').textContent=String(s?.generation??1).padStart(3,'0');
  $('alive').textContent=String(s?.alive??settings.population);$('population-total').textContent=` / ${s?.settings.population??settings.population}`;
  $('best-progress').innerHTML=`${progress.toFixed(1)}<span>%</span>`;$('progress-fill').style.width=`${progress}%`;
  const currentCompletions=s?.cars.reduce((sum,c)=>sum+c.lapsCompleted,0)??0;
  $('completed-laps').textContent=String((s?.completedLaps??0)+currentCompletions);
  $('best-lap').innerHTML=s?.bestLapTime!=null?`${s.bestLapTime.toFixed(2)}<small> s</small>`:'—<small> s</small>';
  $('best-run').innerHTML=!s?.battery&&best?.score.completed?`${best.score.time.toFixed(2)}<small> s</small>`:'—<small> s</small>';
  $('lap-elite-time').textContent=s?.battery?'Off · aggregate selection only':s?.lapElite?`${s.lapElite.lapTime.toFixed(2)}s · GEN ${String(s.lapElite.generation).padStart(3,'0')}`:'Finish all laps';
  const laps=s?.settings.laps??settings.laps;
  $('target-caption').textContent=`${laps} ${laps===1?'LAP':'LAPS'} TARGET`;
  $('settings-state').textContent=s?.pending?'QUEUED':mode!=='train'?'TRAINING PAUSED':'APPLIED';
  $('setting-help').textContent=s?.pending?`Queued for generation ${String(s.generation+1).padStart(3,'0')}.`:'Changes join the next generation.';
  $<HTMLButtonElement>('save-button').disabled=!best;
  if(mode==='train'){
    $('stage-time').textContent=`${(s?.simTime??0).toFixed(1).padStart(4,'0')}s`;
    const leader=s?.cars.find(c=>c.id===s.leaderId);
    $('stage-laps').textContent=`LAP ${Math.min((leader?.lapsCompleted??0)+1,laps)} / ${laps}`;
  }
  drawHistory();
}
function drawHistory(){
  const history=snapshot?.history??[],svg=$('history-chart');
  let html='';
  for(const [y,label] of [[7,'100%'],[51,'50%'],[96,'0%']] as const)html+=`<text x="0" y="${y+2}">${label}</text><line x1="31" y1="${y}" x2="428" y2="${y}"/>`;
  if(history.length){
    const points=(kind:'best'|'average')=>history.map((d,i)=>`${31+i/Math.max(history.length-1,1)*395},${96-d[kind]*89}`).join(' ');
    const best=points('best');
    html+=`<polygon points="31,96 ${best} ${31+(history.length-1)/Math.max(history.length-1,1)*395},96" fill="#a9c27e" opacity=".12"/><polyline points="${points('average')}" fill="none" stroke="#bccca8" stroke-width="1.5"/><polyline points="${best}" fill="none" stroke="#789c4c" stroke-width="1.8"/>`;
    if(history.length===1)html+=`<circle cx="31" cy="${96-history[0].best*89}" r="2.5" fill="#789c4c"/>`;
  }
  svg.innerHTML=html;$('history-empty').classList.toggle('hidden',history.length>0);
  $('chart-start').textContent=`GEN ${String(history[0]?.generation??snapshot?.generation??1).padStart(3,'0')}`;
  $('chart-end').textContent=`GEN ${String(history.at(-1)?.generation??snapshot?.generation??1).padStart(3,'0')}`;
}
function drawNetwork(){
  const leaderId=snapshot?.leaderId,leader=snapshot?.cars.find(c=>c.id===leaderId);
  const shape=snapshot?.architecture??architecture,weights=snapshot?.leaderGenome;
  const layers=weights&&leader?activations(weights,leader.inputs,shape):shape.map(n=>Array(n).fill(0));
  const xs=shape.map((_,i)=>20+i/(shape.length-1)*260),ys=layers.map(a=>a.map((_,i)=>a.length===1?63:9+i/(a.length-1)*108));
  let html='';
  for(let l=0;l<layers.length-1;l++)for(let a=0;a<layers[l].length;a++)for(let b=0;b<layers[l+1].length;b++)html+=`<line x1="${xs[l]}" y1="${ys[l][a]}" x2="${xs[l+1]}" y2="${ys[l+1][b]}" stroke="#c9d8b8" stroke-width=".55" opacity="${shape.length>4?.15:.4}"/>`;
  for(let l=0;l<layers.length;l++)for(let i=0;i<layers[l].length;i++){
    const active=Math.abs(layers[l][i]),output=l===layers.length-1;
    html+=`<circle cx="${xs[l]}" cy="${ys[l][i]}" r="${shape[l]>16?2.1:output?4.3:3.2}" fill="${output?'#6f8b4c':'#a5be84'}" fill-opacity="${.25+.75*active}" stroke="#8ca76c" stroke-width=".8"/>`;
  }
  $('network-svg').innerHTML=html;
  $('network-svg').setAttribute('aria-label',`Neural network: ${shape.join(' → ')}. ${mode!=='train'?'Last training leader; paused during manual driving.':'Current leader activations.'}`);
  $('network-captions').innerHTML=shape.map((n,i)=>`<span>${n} ${i===0?'IN':i===shape.length-1?'OUT':`H${i}`}</span>`).join('');
}
function drawArchitectureEditor(){
  const hidden=architecture.slice(1,-1);
  $('layer-controls').innerHTML=hidden.map((n,i)=>`<div class="layer-chip"><label for="layer-${i}">H${i+1}</label><input id="layer-${i}" type="number" min="1" max="24" value="${n}" aria-label="Neurons in hidden layer ${i+1}"/><button data-remove-layer="${i}" aria-label="Remove hidden layer ${i+1}" ${hidden.length===1?'disabled':''}>×</button></div>`).join('');
  hidden.forEach((_,i)=>{
    const layerInput=$<HTMLInputElement>(`layer-${i}`);
    const commit=()=>{
      const input=$<HTMLInputElement>(`layer-${i}`),value=Number(input.value);
      if(!Number.isInteger(value)||value<1||value>MAX_NEURONS){input.value=String(hidden[i]);toast('Use 1–24 neurons per hidden layer.',true);return;}
      if(value===architecture[i+1])return;
      const next=[...hidden];next[i]=value;changeArchitecture([8,...next,2]);
    };
    layerInput.onchange=()=>{clearTimeout(neuronTimer);commit();};
    layerInput.oninput=()=>{clearTimeout(neuronTimer);neuronTimer=window.setTimeout(commit,500);};
    layerInput.onkeydown=event=>{if(event.key==='Enter'){clearTimeout(neuronTimer);commit();}};
  });
  document.querySelectorAll<HTMLButtonElement>('[data-remove-layer]').forEach(b=>b.onclick=()=>{
    const next=Array.from(document.querySelectorAll<HTMLInputElement>('#layer-controls input')).map(input=>Number(input.value));
    next.splice(Number(b.dataset.removeLayer),1);try{changeArchitecture([8,...next,2]);}catch{toast('Use 1–24 neurons per hidden layer.',true);}
  });
  $<HTMLButtonElement>('add-layer').disabled=hidden.length>=MAX_HIDDEN_LAYERS;
  $('weight-count').textContent=String(weightCount(architecture));
}
function changeArchitecture(next:Architecture){
  clearTimeout(neuronTimer);architecture=validateArchitecture(next);drawArchitectureEditor();initTraining();restartGhost();
  toast(`New brain: ${architecture.join(' → ')} · ${weightCount(architecture)} weights. Training restarted.`);
}
$('add-layer').onclick=()=>{
  if(architecture.length-2>=MAX_HIDDEN_LAYERS)return;
  const values=Array.from(document.querySelectorAll<HTMLInputElement>('#layer-controls input')).map(input=>Number(input.value));
  try{changeArchitecture([8,...values,12,2]);}catch{toast('Use 1–24 neurons per hidden layer.',true);}
};
worker.onmessage=(event:MessageEvent<Snapshot>)=>{if(event.data.epoch!==epoch)return;snapshot=event.data;updateMetrics();syncScene();};
worker.onerror=()=>{setRunning(false);toast('Training worker could not start. Try reloading this local page.',true);};
$('play-button').onclick=()=>setRunning(!running);
$('reset-button').onclick=()=>{if(mode!=='train'){restartDrive();return;}initTraining();restartGhost();toast(`Training reset · seed “${seed()}”`);};
$('test-mode').onclick=()=>{if(savedChampion)setMode('test');else toast('Save or import a champion first.',true);};
$('test-current').onclick=()=>{setMode('test');restartDrive();toast('Frozen brain on your current layout. No weights or obstacles changed.');};
$('test-heldout').onclick=()=>{if(savedChampion){post({type:'validate',champion:savedChampion});toast('Testing saved weights on reserved scenarios; no selection or mutation.');}};
$('apply-evaluation').onclick=()=>{diversityEnabled=$<HTMLSelectElement>('evaluation-mode').value==='diverse';diversityConfig={count:Number($<HTMLSelectElement>('scenario-count').value),difficulty:$<HTMLSelectElement>('diversity-level').value as DiversityConfig['difficulty']};initTraining();toast('Fresh population and comparison history for the new evaluation protocol.');};
$('train-mode').onclick=()=>setMode('train');$('drive-mode').onclick=()=>setMode('drive');$('restart-drive').onclick=restartDrive;
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b=>b.onclick=()=>{
  speed=Number(b.dataset.speed);post({type:'speed',value:speed});document.querySelectorAll('[data-speed]').forEach(el=>el.classList.toggle('active',el===b));
});
document.querySelectorAll<HTMLButtonElement>('[data-track]').forEach(b=>b.onclick=()=>switchTrack(b.dataset.track as TrackId));
function changeSettings(){
  settings={population:Number($<HTMLInputElement>('population').value),laps:Number($<HTMLInputElement>('laps').value),mutationRate:Number($<HTMLInputElement>('mutation-rate').value)/100,mutationStrength:Number($<HTMLInputElement>('mutation-strength').value)/100};
  $('laps-value').textContent=String(settings.laps);
  $('population-value').textContent=String(settings.population);$('mutation-rate-value').textContent=`${Math.round(settings.mutationRate*100)}%`;$('mutation-strength-value').textContent=settings.mutationStrength.toFixed(2);
  for(const id of ['population','laps','mutation-rate','mutation-strength']){const el=$<HTMLInputElement>(id);el.style.setProperty('--range',`${(Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min))*100}%`);}
}
for(const id of ['population','laps','mutation-rate','mutation-strength']){const el=$<HTMLInputElement>(id);el.oninput=changeSettings;el.onchange=()=>{changeSettings();post({type:'settings',value:settings});};}
$('seed-button').onclick=()=>{initTraining();restartGhost();toast(`A fresh population · seed “${seed()}”`);};
$<HTMLInputElement>('seed-input').onkeydown=e=>{if(e.key==='Enter')$('seed-button').click();};
$('save-button').onclick=()=>{
  if(!snapshot?.best)return;
  const c=snapshot.best;
  try{localStorage.setItem(storageKey(trackId),serializeChampion(c));savedChampion=deserializeChampion(serializeChampion(c));restartGhost();updateChampionCard();toast('Best driver saved in this browser.');}
  catch{toast('Browser storage could not save this driver. Export it as JSON instead.',true);savedChampion=c;updateChampionCard();}
};
$('load-button').onclick=()=>{const c=savedChampion??readSaved(trackId);if(!c){toast('No saved driver for this track.',true);return;}activateChampion(c);toast('Original saved scenario restored. Replaying the frozen brain.');};
$('export-button').onclick=()=>{
  if(!savedChampion)return;const blob=new Blob([serializeChampion(savedChampion)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`neurodrive-${savedChampion.track}-gen${savedChampion.generation}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Champion exported as versioned JSON.');
};
$('import-button').onclick=()=>$<HTMLInputElement>('import-file').click();
$<HTMLInputElement>('import-file').onchange=async()=>{
  const input=$<HTMLInputElement>('import-file'),file=input.files?.[0];if(!file)return;
  try{if(file.size>250_000)throw new Error('Champion file is too large (250 KB maximum).');const c=deserializeChampion(await file.text());
    savedChampion=c;updateChampionCard();
    try{localStorage.setItem(storageKey(c.track),serializeChampion(c));}catch{toast('Imported for this session; browser storage is unavailable.',true);}
    restartGhost();updateChampionCard();toast('Frozen brain imported. Current environment preserved; choose test current or replay original.');
  }catch(error){toast(error instanceof Error?error.message:'Could not read this champion file.',true);}finally{input.value='';}
};
$('transfer-button').onclick=()=>{if(savedChampion){switchTrack(trackId==='oval'?'technical':'oval',savedChampion);setMode('test');restartDrive();}};
$('ghost-toggle').onchange=()=>{restartGhost();updateChampionCard();};
$('how-button').onclick=()=>$<HTMLDialogElement>('how-dialog').showModal();$('close-dialog').onclick=()=>$<HTMLDialogElement>('how-dialog').close();
$<HTMLDialogElement>('how-dialog').onclick=e=>{if(e.target===$('how-dialog'))$<HTMLDialogElement>('how-dialog').close();};
$('edit-obstacles').onclick=beginObstacleEdit;
$('obstacle-add').onclick=()=>obstacleEditor.addMode();
$<HTMLSelectElement>('obstacle-kind').onchange=()=>{obstacleEditor.kind=$<HTMLSelectElement>('obstacle-kind').value as ObstacleKind;};
$('obstacle-rotate').onclick=()=>obstacleEditor.rotate();
$('obstacle-rotate-back').onclick=()=>obstacleEditor.rotate(-15);
$<HTMLInputElement>('obstacle-angle').oninput=event=>obstacleEditor.setRotation(Number((event.target as HTMLInputElement).value));
const angleInput=$<HTMLInputElement>('obstacle-angle-value');
const commitAngle=()=>{
  const input=angleInput,value=Number(input.value);
  if(!input.value.trim()||!Number.isInteger(value)||value<0||value>359){toast('Use a whole angle from 0° to 359°.',true);updateObstacleEditor();return;}
  obstacleEditor.setRotation(value);
};
angleInput.onchange=commitAngle;angleInput.onblur=commitAngle;
angleInput.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();commitAngle();}};
$('obstacle-remove').onclick=()=>obstacleEditor.remove();
$('obstacle-clear').onclick=()=>obstacleEditor.clear();
$('obstacle-cancel').onclick=()=>finishObstacleEdit(false);
$('obstacle-apply').onclick=()=>finishObstacleEdit(true);
const editing=(target:EventTarget|null)=>target instanceof HTMLInputElement||target instanceof HTMLSelectElement||target instanceof HTMLTextAreaElement||target instanceof HTMLButtonElement||$<HTMLDialogElement>('how-dialog').open;
window.addEventListener('keydown',e=>{
  if(obstacleEditor.active){
    const typing=e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement;
    if(!typing&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();obstacleEditor.remove();}
    if(e.key==='Escape'){e.preventDefault();finishObstacleEdit(false);}
    if(e.key.toLowerCase()==='r'&&!e.repeat&&e.target===canvas){e.preventDefault();obstacleEditor.rotate(e.shiftKey?-15:15);}
    return;
  }
  if(editing(e.target))return;
  const key=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' ','r'].includes(key))e.preventDefault();
  if(key===' '&&!e.repeat)setRunning(!running);
  if(key==='r'&&mode!=='train'&&!e.repeat)restartDrive();
  if(mode==='drive')keys.add(key);
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>keys.clear());
canvas.onclick=()=>canvas.focus({preventScroll:true});
function animate(now:number){
  const delta=Math.min((now-previousTime)/1000,.1);previousTime=now;
  if(running){
    accumulator+=delta*(mode==='train'?speed:1);
    while(accumulator>=DT){
      if(mode==='drive'&&player&&!obstacleEditor.active){const steer=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),accel=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0);stepCar(player,track,[steer,accel]);}
      if(mode==='test'&&player&&!obstacleEditor.active)stepCar(player,track);
      if(mode!=='test'&&!(mode==='train'&&snapshot?.battery)&&ghost&&$<HTMLInputElement>('ghost-toggle').checked){
        if(ghost.alive)stepCar(ghost,track);else if(mode==='train'){ghostWait+=DT;if(ghostWait>1)restartGhost();}
      }
      accumulator-=DT;
    }
  }
  renderer.draw({cars:snapshot?.cars??[],leaderId:snapshot?.leaderId??0,sensors:$<HTMLInputElement>('sensors-toggle').checked,leaderOnly:$<HTMLInputElement>('leader-toggle').checked,manual:player,ghost:mode!=='test'&&!(mode==='train'&&snapshot?.battery)&&$<HTMLInputElement>('ghost-toggle').checked?ghost:null,mode,generation:snapshot?.generation??1,editor:obstacleEditor.view()});
  if(now-uiTime>120){
    drawNetwork();
    if(mode!=='train'&&player&&!obstacleEditor.active){
      $('stage-laps').textContent=`LAP ${Math.min(player.lapsCompleted+1,player.targetLaps)} / ${player.targetLaps}`;
      $('stage-time').textContent=`${player.elapsed.toFixed(1)}s / ${(player.furthest/(track.length*player.targetLaps)*100).toFixed(1)}%`;
      $('status-text').textContent=!running?'PAUSED':player.alive?(mode==='test'?'FROZEN TEST':'MANUAL DRIVE'):player.completed?'RUN COMPLETE':player.reason==='collision'?'CRASHED · R TO RETRY':player.reason==='stalled'?'STALLED · R TO RETRY':'TIME UP · R TO RETRY';
      $('stage-mode').textContent=player.alive?(mode==='test'?'FROZEN WEIGHTS / NO LEARNING':'WASD / ARROW KEYS'):player.completed?`RUN COMPLETE · ${player.elapsed.toFixed(2)}s total`:`${player.reason?.toUpperCase()} · PRESS R TO RESTART`;
    }
    uiTime=now;
  }
  if(now-detailTime>400){networkInspector.update(snapshot,savedChampion);learningMetrics.update(snapshot);generalizationPanel.update(snapshot,player,mode==='test',track.length);detailTime=now;}
  requestAnimationFrame(animate);
}
track=createTrack(trackId,readLayout(trackId));renderer.setTrack(track);updateObstacleEditor();drawArchitectureEditor();changeSettings();savedChampion=readSaved(trackId);restartGhost();updateChampionCard();updateTransport();initTraining();requestAnimationFrame(animate);
