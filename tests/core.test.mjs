import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,newSurface,newLayer,homography,project,unproject,createMesh,meshPoint,geometry,validateProject,History} from '../src/core.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('perspective mapping reaches every corner and reverses interior points',()=>{
 const corners=[{x:.12,y:.2},{x:.85,y:.1},{x:.7,y:.9},{x:.25,y:.75}],h=homography(corners);
 [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const p=project(h,u,v);near(p.x,corners[i].x);near(p.y,corners[i].y);});
 for(const [u,v]of [[.2,.7],[.5,.5],[.9,.1]]){const p=project(h,u,v),uv=unproject(h,p.x,p.y);near(uv.x,u);near(uv.y,v);}
});
test('tracing preserves the output outline in normalized mask coordinates',()=>{
 const points=[{x:.1,y:.1},{x:.8,y:.2},{x:.5,y:.9},{x:.2,y:.7}],s=newSurface('polygon',points),h=homography(s.corners);
 s.mask.forEach((uv,i)=>{const p=project(h,uv.x,uv.y);near(p.x,points[i].x);near(p.y,points[i].y);});
});
test('mesh nodes deform their neighborhood, leaving distant nodes fixed',()=>{
 const s=newSurface();s.mesh=createMesh(s,3);const old=meshPoint(s,0,0);s.mesh.points[5].x+=.1;
 near(meshPoint(s,1/3,1/3).x,s.mesh.points[5].x);near(meshPoint(s,0,0).x,old.x);
 const g=geometry(s);assert.equal(g.length,24*24*6*5);assert.ok([...g].every(Number.isFinite));
});
test('project validation accepts complete projects and rejects corrupt masks and sizes',()=>{
 const p=newProject();p.surfaces.push(newSurface());p.surfaces[0].layers.push(newLayer('text'));validateProject(p);
 const bad=structuredClone(p);bad.surfaces[0].mesh={divisions:3,points:[]};assert.throws(()=>validateProject(bad),/mesh/);
 const huge=structuredClone(p);huge.width=99999;assert.throws(()=>validateProject(huge),/resolution/);
 const invalid=structuredClone(p);invalid.surfaces[0].holes=[[{x:NaN,y:0}]];assert.throws(()=>validateProject(invalid),/exclusion/);
});
test('undo and redo restore independent geometry and layer snapshots',()=>{
 const p=newProject();p.surfaces.push(newSurface());const history=new History();history.push(p);p.surfaces[0].corners[0].x=.9;
 const previous=history.undo(p);near(previous.surfaces[0].corners[0].x,.2);near(history.redo(previous).surfaces[0].corners[0].x,.9);
 history.push(previous);assert.equal(history.future.length,0);
});

test('joined shapes merge overlap, preserve gaps and cutouts, and use active content',async()=>{
 const {joinSurfaces,surfaceContains}=await import('../src/core.mjs');
 const rect=(x1,y1,x2,y2)=>{const s=newSurface();s.corners=[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}];return s;};
 const a=rect(.1,.1,.5,.5),b=rect(.4,.1,.8,.5);b.layers=[newLayer('text')];b.layers[0].text='Shared';
 const joined=joinSurfaces([a,b],b.id);assert.equal(joined.regions.length,1);assert.equal(joined.regions[0].outline.length,4);assert.ok(surfaceContains(joined,{x:.45,y:.3}));assert.equal(joined.layers[0].text,'Shared');
 const distant=rect(.85,.7,.95,.9),islands=joinSurfaces([a,distant],a.id);assert.equal(islands.regions.length,2);assert.ok(!surfaceContains(islands,{x:.7,y:.6}));
 a.holes=[[{x:.6,y:.2},{x:.9,y:.2},{x:.9,y:.8},{x:.6,y:.8}]];
 const filled=joinSurfaces([a,b],a.id);assert.ok(surfaceContains(filled,{x:.43,y:.3}),'Another shape fills the overlapped portion of a cutout');assert.ok(!surfaceContains(filled,{x:.36,y:.3}),'Uncovered portion of cutout stays transparent');
 const p=newProject();p.surfaces=[islands,filled];validateProject(p);
 const malformed=structuredClone(p);malformed.surfaces[0].regions[0].holes=[[]];assert.throws(()=>validateProject(malformed),/joined/);
});
test('outline points remain editable under perspective and a deformed warp mesh',async()=>{
 const {surfaceUV,moveMaskPoint,editableRings}=await import('../src/core.mjs');
 const s=newSurface('polygon',[{x:.2,y:.2},{x:.7,y:.25},{x:.6,y:.8}]);
 moveMaskPoint(s,0,0,{x:.12,y:.15});let point=meshPoint(s,s.mask[0].x,s.mask[0].y);near(point.x,.12);near(point.y,.15);
 s.mesh=createMesh(s,3);s.mesh.points[5].x+=.08;s.mesh.points[5].y-=.04;
 const target=meshPoint(s,.38,.46),uv=surfaceUV(s,target);near(uv.x,.38);near(uv.y,.46);
 moveMaskPoint(s,0,1,target);point=meshPoint(s,editableRings(s)[0][1].x,editableRings(s)[0][1].y);near(point.x,target.x);near(point.y,target.y);
 const old=newProject();old.version=1;old.surfaces=[newSurface()];validateProject(old);
});

test('surface transforms preserve pixel proportions, mirrored winding, mesh, and cutouts',async()=>{
 const {setSurfaceTransform,transformSettings,moveMaskPoint}=await import('../src/core.mjs');
 const s=newSurface('polygon',[{x:.2,y:.2},{x:.7,y:.2},{x:.4,y:.8}]);s.mesh=createMesh(s,3);s.holes=[[{x:.4,y:.4},{x:.5,y:.4},{x:.5,y:.5}]];const before=structuredClone(s);
 setSurfaceTransform(s,1920,1080,{rotation:90});
 const dx=(s.corners[1].x-s.corners[0].x)*1920,dy=(s.corners[1].y-s.corners[0].y)*1080;near(dx,0);near(dy,(before.corners[1].x-before.corners[0].x)*1920);
 setSurfaceTransform(s,1920,1080,{scaleX:2,scaleY:.5,mirrorX:true});const p=newProject();p.surfaces=[s];validateProject(p);
 assert.deepEqual(s.mask,before.mask);assert.deepEqual(s.holes,before.holes);assert.equal(s.mesh.points.length,16);assert.ok(transformSettings(s).mirrorX);
 setSurfaceTransform(s,1920,1080,{rotation:0,scaleX:1,scaleY:1,mirrorX:false});s.corners.forEach((p,i)=>{near(p.x,before.corners[i].x);near(p.y,before.corners[i].y);});
 s.mesh=null;setSurfaceTransform(s,1920,1080,{mirrorY:true});validateProject({...newProject(),surfaces:[s]});moveMaskPoint(s,0,0,{x:.1,y:.9});validateProject({...newProject(),surfaces:[s]});
});
test('media removal leaves masks and text intact and can be undone',async()=>{
 const {removeMediaAsset}=await import('../src/core.mjs');const p=newProject(),s=newSurface();p.surfaces=[s];p.assets=[{id:'asset',name:'Movie',type:'video'}];s.layers=[newLayer('video','asset'),newLayer('text')];
 const geometryBefore=structuredClone({...s,layers:[]}),history=new History();history.push(p);removeMediaAsset(p,'asset');assert.equal(s.layers.length,1);assert.equal(s.layers[0].type,'text');assert.deepEqual({...s,layers:[]},geometryBefore);validateProject(p);assert.equal(history.undo(p).surfaces[0].layers.length,2);
});
test('mask clipboard is media-independent and preserves joined regions, warps, outlines, transforms',async()=>{
 const {encodeMasks,decodeMasks,joinSurfaces,setSurfaceTransform}=await import('../src/core.mjs');const a=newSurface(),b=newSurface();b.corners.forEach(p=>p.x+=.3);const joined=joinSurfaces([a,b],a.id);joined.layers=[newLayer('video','not-in-target-project')];joined.outline={enabled:true,color:'#ff0066',width:8};joined.mesh=createMesh(joined,3);setSurfaceTransform(joined,1920,1080,{rotation:30,mirrorX:true});
 const pasted=decodeMasks(encodeMasks([joined]),1920,1080);assert.notEqual(pasted[0].id,joined.id);assert.equal(pasted[0].layers.length,0);assert.deepEqual(pasted[0].regions,joined.regions);assert.deepEqual(pasted[0].outline,joined.outline);assert.deepEqual(pasted[0].transform,joined.transform);near(pasted[0].mesh.points[0].x,joined.mesh.points[0].x+20/1920);validateProject({...newProject(),surfaces:pasted});assert.throws(()=>decodeMasks('ordinary text',1920,1080),/clipboard/);
});
test('perimeter outlines follow a concave trace and actual cutout edges',async()=>{
 const {surfacePerimeters,outlineGeometry}=await import('../src/core.mjs');const s=newSurface('polygon',[{x:.1,y:.1},{x:.8,y:.1},{x:.8,y:.3},{x:.4,y:.3},{x:.4,y:.8},{x:.1,y:.8}]);
 let rings=surfacePerimeters(s);assert.equal(rings[0].length,6);near(rings[0][3].x,.4);near(rings[0][3].y,.3);
 s.holes=[[{x:.1,y:.1},{x:.2,y:.1},{x:.2,y:.2},{x:.1,y:.2}]];rings=surfacePerimeters(s);assert.equal(rings.length,2);
 const vertices=outlineGeometry(s,1920,1080);assert.ok(vertices.length>0);assert.ok([...vertices].every(Number.isFinite));const p=newProject();p.surfaces=[s];s.outline.width=-1;assert.throws(()=>validateProject(p),/outline/);
});

test('offscreen handle indicators stay grab-sized and fit-view reveals actual geometry',async()=>{
 const {handleIndicators,fitHandleView}=await import('../src/core.mjs');
 const points=[{x:-2,y:-2},{x:-1,y:-1},{x:3,y:3},{x:.5,y:.5}],view={width:800,height:500,zoom:.35,pan:{x:64,y:61},canvasWidth:1920,canvasHeight:1080};
 const indicators=handleIndicators(points,view);assert.equal(indicators.filter(p=>p.proxy).length,3);
 indicators.forEach(p=>{const x=view.pan.x+p.displayX*1920*view.zoom,y=view.pan.y+p.displayY*1080*view.zoom;assert.ok(x>=13.99&&x<=786.01);assert.ok(y>=13.99&&y<=486.01);});assert.notDeepEqual([indicators[0].displayX,indicators[0].displayY],[indicators[1].displayX,indicators[1].displayY]);assert.equal(indicators[0].x,-2,'Indicator placement does not move the actual point');
 const fitted=fitHandleView(points,1920,1080,800,500);points.forEach(p=>{const x=fitted.pan.x+p.x*1920*fitted.zoom,y=fitted.pan.y+p.y*1080*fitted.zoom;assert.ok(x>=34.99&&x<=765.01);assert.ok(y>=34.99&&y<=465.01);});
});
test('fit-mask-to-media preserves width, center, tracing, and mesh while setting source aspect',async()=>{
 const {fitMaskToMedia,setSurfaceTransform}=await import('../src/core.mjs');const s=newSurface('polygon',[{x:.2,y:.2},{x:.8,y:.25},{x:.5,y:.8}]);s.mesh=createMesh(s,3);setSurfaceTransform(s,1920,1080,{rotation:30,mirrorX:true});const before=structuredClone(s);
 const basis=surface=>{const c=surface.corners.map(p=>({x:p.x*1920,y:p.y*1080}));return{width:Math.hypot((c[1].x-c[0].x+c[2].x-c[3].x)/2,(c[1].y-c[0].y+c[2].y-c[3].y)/2),height:Math.hypot((c[3].x-c[0].x+c[2].x-c[1].x)/2,(c[3].y-c[0].y+c[2].y-c[1].y)/2)};};
 fitMaskToMedia(s,1920,1080,320,640);near(basis(s).width,basis(before).width);near(basis(s).width/basis(s).height,.5);near(s.corners.reduce((a,p)=>a+p.x,0),before.corners.reduce((a,p)=>a+p.x,0));assert.deepEqual(s.mask,before.mask);assert.equal(s.mesh.points.length,16);assert.equal(s.contentAspect,.5);validateProject({...newProject(),surfaces:[s]});assert.throws(()=>fitMaskToMedia(s,1920,1080,0,0),/dimensions/);
});

test('Bézier subdivision preserves the curve and reframe preserves projected geometry',async()=>{
 const {makeBezier,curvePoint,splitCurve,sampleCurve}=await import('../src/led.mjs');const {ensurePath,reframePath}=await import('../src/core.mjs');
 const s=newSurface('polygon',[{x:.2,y:.2},{x:.8,y:.2},{x:.6,y:.8}]);const path=ensurePath(s);makeBezier(path,0);path.nodes[0].out.y=-.3;const original=structuredClone(path),mid=curvePoint(path,0,.5);splitCurve(path,0,.5);near(path.nodes[1].x,mid.x);near(path.nodes[1].y,mid.y);for(const t of [.1,.25,.75,.9]){const a=curvePoint(original,0,t),b=t<=.5?curvePoint(path,0,t*2):curvePoint(path,1,(t-.5)*2);near(a.x,b.x);near(a.y,b.y);}
 const before=sampleCurve(path).map(p=>meshPoint(s,p.x,p.y));reframePath(s);const after=sampleCurve(path).map(p=>meshPoint(s,p.x,p.y));assert.equal(before.length,after.length);before.forEach((p,i)=>{near(p.x,after[i].x);near(p.y,after[i].y);});validateProject({...newProject(),surfaces:[s]});
});
test('LED density uses calibrated arc length and solid mode preserves its path',async()=>{
 const {pathNode,ledDefaults,stripMetrics,ledGeometry,makeBezier}=await import('../src/led.mjs');const s=newSurface();s.path={closed:false,nodes:[pathNode({x:0,y:.5}),pathNode({x:1,y:.5})]};s.led=ledDefaults();s.led.pixelsPerInch=100;s.led.density=2;
 const metrics=stripMetrics(s,1000,1000,meshPoint);near(metrics.table.length,600);near(metrics.inches,6);assert.equal(metrics.count,13);
 const dots=ledGeometry(s,1000,1000,meshPoint);assert.ok(dots.vertices.length>0);assert.ok([...dots.vertices].every(Number.isFinite));makeBezier(s.path,0);s.path.nodes[0].out.y=-.5;makeBezier(s.path,1);s.path.nodes[1].in.y=.5;assert.ok(stripMetrics(s,1000,1000,meshPoint).table.length>600);
 s.led.mode='solid';const solid=ledGeometry(s,1000,1000,meshPoint);assert.ok(solid.vertices.length>0);s.led.density=240;s.led.pixelsPerInch=.1;assert.equal(stripMetrics(s,1000,1000,meshPoint).count,4096);validateProject({...newProject(),surfaces:[s]});s.path.nodes[0].out.x=Infinity;assert.throws(()=>validateProject({...newProject(),surfaces:[s]}),/path/);
});
test('shared animation clock pauses and resumes without jumping',async()=>{
 const {animationTime}=await import('../src/led.mjs');const {setAnimationPlaying}=await import('../src/core.mjs');const p=newProject();p.clock={elapsed:0,startedAt:1000};p.playing=true;near(animationTime(p,2500),1500);setAnimationPlaying(p,false,2500);near(animationTime(p,5000),1500);setAnimationPlaying(p,true,6000);near(animationTime(p,7000),2500);
});


test('legacy connected joined masks convert to editable LED paths without losing holes or placement',async()=>{
 const {ensurePath,surfacePerimeters,clone}=await import('../src/core.mjs');
 const {ledDefaults,makeBezier}=await import('../src/led.mjs');
 const s=newSurface();s.mask=null;s.regions=[{outline:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],holes:[[{x:.3,y:.3},{x:.7,y:.3},{x:.5,y:.7}]]}];
 const before=surfacePerimeters(s),layers=clone(s.layers),corners=clone(s.corners);
 const path=ensurePath(s);assert.equal(path.closed,true);assert.equal(path.nodes.length,4);assert.equal(s.regions,undefined);assert.equal(s.holes.length,1);
 const after=surfacePerimeters(s);assert.equal(after.length,before.length);before.forEach((ring,i)=>{assert.equal(after[i].length,ring.length);ring.forEach(p=>assert.ok(after[i].some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1e-8)));});assert.deepEqual(s.layers,layers);assert.deepEqual(s.corners,corners);
 s.led=ledDefaults();const p=newProject();p.surfaces=[s];validateProject(JSON.parse(JSON.stringify(p)));
 makeBezier(path,0);assert.equal(path.nodes[0].mode,'bezier');delete s.led;assert.equal(s.holes.length,1);assert.deepEqual(s.layers,layers);
 const multi=clone(s);delete multi.path;multi.regions=[{outline:clone(s.mask),holes:[]},{outline:clone(s.mask),holes:[]}];const unchanged=clone(multi);assert.throws(()=>ensurePath(multi),/disconnected/);assert.deepEqual(multi,unchanged);
});
