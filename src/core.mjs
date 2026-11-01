import {sampleCurve,pathNode,validateLEDPath,validateLED,animationTime} from './led.mjs';
import polygonClipping from './vendor/polygon-clipping.mjs';
export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function newProject() {
  return { version: 5, clock:{elapsed:0,startedAt:Date.now()}, name: 'Untitled mapping', width: 1920, height: 1080, surfaces: [], assets: [], blackout: false, calibration: false, isolate: null, playing: true };
}
export function newLayer(type, assetId = null) {
  return { id: uid(), type, assetId, name: type === 'text' ? 'Text' : type === 'color' ? 'Solid color' : type === 'grid' ? 'Alignment grid' : type,
    visible: true, opacity: 1, fit: 'cover', scale: 1, scaleX:1,scaleY:1,keepAspect:true,rotation:0,mirrorX:false,mirrorY:false, x: 0, y: 0, color: '#51e2bc', text: 'YOUR TEXT', font: 'sans-serif', fontSize: 100, align: 'center', loop: true, speed: 1 };
}
export function newSurface(type = 'quad', polygon = null) {
  let corners = [{ x: .2, y: .2 }, { x: .8, y: .2 }, { x: .8, y: .8 }, { x: .2, y: .8 }];
  let mask = null;
  if (polygon) {
    const minX = Math.min(...polygon.map(p => p.x)), minY = Math.min(...polygon.map(p => p.y));
    const w = Math.max(.001, Math.max(...polygon.map(p => p.x)) - minX), h = Math.max(.001, Math.max(...polygon.map(p => p.y)) - minY);
    corners = [{x:minX,y:minY},{x:minX+w,y:minY},{x:minX+w,y:minY+h},{x:minX,y:minY+h}];
    mask = polygon.map(p => ({x:(p.x-minX)/w,y:(p.y-minY)/h}));
  }
  return { id: uid(), name: type === 'polygon' ? 'Traced surface' : type === 'ellipse' ? 'Ellipse' : 'Surface', type,
    visible: true, locked: false, opacity: 1, brightness: 1, outline:{enabled:true,color:'#71e2bf',width:3},transform:{rotation:0,scaleX:1,scaleY:1,mirrorX:false,mirrorY:false},corners, mask, mesh: null, holes: [], layers: [newLayer('grid')] };
}
// Homography from a unit square to four clockwise destination corners.
export function homography(p) {
  const [a,b,c,d] = p, dx1=b.x-c.x, dx2=d.x-c.x, dx3=a.x-b.x+c.x-d.x;
  const dy1=b.y-c.y, dy2=d.y-c.y, dy3=a.y-b.y+c.y-d.y;
  const det=dx1*dy2-dx2*dy1;
  let g=0,h=0;
  if (Math.abs(det)>1e-10) { g=(dx3*dy2-dx2*dy3)/det; h=(dx1*dy3-dx3*dy1)/det; }
  return [b.x-a.x+g*b.x,d.x-a.x+h*d.x,a.x,b.y-a.y+g*b.y,d.y-a.y+h*d.y,a.y,g,h];
}
export function project(h,u,v) {
  const w=h[6]*u+h[7]*v+1;
  return {x:(h[0]*u+h[1]*v+h[2])/w,y:(h[3]*u+h[4]*v+h[5])/w,q:1/w};
}
export function unproject(h,x,y) {
  const a=h[0]-x*h[6], b=h[1]-x*h[7], c=x-h[2];
  const d=h[3]-y*h[6], e=h[4]-y*h[7], f=y-h[5], det=a*e-b*d;
  if (Math.abs(det)<1e-10) return {x:0,y:0};
  return {x:(c*e-b*f)/det,y:(a*f-c*d)/det};
}
export function createMesh(surface, divisions=3) {
  const h=homography(surface.corners), points=[];
  for(let y=0;y<=divisions;y++) for(let x=0;x<=divisions;x++) { const p=project(h,x/divisions,y/divisions); points.push({x:p.x,y:p.y}); }
  return {divisions,points};
}
export function meshPoint(surface,u,v) {
  if(!surface.mesh) return project(homography(surface.corners),u,v);
  const {divisions:n,points}=surface.mesh;
  const ix=Math.max(0,Math.min(n-1,Math.floor(u*n))),iy=Math.max(0,Math.min(n-1,Math.floor(v*n))),fx=u*n-ix,fy=v*n-iy;
  const a=points[iy*(n+1)+ix],b=points[iy*(n+1)+ix+1],c=points[(iy+1)*(n+1)+ix],d=points[(iy+1)*(n+1)+ix+1];
  return {x:a.x*(1-fx)*(1-fy)+b.x*fx*(1-fy)+c.x*(1-fx)*fy+d.x*fx*fy,
    y:a.y*(1-fx)*(1-fy)+b.y*fx*(1-fy)+c.y*(1-fx)*fy+d.y*fx*fy,q:1};
}
export function geometry(surface,steps=24) {
  const h=homography(surface.corners), verts=[];
  const point=(u,v) => {
    const p=surface.mesh?meshPoint(surface,u,v):project(h,u,v),q=p.q??1;
    return [p.x*2-1,1-p.y*2,u*q,v*q,q];
  };
  for(let y=0;y<steps;y++) for(let x=0;x<steps;x++) {
    const a=point(x/steps,y/steps),b=point((x+1)/steps,y/steps),c=point((x+1)/steps,(y+1)/steps),d=point(x/steps,(y+1)/steps);
    verts.push(...a,...b,...c,...a,...c,...d);
  }
  return new Float32Array(verts);
}
export function pointInPolygon(point, points) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j];
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
export function validateProject(value) {
  if(!value||![1,2,3,4,5].includes(value.version)) throw new Error('Unsupported project format. Expected a Surface version 1 through 5 project.');
  const num=(v,min,max) => typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  const point=p=>p&&num(p.x,-10,10)&&num(p.y,-10,10);
  const polygon=p=>Array.isArray(p)&&p.length>=3&&p.length<=8192&&p.every(point);
  if(!num(value.width,320,7680)||!num(value.height,240,4320)||!Number.isInteger(value.width)||!Number.isInteger(value.height)) throw new Error('Invalid output resolution.');
  if(!Array.isArray(value.surfaces)||value.surfaces.length>100||!Array.isArray(value.assets)||value.assets.length>500) throw new Error('Invalid project contents.');
  const ids=new Set();
  for(const asset of value.assets) {
    if(!asset||typeof asset.id!=='string'||ids.has(asset.id)||!['image','video'].includes(asset.type)||typeof asset.name!=='string') throw new Error('Invalid media entry.');
    ids.add(asset.id);
  }
  if(value.clock!==undefined&&(!value.clock||!num(value.clock.elapsed,0,1e12)||!num(value.clock.startedAt,0,1e15)))throw new Error('Invalid animation clock.');
  const surfaceIds=new Set();
  for(const s of value.surfaces) {
    if(!s||typeof s.id!=='string'||surfaceIds.has(s.id)||typeof s.name!=='string'||!['quad','ellipse','polygon'].includes(s.type)||!Array.isArray(s.corners)||s.corners.length!==4||!s.corners.every(point)) throw new Error('Invalid surface geometry.');
    surfaceIds.add(s.id);
    const cross=s.corners.map((a,i)=>{const b=s.corners[(i+1)%4],c=s.corners[(i+2)%4];return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);});
    if(!cross.every(v=>v>1e-10)&&!cross.every(v=>v< -1e-10))throw new Error('Surface corners must form a convex, non-collapsed quad.');
    if(s.path!==undefined&&!validateLEDPath(s.path))throw new Error('Invalid Bézier path.');
    if(s.led!==undefined&&(!validateLED(s.led)||!s.path))throw new Error('Invalid LED strip settings.');
    if(s.contentAspect!==undefined&&!num(s.contentAspect,.01,100))throw new Error('Invalid content aspect ratio.');
    if(s.outline!==undefined&&(!s.outline||typeof s.outline.enabled!=='boolean'||typeof s.outline.color!=='string'||!/^#[0-9a-f]{6}$/i.test(s.outline.color)||!num(s.outline.width,1,100)))throw new Error('Invalid outline settings.');
    if(s.transform!==undefined&&(!s.transform||!num(s.transform.rotation,-36000,36000)||!num(s.transform.scaleX,.05,10)||!num(s.transform.scaleY,.05,10)||typeof s.transform.mirrorX!=='boolean'||typeof s.transform.mirrorY!=='boolean'))throw new Error('Invalid transform settings.');
    if(!num(s.opacity,0,1)||!num(s.brightness,0,2)||!Array.isArray(s.layers)||s.layers.length>50) throw new Error('Invalid surface settings.');
    if(s.mask!==null&&s.mask!==undefined&&!polygon(s.mask)) throw new Error('Invalid surface mask.');
    if(s.regions!==undefined&&(!Array.isArray(s.regions)||!s.regions.length||s.regions.length>1000||!s.regions.every(r=>r&&polygon(r.outline)&&Array.isArray(r.holes)&&r.holes.length<=1000&&r.holes.every(polygon))))throw new Error('Invalid joined surface mask.');
    if(!Array.isArray(s.holes)||s.holes.length>50||!s.holes.every(polygon)) throw new Error('Invalid exclusion mask.');
    if(s.mesh&&(!Number.isInteger(s.mesh.divisions)||s.mesh.divisions<1||s.mesh.divisions>12||!Array.isArray(s.mesh.points)||s.mesh.points.length!==(s.mesh.divisions+1)**2||!s.mesh.points.every(point))) throw new Error('Invalid warp mesh.');
    for(const l of s.layers) {
      if(['image','video'].includes(l?.type)&&!ids.has(l.assetId))throw new Error('Content references unknown media.');
      if(!l||typeof l.id!=='string'||!['image','video','text','color','grid'].includes(l.type)||!num(l.opacity,0,1)||!num(l.scale,.05,10)||!num(l.x,-2,2)||!num(l.y,-2,2)||!num(l.fontSize,8,600)||!num(l.speed,.25,4)) throw new Error('Invalid content layer.');
      if((l.scaleX!==undefined&&!num(l.scaleX,.05,10))||(l.scaleY!==undefined&&!num(l.scaleY,.05,10))||(l.keepAspect!==undefined&&typeof l.keepAspect!=='boolean'))throw new Error('Invalid media scale.');
      if((l.rotation!==undefined&&!num(l.rotation,-36000,36000))||(l.mirrorX!==undefined&&typeof l.mirrorX!=='boolean')||(l.mirrorY!==undefined&&typeof l.mirrorY!=='boolean'))throw new Error('Invalid content transform.');
      if(!['cover','contain','stretch'].includes(l.fit)||!['left','center','right'].includes(l.align)||typeof l.text!=='string'||l.text.length>20000||typeof l.font!=='string'||typeof l.color!=='string'||!/^#[0-9a-f]{6}$/i.test(l.color)) throw new Error('Invalid layer appearance.');
    }
  }
  return value;
}
export class History {
  constructor(limit=80){this.limit=limit;this.past=[];this.future=[];}
  push(value){this.past.push(clone(value));if(this.past.length>this.limit)this.past.shift();this.future=[];}
  undo(value){if(!this.past.length)return null;this.future.push(clone(value));return this.past.pop();}
  redo(value){if(!this.future.length)return null;this.past.push(clone(value));return this.future.pop();}
}

// A polygon can have several islands after joining. All rings stay editable.
export function maskRegions(s) {
  if(s.path?.closed)return [{outline:sampleCurve(s.path),holes:[]}];
  return s.regions || (s.mask ? [{outline:s.mask,holes:[]}] : []);
}
export function editableRings(s) {
  if(s.path)return [s.path.nodes];
  return maskRegions(s).flatMap(r=>[r.outline,...r.holes]);
}
export function sampleRing(s,ring,steps=s.mesh?24:1) {
  return ring.flatMap((a,i)=>{const b=ring[(i+1)%ring.length];return Array.from({length:steps},(_,j)=>meshPoint(s,a.x+(b.x-a.x)*j/steps,a.y+(b.y-a.y)*j/steps));});
}
export function surfaceRegions(s) {
  if(s.path&&!s.path.closed)return [{outline:sampleCurve(s.path,48,s.mesh?24:1).map(p=>meshPoint(s,p.x,p.y)),holes:[]}];
  let regions=maskRegions(s);
  if(!regions.length){const ring=s.type==='ellipse'?Array.from({length:96},(_,i)=>({x:.5+Math.cos(i/96*Math.PI*2)*.5,y:.5+Math.sin(i/96*Math.PI*2)*.5})):[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];regions=[{outline:ring,holes:[]}];}
  return regions.map(r=>({outline:sampleRing(s,r.outline,s.path?(s.mesh?3:1):undefined),holes:r.holes.map(h=>sampleRing(s,h))}));
}
export function surfaceContains(s,p,width=1920,height=1080) {
  if(s.led){const points=surfaceRegions(s)[0].outline,segments=s.path.closed?points.length:points.length-1;for(let i=0;i<segments;i++){const a=points[i],b=points[(i+1)%points.length],dx=(b.x-a.x)*width,dy=(b.y-a.y)*height,x=(p.x-a.x)*width,y=(p.y-a.y)*height,t=clamp((x*dx+y*dy)/(dx*dx+dy*dy||1),0,1);if(Math.hypot(x-t*dx,y-t*dy)<=s.led.width/2+8)return true;}return false;}
  return surfaceRegions(s).some(r=>pointInPolygon(p,r.outline)&&!r.holes.some(h=>pointInPolygon(p,h)))&&!s.holes.some(h=>pointInPolygon(p,sampleRing(s,h)));
}
// Invert a warped cell, so outline points can still be edited after mesh adjustment.
export function surfaceUV(s,p) {
  if(!s.mesh)return unproject(homography(s.corners),p.x,p.y);
  const {divisions:n,points}=s.mesh;let best={x:0,y:0},distance=Infinity;
  for(let row=0;row<n;row++)for(let col=0;col<n;col++){
    const a=points[row*(n+1)+col],b=points[row*(n+1)+col+1],c=points[(row+1)*(n+1)+col],d=points[(row+1)*(n+1)+col+1];
    let u=.5,v=.5;
    for(let i=0;i<15;i++){
      const x=a.x*(1-u)*(1-v)+b.x*u*(1-v)+c.x*(1-u)*v+d.x*u*v-p.x;
      const y=a.y*(1-u)*(1-v)+b.y*u*(1-v)+c.y*(1-u)*v+d.y*u*v-p.y;
      const xu=(b.x-a.x)*(1-v)+(d.x-c.x)*v,xv=(c.x-a.x)*(1-u)+(d.x-b.x)*u;
      const yu=(b.y-a.y)*(1-v)+(d.y-c.y)*v,yv=(c.y-a.y)*(1-u)+(d.y-b.y)*u,det=xu*yv-xv*yu;
      if(Math.abs(det)<1e-12)break;
      const du=(x*yv-y*xv)/det,dv=(y*xu-x*yu)/det;u-=du;v-=dv;if(Math.abs(du)+Math.abs(dv)<1e-9)break;
    }
    const candidate={x:(col+clamp(u,0,1))/n,y:(row+clamp(v,0,1))/n},dest=meshPoint(s,candidate.x,candidate.y),error=Math.hypot(dest.x-p.x,dest.y-p.y);
    if(error<distance){best=candidate;distance=error;}
  }
  return best;
}
export function moveMaskPoint(s,ringIndex,index,p) {
  const rings=editableRings(s),uv=surfaceUV(s,p);Object.assign(rings[ringIndex][index],uv);
  if(s.path){reframePath(s);return;}
  if(s.mesh)return;
  const bounds=rings.flat(),minX=Math.min(0,...bounds.map(p=>p.x)),minY=Math.min(0,...bounds.map(p=>p.y)),maxX=Math.max(1,...bounds.map(p=>p.x)),maxY=Math.max(1,...bounds.map(p=>p.y));
  if(minX===0&&minY===0&&maxX===1&&maxY===1)return;
  const h=homography(s.corners),corners=[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]].map(([x,y])=>{const p=project(h,x,y);return{x:p.x,y:p.y};});
  const cross=corners.map((a,i)=>{const b=corners[(i+1)%4],c=corners[(i+2)%4];return(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);});
  if(!corners.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))||(!cross.every(v=>v>1e-10)&&!cross.every(v=>v< -1e-10))){rings[ringIndex][index]={x:clamp(uv.x,0,1),y:clamp(uv.y,0,1)};return;}
  for(const ring of [...rings,...s.holes])for(const p of ring){p.x=(p.x-minX)/(maxX-minX);p.y=(p.y-minY)/(maxY-minY);}
  s.corners=corners;
}
export function joinSurfaces(surfaces,activeId) {
  if(surfaces.some(s=>s.led))throw new Error('LED strips stay independent. Join masks before applying an LED strip.');
  if(surfaces.length<2)throw new Error('Select at least two shapes to join.');
  if(surfaces.some(s=>s.locked))throw new Error('Unlock the selected shapes before joining.');
  const toRing=points=>points.map(p=>[p.x,p.y]);
  const polygons=surfaces.map(s=>{
    const shape=surfaceRegions(s).map(r=>[toRing(r.outline),...r.holes.map(toRing)]);
    return s.holes.length?polygonClipping.difference(shape,...s.holes.map(h=>[toRing(sampleRing(s,h))])):shape;
  }).filter(p=>p.length);
  if(!polygons.length)throw new Error('The selected shapes have no visible area.');
  const union=polygonClipping.union(...polygons);
  if(!union.length)throw new Error('The selected shapes have no visible area.');
  const coords=union.flat(2),minX=Math.min(...coords.map(p=>p[0])),minY=Math.min(...coords.map(p=>p[1])),maxX=Math.max(...coords.map(p=>p[0])),maxY=Math.max(...coords.map(p=>p[1]));
  const normalize=ring=>ring.slice(0,-1).map(([x,y])=>({x:(x-minX)/(maxX-minX),y:(y-minY)/(maxY-minY)}));
  const result=newSurface('polygon');result.name='Joined surface';result.mask=null;
  result.regions=union.map(p=>({outline:normalize(p[0]),holes:p.slice(1).map(normalize)}));
  result.corners=[{x:minX,y:minY},{x:maxX,y:minY},{x:maxX,y:maxY},{x:minX,y:maxY}];
  const active=surfaces.find(s=>s.id===activeId)||surfaces.at(-1);result.layers=clone(active.layers);result.layers.forEach(l=>l.id=uid());result.opacity=active.opacity;result.brightness=active.brightness;result.outline=clone(outlineSettings(active));
  return result;
}

export const outlineSettings = s => s.outline || {enabled:true,color:'#71e2bf',width:3};
export const transformSettings = s => s.transform || {rotation:0,scaleX:1,scaleY:1,mirrorX:false,mirrorY:false};
export function setSurfaceTransform(s,width,height,patch) {
  if(s.locked)throw new Error('Unlock the surface before transforming it.');
  const old=transformSettings(s),next={...old,...patch};
  if(!Number.isFinite(next.rotation)||Math.abs(next.rotation)>36000||!Number.isFinite(next.scaleX)||!Number.isFinite(next.scaleY)||next.scaleX<.05||next.scaleY<.05||next.scaleX>10||next.scaleY>10)throw new Error('Use scales from 5% to 1000% and a finite rotation.');
  const center={x:s.corners.reduce((n,p)=>n+p.x,0)/4*width,y:s.corners.reduce((n,p)=>n+p.y,0)/4*height};
  const a=old.rotation*Math.PI/180,b=next.rotation*Math.PI/180;
  const sx=next.scaleX/old.scaleX*(next.mirrorX===old.mirrorX?1:-1),sy=next.scaleY/old.scaleY*(next.mirrorY===old.mirrorY?1:-1);
  const apply=p=>{const dx=p.x*width-center.x,dy=p.y*height-center.y,x=(dx*Math.cos(a)+dy*Math.sin(a))*sx,y=(-dx*Math.sin(a)+dy*Math.cos(a))*sy;return{x:(center.x+x*Math.cos(b)-y*Math.sin(b))/width,y:(center.y+x*Math.sin(b)+y*Math.cos(b))/height};};
  const corners=s.corners.map(apply),points=s.mesh?.points.map(apply);
  if([...corners,...points||[]].some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>10||Math.abs(p.y)>10))throw new Error('This transform would move the surface too far outside the canvas.');
  s.corners=corners;if(points)s.mesh.points=points;s.transform=next;
}
export function removeMediaAsset(project,id) {
  if(project.surfaces.some(s=>s.locked&&s.layers.some(l=>l.assetId===id)))throw new Error('Unlock the surfaces using this media before removing it from the library.');
  project.assets=project.assets.filter(a=>a.id!==id);
  for(const s of project.surfaces)s.layers=s.layers.filter(l=>l.assetId!==id);
}
const MASK_PREFIX='SURFACE_MASKS\n';
export function encodeMasks(surfaces) {
  if(!surfaces.length)throw new Error('Select a mask to copy.');
  const masks=clone(surfaces);for(const s of masks){s.layers=[];s.locked=false;}
  validateProject({...newProject(),surfaces:masks});
  return MASK_PREFIX+JSON.stringify({version:1,surfaces:masks});
}
export function decodeMasks(text,width,height,offset=20) {
  if(typeof text!=='string'||!text.startsWith(MASK_PREFIX)||text.length>5*1024*1024)throw new Error('The clipboard does not contain Surface masks. Use Copy masks first.');
  let value;try{value=JSON.parse(text.slice(MASK_PREFIX.length));}catch{throw new Error('The copied mask data is invalid.');}
  if(value?.version!==1||!Array.isArray(value.surfaces)||!value.surfaces.length)throw new Error('The copied mask data is invalid.');
  validateProject({...newProject(),width,height,surfaces:value.surfaces});
  for(const s of value.surfaces){
    s.id=uid();s.name+=' pasted';s.layers=[];s.locked=false;
    s.corners.forEach(p=>{p.x+=offset/width;p.y+=offset/height;});
    s.mesh?.points.forEach(p=>{p.x+=offset/width;p.y+=offset/height;});
  }
  validateProject({...newProject(),width,height,surfaces:value.surfaces});return value.surfaces;
}
// The actual visible perimeter, including holes, rather than a shape's bounding quad.
export function surfacePerimeters(s) {
  const regions=surfaceRegions(s);
  if(!s.holes.length)return regions.flatMap(r=>[r.outline,...r.holes]);
  const toRing=points=>points.map(p=>[p.x,p.y]);
  const result=polygonClipping.difference(regions.map(r=>[toRing(r.outline),...r.holes.map(toRing)]),...s.holes.map(h=>[toRing(sampleRing(s,h))]));
  return result.flatMap(region=>region.map(ring=>ring.slice(0,-1).map(([x,y])=>({x,y}))));
}
// Round joins with width measured in output pixels, unaffected by perspective or mesh distortion.
export function outlineGeometry(s,width,height) {
  const size=outlineSettings(s).width/2,vertices=[];
  const vertex=p=>vertices.push(p.x/width*2-1,1-p.y/height*2);
  for(const ring of surfacePerimeters(s)){
    const points=ring.map(p=>({x:p.x*width,y:p.y*height}));
    points.forEach((a,i)=>{
      const b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<1e-8)return;
      const nx=-dy/length*size,ny=dx/length*size,A={x:a.x+nx,y:a.y+ny},B={x:b.x+nx,y:b.y+ny},C={x:b.x-nx,y:b.y-ny},D={x:a.x-nx,y:a.y-ny};
      [A,B,C,A,C,D].forEach(vertex);
      for(let j=0;j<12;j++){vertex(a);vertex({x:a.x+Math.cos(j/12*Math.PI*2)*size,y:a.y+Math.sin(j/12*Math.PI*2)*size});vertex({x:a.x+Math.cos((j+1)/12*Math.PI*2)*size,y:a.y+Math.sin((j+1)/12*Math.PI*2)*size});}
    });
  }
  return new Float32Array(vertices);
}

export function handleIndicators(points,{width,height,zoom,pan,canvasWidth,canvasHeight},margin=14) {
  const spacing=18,result=[],occupied=[];
  const actual=points.map(p=>({x:pan.x+p.x*canvasWidth*zoom,y:pan.y+p.y*canvasHeight*zoom}));
  const maxX=Math.max(margin,width-margin),maxY=Math.max(margin,height-margin);
  actual.forEach(p=>{if(p.x>=margin&&p.x<=maxX&&p.y>=margin&&p.y<=maxY)occupied.push(p);});
  points.forEach((p,i)=>{
    const a=actual[i],outside=a.x<margin||a.x>maxX||a.y<margin||a.y>maxY;
    let x=clamp(a.x,margin,maxX),y=clamp(a.y,margin,maxY);
    if(outside){
      const xOverflow=Math.max(margin-a.x,a.x-maxX,0),yOverflow=Math.max(margin-a.y,a.y-maxY,0),vertical=xOverflow>yOverflow;
      const candidates=[];
      search: for(let step=0;step<Math.ceil((vertical?height:width)/spacing)+1;step++)for(const sign of step?[1,-1]:[1]){
        const candidate={x:vertical?x:clamp(x+sign*step*spacing,margin,maxX),y:vertical?clamp(y+sign*step*spacing,margin,maxY):y};
        if(!occupied.some(q=>Math.hypot(q.x-candidate.x,q.y-candidate.y)<spacing-1)){candidates.push(candidate);break search;}
      }
      if(candidates.length){x=candidates[0].x;y=candidates[0].y;}
      occupied.push({x,y});
    }
    result.push({...p,proxy:outside,displayX:(x-pan.x)/(canvasWidth*zoom),displayY:(y-pan.y)/(canvasHeight*zoom)});
  });
  return result;
}
export function fitHandleView(points,canvasWidth,canvasHeight,width,height,padding=35) {
  const bounds=points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:0,minY:0,maxX:1,maxY:1});
  const zoom=Math.max(.0001,Math.min((width-2*padding)/((bounds.maxX-bounds.minX)*canvasWidth),(height-2*padding)/((bounds.maxY-bounds.minY)*canvasHeight)));
  return {zoom,pan:{x:(width-(bounds.maxX+bounds.minX)*canvasWidth*zoom)/2,y:(height-(bounds.maxY+bounds.minY)*canvasHeight*zoom)/2}};
}
export function fitMaskToMedia(s,width,height,mediaWidth,mediaHeight) {
  if(s.locked)throw new Error('Unlock the surface before resizing its mask.');
  const aspect=mediaWidth/mediaHeight;
  if(!Number.isFinite(aspect)||aspect<.01||aspect>100||mediaWidth<=0||mediaHeight<=0)throw new Error('Media dimensions are unavailable or its aspect ratio is outside 1:100–100:1.');
  const c=s.corners.map(p=>({x:p.x*width,y:p.y*height}));
  const center={x:c.reduce((a,p)=>a+p.x,0)/4,y:c.reduce((a,p)=>a+p.y,0)/4};
  const a={x:(c[1].x-c[0].x+c[2].x-c[3].x)/2,y:(c[1].y-c[0].y+c[2].y-c[3].y)/2};
  const b={x:(c[3].x-c[0].x+c[2].x-c[1].x)/2,y:(c[3].y-c[0].y+c[2].y-c[1].y)/2};
  const det=a.x*b.y-a.y*b.x,factor=Math.hypot(a.x,a.y)/Math.hypot(b.x,b.y)/aspect;
  if(Math.abs(det)<1e-8||!Number.isFinite(factor))throw new Error('The mask needs a non-collapsed frame before fitting.');
  const apply=p=>{const x=p.x*width-center.x,y=p.y*height-center.y,u=(x*b.y-y*b.x)/det,v=(a.x*y-a.y*x)/det;return{x:(center.x+a.x*u+b.x*v*factor)/width,y:(center.y+a.y*u+b.y*v*factor)/height};};
  const corners=s.corners.map(apply),points=s.mesh?.points.map(apply);
  if([...corners,...points||[]].some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>10||Math.abs(p.y)>10))throw new Error('Fitting would put the mask too far outside the canvas. Reduce its width first.');
  s.corners=corners;if(points)s.mesh.points=points;s.contentAspect=aspect;
}

export function ensurePath(s){
 if(s.path)return s.path;
 if(s.regions){
  if(s.regions.length!==1)throw new Error('This mask contains disconnected outlines. Each LED strip needs one connected outline.');
  const region=s.regions[0];
  if(region.outline.length>512)throw new Error('A curve path supports up to 512 points.');
  s.mask=region.outline.map(p=>({...p}));
  s.holes=[...(s.holes||[]),...region.holes.map(r=>r.map(p=>({...p})))];
  delete s.regions;
 }
 if(s.type==='ellipse'){const k=.2761423749,points=[{x:.5,y:0},{x:1,y:.5},{x:.5,y:1},{x:0,y:.5}],vectors=[{x:k,y:0},{x:0,y:k},{x:-k,y:0},{x:0,y:-k}];s.path={closed:true,nodes:points.map((p,i)=>({...pathNode(p),mode:'bezier',in:{x:-vectors[i].x,y:-vectors[i].y},out:vectors[i]}))};return s.path;}
 const points=s.mask||[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];if(points.length>512)throw new Error('A curve path supports up to 512 points.');
 s.path={closed:true,nodes:points.map(pathNode)};return s.path;
}
export function reframePath(s){
 if(!s.path||s.mesh)return;
 const points=s.path.nodes.flatMap(n=>[n,...n.mode==='bezier'?[{x:n.x+n.in.x,y:n.y+n.in.y},{x:n.x+n.out.x,y:n.y+n.out.y}]:[]]);
 const bounds=points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:0,maxX:1,minY:0,maxY:1});
 const {minX,minY,maxX,maxY}=bounds;if(minX===0&&minY===0&&maxX===1&&maxY===1)return;
 const h=homography(s.corners),corners=[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]].map(([x,y])=>{const p=project(h,x,y);return{x:p.x,y:p.y};});
 if(corners.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>10||Math.abs(p.y)>10))throw new Error('The curve would extend too far outside the canvas.');
 const cross=corners.map((a,i)=>{const b=corners[(i+1)%4],c=corners[(i+2)%4];return(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);});if(!cross.every(v=>v>1e-10)&&!cross.every(v=>v< -1e-10))throw new Error('The curve would cross the perspective horizon.');
 for(const ring of [s.path.nodes,...s.holes])for(const p of ring){p.x=(p.x-minX)/(maxX-minX);p.y=(p.y-minY)/(maxY-minY);if(p.in){p.in.x/=maxX-minX;p.in.y/=maxY-minY;p.out.x/=maxX-minX;p.out.y/=maxY-minY;}}
 s.corners=corners;
}
export function setAnimationPlaying(project,playing,now=Date.now()){const elapsed=animationTime(project,now);project.clock={elapsed,startedAt:now};project.playing=playing;}
