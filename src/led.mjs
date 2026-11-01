// Local projection effects inspired by WLED's familiar 1D strip controls.
// Independent implementations; no firmware source or device connection is required.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const LED_EFFECTS=[['solid','Solid'],['blink','Blink'],['breathe','Breathe'],['wipe','Color Wipe'],['rainbow','Rainbow'],['colorloop','Colorloop'],['chase','Chase'],['comet','Comet'],['scanner','Scanner'],['fire','Fire'],['twinkle','Twinkle'],['sparkle','Sparkle'],['theater','Theater Chase'],['running','Running Lights'],['gradient','Gradient'],['meteor','Meteor'],['noise','Noise'],['candle','Candle'],['waves','Colorwaves'],['strobe','Strobe']];
export const LED_PALETTES=[['custom','Custom colors'],['rainbow','Rainbow'],['fire','Fire'],['ocean','Ocean'],['party','Party'],['sunset','Sunset'],['forest','Forest'],['ice','Ice']];
const PALETTES={fire:['#ff1600','#ff8c00','#fff0a0'],ocean:['#001066','#0088cc','#50ffca'],party:['#ff0080','#7d00ff','#00ffad'],sunset:['#4e006e','#ff3355','#ffbd45'],forest:['#063b21','#26aa39','#c7f367'],ice:['#092d8a','#26b9ff','#e1ffff'],rainbow:['#ff164d','#37ff50','#3655ff']};
export function ledDefaults(){return {enabled:true,mode:'dots',width:12,density:6,pixelsPerInch:96,coverage:.7,glow:.3,effect:'rainbow',palette:'rainbow',colors:['#ff7040','#753dff','#31efcf'],speed:128,intensity:128,reverse:false,mirror:false,grouping:1,spacing:0};}
export const pathNode=(p)=>({x:p.x,y:p.y,mode:'corner',linked:true,in:{x:0,y:0},out:{x:0,y:0}});
export function curvePoint(path,index,t){
 const a=path.nodes[index],b=path.nodes[(index+1)%path.nodes.length],u=1-t,A=a.mode==='bezier'?a.out:{x:0,y:0},B=b.mode==='bezier'?b.in:{x:0,y:0};
 return {x:u*u*u*a.x+3*u*u*t*(a.x+A.x)+3*u*t*t*(b.x+B.x)+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*(a.y+A.y)+3*u*t*t*(b.y+B.y)+t*t*t*b.y};
}
export function sampleCurve(path,steps=48,straightSteps=1){
 const result=[],count=path.closed?path.nodes.length:path.nodes.length-1;
 for(let i=0;i<count;i++){const a=path.nodes[i],b=path.nodes[(i+1)%path.nodes.length],n=a.mode==='bezier'||b.mode==='bezier'?steps:straightSteps;for(let j=0;j<n;j++)result.push(curvePoint(path,i,j/n));}
 if(!path.closed){const p=path.nodes.at(-1);result.push({x:p.x,y:p.y});}return result;
}
export function makeBezier(path,index,enabled=true){
 const n=path.nodes.length,node=path.nodes[index],prev=path.nodes[(index-1+n)%n],next=path.nodes[(index+1)%n];node.mode=enabled?'bezier':'corner';node.linked=true;
 let x=0,y=0;if(enabled){if(!path.closed&&index===0){x=(next.x-node.x)/3;y=(next.y-node.y)/3;}else if(!path.closed&&index===n-1){x=(node.x-prev.x)/3;y=(node.y-prev.y)/3;}else{x=(next.x-prev.x)/6;y=(next.y-prev.y)/6;}}
 node.in={x:-x,y:-y};node.out={x,y};
}
export function splitCurve(path,index,t=.5){
 const a=path.nodes[index],b=path.nodes[(index+1)%path.nodes.length],mix=(a,b)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 if(!path.closed&&index===path.nodes.length-1)throw new Error('The last point has no outgoing segment.');
 const p1=a.mode==='bezier'?{x:a.x+a.out.x,y:a.y+a.out.y}:a,p2=b.mode==='bezier'?{x:b.x+b.in.x,y:b.y+b.in.y}:b;
 const q0=mix(a,p1),q1=mix(p1,p2),q2=mix(p2,b),r0=mix(q0,q1),r1=mix(q1,q2),p=mix(r0,r1),curved=a.mode==='bezier'||b.mode==='bezier';
 if(curved){a.out={x:q0.x-a.x,y:q0.y-a.y};b.in={x:q2.x-b.x,y:q2.y-b.y};a.linked=false;b.linked=false;}
 const node={...pathNode(p),mode:curved?'bezier':'corner',linked:false,in:{x:r0.x-p.x,y:r0.y-p.y},out:{x:r1.x-p.x,y:r1.y-p.y}};path.nodes.splice(index+1,0,node);return index+1;
}
export function pathTable(surface,width,height,map){
 const uv=sampleCurve(surface.path,64,surface.mesh?24:1),points=uv.map(p=>{const q=map(surface,p.x,p.y);return{x:q.x*width,y:q.y*height};});
 if(surface.path.closed&&points.length)points.push({...points[0]});
 let length=0;const distances=[0];for(let i=1;i<points.length;i++){length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);distances.push(length);}
 return {points,distances,length};
}
export function atDistance(table,d){
 d=clamp(d,0,table.length);let low=0,high=table.distances.length-1;while(low+1<high){const mid=(low+high)>>1;if(table.distances[mid]<=d)low=mid;else high=mid;}
 const a=table.points[low],b=table.points[Math.min(low+1,table.points.length-1)],span=table.distances[Math.min(low+1,table.distances.length-1)]-table.distances[low],t=span>0?(d-table.distances[low])/span:0;
 return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,dx:b.x-a.x,dy:b.y-a.y};
}
export function stripMetrics(surface,width,height,map){
 const table=pathTable(surface,width,height,map),led=surface.led,inches=table.length/led.pixelsPerInch,requested=Math.max(1,Math.round(inches*led.density)+(surface.path.closed?0:1));
 return {table,inches,count:Math.min(4096,requested),requested,capped:requested>4096};
}
export function ledGeometry(surface,width,height,map){
 const metrics=stripMetrics(surface,width,height,map),{table,count}=metrics,led=surface.led,vertices=[];
 const v=(x,y,index,alpha=1)=>vertices.push(x/width*2-1,1-y/height*2,index,alpha);
 const disc=(p,r,index,alpha=1,fade=false)=>{for(let j=0;j<16;j++){v(p.x,p.y,index,alpha);v(p.x+Math.cos(j/16*Math.PI*2)*r,p.y+Math.sin(j/16*Math.PI*2)*r,index,fade?0:alpha);v(p.x+Math.cos((j+1)/16*Math.PI*2)*r,p.y+Math.sin((j+1)/16*Math.PI*2)*r,index,fade?0:alpha);}};
 if(table.length<.01)return {...metrics,vertices:new Float32Array()};
 if(led.mode==='solid'){
   const steps=Math.min(8192,Math.max(table.points.length,Math.ceil(table.length/4))),radius=led.width/2;
   for(let i=0;i<steps;i++){
     const a=atDistance(table,table.length*i/steps),b=atDistance(table,table.length*(i+1)/steps),len=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/len*radius,ny=(b.x-a.x)/len*radius,ia=i/steps*(count-1),ib=(i+1)/steps*(count-1);
     v(a.x+nx,a.y+ny,ia);v(b.x+nx,b.y+ny,ib);v(b.x-nx,b.y-ny,ib);v(a.x+nx,a.y+ny,ia);v(b.x-nx,b.y-ny,ib);v(a.x-nx,a.y-ny,ia);disc(a,radius,ia);
   }
   disc(atDistance(table,table.length),radius,count-1);
 }else{
   const spacing=table.length/Math.max(1,count-(surface.path.closed?0:1)),size=Math.max(.5,Math.min(led.width,spacing*led.coverage));
   const samples=Array.from({length:count},(_,i)=>atDistance(table,surface.path.closed?table.length*i/count:count===1?table.length/2:table.length*i/(count-1)));
   if(led.glow>0)samples.forEach((p,i)=>disc(p,Math.max(size,led.width)/2*(1+led.glow*3),i,.3*led.glow,true));
   samples.forEach((p,i)=>{if(led.mode==='dots')disc(p,size/2,i);else{const len=Math.hypot(p.dx,p.dy)||1,tx=p.dx/len*spacing*led.coverage/2,ty=p.dy/len*spacing*led.coverage/2,nx=-p.dy/len*led.width/2,ny=p.dx/len*led.width/2;[[p.x-tx+nx,p.y-ty+ny],[p.x+tx+nx,p.y+ty+ny],[p.x+tx-nx,p.y+ty-ny],[p.x-tx+nx,p.y-ty+ny],[p.x+tx-nx,p.y+ty-ny],[p.x-tx-nx,p.y-ty-ny]].forEach(([x,y])=>v(x,y,i));}});
 }
 return {...metrics,vertices:new Float32Array(vertices)};
}
export function paletteColors(led){return (PALETTES[led.palette]||led.colors).map(c=>[parseInt(c.slice(1,3),16)/255,parseInt(c.slice(3,5),16)/255,parseInt(c.slice(5,7),16)/255]);}
export function animationTime(project,now=Date.now()){const c=project.clock||{elapsed:0,startedAt:now};return c.elapsed+(project.playing?Math.max(0,now-c.startedAt):0);}
export function validateLEDPath(path){
 const num=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b,vector=p=>p&&num(p.x,-20,20)&&num(p.y,-20,20);
 return path&&typeof path.closed==='boolean'&&Array.isArray(path.nodes)&&path.nodes.length>=(path.closed?3:2)&&path.nodes.length<=512&&path.nodes.every(n=>vector(n)&&['corner','bezier'].includes(n.mode)&&typeof n.linked==='boolean'&&vector(n.in)&&vector(n.out));
}
export function validateLED(led){
 const num=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
 return led&&typeof led.enabled==='boolean'&&['dots','blocks','solid'].includes(led.mode)&&num(led.width,1,200)&&num(led.density,.1,240)&&num(led.pixelsPerInch,.1,10000)&&num(led.coverage,.05,1)&&num(led.glow,0,1)&&LED_EFFECTS.some(([id])=>id===led.effect)&&LED_PALETTES.some(([id])=>id===led.palette)&&Array.isArray(led.colors)&&led.colors.length===3&&led.colors.every(c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c))&&num(led.speed,0,255)&&num(led.intensity,0,255)&&typeof led.reverse==='boolean'&&typeof led.mirror==='boolean'&&Number.isInteger(led.grouping)&&num(led.grouping,1,100)&&Number.isInteger(led.spacing)&&num(led.spacing,0,100);
}
