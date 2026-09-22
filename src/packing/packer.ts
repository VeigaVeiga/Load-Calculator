import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, inBounds, overlap, supportRatio } from './geometry'

const EPS = 0.5
const STEP = 10
const SUPPORT = 0.98
const snap = (n:number) => Math.max(0, Math.round(n / STEP) * STEP)
type Ori = { length:number; width:number; height:number; rotation:0|90 }
type Unit = { cargo:Cargo; index:number }

function orientations(c:Cargo):Ori[]{
  const a:Ori={length:c.length,width:c.width,height:c.height,rotation:0}
  if(!c.rotatable||Math.abs(c.length-c.width)<EPS)return[a]
  return[a,{length:c.width,width:c.length,height:c.height,rotation:90}]
}

export function expandCargo(cargo:Cargo[]):Unit[]{
  const out:Unit[]=[]
  for(const c of cargo){const n=Math.max(0,Math.floor(c.quantity));for(let i=0;i<n;i++)out.push({cargo:c,index:i})}
  return out
}

function makePlaced(u:Unit,o:Ori,x:number,y:number,z:number):PlacedCargo{return {id:`${u.cargo.id}-${u.index+1}`,cargoId:u.cargo.id,cargoType:u.cargo.type,x:snap(x),y:snap(y),z:snap(z),length:u.cargo.length,width:u.cargo.width,height:o.height,weight:u.cargo.weight,color:u.cargo.color,rotation:o.rotation,placementMode:'automatic',locked:false}}

function units(cargo:Cargo[]){
  const out=expandCargo(cargo).filter(u=>u.cargo.length>0&&u.cargo.width>0&&u.cargo.height>0)
  out.sort((a,b)=>{const av=a.cargo.length*a.cargo.width*a.cargo.height,bv=b.cargo.length*b.cargo.width*b.cargo.height;return (bv-av)||(b.cargo.loadBearing?1:0)-(a.cargo.loadBearing?1:0)||(b.cargo.stackable?1:0)-(a.cargo.stackable?1:0)})
  return out
}

function supports(p:PlacedCargo,items:PlacedCargo[]){const d=dims(p);return items.filter(q=>Math.abs(q.z+q.height-p.z)<=3&&Math.max(0,Math.min(p.x+d.length,q.x+dims(q).length)-Math.max(p.x,q.x))>EPS&&Math.max(0,Math.min(p.y+d.width,q.y+dims(q).width)-Math.max(p.y,q.y))>EPS)}
function stackLevel(p:PlacedCargo,items:PlacedCargo[],seen=new Set<string>()):number{if(p.z<=EPS||seen.has(p.id))return 1;seen.add(p.id);const s=supports(p,items);return s.length?1+Math.max(...s.map(q=>stackLevel(q,items,new Set(seen)))):1}
function loadAbove(q:PlacedCargo,items:PlacedCargo[]){return items.filter(p=>p.id!==q.id&&Math.abs(q.z+q.height-p.z)<=3).reduce((s,p)=>s+p.weight,0)}
function canStack(p:PlacedCargo,c:Cargo,items:PlacedCargo[],defs:Map<string,Cargo>){
  if(p.z<=EPS)return true;if(!c.stackable)return false
  const s=supports(p,items);if(!s.length||supportRatio(p,items)<SUPPORT)return false
  const configured=Math.floor(c.maxStackLayers||0),maxLayers=configured>0?configured:Number.POSITIVE_INFINITY
  if(stackLevel(p,items)>maxLayers)return false
  return s.every(q=>{const d=defs.get(q.cargoId);if(!d||!d.loadBearing||d.breakablePallet)return false;return !Number.isFinite(d.maxLoadOnTop)||d.maxLoadOnTop<=0||loadAbove(q,items)+c.weight<=d.maxLoadOnTop+EPS})
}
function validLocked(lock:PlacedCargo[],c:Container,qty:Map<string,number>){const out:PlacedCargo[]=[];for(const p of lock){if(!qty.get(p.cargoId)||!inBounds(p,c)||out.some(q=>overlap(p,q)))continue;out.push(p)}return out}
function overlapsAny(p:PlacedCargo,items:PlacedCargo[]){return items.some(q=>overlap(p,q))}
function floorPositions(c:Container,o:Ori){
  const maxX=Math.max(0,c.length-o.length),maxY=Math.max(0,c.width-o.width),xs:number[]=[],ys:number[]=[]
  for(let x=0;x<=maxX+EPS;x+=STEP)xs.push(Math.min(x,maxX));for(let y=0;y<=maxY+EPS;y+=STEP)ys.push(Math.min(y,maxY));if(xs[xs.length-1]!==maxX)xs.push(maxX);if(ys[ys.length-1]!==maxY)ys.push(maxY)
  const cx=maxX/2,cy=maxY/2;xs.sort((a,b)=>Math.abs(a-cx)-Math.abs(b-cy)||a-b);ys.sort((a,b)=>Math.abs(a-cy)-Math.abs(b-cy)||a-b)
  const out:{x:number;y:number;distance:number}[]=[];for(const y of ys)for(const x of xs)out.push({x,y,distance:Math.hypot(x+o.length/2-c.length/2,y+o.width/2-c.width/2)});return out
}
function stackPositions(items:PlacedCargo[],c:Container,o:Ori){
  const out:{x:number;y:number;z:number;distance:number}[]=[],seen=new Set<string>(),sources=items.slice().sort((a,b)=>a.z-b.z||a.y-b.y||a.x-b.x)
  for(const q of sources){const qd=dims(q),z=q.z+q.height,xs=[q.x,q.x+qd.length-o.length,q.x+(qd.length-o.length)/2],ys=[q.y,q.y+qd.width-o.width,q.y+(qd.width-o.width)/2];for(const x of xs)for(const y of ys){const xx=Math.max(0,Math.min(c.length-o.length,snap(x))),yy=Math.max(0,Math.min(c.width-o.width,snap(y))),key=`${xx}:${yy}:${z}`;if(seen.has(key)||xx+o.length>c.length||yy+o.width>c.width)continue;seen.add(key);out.push({x:xx,y:yy,z,distance:Math.hypot(xx+o.length/2-c.length/2,yy+o.width/2-c.width/2)})}}
  return out.sort((a,b)=>a.z-b.z||a.distance-b.distance||a.y-b.y||a.x-b.x)
}
function choose(u:Unit,items:PlacedCargo[],c:Container,defs:Map<string,Cargo>){
  for(const o of orientations(u.cargo))for(const pos of floorPositions(c,o)){const p=makePlaced(u,o,pos.x,pos.y,0);if(inBounds(p,c)&&!overlapsAny(p,items))return p}
  if(!u.cargo.stackable)return undefined
  for(const o of orientations(u.cargo))for(const pos of stackPositions(items,c,o)){const p=makePlaced(u,o,pos.x,pos.y,pos.z);if(inBounds(p,c)&&!overlapsAny(p,items)&&canStack(p,u.cargo,items,defs))return p}
  return undefined
}
function buildState(cargo:Cargo[],c:Container,locked:PlacedCargo[]){const defs=new Map(cargo.map(x=>[x.id,x])),qty=new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)])),items=validLocked(locked,c,qty),count=new Map<string,number>();for(const p of items)count.set(p.cargoId,(count.get(p.cargoId)||0)+1);const us=units(cargo).filter(u=>u.index>=(count.get(u.cargo.id)||0));return {defs,items,us}}
function sameCargo(a:Cargo,b:Cargo){return a.id===b.id&&a.length===b.length&&a.width===b.width&&a.height===b.height&&a.weight===b.weight&&a.stackable===b.stackable&&a.loadBearing===b.loadBearing&&a.rotatable===b.rotatable&&a.maxStackLayers===b.maxStackLayers&&a.maxLoadOnTop===b.maxLoadOnTop}
function uniformSignature(c:Cargo){return `${c.length}|${c.width}|${c.height}|${c.weight}|${c.stackable}|${c.loadBearing}|${c.rotatable}|${c.maxStackLayers}|${c.maxLoadOnTop}|${c.breakablePallet}`}

function fastUniformGroup(state:ReturnType<typeof buildState>,group:Unit[],c:Container,step?:(done:number,total:number)=>void){
  if(!group.length)return true;const base=group[0].cargo;if(!group.every(u=>sameCargo(u.cargo,base)))return false
  const choices=orientations(base).map(o=>{const cols=Math.floor(c.length/o.length),rows=Math.floor(c.width/o.width);return {o,cols,rows,perLayer:cols*rows}}).sort((a,b)=>b.perLayer-a.perLayer),best=choices[0];if(!best||best.perLayer<=0)return false
  let maxLayers=Math.floor(c.height/best.o.height);const configured=Math.floor(base.maxStackLayers||0);if(!base.stackable)maxLayers=1;else if(configured>0)maxLayers=Math.min(maxLayers,configured);if(Number.isFinite(base.maxLoadOnTop)&&base.maxLoadOnTop>0&&base.weight>0)maxLayers=Math.min(maxLayers,Math.floor(base.maxLoadOnTop/base.weight)+1);maxLayers=Math.max(1,maxLayers)
  let done=0
  for(let layer=0;layer<maxLayers&&done<group.length;layer++){
    const z=layer*best.o.height,xOffset=Math.max(0,(c.length-best.cols*best.o.length)/2),yOffset=Math.max(0,(c.width-best.rows*best.o.width)/2),slots:{x:number;y:number;d:number}[]=[]
    for(let row=0;row<best.rows;row++)for(let col=0;col<best.cols;col++){const x=xOffset+col*best.o.length,y=yOffset+row*best.o.width;slots.push({x,y,d:Math.hypot(x+best.o.length/2-c.length/2,y+best.o.width/2-c.width/2)})}
    slots.sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x)
    for(const slot of slots){if(done>=group.length)break;const u=group[done],p=makePlaced(u,best.o,slot.x,slot.y,z);if(!inBounds(p,c)||overlapsAny(p,state.items))continue;if(z>0&&!canStack(p,base,state.items,state.defs))continue;state.items.push(p);done++;step?.(done,group.length)}
  }
  return done===group.length
}
function fastUniformPack(state:ReturnType<typeof buildState>,c:Container,step?:(i:number,n:number)=>void){if(state.items.length!==0||state.us.length<40)return false;return fastUniformGroup(state,state.us,c,step)}
function placeOne(state:ReturnType<typeof buildState>,u:Unit,c:Container){const p=choose(u,state.items,c,state.defs);if(p)state.items.push(p)}
function pack(cargo:Cargo[],c:Container,locked:PlacedCargo[],step?:(i:number,n:number)=>void){const state=buildState(cargo,c,locked);if(fastUniformPack(state,c,step))return state.items;for(let i=0;i<state.us.length;i++){placeOne(state,state.us[i],c);step?.(i+1,state.us.length)}return state.items}
export function autoPack(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[]){return pack(cargo,c,locked)}

export async function autoPackAsync(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[],progress?:(percent:number)=>void){
  const state=buildState(cargo,c,locked),n=state.us.length;if(n===0){progress?.(100);return state.items}
  let last=-1;const report=(i:number,total:number)=>{const p=Math.min(100,Math.round(i/Math.max(1,total)*100));if(p!==last){last=p;progress?.(p)}}
  if(fastUniformPack(state,c,report)){progress?.(100);return state.items}
  const groups=new Map<string,Unit[]>();for(const u of state.us){const key=uniformSignature(u.cargo);const g=groups.get(key)||[];g.push(u);groups.set(key,g)}
  if(groups.size>1){
    const total=n;let done=0
    for(const group of groups.values()){
      const ok=fastUniformGroup(state,group,c,(i)=>report(done+i,total))
      if(ok){done+=group.length;report(done,total)}
      else{
        for(const u of group){placeOne(state,u,c);done++;report(done,total);if((done&3)===0)await new Promise<void>(resolve=>setTimeout(resolve,0))}
      }
      await new Promise<void>(resolve=>setTimeout(resolve,0))
    }
    progress?.(100);return state.items
  }
  for(let i=0;i<n;i++){placeOne(state,state.us[i],c);report(i+1,n);if((i&3)===3)await new Promise<void>(resolve=>setTimeout(resolve,0))}
  progress?.(100);return state.items
}