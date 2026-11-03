import {PRESETS,presetDefaults,retimePreset,resetPresetClocks} from './presets.mjs';
import {LED_EFFECTS,LED_PALETTES,ledDefaults,pathNode,curvePoint,makeBezier,splitCurve,stripMetrics,animationTime} from './led.mjs';
import {newProject,newSurface,newLayer,uid,clone,clamp,createMesh,meshPoint,History,editableRings,surfaceRegions,surfaceContains,surfaceUV,moveMaskPoint,joinSurfaces,outlineSettings,transformSettings,setSurfaceTransform,removeMediaAsset,handleIndicators,fitHandleView,fitMaskToMedia,ensurePath,reframePath,setAnimationPlaying} from './core.mjs';
import {ProjectionRenderer} from './renderer.mjs';
const $=s=>document.querySelector(s),api=window.desktop;
let state=newProject(),selected=null,selectedLayer=null,pointSelection=null,tool='select',trace=[],dirty=false,outputOpen=false;
let revision=0,saving=false,selectedIds=new Set(),minimal=false,deleteTarget='surface';
let zoom=1,pan={x:0,y:0},drag=null,showGuides=true,projectFile=null,toastTimer,fitMode=true;
const history=new History(),svg=$('#overlay'),wrap=$('#stage-wrap'),viewport=$('#canvas-viewport');
const renderer=new ProjectionRenderer($('#projection'),message=>toast(message,true));
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const surface=()=>state.surfaces.find(s=>s.id===selected),layer=()=>surface()?.layers.find(l=>l.id===selectedLayer);
function toast(message,error=false){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.toggle('error',error);$('#toast').style.display='block';$('#status').textContent=message;toastTimer=setTimeout(()=>$('#toast').style.display='none',error?8000:4000);}
async function attempt(fn){try{return await fn();}catch(error){toast(error.message||String(error),true);return null;}}
function snapshot(){history.push(state);}
function changed(refresh=true){revision++;dirty=true;$('#dirty').style.visibility='visible';sync();if(refresh)render();}
function sync(){renderer.update(state);api.sync({...state,mediaTimes:renderer.times()});}
function transact(fn){snapshot();fn();changed();}
function select(id,additive=false){
  deleteTarget='surface';
  if(additive){if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);selected=selectedIds.has(id)?id:[...selectedIds].at(-1)??null;}
  else{selected=id;selectedIds=new Set(id?[id]:[]);}
  selectedLayer=surface()?.layers.at(-1)?.id;pointSelection=null;trace=[];if(['hole','mask','mesh'].includes(tool)&&!surface())tool='select';render();
}
function safeSelection(){if(!surface()){selected=state.surfaces.at(-1)?.id??null;selectedLayer=surface()?.layers.at(-1)?.id??null;}if(!layer())selectedLayer=surface()?.layers.at(-1)?.id;selectedIds=new Set(selected?[selected]:[]);pointSelection=null;}
function joinSelected(){
  const chosen=state.surfaces.filter(s=>selectedIds.has(s.id));
  try{const joined=joinSurfaces(chosen,selected),top=Math.max(...chosen.map(s=>state.surfaces.indexOf(s)));transact(()=>{const below=state.surfaces.slice(0,top+1).filter(s=>!selectedIds.has(s.id)).length;state.surfaces=state.surfaces.filter(s=>!selectedIds.has(s.id));state.surfaces.splice(below,0,joined);state.version=6;if(state.isolate)state.isolate=joined.id;selected=joined.id;selectedIds=new Set([selected]);selectedLayer=joined.layers.at(-1)?.id;pointSelection=null;tool='select';});toast('Shapes joined. The active shape’s content fills the combined mask. Undo restores the originals.');}catch(error){toast(error.message,true);}
}
function applyLED(){
 const s=surface();if(!s){setTool('led');toast('Click a strip path, then Enter to finish. Shift+Enter closes a loop.');return;}if(s.locked)return;
 try{const copy=clone(s);ensurePath(copy);copy.led=copy.led||ledDefaults();transact(()=>{Object.assign(s,copy);state.version=6;if(!state.clock)state.clock={elapsed:0,startedAt:Date.now()};tool='select';pointSelection={kind:'mask',ring:0,index:0};});toast('LEDSTRIP applied. Set its measured length to calibrate LEDs per inch.');}catch(error){toast(error.message,true);}
}
function createStrip(points,closed=false){
 const s=newSurface('polygon',points);const nodes=points.map(p=>surfaceUV(s,p));s.type=closed?'polygon':'quad';s.mask=closed?nodes:null;s.path={closed,nodes:nodes.map(pathNode)};s.led=ledDefaults();s.layers=[];s.name=`LED strip ${state.surfaces.length+1}`;
 transact(()=>{state.surfaces.push(s);selected=s.id;selectedIds=new Set([selected]);selectedLayer=null;pointSelection={kind:'mask',ring:0,index:0};state.version=6;});tool='select';render();toast('Strip created. Select a point and use Make Bézier to curve it.');
}
function curveNodeIndex(s){const n=s.path?.nodes.length||s.mask?.length||4;return pointSelection&&(pointSelection.kind==='mask'||pointSelection.kind.startsWith('curve-'))?clamp(pointSelection.index,0,n-1):0;}
function curvePointAction(enabled){
 const s=surface();if(!s||s.locked)return;try{const copy=clone(s),path=ensurePath(copy),index=curveNodeIndex(s);makeBezier(path,Math.min(index,path.nodes.length-1),enabled);reframePath(copy);transact(()=>{Object.assign(s,copy);pointSelection={kind:'mask',ring:0,index:Math.min(index,path.nodes.length-1)};state.version=6;});}catch(error){toast(error.message,true);}
}
function ledPanel(s){
 const led=s.led,path=s.path,nodeIndex=curveNodeIndex(s),node=path?.nodes[nodeIndex],metrics=led?stripMetrics(s,state.width,state.height,meshPoint):null;
 return `<section class="inspector-section led-panel"><h3>LEDSTRIP & Bézier path</h3><div class="inspector-actions"><button id="apply-led" ${led?'disabled':''}>${led?'LEDSTRIP applied':'Apply LEDSTRIP'}</button>${led?'<button id="remove-led">Restore mask content</button>':''}</div>${path||s.mask||s.type==='ellipse'?`${selectField('Selected path point','curve-node',String(nodeIndex),(path?.nodes||s.mask||Array(4).fill(0)).map((_,i)=>[String(i),`Point ${i+1}`]))}<div class="inspector-actions"><button id="make-bezier">Make Bézier</button><button id="make-corner">Make corner</button></div>${node?.mode==='bezier'?`<label class="field"><span><input id="curve-linked" type="checkbox" ${node.linked?'checked':''}> Linked tangents</span></label>`:''}`:''}
 ${led?`${selectField('Strip rendering','led-mode',led.mode,[['dots','Individual LED dots'],['blocks','Individual LED blocks'],['solid','Continuous solid strip']])}<div class="field-row">${input('LEDs per inch','led-density',led.density,'number','min="0.1" max="240" step="0.1"')}${input('Strip width (px)','led-width',led.width,'number','min="1" max="200" step="1"')}</div>${input('Measured path length (in)','led-length',Math.round(metrics.inches*100)/100,'number','min="0.01" step="0.1"')}${input('Output pixels per inch','led-ppi',Math.round(led.pixelsPerInch*1000)/1000,'number','min="0.1" max="10000" step="0.1"')}<p id="led-count">${metrics.count} LEDs · ${metrics.table.length.toFixed(0)} output pixels${metrics.capped?' · capped at 4096; reduce density':''}</p><p>96 px/in is an initial estimate. Enter the measured projected path length to calibrate physical density.</p>${range('LED coverage / fill','led-coverage',led.coverage,.05,1)}${range('Glow (dots / blocks)','led-glow',led.glow,0,1)}<label class="field"><span><input id="led-closed" type="checkbox" ${path.closed?'checked':''}> Closed loop</span></label>${selectField('WLED-style effect','led-effect',led.effect,LED_EFFECTS)}${selectField('Palette','led-palette',led.palette,LED_PALETTES)}<div class="field-row">${input('Color 1','led-color-0',led.colors[0],'color')}${input('Color 2','led-color-1',led.colors[1],'color')}</div>${input('Color 3','led-color-2',led.colors[2],'color')}${range('Speed','led-speed',led.speed,0,255,1)}${range('Intensity','led-intensity',led.intensity,0,255,1)}<div class="field-row">${input('Grouping','led-grouping',led.grouping,'number','min="1" max="100"')}${input('Spacing','led-spacing',led.spacing,'number','min="0" max="100"')}</div><label class="field"><span><input id="led-reverse" type="checkbox" ${led.reverse?'checked':''}> Reverse direction</span><span><input id="led-mirror" type="checkbox" ${led.mirror?'checked':''}> Mirror effect</span><span><input id="led-enabled" type="checkbox" ${led.enabled?'checked':''}> Strip enabled</span></label><p>Local projection effects inspired by WLED. No controller required; previews are not firmware-identical. Select Custom colors to use the three color controls.</p>`:''}</section>`;
}
function bindLED(s){
 $('#apply-led').onclick=applyLED;
 if($('#make-bezier')){$('#make-bezier').onclick=()=>curvePointAction(true);$('#make-corner').onclick=()=>curvePointAction(false);$('#curve-node').onchange=e=>{pointSelection={kind:'mask',ring:0,index:Number(e.target.value)};renderInspector();renderOverlay();};if($('#curve-linked'))$('#curve-linked').onchange=e=>{const checked=e.target.checked;if(!s.locked)transact(()=>s.path.nodes[curveNodeIndex(s)].linked=checked);};}
 if(!s.led)return;const led=s.led;
 $('#remove-led').onclick=()=>{if(s.locked)return;transact(()=>{delete s.led;if(!s.path.closed)delete s.path;pointSelection=null;});};
 for(const[id,key,min,max]of [['led-density','density',.1,240],['led-width','width',1,200],['led-ppi','pixelsPerInch',.1,10000],['led-grouping','grouping',1,100],['led-spacing','spacing',0,100]])bind(id,v=>{led[key]=clamp(Number.isFinite(v)?(['grouping','spacing'].includes(key)?Math.round(v):v):min,min,max);state.version=6;},true);
 bind('led-mode',v=>led.mode=v);bind('led-effect',v=>led.effect=v);bind('led-palette',v=>led.palette=v);bind('led-coverage',v=>led.coverage=v,true);bind('led-glow',v=>led.glow=v,true);bind('led-speed',v=>led.speed=v,true);bind('led-intensity',v=>led.intensity=v,true);
 for(let i=0;i<3;i++)bind('led-color-'+i,v=>{led.colors[i]=v;led.palette='custom';});
 $('#led-length').onchange=e=>{if(s.locked)return;const length=Number(e.target.value),px=stripMetrics(s,state.width,state.height,meshPoint).table.length,ppi=px/length;if(!Number.isFinite(ppi)||ppi<.1||ppi>10000){toast('Enter a positive measured length giving 0.1–10000 output pixels per inch.',true);renderInspector();return;}transact(()=>led.pixelsPerInch=ppi);};
 for(const[id,key]of [['led-reverse','reverse'],['led-mirror','mirror'],['led-enabled','enabled']])$('#'+id).onchange=e=>{const checked=e.target.checked;if(!s.locked)transact(()=>led[key]=checked);};
 $('#led-closed').onchange=e=>{const checked=e.target.checked;if(s.path.nodes.length<3&&checked){toast('Add a third point before closing a loop.');renderInspector();return;}if(!s.locked)transact(()=>s.path.closed=checked);};
}
function editRing(){return pointSelection?.kind==='mask'?editableRings(surface())[pointSelection.ring??0]:editableRings(surface())[0];}
function addOutlinePoint(){const s=surface();if(!s||s.locked)return;const ring=editRing();if(!ring||ring.length>=(s.path?512:8192))return;let index=pointSelection?.kind==='mask'?pointSelection.index:-1;if(index<0){let longest=-1;ring.forEach((a,i)=>{if(s.path&&!s.path.closed&&i===ring.length-1)return;const b=ring[(i+1)%ring.length],d=Math.hypot(a.x-b.x,a.y-b.y);if(d>longest){longest=d;index=i;}});}if(s.path&&!s.path.closed)index=Math.min(index,ring.length-2);transact(()=>{if(s.path){const inserted=splitCurve(s.path,index);pointSelection={kind:'mask',ring:0,index:inserted};}else{const a=ring[index],b=ring[(index+1)%ring.length];ring.splice(index+1,0,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});pointSelection={kind:'mask',ring:pointSelection?.ring??0,index:index+1};}});}
function removeOutlinePoint(){const s=surface();if(!s||s.locked||pointSelection?.kind!=='mask')return;const ring=editRing(),minimum=s.path&&!s.path.closed?2:3;if(ring.length<=minimum){toast(`This path needs at least ${minimum} points.`);return;}transact(()=>{ring.splice(pointSelection.index,1);pointSelection=null;});}
function toggleMinimal(){minimal=!minimal;document.body.classList.toggle('minimal',minimal);$('#minimal-ui').classList.toggle('active',minimal);$('#minimal-ui').textContent=minimal?'↙ Full interface':'⛶ Minimal interface';$('#minimal-ui').setAttribute('aria-pressed',String(minimal));fitMode=true;requestAnimationFrame(fitView);}
function undo(redo=false){const next=redo?history.redo(state):history.undo(state);if(next){state=next;safeSelection();changed();}}
function create(type='quad',polygon=null){
  transact(()=>{const s=newSurface(type,polygon);s.name=`${type==='polygon'?'Traced surface':type==='ellipse'?'Ellipse':'Surface'} ${state.surfaces.length+1}`;state.surfaces.push(s);selected=s.id;selectedLayer=s.layers[0].id;pointSelection=null;});
  selectedIds=new Set([selected]);setTool('select');toast(type==='polygon'?'Trace created. Its outline points stay editable; double-click an edge to add a point.':'Surface created. Drag its numbered corners to align with your object.');
}
function duplicate(){const s=surface();if(!s)return;transact(()=>{const copy=clone(s);copy.id=uid();copy.name+=' copy';copy.layers.forEach(l=>l.id=uid());copy.corners.forEach(p=>{p.x+=.02;p.y+=.02;});copy.mesh?.points.forEach(p=>{p.x+=.02;p.y+=.02;});state.surfaces.push(copy);selected=copy.id;selectedIds=new Set([selected]);selectedLayer=copy.layers.at(-1)?.id;pointSelection=null;});}
async function copyMasks(){const selectedSurfaces=state.surfaces.filter(s=>selectedIds.has(s.id));if(await attempt(()=>api.copyMasks(selectedSurfaces)))toast(`Copied ${selectedSurfaces.length} mask(s), including warp and outline settings. Content is not copied.`);}
async function pasteMasks(){const masks=await attempt(()=>api.pasteMasks(state.width,state.height));if(!masks)return;if(state.surfaces.length+masks.length>100){toast('A project supports up to 100 surfaces.',true);return;}transact(()=>{state.surfaces.push(...masks);state.version=6;selectedIds=new Set(masks.map(s=>s.id));selected=masks.at(-1).id;selectedLayer=null;pointSelection=null;tool='select';deleteTarget='surface';});toast(`Pasted ${masks.length} mask(s). Add media independently from the library.`);}
function fitSelectedMaskToMedia(){
  const s=surface(),l=layer();if(!s||s.locked||!l||!['image','video'].includes(l.type))return;
  const size=renderer.mediaDimensions(l.assetId);if(!size){toast('Media dimensions are not ready. Wait for it to load or relink the file.',true);return;}
  try{const copy=clone(s);fitMaskToMedia(copy,state.width,state.height,size.width,size.height);const content=copy.layers.find(a=>a.id===l.id);Object.assign(content,{fit:'contain',scale:1,scaleX:1,scaleY:1,x:0,y:0,rotation:0});transact(()=>{Object.assign(s,copy);state.version=6;pointSelection=null;});toast(`Mask fitted to ${size.width} × ${size.height} media. Its width, trace, and warp are preserved; height follows the source aspect ratio.`);}catch(error){toast(error.message,true);}
}
function clearMedia(){const s=surface();if(!s||s.locked)return;transact(()=>{s.layers=s.layers.filter(l=>!['image','video'].includes(l.type));selectedLayer=s.layers.at(-1)?.id;});toast('Media removed. The mask, warp, and outline are unchanged.');}
function clearContent(){const s=surface();if(!s||s.locked)return;transact(()=>{s.layers=[];selectedLayer=null;});toast('Content cleared. The mask, warp, and outline are unchanged.');}
function removeLayer(){const s=surface();if(!s||s.locked||!layer())return;transact(()=>{s.layers=s.layers.filter(l=>l.id!==selectedLayer);selectedLayer=s.layers.at(-1)?.id;});}
function removeAsset(id){try{const copy=clone(state);removeMediaAsset(copy,id);snapshot();state=copy;safeSelection();changed();toast('Removed media from the library and its layers. All masks remain. Undo restores it.');}catch(error){toast(error.message,true);}}
function transformSurface(patch){const s=surface();if(!s||s.locked)return;try{const copy=clone(s);setSurfaceTransform(copy,state.width,state.height,patch);transact(()=>{Object.assign(s,copy);state.version=6;pointSelection=null;});}catch(error){toast(error.message,true);renderInspector();}}
function setOutline(patch){const s=surface();if(!s||s.locked)return;s.outline={...outlineSettings(s),...patch};state.version=6;}
function deleteSurface(){const s=surface();if(!s||s.locked)return;transact(()=>{state.surfaces=state.surfaces.filter(s=>s.id!==selected);if(state.isolate===selected)state.isolate=null;selected=null;safeSelection();});}
function moveSurface(direction){const s=surface();if(!s)return;const i=state.surfaces.indexOf(s),j=clamp(i+direction,0,state.surfaces.length-1);if(i!==j)transact(()=>{state.surfaces.splice(i,1);state.surfaces.splice(j,0,s);});}
function addPreset(preset='gauge'){
 if(surface()?.led){toast('Restore mask content before adding an animated layer.');return;}
 if(!surface())create();const s=surface();if(s.locked){toast('Unlock the surface first.');return;}
 transact(()=>{if(s.layers.length===1&&s.layers[0].type==='grid')s.layers=[];const l=newLayer('preset');l.animation=presetDefaults(preset);l.animation.anchor=animationTime(state)/1000;l.name=PRESETS.find(([id])=>id===preset)[1];s.layers.push(l);selectedLayer=l.id;deleteTarget='layer';state.version=6;});
}
function presetPanel(l){
 const a=l.animation;return `<section class="inspector-section"><h3>Animation</h3>${selectField('Preset','preset-kind',a.preset,PRESETS)}${selectField('Layout','preset-layout',a.layout||'auto',[['auto','Auto · adapt to mask size'],['compact','Compact · small zones'],['detailed','Detailed']])}${input('Label','preset-label',a.label)}<div class="inspector-actions"><button id="preset-pause">${a.paused?'Resume':'Pause'} item</button><button id="preset-restart">Restart item</button></div>${range('Animation speed','preset-speed',a.speed,.1,4,.1)}<label class="field"><span><input id="preset-reverse" type="checkbox" ${a.reverse?'checked':''}> Reverse</span></label><div ${a.preset==='code'?'hidden':''}><label class="field"><span><input id="preset-auto" type="checkbox" ${a.auto?'checked':''}> Automatic value</span></label>${range('Manual value (%)','preset-value',a.value,0,100,1)}<div class="field-row">${input('Minimum (%)','preset-min',a.min,'number','min="0" max="100"')}${input('Maximum (%)','preset-max',a.max,'number','min="0" max="100"')}</div></div>${range('Detail / density','preset-detail',a.detail,4,32,1)}<div class="field-row">${input('Primary','preset-color',a.color,'color')}${input('Accent','preset-accent',a.accent,'color')}</div>${input('Background','preset-background',a.background,'color')}<label class="field"><span><input id="preset-transparent" type="checkbox" ${a.transparent?'checked':''}> Transparent background</span><span><input id="preset-labels" type="checkbox" ${a.labels?'checked':''}> Show labels</span></label>${a.preset==='code'?`<label class="field"><span>Scrolling text</span><textarea id="preset-text" spellcheck="false">${escape(a.text)}</textarea></label>`:''}</section>`;
}
function bindPreset(l){
 const a=l.animation,now=()=>animationTime(state)/1000;$('#preset-value').disabled=a.auto;
 bind('preset-layout',v=>a.layout=v);
 bind('preset-kind',v=>{a.preset=v;a.label=presetDefaults(v).label;l.name=PRESETS.find(([id])=>id===v)[1];});bind('preset-label',v=>a.label=v.slice(0,80));
 bind('preset-speed',v=>retimePreset(a,now(),{speed:clamp(v,.1,4)}),true);
 for(const [id,key]of [['preset-color','color'],['preset-accent','accent'],['preset-background','background'],['preset-text','text']])bind(id,v=>a[key]=v.slice(0,key==='text'?12000:7));
 bind('preset-value',v=>a.value=clamp(v,0,100),true);bind('preset-detail',v=>a.detail=Math.round(clamp(v,4,32)),true);
 bind('preset-min',v=>a.min=clamp(Number.isFinite(v)?v:0,0,a.max),true);bind('preset-max',v=>a.max=clamp(Number.isFinite(v)?v:100,a.min,100),true);
 for(const key of ['reverse','auto','transparent','labels'])$('#preset-'+key).onchange=e=>{const checked=e.target.checked;if(!surface().locked)transact(()=>a[key]=checked);};
 $('#preset-pause').onclick=()=>{if(!surface().locked)transact(()=>retimePreset(a,now(),{paused:!a.paused}));};$('#preset-restart').onclick=()=>{if(!surface().locked)transact(()=>Object.assign(a,{offset:0,anchor:now()}));};
}
function addLayer(type,asset=null){
  if(!surface())create();
  const s=surface();if(s.locked){toast('Unlock the surface to edit its content.');return;}
  transact(()=>{if(s.layers.length===1&&s.layers[0].type==='grid'&&type!=='grid')s.layers=[];const l=newLayer(type,asset?.id);if(asset)l.name=asset.name;s.layers.push(l);selectedLayer=l.id;deleteTarget='layer';});
}
function setTool(value){
  if(value==='corners'&&surface()?.mesh){toast('Use Warp to adjust a meshed surface, or remove its mesh to edit perspective corners.');return;}
  if(['mesh','mask','hole','corners'].includes(value)&&!surface()){toast('Select or create a surface first.');return;}
  if(value==='mesh'&&!surface().mesh){if(surface().locked){toast('Unlock the surface first.');return;}transact(()=>surface().mesh=createMesh(surface()));}
  if(value==='mask'&&!editableRings(surface()).length){toast('Outline editing is available for traced polygon surfaces.');return;}
  tool=value;trace=[];pointSelection=null;render();
}
function finishTrace(close=false){
  if(tool==='led'){if(trace.length<(close?3:2)){toast('Place at least two points, or three for a closed loop.');return;}const points=clone(trace);trace=[];createStrip(points,close);return;}
  if(trace.length<3){toast('Place at least three points before finishing the outline.');return;}
  const points=clone(trace);trace=[];
  if(tool==='hole'){const s=surface();if(!s||s.locked)return;transact(()=>s.holes.push(points.map(p=>surfaceUV(s,p))));setTool('select');toast('Cutout added. This area will remain transparent.');}
  else create('polygon',points);
}
function toggleBlackout(){state.blackout=!state.blackout;sync();render();}
function toggleCalibration(){state.calibration=!state.calibration;sync();render();}
function togglePlaying(){setAnimationPlaying(state,!state.playing);sync();render();}
function displayList(displays){
  const old=$('#display').value;$('#display').innerHTML=displays.map(d=>`<option value="${d.id}">${escape(d.label)}${d.primary?' · Main':''} (${d.width}×${d.height})</option>`).join('');
  if(displays.some(d=>String(d.id)===old))$('#display').value=old;else $('#display').value=String((displays.find(d=>!d.primary)||displays[0])?.id??'');
  $('#open-output').disabled=!displays.length;
}
async function save(saveAs=false){if(saving){toast('A save is already in progress.');return false;}saving=true;const savedRevision=revision;$('#save-project').disabled=true;const result=await attempt(()=>api.saveProject(state,saveAs));saving=false;$('#save-project').disabled=false;if(result){if(revision===savedRevision)dirty=false;projectFile=result.path;$('#dirty').style.visibility=dirty?'visible':'hidden';$('#project-path').textContent=projectFile;toast(dirty?'Saved. Newer edits still need saving.':'Project saved with its media folder.');}return !!result;}
async function mayDiscard(){return !dirty||await api.confirmDiscard();}
async function open(){if(saving){toast('Wait for the current save to finish.');return;}if(!await mayDiscard())return;const result=await attempt(()=>api.loadProject());if(!result)return;state=result.project;projectFile=result.path;dirty=false;history.past=[];history.future=[];selected=state.surfaces.at(-1)?.id;selectedIds=new Set(selected?[selected]:[]);selectedLayer=surface()?.layers.at(-1)?.id;tool='select';trace=[];pointSelection=null;sync();render();fitView();const missing=state.assets.filter(a=>a.missing).length;toast(missing?`Opened project. ${missing} missing media file(s); use Relink in the library.`:'Project opened.',!!missing);}
async function fresh(){if(saving){toast('Wait for the current save to finish.');return;}if(!await mayDiscard())return;await api.newProject();state=newProject();projectFile=null;dirty=false;history.past=[];history.future=[];selected=null;selectedIds.clear();selectedLayer=null;tool='select';trace=[];sync();render();fitView();}
function render(){
  $('#project-name').value=state.name;$('#dirty').style.visibility=dirty?'visible':'hidden';$('#project-path').textContent=projectFile||'Unsaved project';
  $('#surface-count').textContent=state.surfaces.length;$('#media-count').textContent=state.assets.length;
  $('#calibration').classList.toggle('active',state.calibration);$('#blackout').classList.toggle('active',state.blackout);
  $('#isolate').classList.toggle('active',!!state.isolate);$('#isolate').disabled=!surface();
  $('#play').textContent=state.playing?'Ⅱ':'▶';$('#transport-status').textContent=state.playing?'Animations playing · videos silent':'Animations paused';
  $('#copy-masks').disabled=!selectedIds.size;
  $('#join-surfaces').title=`Join selected shapes using ${surface()?.name||'the active shape'}’s content · Ctrl J`;$('#join-surfaces').disabled=selectedIds.size<2||state.surfaces.some(s=>selectedIds.has(s.id)&&(s.locked||s.led));$('#join-surfaces').textContent=selectedIds.size>1?`Join ${selectedIds.size} shapes`:'Join shapes';
  $('#undo').disabled=!history.past.length;$('#redo').disabled=!history.future.length;
  for(const id of ['duplicate','delete-surface','surface-up','surface-down'])$('#'+id).disabled=!surface()||(id==='delete-surface'&&surface()?.locked);
  document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  $('#empty-state').style.display=state.surfaces.length||['polygon','led'].includes(tool)?'none':'flex';
  $('#blackout-overlay').style.display=state.blackout?'flex':'none';
  $('#canvas-size').textContent=`${state.width} × ${state.height} · PROJECTOR SPACE`;
  const resolution=`${state.width},${state.height}`;$('#resolution').value=[...$('#resolution').options].some(o=>o.value===resolution)?resolution:'custom';
  $('#tool-hint').textContent=tool==='led'?'LED path: click points · Enter open run · Shift+Enter closed loop':tool==='polygon'||tool==='hole'?'Click to place points · Enter / double-click to finish · Escape to cancel':tool==='mesh'?'Drag mesh nodes to follow a curved surface · Arrow keys to nudge':tool==='mask'||editableRings(surface()||{}).length?'Drag outline points · Double-click edge to add · Delete removes selected point':'Shift-click shapes to select several · Drag corners to align';
  renderSurfaces();renderMedia();renderInspector();resizeCanvas();renderOverlay();
}
function renderSurfaces(){
  $('#surface-list').innerHTML=state.surfaces.length?[...state.surfaces].reverse().map(s=>`<div class="surface-row ${selectedIds.has(s.id)?'selected':''} ${s.id===selected&&selectedIds.size>1?'active':''}" data-surface="${s.id}"><span class="surface-glyph">${s.led?'⋯':s.type==='ellipse'?'◯':s.type==='polygon'?'⬡':'◇'}</span><span class="surface-name">${escape(s.name)}<small>${s.led?'LEDSTRIP':s.mesh?'WARP MESH':s.regions?'JOINED MASK':s.type==='polygon'?'POLYGON MASK':'4 CORNER SURFACE'} · ${s.layers.length} LAYER${s.layers.length===1?'':'S'}</small></span><button data-visibility="${s.id}" class="${s.visible?'':'off'}" title="${s.visible?'Hide':'Show'} surface">${s.visible?'◉':'○'}</button><button data-lock="${s.id}" title="${s.locked?'Unlock':'Lock'} surface">${s.locked?'▣':'□'}</button></div>`).join(''):'';
  document.querySelectorAll('[data-surface]').forEach(el=>el.onclick=e=>select(el.dataset.surface,e.shiftKey||e.ctrlKey||e.metaKey));
  document.querySelectorAll('[data-visibility]').forEach(el=>el.onclick=e=>{e.stopPropagation();transact(()=>{const s=state.surfaces.find(s=>s.id===el.dataset.visibility);s.visible=!s.visible;});});
  document.querySelectorAll('[data-lock]').forEach(el=>el.onclick=e=>{e.stopPropagation();transact(()=>{const s=state.surfaces.find(s=>s.id===el.dataset.lock);s.locked=!s.locked;});});
}
function renderMedia(){
  $('#media-list').innerHTML=state.assets.length?state.assets.map(a=>`<div class="media-card"><div class="thumb">${a.type==='image'&&!a.missing?`<img src="${escape(a.url)}" alt="">`:a.missing?'!':'▷'}</div><div class="media-copy"><strong>${escape(a.name)}</strong><small>${a.missing?'Missing file':a.type}</small></div><button data-add-asset="${a.id}" title="Add to selected surface" ${a.missing?'disabled':''}>＋</button><button data-relink="${a.id}" title="Relink media">↻</button><button data-remove-asset="${a.id}" title="Remove media from library and all layers; keep masks">×</button></div>`).join(''):'';
  document.querySelectorAll('[data-add-asset]').forEach(b=>b.onclick=()=>{const a=state.assets.find(a=>a.id===b.dataset.addAsset);addLayer(a.type,a);});
  document.querySelectorAll('[data-remove-asset]').forEach(b=>b.onclick=()=>removeAsset(b.dataset.removeAsset));
  document.querySelectorAll('[data-relink]').forEach(b=>b.onclick=async()=>{const a=await attempt(()=>api.relinkMedia(b.dataset.relink));if(a)transact(()=>{state.assets=state.assets.map(old=>old.id===a.id?a:old);for(const s of state.surfaces)for(const l of s.layers)if(l.assetId===a.id){l.type=a.type;l.name=a.name;}});});
}
function input(label,id,value,type='text',extra=''){return `<label class="field"><span>${label}</span><input id="${id}" type="${type}" value="${escape(value)}" ${extra}></label>`;}
function range(label,id,value,min,max,step=0.01){return `<label class="field"><span class="range-label">${label}<output id="${id}-value">${Math.round(value*100)/100}</output></span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;}
function selectField(label,id,value,options){return `<label class="field"><span>${label}</span><select id="${id}">${options.map(([v,t])=>`<option value="${escape(v)}" ${v===value?'selected':''}>${t}</option>`).join('')}</select></label>`;}
function bind(id,fn,numeric=false){
  const el=$('#'+id);if(!el)return;
  if(el.type==='range'){
    let editing=false;
    el.oninput=()=>{if(surface()?.locked)return;if(!editing){snapshot();editing=true;}fn(Number(el.value));$('#'+id+'-value').textContent=el.value;changed(false);renderOverlay();};
    el.onchange=()=>{editing=false;$('#undo').disabled=false;};
  }else el.onchange=()=>{if(surface()?.locked)return;transact(()=>fn(numeric?Number(el.value):el.value));};
}
function renderInspector(){
  const s=surface(),l=layer(),transform=s?transformSettings(s):null,outline=s?outlineSettings(s):null;$('#selection-kind').textContent=selectedIds.size>1?`${selectedIds.size} SELECTED · ACTIVE`:s?(s.locked?'LOCKED':s.type.toUpperCase()):'NO SELECTION';
  if(!s){$('#inspector').innerHTML='<div class="inspector-empty">Select a surface.</div>';return;}
  $('#inspector').innerHTML=`<section class="inspector-section"><h3>Surface properties</h3>${input('Name','surface-name',s.name)}${range('Opacity','surface-opacity',s.opacity,0,1)}${range('Brightness','surface-brightness',s.brightness,0,2)}<div class="inspector-actions"><button id="reset-corners">Reset shape</button><button id="unlock">${s.locked?'Unlock surface':'Lock surface'}</button></div></section>
  ${l?.type==='preset'&&!s.led?presetPanel(l):''}
  ${ledPanel(s)}
  <section class="inspector-section"><h3>Transform active surface</h3><div class="field-row">${input('Scale X (%)','surface-scale-x',Math.round(transform.scaleX*10000)/100,'number','min="5" max="1000" step="1"')}${input('Scale Y (%)','surface-scale-y',Math.round(transform.scaleY*10000)/100,'number','min="5" max="1000" step="1"')}</div>${input('Rotation (degrees)','surface-rotation',Math.round(transform.rotation*100)/100,'number','min="-36000" max="36000" step="1"')}<div class="inspector-actions"><button id="mirror-x" class="${transform.mirrorX?'active':''}">Mirror X</button><button id="mirror-y" class="${transform.mirrorY?'active':''}">Mirror Y</button><button id="rotate-left">↶ 90°</button><button id="rotate-right">↷ 90°</button><button id="reset-transform">Reset transform</button></div></section>
  <section class="inspector-section" ${s.led?'hidden':''}><h3>Perimeter outline</h3><label class="field"><span><input id="outline-enabled" type="checkbox" ${outline.enabled?'checked':''}> Show in projector output</span></label>${input('Outline color','outline-color',outline.color,'color')}${input('Width (output pixels)','outline-width',outline.width,'number','min="1" max="100" step="1"')}</section>
  <section class="inspector-section"><h3>Warp & masks</h3>${editableRings(s).length?'<div class="inspector-actions outline-actions"><button id="edit-outline">Edit outline</button><button id="add-point">＋ Point</button><button id="remove-point">− Point</button></div><p>Outline points stay editable. Double-click an edge to insert a point; Delete removes the selected point.</p>':''}${selectField('Mesh density','mesh-density',String(s.mesh?.divisions??3),[['2','2 × 2 cells'],['3','3 × 3 cells'],['4','4 × 4 cells'],['6','6 × 6 cells'],['8','8 × 8 cells']])}<div class="inspector-actions"><button id="edit-mesh">${s.mesh?'Edit':'Add'} warp mesh</button>${s.mesh?'<button id="reset-mesh">Remove mesh</button>':''}<button id="add-hole">＋ Cutout</button>${s.holes.length?`<button id="clear-holes">Clear ${s.holes.length} cutout(s)</button>`:''}</div></section>
  <section class="inspector-section" ${s.led?'hidden':''}><h3>Content layers · top first</h3><div class="inspector-actions media-actions"><button id="clear-media">Remove media</button><button id="clear-content">Clear all content</button></div><div class="layer-list">${[...s.layers].reverse().map(a=>`<div class="layer-row ${a.id===selectedLayer?'active':''}" data-layer="${a.id}"><button data-layer-visible="${a.id}" title="Toggle layer visibility">${a.visible?'◉':'○'}</button><span>${escape(a.name)}</span><button data-layer-up="${a.id}" title="Move layer forward">↑</button><button data-layer-down="${a.id}" title="Move layer backward">↓</button><button data-layer-delete="${a.id}" title="Remove layer">×</button></div>`).join('')}</div><div class="layer-add"><button id="add-text">＋ Text</button><button id="add-color">＋ Color</button><button id="layer-import">＋ Media</button><button id="add-grid">＋ Grid</button><button id="add-preset">＋ Animated</button></div></section>
  ${l?`<section class="inspector-section" ${s.led?'hidden':''}><h3>${escape(l.type)} layer</h3><div class="inspector-actions media-actions"><button id="remove-layer">Remove this layer</button></div>${l.type==='text'?`<label class="field"><span>Text</span><textarea id="text-content">${escape(l.text)}</textarea></label>${selectField('Font','font',l.font,[['sans-serif','Sans serif'],['serif','Serif'],['monospace','Monospace']])}${input('Font size (texture pixels)','font-size',l.fontSize,'number','min="8" max="600"')}${selectField('Alignment','text-align',l.align,[['left','Left'],['center','Center'],['right','Right']])}`:''}${['text','color'].includes(l.type)?input('Color','layer-color',l.color,'color'):''}${['image','video'].includes(l.type)?selectField('Media placement','layer-fit',l.fit,[['cover','Fill / crop'],['contain','Fit inside'],['stretch','Stretch']])+`<div class="field-row">${input('Media width (%)','media-scale-x',Math.round((l.scaleX??1)*10000)/100,'number','min="5" max="1000" step="1"')}${input('Media height (%)','media-scale-y',Math.round((l.scaleY??1)*10000)/100,'number','min="5" max="1000" step="1"')}</div><label class="field"><span><input id="media-keep-aspect" type="checkbox" ${l.keepAspect!==false?'checked':''}> Keep media proportions</span></label><div class="inspector-actions media-actions"><button id="fit-mask-media" title="Preserve mask width and change its height to source aspect; reset selected media placement. Undo restores it.">Fit mask to media</button></div><p>Width/height scale the media inside a fixed mask. Fit mask to media changes the mask itself.</p>`:''}${range('Layer opacity','layer-opacity',l.opacity,0,1)}${l.type!=='grid'?`${range(['image','video'].includes(l.type)?'Media zoom':'Scale','layer-scale',l.scale,.05,4)}${input('Content rotation (degrees)','layer-rotation',l.rotation||0,'number','min="-36000" max="36000" step="1"')}<div class="inspector-actions media-actions"><button id="layer-mirror-x" class="${l.mirrorX?'active':''}">Mirror content X</button><button id="layer-mirror-y" class="${l.mirrorY?'active':''}">Mirror content Y</button><button id="reset-layer-transform">Reset content transform</button></div><div class="field-row">${input('Horizontal offset','layer-x',l.x,'number','min="-2" max="2" step="0.01"')}${input('Vertical offset','layer-y',l.y,'number','min="-2" max="2" step="0.01"')}</div>`:''}${l.type==='video'?`${range('Playback speed','video-speed',l.speed,.25,4,.25)}<label class="field"><span><input id="video-loop" type="checkbox" ${l.loop?'checked':''}> Loop video</span></label><p>Video playback is silent. Repeated uses of this media share the same playback position and settings.</p>`:''}</section>`:''}`;
  bindLED(s);
  bind('surface-name',v=>s.name=v.slice(0,100));bind('surface-opacity',v=>s.opacity=v,true);bind('surface-brightness',v=>s.brightness=v,true);
  $('#clear-media').onclick=clearMedia;$('#clear-media').disabled=!s.layers.some(l=>['image','video'].includes(l.type));$('#clear-content').onclick=clearContent;$('#clear-content').disabled=!s.layers.length;if($('#remove-layer'))$('#remove-layer').onclick=removeLayer;
  for(const [id,key,factor]of [['surface-scale-x','scaleX',.01],['surface-scale-y','scaleY',.01],['surface-rotation','rotation',1]])$('#'+id).onchange=e=>transformSurface({[key]:Number(e.target.value)*factor});
  $('#mirror-x').onclick=()=>transformSurface({mirrorX:!transformSettings(s).mirrorX});$('#mirror-y').onclick=()=>transformSurface({mirrorY:!transformSettings(s).mirrorY});$('#rotate-left').onclick=()=>transformSurface({rotation:transformSettings(s).rotation-90});$('#rotate-right').onclick=()=>transformSurface({rotation:transformSettings(s).rotation+90});$('#reset-transform').onclick=()=>transformSurface({rotation:0,scaleX:1,scaleY:1,mirrorX:false,mirrorY:false});
  $('#outline-enabled').onchange=e=>{const enabled=e.target.checked;transact(()=>setOutline({enabled}));};bind('outline-color',v=>setOutline({color:v}));bind('outline-width',v=>setOutline({width:clamp(Number.isFinite(v)?v:3,1,100)}),true);
  $('#unlock').onclick=()=>transact(()=>s.locked=!s.locked);
  $('#reset-corners').onclick=()=>{if(s.locked)return;transact(()=>{s.corners=newSurface().corners;s.mesh=null;pointSelection=null;});};
  $('#edit-mesh').onclick=()=>{if(s.locked)return;const n=Number($('#mesh-density').value);if(!s.mesh||s.mesh.divisions!==n){if(s.mesh&&!window.confirm('Replace the current warp mesh? Its adjustments will be reset.'))return;transact(()=>s.mesh=createMesh(s,n));}setTool('mesh');};
  if($('#reset-mesh'))$('#reset-mesh').onclick=()=>{if(s.locked)return;transact(()=>s.mesh=null);setTool('select');};
  $('#add-hole').onclick=()=>setTool('hole');
  if($('#edit-outline')){$('#edit-outline').onclick=()=>setTool('mask');$('#add-point').onclick=addOutlinePoint;$('#remove-point').onclick=removeOutlinePoint;$('#remove-point').disabled=pointSelection?.kind!=='mask';}
  if($('#clear-holes'))$('#clear-holes').onclick=()=>{if(!s.locked)transact(()=>s.holes=[]);};
  document.querySelectorAll('[data-layer]').forEach(b=>b.onclick=()=>{selectedLayer=b.dataset.layer;deleteTarget='layer';renderInspector();});
  for(const action of ['visible','up','down','delete'])document.querySelectorAll(`[data-layer-${action}]`).forEach(b=>b.onclick=e=>{e.stopPropagation();if(s.locked)return;const id=b.dataset['layer'+action[0].toUpperCase()+action.slice(1)],a=s.layers.find(l=>l.id===id);transact(()=>{if(action==='visible')a.visible=!a.visible;else if(action==='delete'){s.layers=s.layers.filter(l=>l.id!==id);selectedLayer=s.layers.at(-1)?.id;}else{const i=s.layers.indexOf(a),j=clamp(i+(action==='up'?1:-1),0,s.layers.length-1);s.layers.splice(i,1);s.layers.splice(j,0,a);}});});
  $('#add-preset').onclick=()=>addPreset();if(l?.type==='preset'&&!s.led)bindPreset(l);
  $('#add-text').onclick=()=>addLayer('text');$('#add-color').onclick=()=>addLayer('color');$('#add-grid').onclick=()=>addLayer('grid');$('#layer-import').onclick=importMedia;
  if(l){bind('text-content',v=>{l.text=v.slice(0,20000);l.name=v.split('\n')[0].slice(0,35)||'Text';});bind('font',v=>l.font=v);bind('font-size',v=>l.fontSize=clamp(v,8,600),true);bind('text-align',v=>l.align=v);bind('layer-color',v=>l.color=v);bind('layer-fit',v=>l.fit=v);bind('layer-opacity',v=>l.opacity=v,true);bind('layer-scale',v=>l.scale=v,true);bind('layer-rotation',v=>{l.rotation=clamp(Number.isFinite(v)?v:0,-36000,36000);state.version=6;},true);if($('#layer-mirror-x')){$('#layer-mirror-x').onclick=()=>{if(!s.locked)transact(()=>{l.mirrorX=!l.mirrorX;state.version=6;});};$('#layer-mirror-y').onclick=()=>{if(!s.locked)transact(()=>{l.mirrorY=!l.mirrorY;state.version=6;});};$('#reset-layer-transform').onclick=()=>{if(!s.locked)transact(()=>Object.assign(l,{rotation:0,mirrorX:false,mirrorY:false,scale:1,scaleX:1,scaleY:1,x:0,y:0}));};}bind('layer-x',v=>l.x=clamp(v,-2,2),true);bind('layer-y',v=>l.y=clamp(v,-2,2),true);bind('video-speed',v=>{l.speed=v;for(const surf of state.surfaces)for(const a of surf.layers)if(a.assetId===l.assetId)a.speed=v;},true);if($('#video-loop'))$('#video-loop').onchange=e=>{const checked=e.target.checked;transact(()=>{for(const surf of state.surfaces)for(const a of surf.layers)if(a.assetId===l.assetId)a.loop=checked;});};}
  if(l&&['image','video'].includes(l.type)){
    $('#fit-mask-media').onclick=fitSelectedMaskToMedia;
    for(const[id,key]of [['media-scale-x','scaleX'],['media-scale-y','scaleY']])$('#'+id).onchange=e=>{if(s.locked)return;const value=Number(e.target.value)/100;if(!Number.isFinite(value)||value<.05||value>10){toast('Media size must be between 5% and 1000%.',true);renderInspector();return;}transact(()=>{l[key]=value;if(l.keepAspect!==false){l.scaleX=value;l.scaleY=value;}state.version=6;});};
    $('#media-keep-aspect').onchange=e=>{const checked=e.target.checked;if(!s.locked)transact(()=>{l.keepAspect=checked;if(checked)l.scaleY=l.scaleX??1;state.version=6;});};
  }
  if(s.locked)$('#inspector').querySelectorAll('input,textarea,select,button').forEach(el=>{if(el.id!=='unlock')el.disabled=true;});
}
function resizeCanvas(){
  const canvas=$('#projection');if(canvas.width!==state.width)canvas.width=state.width;if(canvas.height!==state.height)canvas.height=state.height;
  svg.setAttribute('viewBox',`0 0 ${state.width} ${state.height}`);
  if(fitMode){zoom=Math.min((viewport.clientWidth-70)/state.width,(viewport.clientHeight-70)/state.height);pan={x:(viewport.clientWidth-state.width*zoom)/2,y:(viewport.clientHeight-state.height*zoom)/2};}
  wrap.style.setProperty('--inverse-zoom',1/zoom);wrap.style.width=state.width+'px';wrap.style.height=state.height+'px';wrap.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
  $('#zoom-label').textContent=fitMode?'Fit':Math.round(zoom*100)+'%';
}
function fitHandles(){const points=state.surfaces.filter(s=>selectedIds.has(s.id)).flatMap(s=>[...s.corners,...s.mesh?.points||[],...surfaceRegions(s).flatMap(r=>r.outline)]);const view=fitHandleView(points,state.width,state.height,viewport.clientWidth,viewport.clientHeight);zoom=view.zoom;pan=view.pan;fitMode=false;resizeCanvas();renderOverlay();}
function fitView(){fitMode=true;resizeCanvas();renderOverlay();}
function zoomAt(factor,x=viewport.clientWidth/2,y=viewport.clientHeight/2){const next=clamp(zoom*factor,.05,4);pan={x:x-(x-pan.x)*next/zoom,y:y-(y-pan.y)*next/zoom};zoom=next;fitMode=false;resizeCanvas();renderOverlay();}
const pathPoints=points=>points.map((p,i)=>`${i?'L':'M'}${p.x*state.width},${p.y*state.height}`).join(' ')+' Z';
function renderOverlay(){
  if(!showGuides){svg.innerHTML='';return;}
  let content='';const radius=5/zoom,textSize=11/zoom;
  for(const s of state.surfaces){
    if(!s.visible||(state.isolate&&state.isolate!==s.id))continue;
    const regions=surfaceRegions(s),isSelected=selectedIds.has(s.id);
    const d=s.path&&!s.path.closed?regions[0].outline.map((p,i)=>`${i?'L':'M'}${p.x*state.width},${p.y*state.height}`).join(' '):regions.flatMap(r=>[r.outline,...r.holes]).map(pathPoints).join(' ');
    content+=`<path class="surface-outline ${isSelected?'selected':''}" data-shape="${s.id}" d="${d}" fill-rule="evenodd" style="stroke:${outlineSettings(s).color};${s.led?'fill:none':''}"/>`;
    if(!isSelected)continue;
    const anchor=regions[0].outline[0];content+=`<text x="${anchor.x*state.width}" y="${anchor.y*state.height-15/zoom}" fill="#71e2bf" font-size="${textSize}">${escape(s.name)}${s.locked?' · LOCKED':''}</text>`;
    for(const hole of s.holes)content+=`<path d="${pathPoints(hole.map(p=>meshPoint(s,p.x,p.y)))}" fill="none" stroke="#ed9c91" stroke-width="1" stroke-dasharray="4 4" pointer-events="none"/>`;
    if(s.locked||s.id!==selected||selectedIds.size>1)continue;
    let handles=s.corners.map((p,index)=>({...p,index,kind:'corner',ring:0}));
    if(tool==='mesh'&&s.mesh){
      const nodes=s.mesh.points,n=s.mesh.divisions;handles=nodes.map((p,index)=>({...p,index,kind:'mesh',ring:0}));
      for(let y=0;y<=n;y++)content+=`<path d="${nodes.slice(y*(n+1),(y+1)*(n+1)).map((p,i)=>`${i?'L':'M'} ${p.x*state.width} ${p.y*state.height}`).join(' ')}" fill="none" stroke="#71e2bf88" stroke-width="1" pointer-events="none"/>`;
      for(let x=0;x<=n;x++)content+=`<path d="${Array.from({length:n+1},(_,y)=>nodes[y*(n+1)+x]).map((p,i)=>`${i?'L':'M'} ${p.x*state.width} ${p.y*state.height}`).join(' ')}" fill="none" stroke="#71e2bf88" stroke-width="1" pointer-events="none"/>`;
    }else if(['select','mask'].includes(tool)&&editableRings(s).length){
      handles=editableRings(s).flatMap((ring,ringIndex)=>ring.map((p,index)=>({...meshPoint(s,p.x,p.y),index,kind:'mask',ring:ringIndex})));
    }else if(s.mesh)handles=[];
    if(s.path&&['select','mask'].includes(tool)&&pointSelection&&s.path.nodes[pointSelection.index]?.mode==='bezier'){
      const index=pointSelection.index,n=s.path.nodes[index],anchor=meshPoint(s,n.x,n.y);
      for(const side of ['in','out']){if(!s.path.closed&&((index===0&&side==='in')||(index===s.path.nodes.length-1&&side==='out')))continue;const p=meshPoint(s,n.x+n[side].x,n.y+n[side].y);content+=`<line x1="${anchor.x*state.width}" y1="${anchor.y*state.height}" x2="${p.x*state.width}" y2="${p.y*state.height}" stroke="#ffce80" stroke-width="1" stroke-dasharray="4 3" pointer-events="none"/>`;handles.push({...p,index,kind:'curve-'+side,ring:0});}
    }
    const indicators=handleIndicators(handles,{width:viewport.clientWidth,height:viewport.clientHeight,zoom,pan,canvasWidth:state.width,canvasHeight:state.height});
    indicators.forEach((p,label)=>{
      const current=pointSelection?.kind===p.kind&&pointSelection?.index===p.index&&(pointSelection?.ring??0)===p.ring,x=p.displayX*state.width,y=p.displayY*state.height;
      if(p.proxy)content+=`<line class="handle-leader" x1="${x}" y1="${y}" x2="${p.x*state.width}" y2="${p.y*state.height}" stroke="#71e2bf" stroke-dasharray="3 4" stroke-width="1" pointer-events="none"/>`;
      content+=`<circle class="handle ${p.kind.startsWith('curve-')?'tangent':''} ${p.proxy?'proxy':''} ${current?'current':''}" data-handle="${p.kind}" data-proxy="${p.proxy}" data-ring="${p.ring}" data-index="${p.index}" cx="${x}" cy="${y}" r="${p.proxy?7/zoom:radius}"><title>${p.proxy?'Offscreen point: drag to bring it back, or use Fit handles. ':''}Point ${label+1} · ${Math.round(p.x*state.width)}, ${Math.round(p.y*state.height)}</title></circle>`;
      const screenX=pan.x+x*zoom,screenY=pan.y+y*zoom,anchor=p.proxy&&screenX>viewport.clientWidth/2?'end':'start',dx=anchor==='end'?-10/zoom:10/zoom,dy=p.proxy&&screenY<30?18/zoom:-10/zoom;
      content+=`<text x="${x+dx}" y="${y+dy}" text-anchor="${anchor}" fill="#ddfff2" font-size="${textSize}">${p.kind.startsWith('curve-')?p.kind.slice(6):label+1}${p.proxy?' ↗':''}</text>`;
    });
  }
  if(trace.length){content+=`<path d="${trace.map((p,i)=>`${i?'L':'M'}${p.x*state.width} ${p.y*state.height}`).join(' ')}" fill="#71e2bf11" stroke="#71e2bf" stroke-dasharray="5 4" stroke-width="1.5" pointer-events="none"/>`;trace.forEach((p,i)=>content+=`<circle cx="${p.x*state.width}" cy="${p.y*state.height}" r="${radius}" fill="#71e2bf" pointer-events="none"/><text x="${p.x*state.width+10/zoom}" y="${p.y*state.height-10/zoom}" fill="#fff" font-size="${textSize}">${i+1}</text>`);}
  svg.innerHTML=content;
}
function eventPoint(e){const r=wrap.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}
function movePoint(s,kind,index,p){
  if(kind==='mesh'){s.mesh.points[index]={x:clamp(p.x,-2,3),y:clamp(p.y,-2,3)};}
  else if(kind==='mask'){if(s.path){try{const copy=clone(s);moveMaskPoint(copy,0,index,p);Object.assign(s,copy);}catch{}}else moveMaskPoint(s,pointSelection?.ring??0,index,p);}
  else if(kind.startsWith('curve-')){try{const copy=clone(s),n=copy.path.nodes[index],side=kind.slice(6),uv=surfaceUV(copy,p);if(copy.mesh&&!copy.led){uv.x=clamp(uv.x,0,1);uv.y=clamp(uv.y,0,1);}n[side]={x:uv.x-n.x,y:uv.y-n.y};if(n.linked)n[side==='in'?'out':'in']={x:-n[side].x,y:-n[side].y};reframePath(copy);Object.assign(s,copy);}catch{}}
  else{
    const next=clone(s.corners);next[index]={x:clamp(p.x,-2,3),y:clamp(p.y,-2,3)};
    // Keep a usable, convex quad; crossed or collapsed corners have no valid perspective mapping.
    const cross=next.map((a,i)=>{const b=next[(i+1)%4],c=next[(i+2)%4];return(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);});
    if(cross.every(v=>v>.00001)||cross.every(v=>v< -.00001))s.corners=next;
  }
}
svg.onpointerdown=e=>{
  if(e.button!==0)return;e.preventDefault();svg.focus();deleteTarget='surface';
  const p=eventPoint(e),s=surface();
  if(tool==='polygon'||tool==='hole'||tool==='led'){
    if(tool==='hole'&&(!s||s.locked))return;
    if(e.detail>1)return;
    if(trace.length>=3&&Math.hypot((p.x-trace[0].x)*state.width*zoom,(p.y-trace[0].y)*state.height*zoom)<12){finishTrace(true);return;}
    trace.push({x:clamp(p.x,0,1),y:clamp(p.y,0,1)});renderOverlay();return;
  }
  if(tool==='quad'||tool==='ellipse'){create(tool);return;}
  const handle=e.target.closest('[data-handle]');
  if(handle&&s&&!s.locked){snapshot();pointSelection={kind:handle.dataset.handle,index:Number(handle.dataset.index),ring:Number(handle.dataset.ring||0)};drag={type:'point',start:p,proxy:handle.dataset.proxy==='true'};svg.setPointerCapture(e.pointerId);renderOverlay();return;}
  const hit=[...state.surfaces].reverse().find(s=>s.visible&&(!state.isolate||s.id===state.isolate)&&surfaceContains(s,p,state.width,state.height));
  if(hit){if(e.shiftKey||e.ctrlKey||e.metaKey){select(hit.id,true);return;}if(!selectedIds.has(hit.id))select(hit.id);pointSelection=null;const moving=state.surfaces.filter(s=>selectedIds.has(s.id));if(moving.every(s=>!s.locked)){snapshot();drag={type:'surface',start:p,surfaces:clone(moving)};svg.setPointerCapture(e.pointerId);}renderOverlay();}
  else{pointSelection=null;renderOverlay();}
};
svg.onpointermove=e=>{if(!drag||drag.type==='pan')return;const p=eventPoint(e),s=surface();if(!s)return;if(drag.type==='point'){if(drag.proxy&&Math.hypot((p.x-drag.start.x)*state.width*zoom,(p.y-drag.start.y)*state.height*zoom)<3)return;movePoint(s,pointSelection.kind,pointSelection.index,p);}else{const dx=p.x-drag.start.x,dy=p.y-drag.start.y;for(const before of drag.surfaces){const dest=state.surfaces.find(s=>s.id===before.id);dest.corners=before.corners.map(a=>({x:a.x+dx,y:a.y+dy}));if(before.mesh)dest.mesh.points=before.mesh.points.map(a=>({x:a.x+dx,y:a.y+dy}));}}changed(false);renderOverlay();};
svg.onpointerup=e=>{if(drag&&drag.type!=='pan'){drag=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);renderInspector();$('#undo').disabled=false;}};
svg.onpointercancel=()=>{drag=null;};
svg.ondblclick=e=>{
  if(tool==='polygon'||tool==='hole'||tool==='led'){e.preventDefault();finishTrace();return;}
  const s=surface();if(!s||s.locked||!['select','mask'].includes(tool)||selectedIds.size!==1)return;
  const p=eventPoint(e);let closest=null,distance=14;
  editableRings(s).forEach((ring,ringIndex)=>ring.forEach((a,index)=>{
    if(s.path&&!s.path.closed&&index===ring.length-1)return;const b=ring[(index+1)%ring.length];for(let k=0;k<24;k++){
      const u=k/24,v=(k+1)/24,A=s.path?(()=>{const p=curvePoint(s.path,index,u);return meshPoint(s,p.x,p.y);})():meshPoint(s,a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u),B=s.path?(()=>{const p=curvePoint(s.path,index,v);return meshPoint(s,p.x,p.y);})():meshPoint(s,a.x+(b.x-a.x)*v,a.y+(b.y-a.y)*v);
      const dx=(B.x-A.x)*state.width*zoom,dy=(B.y-A.y)*state.height*zoom,px=(p.x-A.x)*state.width*zoom,py=(p.y-A.y)*state.height*zoom,t=clamp((px*dx+py*dy)/(dx*dx+dy*dy||1),0,1),d=Math.hypot(px-dx*t,py-dy*t);
      if(d<distance){distance=d;const f=u+(v-u)*t;closest={ring,ringIndex,index,t:f,point:{x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f}};}
    }
  }));
  if(closest&&closest.ring.length<(s.path?512:8192)){e.preventDefault();transact(()=>{if(s.path)splitCurve(s.path,closest.index,closest.t);else closest.ring.splice(closest.index+1,0,closest.point);pointSelection={kind:'mask',ring:closest.ringIndex,index:closest.index+1};});}
};
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();zoomAt(e.deltaY<0?1.1:1/1.1,e.clientX-r.left,e.clientY-r.top);},{passive:false});
viewport.addEventListener('pointerdown',e=>{if(e.button===1){e.preventDefault();drag={type:'pan',x:e.clientX,y:e.clientY,pan:clone(pan)};viewport.setPointerCapture(e.pointerId);}});
viewport.addEventListener('pointermove',e=>{if(drag?.type==='pan'){fitMode=false;pan={x:drag.pan.x+e.clientX-drag.x,y:drag.pan.y+e.clientY-drag.y};resizeCanvas();}});
viewport.addEventListener('pointerup',e=>{if(drag?.type==='pan'){drag=null;viewport.releasePointerCapture(e.pointerId);}});
async function importMedia(){const assets=await attempt(()=>api.importMedia());if(assets?.length){transact(()=>state.assets.push(...assets));toast(`${assets.length} media file(s) imported. Click ＋ in the library to add one to a surface.`);}}
$('#new-project').onclick=fresh;$('#open-project').onclick=open;$('#save-project').onclick=()=>save();$('#project-name').onchange=e=>transact(()=>state.name=e.target.value.slice(0,100)||'Untitled mapping');
$('#add-surface').onclick=()=>create();$('#first-surface').onclick=()=>create();$('#duplicate').onclick=duplicate;$('#delete-surface').onclick=deleteSurface;$('#surface-up').onclick=()=>moveSurface(1);$('#surface-down').onclick=()=>moveSurface(-1);$('#import-media').onclick=importMedia;
$('#copy-masks').onclick=copyMasks;$('#paste-masks').onclick=pasteMasks;$('#join-surfaces').onclick=joinSelected;$('#minimal-ui').onclick=toggleMinimal;
$('#undo').onclick=()=>undo();$('#redo').onclick=()=>undo(true);$('#blackout').onclick=toggleBlackout;$('#calibration').onclick=toggleCalibration;$('#play').onclick=togglePlaying;
$('#restart').onclick=()=>{state.clock={elapsed:0,startedAt:Date.now()};resetPresetClocks(state);renderer.restart();api.transport('restart');sync();toast('Animations restarted.');};
$('#isolate').onclick=()=>{state.isolate=state.isolate?null:selected;sync();render();};
$('#resolution').onchange=e=>{let [w,h]=e.target.value.split(',').map(Number);if(e.target.value==='custom'){const value=window.prompt('Output resolution: width × height (for example, 1280x800)',`${state.width}x${state.height}`);if(!value){render();return;}[w,h]=value.toLowerCase().split(/[x×,]/).map(Number);}if(!Number.isInteger(w)||!Number.isInteger(h)||w<320||h<240||w>7680||h>4320){toast('Enter a resolution between 320×240 and 7680×4320.',true);render();return;}transact(()=>{state.width=w;state.height=h;});fitView();};
$('#open-output').onclick=async()=>{if(outputOpen){await api.closeOutput();return;}sync();const ok=await attempt(()=>api.openOutput(Number($('#display').value)));if(ok)toast('Projector output launched. Escape closes output; B toggles blackout.');};
$('#display').onchange=async()=>{if(outputOpen)await attempt(()=>api.openOutput(Number($('#display').value)));};
$('#zoom-in').onclick=()=>zoomAt(1.2);$('#zoom-out').onclick=()=>zoomAt(1/1.2);$('#fit-view').onclick=fitView;$('#fit-handles').onclick=fitHandles;$('#guides').onchange=e=>{showGuides=e.target.checked;renderOverlay();};
$('#help').onclick=()=>$('#help-dialog').showModal();$('#close-help').onclick=()=>$('#help-dialog').close();document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
window.addEventListener('keydown',e=>{
  if($('#help-dialog').open)return;
  const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
  const key=e.key.toLowerCase(),command=e.ctrlKey||e.metaKey;
  if(command&&key==='s'){e.preventDefault();document.activeElement?.blur();save(e.shiftKey);return;}if(editing)return;if(command&&key==='c'){e.preventDefault();copyMasks();return;}if(command&&key==='v'){e.preventDefault();pasteMasks();return;}if(command&&key==='z'){e.preventDefault();undo(e.shiftKey);return;}if(command&&key==='d'){e.preventDefault();duplicate();return;}if(command&&key==='o'){e.preventDefault();open();return;}
  if(command&&key==='b'){e.preventDefault();curvePointAction(surface()?.path?.nodes[pointSelection?.index??0]?.mode!=='bezier');}else if(key==='home'){e.preventDefault();fitHandles();}else if(key==='tab'){e.preventDefault();toggleMinimal();}else if(key==='j'&&command){e.preventDefault();joinSelected();}else if(key==='b'){e.preventDefault();toggleBlackout();}else if(key===' '){e.preventDefault();togglePlaying();}else if(key==='escape'){trace=[];setTool('select');}else if(key==='enter'&&(tool==='polygon'||tool==='hole'||tool==='led'))finishTrace(e.shiftKey);else if(key==='v')setTool('select');else if(key==='r')setTool('quad');else if(key==='p')setTool('polygon');else if(key==='m')setTool('mesh');else if(key==='delete'||key==='backspace'){e.preventDefault();if(pointSelection?.kind==='mask')removeOutlinePoint();else if(pointSelection?.kind.startsWith('curve-'))curvePointAction(false);else if(deleteTarget==='layer')removeLayer();else deleteSurface();}
  else if(['arrowleft','arrowright','arrowup','arrowdown'].includes(key)){
    const s=surface();if(!s||s.locked)return;e.preventDefault();snapshot();const step=e.shiftKey?10:1,dx=(key==='arrowright'?step:key==='arrowleft'?-step:0)/state.width,dy=(key==='arrowdown'?step:key==='arrowup'?-step:0)/state.height;
    if(pointSelection){const {kind,index}=pointSelection;const p=kind.startsWith('curve-')?meshPoint(s,s.path.nodes[index].x+s.path.nodes[index][kind.slice(6)].x,s.path.nodes[index].y+s.path.nodes[index][kind.slice(6)].y):kind==='mesh'?s.mesh.points[index]:kind==='mask'?meshPoint(s,editableRings(s)[pointSelection.ring??0][index].x,editableRings(s)[pointSelection.ring??0][index].y):s.corners[index];movePoint(s,kind,index,{x:p.x+dx,y:p.y+dy});}else{s.corners.forEach(p=>{p.x+=dx;p.y+=dy;});s.mesh?.points.forEach(p=>{p.x+=dx;p.y+=dy;});}changed(false);renderOverlay();$('#undo').disabled=false;
  }
});
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>addPreset(b.dataset.preset));
api.onOutput(({open,message})=>{outputOpen=open;$('#open-output').textContent=open?'Close output':'Launch output ↗';$('#output-label').textContent=open?'OUTPUT LIVE':'OUTPUT OFFLINE';$('.signal-dot').classList.toggle('live',open);if(message)toast(message,true);});
api.onDisplays(displayList);api.onBlackout(toggleBlackout);api.onClose(async()=>{if(await mayDiscard())api.quit();});
new ResizeObserver(()=>{resizeCanvas();renderOverlay();}).observe(viewport);
setInterval(()=>{if(outputOpen)api.sync({...state,mediaTimes:renderer.times()});},2000);
await attempt(async()=>displayList(await api.displays()));sync();render();fitView();
