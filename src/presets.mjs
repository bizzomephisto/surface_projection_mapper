export const PRESETS=[['gauge','Analog gauge'],['dial','Rotary dial'],['panel','Control panel'],['code','Scrolling code'],['radar','Radar'],['scope','Oscilloscope']];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function presetDefaults(preset='gauge'){
 return {preset,layout:'auto',label:({gauge:'PRESSURE',dial:'FREQUENCY',panel:'SYSTEM CONTROL',code:'TERMINAL',radar:'SECTOR SCAN',scope:'SIGNAL'})[preset]||'DISPLAY',color:'#71e2bf',accent:'#ffbd69',background:'#071015',transparent:false,speed:1,min:10,max:90,value:50,auto:true,reverse:false,detail:12,labels:true,paused:false,offset:0,anchor:0,text:'const system = await connect();\nawait system.scan({ mode: "live" });\nfor (const node of system.nodes) {\n  const signal = node.read();\n  display.render(signal);\n  await frame.next();\n}\n// telemetry stream active\nstatus.update({ power: 98.4, link: true });'};
}
export function validatePreset(c){
 const num=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b,color=s=>typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s);
 return c&&(c.layout===undefined||['auto','compact','detailed'].includes(c.layout))&&PRESETS.some(([id])=>c.preset===id)&&typeof c.label==='string'&&c.label.length<=80&&[c.color,c.accent,c.background].every(color)&&['transparent','auto','reverse','labels','paused'].every(k=>typeof c[k]==='boolean')&&num(c.speed,.1,4)&&num(c.min,0,100)&&num(c.max,c.min,100)&&num(c.value,0,100)&&Number.isInteger(c.detail)&&num(c.detail,4,32)&&num(c.offset,0,1e12)&&num(c.anchor,0,1e12)&&typeof c.text==='string'&&c.text.length<=12000;
}
export function presetTime(c,seconds){return c.offset+(c.paused?0:Math.max(0,seconds-c.anchor)*c.speed);}
export function retimePreset(c,seconds,changes){const elapsed=presetTime(c,seconds);Object.assign(c,changes,{offset:elapsed,anchor:seconds});}
export function presetValue(c,time){return c.auto?c.min+(c.max-c.min)*(.5+.5*Math.sin(time*(c.reverse?-1:1)*.8-1.2)):c.value;}
export function resetPresetClocks(project){for(const s of project.surfaces)for(const l of s.layers)if(l.type==='preset'){l.animation.offset=0;l.animation.anchor=0;}}
const hash=n=>{const x=Math.sin(n*127.1+31.7)*43758.5453;return x-Math.floor(x);};
export function presetFootprint(s,l,width,height,map){
 const aspect=s.contentAspect||16/9,angle=(l.rotation||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
 const point=(u,v)=>{const x=(u-.5)*l.scale*(l.scaleX??1),y=(v-.5)*l.scale*(l.scaleY??1),p=map(s,.5+l.x+x*cos-y*sin/aspect,.5+l.y+x*sin*aspect+y*cos);return{x:p.x*width,y:p.y*height};};
 const a=point(0,0),b=point(1,0),c=point(1,1),d=point(0,1),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 return {width:Math.min((distance(a,b)+distance(d,c))/2,distance(point(0,.5),point(1,.5))),height:Math.min((distance(a,d)+distance(b,c))/2,distance(point(.5,0),point(.5,1)))};
}
export function presetLayout(c,size){return c.layout&&c.layout!=='auto'?c.layout:Math.min(size.width,size.height)<220?'compact':'detailed';}
export function drawPreset(ctx,w,h,c,seconds,size={width:w,height:h}){
 const t=presetTime(c,seconds)*(c.reverse?-1:1),value=presetValue(c,presetTime(c,seconds)),fg=c.color,accent=c.accent;
 ctx.save();if(!c.transparent){ctx.fillStyle=c.background;ctx.fillRect(0,0,w,h);}const scale=Math.min(w/1000,h/600);ctx.translate((w-1000*scale)/2,(h-600*scale)/2);ctx.scale(scale,scale);
 const line=(x,y,X,Y,color=fg,width=2)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(X,Y);ctx.stroke();};
 const text=(str,x,y,size=18,color=fg,align='left')=>{ctx.fillStyle=color;ctx.font=`${size>=30?'500':'400'} ${size}px monospace`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(String(str),x,y,900);};
 const box=(x,y,W,H,color=fg)=>{ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.strokeRect(x,y,W,H);};
 const circle=(x,y,r,color=fg,width=2)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();};
 const arc=(x,y,r,start,end,color=fg,width=3)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(x,y,r,start,end);ctx.stroke();};
 const title=()=>{if(c.labels){text(c.label,50,42,20);text('●',940,42,16,Math.sin(t*2)>0?accent:fg,'right');line(50,70,950,70,fg,1);}};
 if(presetLayout(c,size)==='compact'){
  // A separate composition for small physical zones: large readouts and strong
  // silhouettes, rather than a reduced dashboard full of miniature labels.
  const label=(x=500,y=560)=>{if(c.labels)text(c.label.slice(0,18),x,y,42,fg,'center');};
  if(c.preset==='gauge'){
   const x=500,y=278,r=232,start=Math.PI*.75,sweep=Math.PI*1.5,ticks=clamp(Math.round(c.detail/2),4,8);
   arc(x,y,r,start,start+sweep,fg,16);arc(x,y,r-23,start+sweep*.8,start+sweep,accent,16);
   for(let i=0;i<=ticks;i++){const a=start+sweep*i/ticks;line(x+Math.cos(a)*(r-45),y+Math.sin(a)*(r-45),x+Math.cos(a)*(r-8),y+Math.sin(a)*(r-8),fg,10);}
   const a=start+sweep*value/100;line(x-Math.cos(a)*20,y-Math.sin(a)*20,x+Math.cos(a)*(r-55),y+Math.sin(a)*(r-55),accent,15);circle(x,y,18,accent,9);text(Math.round(value),x,432,116,accent,'center');label();
  }else if(c.preset==='dial'){
   const x=500,y=280,r=225,a=value/100*Math.PI*2;circle(x,y,r,fg,14);
   for(let i=0;i<12;i++){const a=i/12*Math.PI*2;line(x+Math.sin(a)*(r-35),y-Math.cos(a)*(r-35),x+Math.sin(a)*(r-10),y-Math.cos(a)*(r-10),fg,9);}
   line(x+Math.sin(a)*(r-42),y-Math.cos(a)*(r-42),x+Math.sin(a)*(r-100),y-Math.cos(a)*(r-100),accent,24);text(Math.round(value),x,y,132,accent,'center');label();
  }else if(c.preset==='panel'){
   if(c.labels)text(c.label.slice(0,18),50,48,42);
   const rows=clamp(Math.round(c.detail/4),2,4),step=420/rows;
   for(let i=0;i<rows;i++){const v=c.auto?c.min+(c.max-c.min)*(.5+.5*Math.sin(t*.8+i*1.7)):c.value,y=120+i*step;if(c.labels)text(['PWR','TEMP','LINK','LOAD'][i],50,y,44);text(Math.round(v),600,y,60,i===1?accent:fg,'right');ctx.fillStyle=fg+'35';ctx.fillRect(50,y+43,550,34);ctx.fillStyle=i===1?accent:fg;ctx.fillRect(50,y+43,550*v/100,34);ctx.fillStyle=hash(i+Math.floor(t*2))>.4?accent:fg+'40';ctx.fillRect(720,y-15,210,80);}
   text(String(Math.floor(Math.abs(t)*23)%10000).padStart(4,'0'),925,558,62,accent,'right');
  }else if(c.preset==='code'){
   const top=c.labels?100:30,bottom=575,rows=clamp(Math.round(c.detail/4),3,6),step=(bottom-top)/rows,font=Math.min(76,step*.7),columns=Math.floor(890/(font*.61)),lines=c.text.split('\n').flatMap(line=>{const chunks=[];for(let i=0;i<Math.max(1,line.length);i+=columns)chunks.push(line.slice(i,i+columns)||' ');return chunks;});
   if(c.labels)text(c.label.slice(0,18),50,45,42);ctx.save();ctx.beginPath();ctx.rect(45,top,910,bottom-top);ctx.clip();const scroll=Math.abs(t)*60;
   for(let i=-1;i<=rows+1;i++){const index=Math.floor(scroll/step)+i,j=((index%lines.length)+lines.length)%lines.length,y=c.reverse?bottom-i*step+scroll%step:top+step*.5+i*step-scroll%step;text(lines[j],50,y,font,j%3===0?accent:fg);}
   ctx.restore();
  }else if(c.preset==='radar'){
   const x=500,y=310,r=235,a=t*.75;for(let i=1;i<=3;i++)circle(x,y,r*i/3,fg+'90',7);line(x-r,y,x+r,y,fg+'70',5);line(x,y-r,x,y+r,fg+'70',5);line(x,y,x+Math.cos(a)*r,y+Math.sin(a)*r,accent,13);
   for(let i=0;i<clamp(Math.round(c.detail/2),3,8);i++){const A=hash(i*2)*Math.PI*2,R=Math.sqrt(hash(i*2+1))*r*.85,delta=((a-A)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);ctx.save();ctx.globalAlpha=c.auto?.25+.75*Math.exp(-delta):value/100;ctx.fillStyle=accent;ctx.beginPath();ctx.arc(x+Math.cos(A)*R,y+Math.sin(A)*R,13,0,Math.PI*2);ctx.fill();ctx.restore();}if(c.labels)text(c.label.slice(0,18),500,35,42,fg,'center');
  }else if(c.preset==='scope'){
   if(c.labels)text(c.label.slice(0,18),50,45,42);for(let i=0;i<=4;i++)line(50+i*225,100,50+i*225,480,fg+'40',4);for(let i=0;i<=2;i++)line(50,100+i*190,950,100+i*190,fg+'40',4);
   const amplitude=value/100*150;for(let channel=0;channel<2;channel++){ctx.strokeStyle=channel?accent:fg;ctx.lineWidth=channel?9:12;ctx.beginPath();for(let i=0;i<=300;i++){const x=50+i*3,u=i/300*Math.PI*2*clamp(c.detail/6,1,4),y=290+Math.sin(u+t*3+channel*1.5)*amplitude*(channel?.5:1);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();}text(value.toFixed(0)+' V',950,550,85,accent,'right');
  }
  ctx.restore();return;
 }
 if(c.preset==='gauge'){
  const x=500,y=320,r=205,start=Math.PI*.75,sweep=Math.PI*1.5;
  circle(x,y,r+18,fg,1);arc(x,y,r,start,start+sweep,fg,7);arc(x,y,r-16,start+sweep*.8,start+sweep,accent,9);
  for(let i=0;i<=c.detail;i++){const a=start+sweep*i/c.detail,R=i%2?r-27:r-38;line(x+Math.cos(a)*R,y+Math.sin(a)*R,x+Math.cos(a)*(r-6),y+Math.sin(a)*(r-6),fg,i%2?2:3);if(c.labels&&i%2===0)text(Math.round(i/c.detail*100),x+Math.cos(a)*(r-60),y+Math.sin(a)*(r-60),17,fg,'center');}
  const a=start+sweep*value/100;line(x-Math.cos(a)*25,y-Math.sin(a)*25,x+Math.cos(a)*(r-48),y+Math.sin(a)*(r-48),accent,6);circle(x,y,13,accent,5);text(value.toFixed(1),x,440,54,accent,'center');if(c.labels)text(c.label,x,245,19,fg,'center');
 }else if(c.preset==='dial'){
  const x=500,y=305,r=192,angle=value/100*Math.PI*2;
  circle(x,y,r+34,fg,1);circle(x,y,r,fg,4);circle(x,y,r-25,fg,1);
  for(let i=0;i<c.detail*3;i++){const a=i/(c.detail*3)*Math.PI*2;line(x+Math.sin(a)*(r+8),y-Math.cos(a)*(r+8),x+Math.sin(a)*(r+(i%3?18:30)),y-Math.cos(a)*(r+(i%3?18:30)),fg,i%3?1:3);}
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);line(0,-r+38,0,-r+86,accent,12);for(let i=0;i<8;i++){const a=i/8*Math.PI*2;line(Math.sin(a)*102,-Math.cos(a)*102,Math.sin(a)*120,-Math.cos(a)*120,fg,4);}ctx.restore();text(String(Math.round(value)).padStart(2,'0'),x,y,70,accent,'center');if(c.labels)text(c.label,x,565,21,fg,'center');
 }else if(c.preset==='panel'){
  title();box(50,100,280,440);box(355,100,370,440);box(750,100,200,440);
  for(let i=0;i<6;i++){const v=c.auto?(Math.sin(t*.8+i*1.7)*.5+.5)*(c.max-c.min)+c.min:c.value,y=143+i*67;if(c.labels)text(['POWER','THERMAL','UPLINK','COOLANT','LOAD','RESERVE'][i],70,y-12,13);ctx.fillStyle=fg+'25';ctx.fillRect(70,y+6,240,12);ctx.fillStyle=i===1?accent:fg;ctx.fillRect(70,y+6,240*v/100,12);}
  for(let row=0;row<4;row++)for(let col=0;col<6;col++){const on=hash(row*31+col+Math.floor(t*2))>.38,x=382+col*55,y=140+row*70;ctx.fillStyle=(on?(col%3===0?accent:fg):fg+'20');ctx.fillRect(x,y,27,17);if(c.labels)text(`${row+1}${col+1}`,x+13,y+31,12,fg,'center');}
  if(c.labels)text('SEQUENCE',382,455,14);text(String(Math.floor(Math.abs(t)*23)%10000).padStart(4,'0'),540,495,38,accent,'center');
  for(let i=0;i<c.detail;i++){const v=c.auto?hash(i+Math.floor(t*1.5))>.35:value>i/c.detail*100;ctx.fillStyle=v?fg:fg+'20';ctx.fillRect(775,122+i*(396/c.detail),150,Math.max(4,396/c.detail-7));}
 }else if(c.preset==='code'){
  title();box(50,95,900,455);ctx.save();ctx.beginPath();ctx.rect(62,108,876,425);ctx.clip();const rows=c.detail+4,step=425/rows,lines=c.text.split('\n'),scroll=Math.abs(t)*35,direction=c.reverse?-1:1;
  for(let i=-1;i<=rows+1;i++){const sequence=Math.floor(scroll/step)+i,j=((sequence%lines.length)+lines.length)%lines.length,y=direction>0?120+i*step-scroll%step:525-i*step+scroll%step;let content=lines[j]||' ';if(content.length>86)content=content.slice(0,86);text(String(((sequence%9999)+9999)%9999).padStart(4,'0'),75,y,Math.min(20,step*.7),fg+'80');text(content,145,y,Math.min(20,step*.7),j%3===0?accent:fg);}
  ctx.restore();if(c.labels){text('STREAM / LOCAL',64,574,13);text(`${Math.floor(Math.abs(t)*960).toString(16).toUpperCase().padStart(8,'0')}`,935,574,13,accent,'right');}
 }else if(c.preset==='radar'){
  const x=500,y=320,r=218,angle=t*.75;for(let i=1;i<=4;i++)circle(x,y,r*i/4,fg+'65',1);line(x-r,y,x+r,y,fg+'70',1);line(x,y-r,x,y+r,fg+'70',1);
  ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();for(let i=0;i<35;i++){ctx.globalAlpha=(1-i/35)*.16;ctx.fillStyle=fg;ctx.beginPath();ctx.moveTo(x,y);ctx.arc(x,y,r,angle-i*.012,angle-(i-1)*.012);ctx.closePath();ctx.fill();}ctx.globalAlpha=1;line(x,y,x+Math.cos(angle)*r,y+Math.sin(angle)*r,accent,3);
  for(let i=0;i<c.detail;i++){const a=hash(i*2)*Math.PI*2,R=Math.sqrt(hash(i*2+1))*r*.9,delta=((angle-a)%(Math.PI*2)+Math.PI*2)%(Math.PI*2),strength=c.auto?Math.exp(-delta*1.1)*value/100:value/100;ctx.globalAlpha=strength;circle(x+Math.cos(a)*R,y+Math.sin(a)*R,5,accent,3);}ctx.restore();if(c.labels)text(c.label,500,46,20,fg,'center');
 }else if(c.preset==='scope'){
  title();box(50,110,900,400);for(let i=1;i<12;i++)line(50+i*75,110,50+i*75,510,fg+'28',1);for(let i=1;i<8;i++)line(50,110+i*50,950,110+i*50,fg+'28',1);
  const amplitude=(c.auto?value:c.value)/100*155;for(let channel=0;channel<2;channel++){ctx.strokeStyle=channel?accent:fg;ctx.lineWidth=channel?2:3;ctx.beginPath();for(let i=0;i<=600;i++){const x=50+i*1.5,u=i/600*Math.PI*2*(c.detail/4),y=310+Math.sin(u+t*3+channel*1.5)*amplitude*(channel?.45:1)+Math.sin(u*2.1-t)*amplitude*.12;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();}if(c.labels){text('CH 01',60,555,15);text(`${value.toFixed(1)} V`,940,555,20,accent,'right');}
 }
 ctx.restore();
}
