import { pointInPolygon, type Vec } from '../core/math';
import { MAX_OBSTACLES, obstacleCorners, type Obstacle, type ObstacleKind } from '../core/obstacles';
import { canPlaceObstacle, nearestHeading, type Track } from '../core/track';
export interface EditorView {obstacles:Obstacle[];selected:number|null;invalid:boolean}
export class ObstacleEditor {
  active=false;adding=false;selected:number|null=null;invalid=false;draft:Obstacle[]=[];kind:ObstacleKind='barrier';
  private drag:{id:number;pointer:number;dx:number;dy:number;original:Obstacle}|null=null;
  constructor(private canvas:HTMLCanvasElement,private getTrack:()=>Track,private changed:()=>void,private feedback:(message:string)=>void){
    canvas.addEventListener('pointerdown',event=>this.down(event));
    canvas.addEventListener('pointermove',event=>this.move(event));
    canvas.addEventListener('pointerup',event=>this.up(event));
    canvas.addEventListener('pointercancel',event=>this.up(event,true));
    canvas.addEventListener('lostpointercapture',event=>{if(this.drag)this.up(event,true);});
  }
  begin(){this.active=true;this.adding=false;this.selected=null;this.invalid=false;this.draft=this.getTrack().obstacles.map(o=>({...o}));this.changed();}
  end(){this.stopDrag();this.active=false;this.selected=null;this.adding=false;this.invalid=false;this.changed();}
  view():EditorView|undefined{return this.active?{obstacles:this.draft,selected:this.selected,invalid:this.invalid}:undefined;}
  addMode(){if(this.draft.length>=MAX_OBSTACLES)return;this.adding=!this.adding;this.selected=null;this.changed();}
  remove(){if(this.selected===null)return;this.stopDrag();this.invalid=false;this.draft=this.draft.filter(o=>o.id!==this.selected);this.selected=null;this.changed();}
  clear(){this.stopDrag();this.invalid=false;this.draft=[];this.selected=null;this.adding=false;this.changed();}
  rotate(degrees=15){
    const o=this.draft.find(o=>o.id===this.selected);if(!o)return;
    if(this.drag&&this.invalid)Object.assign(o,this.drag.original);
    this.setRotation(o.angle*180/Math.PI+degrees);
  }
  setRotation(degrees:number){
    const o=this.draft.find(o=>o.id===this.selected);if(!o||!Number.isFinite(degrees))return;
    if(this.drag&&this.invalid)Object.assign(o,this.drag.original);
    this.stopDrag();this.invalid=false;
    const next={...o,angle:((degrees%360+360)%360)*Math.PI/180};
    if(canPlaceObstacle(this.getTrack(),next))Object.assign(o,next);else this.feedback('This rotation extends beyond the asphalt.');
    this.changed();
  }
  private stopDrag(){
    const drag=this.drag;this.drag=null;
    if(drag&&this.canvas.hasPointerCapture(drag.pointer))this.canvas.releasePointerCapture(drag.pointer);
  }
  private world(event:PointerEvent):Vec {
    const r=this.canvas.getBoundingClientRect(),scale=Math.min(r.width/1000,r.height/700);
    return {x:Math.round(((event.clientX-r.left-(r.width-1000*scale)/2)/scale)*10)/10,y:Math.round(((event.clientY-r.top-(r.height-700*scale)/2)/scale)*10)/10};
  }
  private down(event:PointerEvent){
    if(!this.active||event.button!==0)return;
    event.preventDefault();this.canvas.focus({preventScroll:true});const p=this.world(event);
    const hit=[...this.draft].reverse().find(o=>pointInPolygon(p,obstacleCorners(o)));
    if(hit){
      this.selected=hit.id;this.adding=false;this.drag={id:hit.id,pointer:event.pointerId,dx:hit.x-p.x,dy:hit.y-p.y,original:{...hit}};
      this.canvas.setPointerCapture(event.pointerId);
    }else if(this.adding&&this.draft.length<MAX_OBSTACLES){
      let id=0;while(this.draft.some(o=>o.id===id))id++;
      const obstacle={id,...p,angle:nearestHeading(this.getTrack(),p),kind:this.kind};
      if(!canPlaceObstacle(this.getTrack(),obstacle)){this.feedback('Place the obstacle fully on the asphalt, away from the starting grid.');return;}
      this.draft.push(obstacle);this.selected=obstacle.id;this.adding=false;
    }else this.selected=null;
    this.changed();
  }
  private move(event:PointerEvent){
    if(!this.active||!this.drag||event.pointerId!==this.drag.pointer)return;
    const p=this.world(event),o=this.draft.find(o=>o.id===this.drag!.id)!;
    o.x=p.x+this.drag.dx;o.y=p.y+this.drag.dy;
    this.invalid=!canPlaceObstacle(this.getTrack(),o);this.changed();
  }
  private up(event:PointerEvent,cancel=false){
    if(!this.active||!this.drag||event.pointerId!==this.drag.pointer)return;
    const drag=this.drag;this.drag=null;
    if(cancel||this.invalid){const i=this.draft.findIndex(o=>o.id===drag.id);if(i>=0)this.draft[i]=drag.original;if(this.invalid)this.feedback('Invalid position. The barrier returned to its previous spot.');}
    this.invalid=false;
    if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
    this.changed();
  }
}
