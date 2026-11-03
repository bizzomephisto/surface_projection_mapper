const {_electron:electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
(async()=>{
 const executable=process.env.SURFACE_EXECUTABLE;
 const app=await electron.launch({...(executable?{executablePath:executable}:{}),args:executable?['--ozone-platform=x11']:[path.join(__dirname,'..'),'--ozone-platform=x11']});
 try{
  const page=await app.firstWindow();await page.waitForSelector('#first-surface');
  const result=await page.evaluate(async()=>{
   const {ProjectionRenderer}=await import('./renderer.mjs'),{newProject,newSurface,newLayer}=await import('./core.mjs'),{presetDefaults}=await import('./presets.mjs');
   const canvas=document.createElement('canvas');canvas.width=768;canvas.height=432;const renderer=new ProjectionRenderer(canvas);cancelAnimationFrame(renderer.frame);const gl=renderer.gl;
   const project=newProject();project.width=768;project.height=432;project.playing=false;project.clock={elapsed:2300,startedAt:0};const s=newSurface();s.outline.enabled=false;s.corners=[{x:1/3,y:1/3},{x:2/3,y:1/3},{x:2/3,y:2/3},{x:1/3,y:2/3}];const l=newLayer('preset');l.animation=presetDefaults('gauge');l.animation.layout='detailed';s.layers=[l];project.surfaces=[s];
   const upload=renderer.uploadTexture,read=()=>{const data=new Uint8Array(768*432*4);gl.readPixels(0,0,768,432,gl.RGBA,gl.UNSIGNED_BYTE,data);const flipped=new Uint8ClampedArray(data.length);for(let y=0;y<432;y++)flipped.set(data.subarray((431-y)*768*4,(432-y)*768*4),y*768*4);return flipped;};
   const reference=document.createElement('canvas');reference.width=768;reference.height=432;const ctx=reference.getContext('2d'),errors=[],captures=[];
   for(const [scale,transparent,opacity] of [[1,false,1],[.65,false,1],[.35,false,1],[.65,true,1],[.65,true,.45]]){
    l.scale=scale;l.animation.transparent=transparent;s.opacity=opacity;
    renderer.uploadTexture=function(s,r){r.premultiplied=false;gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,r.canvas);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);if(this.anisotropy)gl.texParameterf(gl.TEXTURE_2D,this.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,1);r.uploaded=true;r.uploadDirty=false;};
    renderer.update(project);renderer.draw();const before=read();
    renderer.uploadTexture=upload;renderer.update(project);renderer.draw();const after=read(),r=renderer.resource(s);
    ctx.globalAlpha=1;ctx.fillStyle='black';ctx.fillRect(0,0,768,432);ctx.globalAlpha=opacity;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(r.canvas,256,144,256,144);const target=ctx.getImageData(0,0,768,432).data;
    const error=data=>{let sum=0;for(let y=145;y<287;y++)for(let x=257;x<511;x++)for(let c=0;c<3;c++){const i=(y*768+x)*4+c;sum+=(data[i]-target[i])**2;}return sum/(142*254*3);};
    errors.push({scale,transparent,opacity,before:error(before),after:error(after)});if(!transparent)captures.push({before,after});
   }
   const gallery=document.createElement('canvas');gallery.width=1536;gallery.height=360;const g=gallery.getContext('2d');g.fillStyle='#11191d';g.fillRect(0,0,1536,360);
   captures.forEach(({before,after},i)=>{for(const[data,col]of [[before,0],[after,1]]){const temp=document.createElement('canvas');temp.width=768;temp.height=432;temp.getContext('2d').putImageData(new ImageData(data,768,432),0,0);g.imageSmoothingEnabled=false;g.drawImage(temp,256,144,256,144,col*768+i*256,44,256,144);g.drawImage(temp,320,180,128,72,col*768+i*256,206,256,144);}});
   g.fillStyle='#e2e9ec';g.font='18px sans-serif';g.fillText('Before: linear filtering (100% / 2× detail)' ,20,28);g.fillText('After: mipmap filtering (100% / 2× detail)' ,788,28);
   return {errors,glError:gl.getError(),comparison:gallery.toDataURL().split(',')[1]};
  });
  await fs.mkdir(path.resolve('test-results'),{recursive:true});await fs.writeFile(path.resolve('test-results/small-presets-filtering.png'),Buffer.from(result.comparison,'base64'));
  assert.equal(result.glError,0,'Mipmap upload and sampling have no WebGL errors');
  for(const sample of result.errors)assert.ok(sample.after<sample.before*.65,`Filtering improves scale ${sample.scale}, transparency ${sample.transparent}, opacity ${sample.opacity}`);
  const before=result.errors.reduce((s,e)=>s+e.before,0),after=result.errors.reduce((s,e)=>s+e.after,0);console.log(result.errors);assert.ok(after<before*.65,`Reduced presets should approach high-quality area downsampling: before ${before}, after ${after}`);
  console.log('Small preset filtering passed; aggregate reference error reduced '+Math.round((1-after/before)*100)+'%.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
