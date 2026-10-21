import { obstacleCorners, OBSTACLE_LABELS, type Obstacle } from '../core/obstacles';
import type { EditorView } from './obstacle-editor';
import type { Track } from '../core/track';
import { PHYSICS, SENSOR_ANGLES, type Car } from '../core/simulation';
import type { RunCarView } from '../protocol';
export interface RenderState {cars:(RunCarView&{inputs?:number[]})[];leaderId:number;sensors:boolean;leaderOnly:boolean;manual:Car|null;ghost:Car|null;mode:'train'|'drive'|'test';generation:number;editor?:EditorView;}
const path=(ctx:CanvasRenderingContext2D,points:{x:number;y:number}[])=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();};
function car(ctx:CanvasRenderingContext2D,c:{x:number;y:number;angle:number},color:string,opacity:number,highlight=false,ghost=false) {
  ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.angle);ctx.globalAlpha=opacity;
  if(highlight){ctx.shadowBlur=18;ctx.shadowColor=color;}
  ctx.fillStyle='#091411';
  for(const [x,y] of [[-7,-8],[5,-8],[-7,5],[5,5]])ctx.fillRect(x,y,5,3);
  ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(-12,-6,24,12,3);ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle=ghost?'#3c2a5b':'#152b24';ctx.beginPath();ctx.roundRect(0,-4.5,6,9,1.4);ctx.fill();
  ctx.fillStyle=ghost?'#665080':'#30463b';ctx.fillRect(-8,-4,4,8);
  ctx.fillStyle='#e9ffd7';ctx.fillRect(9,-4.5,2,2);ctx.fillRect(9,2.5,2,2);
  if(ghost){ctx.strokeStyle='#e1ccff';ctx.lineWidth=1.1;ctx.strokeRect(-12,-6,24,12);}
  ctx.restore();
}
function barrier(ctx:CanvasRenderingContext2D,o:Obstacle,selected=false,invalid=false){
  const polygon=obstacleCorners(o),kind=o.kind??'barrier';
  const color={barrier:'#d88145',circle:'#66b7bd',triangle:'#dfb955',block:'#a697c8',long:'#d88145'}[kind];
  ctx.save();ctx.shadowColor='#080e0bcc';ctx.shadowBlur=3;ctx.shadowOffsetX=2;ctx.shadowOffsetY=4;
  path(ctx,polygon);ctx.fillStyle=color;ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
  ctx.save();path(ctx,polygon);ctx.clip();ctx.translate(o.x,o.y);ctx.rotate(o.angle);
  ctx.strokeStyle='#fff0d3';ctx.lineWidth=5;
  if(kind==='barrier'||kind==='long'){
    for(let x=-60;x<90;x+=14){ctx.beginPath();ctx.moveTo(x,-25);ctx.lineTo(x-50,25);ctx.stroke();}
  }else if(kind==='circle'){
    ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.lineWidth=3;ctx.stroke();
  }else if(kind==='triangle'){
    ctx.fillStyle='#564b29';ctx.font='bold 18px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',-5,1);
  }else{ctx.lineWidth=2;ctx.strokeRect(-9,-9,18,18);}
  ctx.restore();path(ctx,polygon);ctx.strokeStyle='#1f3024';ctx.lineWidth=1.6;ctx.stroke();
  if(selected){
    ctx.translate(o.x,o.y);ctx.scale(1.18,1.18);ctx.translate(-o.x,-o.y);
    path(ctx,polygon);ctx.strokeStyle=invalid?'#fc8971':'#e4f8a5';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.stroke();
  }
  ctx.restore();
  if(selected){ctx.fillStyle=invalid?'#fc8971':'#e4f8a5';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText(`${OBSTACLE_LABELS[kind].toUpperCase()} ${o.id+1}`,o.x,Math.min(...polygon.map(p=>p.y))-12);}
}
export class TrackRenderer {
  private ctx:CanvasRenderingContext2D;private width=0;private height=0;private dpr=1;private background:HTMLCanvasElement;
  constructor(private canvas:HTMLCanvasElement,private track:Track,private backgroundScale=1.6){this.ctx=canvas.getContext('2d')!;this.background=document.createElement('canvas');this.makeBackground();}
  setTrack(track:Track){this.track=track;this.makeBackground();}
  resize(){
    const rect=this.canvas.getBoundingClientRect();this.width=rect.width;this.height=rect.height;this.dpr=Math.min(devicePixelRatio||1,2);
    if(this.canvas.width!==Math.round(rect.width*this.dpr)||this.canvas.height!==Math.round(rect.height*this.dpr)){
      this.canvas.width=Math.round(rect.width*this.dpr);this.canvas.height=Math.round(rect.height*this.dpr);
    }
  }
  private makeBackground(){
    this.background.width=1000*this.backgroundScale;this.background.height=700*this.backgroundScale;const ctx=this.background.getContext('2d')!;ctx.scale(this.backgroundScale,this.backgroundScale);
    const t=this.track;
    ctx.fillStyle='#131e1a';ctx.fillRect(0,0,1000,700);
    const grad=ctx.createRadialGradient(480,345,60,480,345,570);grad.addColorStop(0,'#1d3025');grad.addColorStop(1,'#111b17');ctx.fillStyle=grad;ctx.fillRect(0,0,1000,700);
    ctx.strokeStyle='#25352b';ctx.lineWidth=.6;
    for(let x=0;x<=1000;x+=35){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,700);ctx.stroke();}
    for(let y=0;y<=700;y+=35){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1000,y);ctx.stroke();}
    // Border runoff, then asphalt, then the infield. No image or external asset needed.
    path(ctx,t.outer);ctx.lineWidth=20;ctx.strokeStyle='#0b120f';ctx.stroke();
    path(ctx,t.inner);ctx.lineWidth=20;ctx.stroke();
    path(ctx,t.outer);ctx.fillStyle='#2a332e';ctx.fill();
    path(ctx,t.inner);ctx.fillStyle='#19271f';ctx.fill();
    for(const edge of [t.outer,t.inner]){
      path(ctx,edge);ctx.strokeStyle='#455749';ctx.lineWidth=5;ctx.stroke();
      ctx.setLineDash([12,13]);ctx.strokeStyle='#83927b';ctx.lineWidth=3;ctx.stroke();ctx.setLineDash([]);
    }
    path(ctx,t.points);ctx.strokeStyle='#76857333';ctx.lineWidth=1;ctx.setLineDash([8,13]);ctx.stroke();ctx.setLineDash([]);
    for(let i=1;i<t.gates.length;i++) {
      const g=t.gates[i];ctx.strokeStyle='#a4c38b0e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(g.a.x,g.a.y);ctx.lineTo(g.b.x,g.b.y);ctx.stroke();
    }
    const gate=t.gates[0],dx=gate.b.x-gate.a.x,dy=gate.b.y-gate.a.y;
    for(let i=0;i<12;i++)for(let j=0;j<2;j++){
      const p={x:gate.a.x+dx*i/12+gate.forward.x*(j-.5)*6,y:gate.a.y+dy*i/12+gate.forward.y*(j-.5)*6};
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(t.heading);ctx.fillStyle=(i+j)%2?'#243128':'#ced5ba';ctx.fillRect(-3,0,6,t.width/12);ctx.restore();
    }
    ctx.save();ctx.translate(t.spawn.x+gate.forward.x*50,t.spawn.y+78);ctx.font='10px monospace';ctx.fillStyle='#91a087';ctx.fillText('START / FINISH',-50,0);ctx.restore();
    if(t.id==='oval') {
      ctx.textAlign='center';ctx.fillStyle='#354a37';ctx.font='700 66px "Arial",sans-serif';ctx.fillText('NEURO',500,326);ctx.fillText('DRIVE.',500,387);
      ctx.font='10px monospace';ctx.fillStyle='#6b8068';ctx.fillText('A LITTLE BETTER. EVERY GENERATION.',500,422);
    }else{ctx.font='700 34px Arial';ctx.fillStyle='#38513d';ctx.fillText('SWITCHBACK',280,370);ctx.font='10px monospace';ctx.fillStyle='#799171';ctx.fillText('ADAPT TO THE UNFAMILIAR',280,394);}
    // Restrained technical framing.
    ctx.strokeStyle='#75936d60';ctx.lineWidth=1;
    for(const [x,y,sx,sy] of [[42,42,1,1],[958,42,-1,1],[42,658,1,-1],[958,658,-1,-1]]){
      ctx.beginPath();ctx.moveTo(x,y+sy*14);ctx.lineTo(x,y);ctx.lineTo(x+sx*14,y);ctx.stroke();
    }
  }
  draw(state:RenderState){
    this.resize();const ctx=this.ctx,w=this.width,h=this.height;if(!w||!h)return;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.fillStyle='#131e1a';ctx.fillRect(0,0,w,h);
    const scale=Math.min(w/1000,h/700),ox=(w-1000*scale)/2,oy=(h-700*scale)/2;
    ctx.translate(ox,oy);ctx.scale(scale,scale);ctx.drawImage(this.background,0,0,1000,700);
    for(const o of state.editor?.obstacles??this.track.obstacles)barrier(ctx,o,state.editor?.selected===o.id,state.editor?.invalid);
    if(state.editor)return;
    const leader=state.mode!=='train'?state.manual:state.cars.find(c=>c.id===state.leaderId);
    if(state.mode==='train') {
      for(const c of state.cars)if(c.id!==state.leaderId&&!state.leaderOnly)car(ctx,c,c.alive?'#90cba0':'#849287',c.alive?.27:.12);
    }
    if(state.ghost)car(ctx,state.ghost,'#b9a0ef',.8,false,true);
    if(leader&&state.sensors){
      ctx.lineWidth=1;
      SENSOR_ANGLES.forEach((a,i)=>{
        const angle=leader.angle+a,ratio=leader.inputs?.[i]??1,length=ratio*PHYSICS.sensorRange;
        ctx.strokeStyle='#d4f57735';ctx.beginPath();ctx.moveTo(leader.x,leader.y);ctx.lineTo(leader.x+Math.cos(angle)*PHYSICS.sensorRange,leader.y+Math.sin(angle)*PHYSICS.sensorRange);ctx.stroke();
        ctx.strokeStyle='#ddf88b88';ctx.beginPath();ctx.moveTo(leader.x,leader.y);ctx.lineTo(leader.x+Math.cos(angle)*length,leader.y+Math.sin(angle)*length);ctx.stroke();
        ctx.fillStyle='#e0fa9c';ctx.beginPath();ctx.arc(leader.x+Math.cos(angle)*length,leader.y+Math.sin(angle)*length,2,0,Math.PI*2);ctx.fill();
      });
    }
    if(leader){
      car(ctx,leader,state.mode==='test'?'#b9a0ef':state.mode==='drive'?'#f4f6df':'#dcf991',1,true);
      ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillStyle=state.mode==='drive'?'#f4f6df':'#d9f48a';
      ctx.fillText(state.mode==='test'?'FROZEN CHAMPION':state.mode==='drive'?'YOU':`LEADER ${String(leader.id+1).padStart(3,'0')}`,leader.x,leader.y-23);
    }
  }
}
