import {drawPreset,presetFootprint} from './presets.mjs';
import {LED_EFFECTS,ledGeometry,paletteColors,animationTime} from './led.mjs';
import {LED_VERTEX,LED_FRAGMENT} from './led-shaders.mjs';
import {geometry,meshPoint,maskRegions,outlineSettings,outlineGeometry} from './core.mjs';
const VS=`attribute vec2 a_position;attribute vec3 a_uvq;varying vec3 v_uvq;void main(){gl_Position=vec4(a_position,0.,1.);v_uvq=a_uvq;}`;
const FS=`precision mediump float;uniform sampler2D u_texture;uniform float u_opacity;uniform float u_brightness;uniform float u_premultiplied;varying vec3 v_uvq;void main(){vec4 c=texture2D(u_texture,v_uvq.xy/v_uvq.z);gl_FragColor=vec4(c.rgb*u_brightness*mix(1.,u_opacity,u_premultiplied),c.a*u_opacity);}`;
export class ProjectionRenderer {
  constructor(canvas,onError=()=>{}){
    this.canvas=canvas;this.onError=onError;this.media=new Map();this.surfaces=new Map();this.project=null;this.lastFrame=0;
    const gl=this.gl=canvas.getContext('webgl',{alpha:false,antialias:true,stencil:true,preserveDrawingBuffer:true});
    if(!gl)throw new Error('GPU rendering is unavailable. Enable hardware acceleration and restart Surface.');
    this.maxAttributes=gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    this.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);this.anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');this.anisotropyLevel=this.anisotropy?Math.min(4,gl.getParameter(this.anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)):1;
    const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
    const program=this.program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,VS));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FS));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    const solid=this.solidProgram=gl.createProgram();gl.attachShader(solid,shader(gl.VERTEX_SHADER,'attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.,1.);}'));gl.attachShader(solid,shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform vec4 u_color;void main(){gl_FragColor=u_color;}'));gl.linkProgram(solid);if(!gl.getProgramParameter(solid,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(solid));this.solidPosition=gl.getAttribLocation(solid,'a_position');this.solidColor=gl.getUniformLocation(solid,'u_color');
    const ledProgram=this.ledProgram=gl.createProgram();gl.attachShader(ledProgram,shader(gl.VERTEX_SHADER,LED_VERTEX));gl.attachShader(ledProgram,shader(gl.FRAGMENT_SHADER,LED_FRAGMENT));gl.linkProgram(ledProgram);if(!gl.getProgramParameter(ledProgram,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(ledProgram));
    this.ledAttributes=['a_position','a_index','a_strength'].map(n=>gl.getAttribLocation(ledProgram,n));this.ledUniforms=Object.fromEntries(['time','count','speed','intensity','opacity','brightness','grouping','spacing','reverse','mirror','effect','color0','color1','color2'].map(n=>[n,gl.getUniformLocation(ledProgram,'u_'+n)]));
    gl.useProgram(program);this.position=gl.getAttribLocation(program,'a_position');this.uvq=gl.getAttribLocation(program,'a_uvq');
    this.opacity=gl.getUniformLocation(program,'u_opacity');this.brightness=gl.getUniformLocation(program,'u_brightness');this.premultiplied=gl.getUniformLocation(program,'u_premultiplied');
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,1);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.onError('GPU context lost. Save your project and restart Surface.');});
    this.frame=requestAnimationFrame(t=>this.animate(t));
  }
  update(project){
    this.project=project;
    const active=new Set(project.assets.map(a=>a.id));
    for(const [id,m]of this.media)if(!active.has(id)||project.assets.find(a=>a.id===id)?.missing||project.assets.find(a=>a.id===id)?.url!==m.url){m.disposed=true;m.el.pause?.();m.el.removeAttribute('src');m.el.load?.();this.media.delete(id);}
    for(const a of project.assets){
      if(a.missing||this.media.has(a.id))continue;
      const el=document.createElement(a.type==='video'?'video':'img');
      const m={el,type:a.type,url:a.url,ready:false,error:false};this.media.set(a.id,m);
      const ready=()=>{if(m.disposed)return;m.ready=true;this.invalidate();};
      el.addEventListener(a.type==='video'?'loadeddata':'load',ready);
      el.addEventListener('error',()=>{if(m.disposed)return;m.error=true;this.onError(`Cannot decode “${a.name}”. Try PNG/JPEG, H.264 MP4, or WebM.`);this.invalidate();});
      if(a.type==='video'){el.muted=true;el.playsInline=true;el.preload='auto';el.addEventListener('loadedmetadata',()=>{if(!m.disposed)this.applyPlayback(this.project);});}
      el.src=a.url;
    }
    const surfaces=new Set(project.surfaces.map(s=>s.id));
    for(const[id,r]of this.surfaces)if(!surfaces.has(id)){this.gl.deleteTexture(r.texture);this.gl.deleteBuffer(r.buffer);this.gl.deleteBuffer(r.outlineBuffer);if(r.ledBuffer)this.gl.deleteBuffer(r.ledBuffer);this.surfaces.delete(id);}
    this.applyPlayback(project);this.invalidate();
  }
  applyPlayback(project){
    for(const s of project.surfaces)for(const l of s.layers){
      const m=this.media.get(l.assetId);if(!m||m.type!=='video')continue;
      m.el.loop=l.loop;m.el.playbackRate=l.speed;
      const time=project.mediaTimes?.[l.assetId];
      if(Number.isFinite(time)&&m.el.readyState>=1&&Math.abs(m.el.currentTime-time)>.25)try{m.el.currentTime=time;}catch{}
      if(project.playing&&m.el.paused)m.el.play().catch(()=>{});else if(!project.playing&&!m.el.paused)m.el.pause();
    }
  }
  mediaDimensions(id){const m=this.media.get(id);if(!m||m.error)return null;const width=m.el.videoWidth||m.el.naturalWidth,height=m.el.videoHeight||m.el.naturalHeight;return width&&height?{width,height}:null;}
  times(){return Object.fromEntries([...this.media].filter(([,m])=>m.type==='video').map(([id,m])=>[id,m.el.currentTime]));}
  restart(){for(const m of this.media.values())if(m.type==='video')m.el.currentTime=0;this.invalidate();}
  invalidate(){for(const r of this.surfaces.values())r.dirty=true;}
  animate(t){
    if(t-this.lastFrame>1000/30){this.draw();this.lastFrame=t;}
    this.frame=requestAnimationFrame(t=>this.animate(t));
  }
  resource(s){
    if(this.surfaces.has(s.id)){const r=this.surfaces.get(s.id);this.resizeTexture(s,r);return r;}
    const gl=this.gl,c=document.createElement('canvas');c.width=1280;c.height=720;
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const r={canvas:c,ctx:c.getContext('2d'),texture,buffer:gl.createBuffer(),outlineBuffer:gl.createBuffer(),dirty:true};this.resizeTexture(s,r);this.surfaces.set(s.id,r);return r;
  }
  resizeTexture(s,r){
    const aspect=s.contentAspect||16/9,w=aspect>=1?1280:Math.max(1,Math.round(1280*aspect)),h=aspect>=1?Math.max(1,Math.round(1280/aspect)):1280;
    if(r.canvas.width!==w||r.canvas.height!==h){r.canvas.width=w;r.canvas.height=h;r.dirty=true;r.uploadDirty=true;}
  }
  uploadTexture(s,r){
    const gl=this.gl,mipmapped=s.layers.some(l=>l.type==='preset');let source=r.canvas;
    if(mipmapped){
      // WebGL 1 needs power-of-two textures for mipmaps. Resample the full
      // composition to fill that texture so the existing UVs/aspect stay intact.
      if(!r.mipmapCanvas){r.mipmapCanvas=document.createElement('canvas');r.mipmapContext=r.mipmapCanvas.getContext('2d');}
      const size=n=>Math.min(this.maxTextureSize,2**Math.ceil(Math.log2(n))),w=size(source.width),h=size(source.height);
      if(r.mipmapCanvas.width!==w||r.mipmapCanvas.height!==h){r.mipmapCanvas.width=w;r.mipmapCanvas.height=h;}
      const ctx=r.mipmapContext;ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,w,h);source=r.mipmapCanvas;
    }else if(r.mipmapCanvas){r.mipmapCanvas.width=1;r.mipmapCanvas.height=1;delete r.mipmapCanvas;delete r.mipmapContext;}
    // Average premultiplied colors so transparent strokes keep their brightness.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,mipmapped);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);r.premultiplied=mipmapped;
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mipmapped?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);
    if(this.anisotropy)gl.texParameterf(gl.TEXTURE_2D,this.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,mipmapped?this.anisotropyLevel:1);
    if(mipmapped)gl.generateMipmap(gl.TEXTURE_2D);
    r.uploaded=true;r.uploadDirty=false;
  }
  grid(ctx,w,h,label,mesh=null){
    ctx.fillStyle='#0c2021';ctx.fillRect(0,0,w,h);ctx.lineWidth=2;ctx.strokeStyle='#51e2bc';ctx.beginPath();
    const divisions=mesh?.divisions||10;for(let x=0;x<=w;x+=w/divisions){ctx.moveTo(x,0);ctx.lineTo(x,h);}for(let y=0;y<=h;y+=h/divisions){ctx.moveTo(0,y);ctx.lineTo(w,y);}ctx.stroke();
    ctx.lineWidth=6;ctx.strokeStyle='#e7fff8';ctx.strokeRect(3,3,w-6,h-6);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(w,h);ctx.moveTo(w,0);ctx.lineTo(0,h);ctx.stroke();
    ctx.fillStyle='#061414cc';ctx.fillRect(w*.2,h*.4,w*.6,h*.2);ctx.fillStyle='#edfff9';ctx.font=`600 ${Math.round(h*.065)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,w/2,h/2,w*.55);
    if(mesh){ctx.font=`600 ${h*.04}px monospace`;for(let y=0;y<=divisions;y++)for(let x=0;x<=divisions;x++){const px=Math.max(25,Math.min(w-25,x*w/divisions+22)),py=Math.max(25,Math.min(h-25,y*h/divisions+22));ctx.fillStyle='#061414';ctx.fillRect(px-22,py-18,44,36);ctx.fillStyle='#edfff9';ctx.fillText(String(y*(divisions+1)+x+1),px,py);}}else{ctx.font=`600 ${h*.08}px monospace`;[[.04,.07],[.96,.07],[.96,.93],[.04,.93]].forEach(([x,y],i)=>ctx.fillText(String(i+1),x*w,y*h));}
  }
  compose(s,r){
    const {ctx,canvas}=r,w=canvas.width,h=canvas.height,p=this.project;
    ctx.clearRect(0,0,w,h);ctx.save();
    if(s.type==='ellipse'&&!s.path){ctx.beginPath();ctx.ellipse(w/2,h/2,w/2,h/2,0,0,Math.PI*2);ctx.clip();}
    else if(maskRegions(s).length){ctx.beginPath();for(const region of maskRegions(s))for(const ring of [region.outline,...region.holes]){ring.forEach((a,i)=>i?ctx.lineTo(a.x*w,a.y*h):ctx.moveTo(a.x*w,a.y*h));ctx.closePath();}ctx.clip('evenodd');}
    if(p.calibration){this.grid(ctx,w,h,s.name,s.mesh);}else for(const l of s.layers){
      if(!l.visible)continue;ctx.save();ctx.globalAlpha=l.opacity;
      ctx.translate(w/2+l.x*w,h/2+l.y*h);ctx.rotate((l.rotation||0)*Math.PI/180);ctx.scale(l.scale*(l.scaleX??1)*(l.mirrorX?-1:1),l.scale*(l.scaleY??1)*(l.mirrorY?-1:1));ctx.translate(-w/2,-h/2);
      if(l.type==='grid')this.grid(ctx,w,h,s.name,s.mesh);
      else if(l.type==='preset')drawPreset(ctx,w,h,l.animation,animationTime(p)/1000,presetFootprint(s,l,p.width,p.height,meshPoint));
      else if(l.type==='color'){ctx.fillStyle=l.color;ctx.fillRect(0,0,w,h);}
      else if(l.type==='text'){
        ctx.fillStyle=l.color;ctx.font=`600 ${l.fontSize}px ${l.font}`;ctx.textAlign=l.align;ctx.textBaseline='middle';
        const lines=l.text.split('\n'),lineHeight=l.fontSize*1.25,x=l.align==='left'?w*.05:l.align==='right'?w*.95:w/2;
        lines.forEach((line,i)=>ctx.fillText(line,x,h/2+(i-(lines.length-1)/2)*lineHeight));
      }else{
        const m=this.media.get(l.assetId);
        if(m?.ready&&!m.error){
          const iw=m.el.videoWidth||m.el.naturalWidth,ih=m.el.videoHeight||m.el.naturalHeight;
          if(iw&&ih){const ratio=l.fit==='cover'?Math.max(w/iw,h/ih):Math.min(w/iw,h/ih),dw=l.fit==='stretch'?w:iw*ratio,dh=l.fit==='stretch'?h:ih*ratio;ctx.drawImage(m.el,(w-dw)/2,(h-dh)/2,dw,dh);}
        }else{ctx.fillStyle='#271c23';ctx.fillRect(0,0,w,h);ctx.fillStyle='#ffb8a9';ctx.textAlign='center';ctx.font='32px sans-serif';ctx.fillText(m?.error?'Unsupported media':'Missing / loading media',w/2,h/2);}
      }
      ctx.restore();
    }
    ctx.restore();ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';
    for(const hole of s.holes){ctx.beginPath();hole.forEach((a,i)=>i?ctx.lineTo(a.x*w,a.y*h):ctx.moveTo(a.x*w,a.y*h));ctx.closePath();ctx.fill();}ctx.restore();
    r.dirty=false;r.uploadDirty=true;
  }
  drawOutline(s,r){
    const outline=outlineSettings(s);if(!outline.enabled)return;
    const gl=this.gl,p=this.project,key=JSON.stringify([s.corners,s.mask,s.regions,s.mesh,s.holes,outline.width,p.width,p.height]);
    gl.bindBuffer(gl.ARRAY_BUFFER,r.outlineBuffer);
    if(r.outlineKey!==key){const vertices=outlineGeometry(s,p.width,p.height);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);r.outlineCount=vertices.length/2;r.outlineKey=key;}
    gl.useProgram(this.solidProgram);gl.disableVertexAttribArray(this.position);gl.disableVertexAttribArray(this.uvq);gl.enableVertexAttribArray(this.solidPosition);gl.vertexAttribPointer(this.solidPosition,2,gl.FLOAT,false,8,0);
    const color=outline.color;gl.uniform4f(this.solidColor,parseInt(color.slice(1,3),16)/255,parseInt(color.slice(3,5),16)/255,parseInt(color.slice(5,7),16)/255,s.opacity);
    // Draw overlapping segment quads and round joins only once at each pixel.
    gl.enable(gl.STENCIL_TEST);gl.stencilMask(0xff);gl.clearStencil(0);gl.clear(gl.STENCIL_BUFFER_BIT);gl.stencilFunc(gl.EQUAL,0,0xff);gl.stencilOp(gl.KEEP,gl.KEEP,gl.INCR);
    gl.drawArrays(gl.TRIANGLES,0,r.outlineCount);gl.disable(gl.STENCIL_TEST);gl.disableVertexAttribArray(this.solidPosition);
  }
  drawLED(s,r){
    if(!s.led.enabled)return;
    const gl=this.gl,p=this.project,led=s.led,key=JSON.stringify([s.path,s.corners,s.mesh,p.width,p.height,led.mode,led.width,led.density,led.pixelsPerInch,led.coverage,led.glow]);
    if(!r.ledBuffer)r.ledBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,r.ledBuffer);
    if(r.ledKey!==key){const layout=ledGeometry(s,p.width,p.height,meshPoint);gl.bufferData(gl.ARRAY_BUFFER,layout.vertices,gl.STATIC_DRAW);r.ledCount=layout.count;r.ledVertexCount=layout.vertices.length/4;r.ledKey=key;}
    gl.useProgram(this.ledProgram);for(let i=0;i<this.maxAttributes;i++)gl.disableVertexAttribArray(i);
    this.ledAttributes.forEach((attr,i)=>{gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,i===0?2:1,gl.FLOAT,false,16,i===0?0:i===1?8:12);});
    const u=this.ledUniforms,calibration=p.calibration,colors=calibration?[[1,1,1],[1,1,1],[1,1,1]]:paletteColors(led);
    gl.uniform1f(u.time,animationTime(p)/1000);gl.uniform1f(u.count,r.ledCount);gl.uniform1f(u.speed,led.speed);gl.uniform1f(u.intensity,led.intensity);gl.uniform1f(u.opacity,s.opacity);gl.uniform1f(u.brightness,s.brightness);gl.uniform1f(u.grouping,calibration?1:led.grouping);gl.uniform1f(u.spacing,calibration?0:led.spacing);gl.uniform1f(u.reverse,led.reverse?1:0);gl.uniform1f(u.mirror,led.mirror?1:0);gl.uniform1i(u.effect,calibration?0:LED_EFFECTS.findIndex(([id])=>id===led.effect));colors.forEach((c,i)=>gl.uniform3fv(u['color'+i],c));
    gl.drawArrays(gl.TRIANGLES,0,r.ledVertexCount);this.ledAttributes.forEach(attr=>gl.disableVertexAttribArray(attr));
  }
  draw(){
    const p=this.project;if(!p)return;const gl=this.gl;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);
    if(p.blackout)return;
    gl.useProgram(this.program);
    for(const s of p.surfaces){
      if(!s.visible||(p.isolate&&p.isolate!==s.id))continue;
      const r=this.resource(s);if(s.led){this.drawLED(s,r);continue;}gl.useProgram(this.program);const video=s.layers.some(l=>l.visible&&l.type==='video'),animated=s.layers.some(l=>l.visible&&l.type==='preset'&&!l.animation.paused)&&p.playing&&!p.calibration;
      if(r.dirty||video||animated)this.compose(s,r);
      gl.bindTexture(gl.TEXTURE_2D,r.texture);
      if(r.uploaded!==true||r.uploadDirty)this.uploadTexture(s,r);
      const shapeKey=JSON.stringify([s.corners,s.mesh]);
      gl.bindBuffer(gl.ARRAY_BUFFER,r.buffer);
      if(r.shapeKey!==shapeKey){const verts=geometry(s);gl.bufferData(gl.ARRAY_BUFFER,verts,gl.DYNAMIC_DRAW);r.count=verts.length/5;r.shapeKey=shapeKey;}
      gl.enableVertexAttribArray(this.position);gl.vertexAttribPointer(this.position,2,gl.FLOAT,false,20,0);
      gl.enableVertexAttribArray(this.uvq);gl.vertexAttribPointer(this.uvq,3,gl.FLOAT,false,20,8);
      gl.uniform1f(this.opacity,s.opacity);gl.uniform1f(this.brightness,s.brightness);gl.uniform1f(this.premultiplied,r.premultiplied?1:0);gl.blendFunc(r.premultiplied?gl.ONE:gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.TRIANGLES,0,r.count);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);this.drawOutline(s,r);
    }
  }
}
