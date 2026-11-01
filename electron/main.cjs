const { app, BrowserWindow, ipcMain, dialog, screen, protocol, net, Menu, clipboard } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const root = path.join(__dirname, '..', 'src');
protocol.registerSchemesAsPrivileged([{scheme:'surface',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let editor, output, projectPath=null, latest=null, closing=false, media=new Map();
const isEditor = event => event.sender === editor?.webContents && event.senderFrame === editor.webContents.mainFrame;
const settings = { preload:path.join(__dirname,'preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true, backgroundThrottling:false };
function secure(win) {
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event)=>event.preventDefault());
}
function displays(){return screen.getAllDisplays().map(d=>({id:d.id,label:d.label||`Display ${d.id}`,width:d.size.width,height:d.size.height,primary:d.id===screen.getPrimaryDisplay().id}));}
function sendOutput(){if(output&&!output.isDestroyed()&&latest)output.webContents.send('project-state',latest);}
async function addAsset(file, id=randomUUID(), type=null) {
  const ext=path.extname(file).toLowerCase();
  type=type||(['.mp4','.webm','.mov','.m4v','.ogv'].includes(ext)?'video':'image');
  const stat=await fs.stat(file);if(!stat.isFile())throw new Error('Media is not a regular file.');
  media.set(id,{path:file,type});
  return {id,name:path.basename(file),type,url:`surface://app/media/${encodeURIComponent(id)}?v=${randomUUID()}`,missing:false};
}
async function saveProject(project, saveAs=false) {
  const {validateProject}=await import('../src/core.mjs');validateProject(project);
  let target=projectPath;
  if(!target||saveAs){const res=await dialog.showSaveDialog(editor,{title:'Save mapping project',defaultPath:target||`${project.name||'Untitled'}.surface.json`,filters:[{name:'Surface project',extensions:['surface.json']}]});if(res.canceled)return null;target=res.filePath;}
  const assetDir=path.basename(target).replace(/\.json$/i,'')+'.assets';
  await fs.mkdir(path.join(path.dirname(target),assetDir),{recursive:true});
  const saved=structuredClone(project);
  saved.clock={elapsed:0,startedAt:0};saved.blackout=false;saved.calibration=false;saved.isolate=null;
  for(const asset of saved.assets){
    const entry=media.get(asset.id);
    if(!entry)throw new Error(`Relink missing media before saving: ${asset.name}`);
    const ext=path.extname(entry.path).toLowerCase(), filename=asset.id.replace(/[^a-zA-Z0-9_-]/g,'_')+ext;
    const dest=path.join(path.dirname(target),assetDir,filename);
    if(path.resolve(dest)!==path.resolve(entry.path))await fs.copyFile(entry.path,dest);
    asset.file=assetDir+'/'+filename;delete asset.url;delete asset.missing;
  }
  const temporary=target+'.tmp-'+randomUUID();
  await fs.writeFile(temporary,JSON.stringify(saved,null,2),'utf8');
  await fs.rename(temporary,target);projectPath=target;
  return {path:target,name:path.basename(target)};
}
app.whenReady().then(async()=>{
  protocol.handle('surface',async request=>{
    try{
      const url=new URL(request.url);
      if(url.hostname==='app'&&url.pathname.startsWith('/media/')){
        const entry=media.get(decodeURIComponent(url.pathname.slice(7)));if(!entry)return new Response('Missing media',{status:404});
        return net.fetch(pathToFileURL(entry.path).href,{headers:request.headers});
      }
      if(url.hostname!=='app')return new Response('Not found',{status:404});
      const name=decodeURIComponent(url.pathname).replace(/^\/+/,''), resolved=path.resolve(root,name);
      if(!resolved.startsWith(root+path.sep))return new Response('Forbidden',{status:403});
      return net.fetch(pathToFileURL(resolved).href);
    }catch{return new Response('File unavailable',{status:404});}
  });
  editor=new BrowserWindow({width:1500,height:950,minWidth:1000,minHeight:680,backgroundColor:'#121619',title:'Surface — Projection Studio',webPreferences:settings});
  secure(editor);Menu.setApplicationMenu(null);
  editor.on('close',event=>{if(!closing){event.preventDefault();editor.webContents.send('request-close');}});
  editor.on('closed',()=>{output?.destroy();app.quit();});
  await editor.loadURL('surface://app/index.html');
  screen.on('display-added',()=>editor?.webContents.send('displays-changed',displays()));
  screen.on('display-removed',()=>{editor?.webContents.send('displays-changed',displays());if(output&&!screen.getAllDisplays().some(d=>d.id===output.displayId)){output.close();editor?.webContents.send('output-status',{open:false,message:'Projector disconnected'});}});
});
ipcMain.handle('displays',event=>isEditor(event)?displays():[]);
ipcMain.handle('import-media',async(event)=>{
  if(!isEditor(event))throw new Error('Unauthorized');
  const result=await dialog.showOpenDialog(editor,{title:'Import images or videos',properties:['openFile','multiSelections'],filters:[{name:'Images & videos',extensions:['png','jpg','jpeg','webp','gif','bmp','mp4','webm','mov','m4v','ogv']}]});
  if(result.canceled)return [];
  return Promise.all(result.filePaths.map(file=>addAsset(file)));
});
ipcMain.handle('relink-media',async(event,id)=>{
  if(!isEditor(event))throw new Error('Unauthorized');
  const result=await dialog.showOpenDialog(editor,{title:'Relink media',properties:['openFile'],filters:[{name:'Images & videos',extensions:['png','jpg','jpeg','webp','gif','bmp','mp4','webm','mov','m4v','ogv']}]});
  if(result.canceled)return null;return addAsset(result.filePaths[0],id);
});
ipcMain.handle('save-project',async(event,project,saveAs)=>{if(!isEditor(event))throw new Error('Unauthorized');return saveProject(project,saveAs);});
ipcMain.handle('load-project',async(event)=>{
  if(!isEditor(event))throw new Error('Unauthorized');
  const result=await dialog.showOpenDialog(editor,{title:'Open mapping project',properties:['openFile'],filters:[{name:'Surface project',extensions:['json']}]});
  if(result.canceled)return null;
  const file=result.filePaths[0],stat=await fs.stat(file);if(stat.size>10*1024*1024)throw new Error('Project file is too large.');
  const project=JSON.parse(await fs.readFile(file,'utf8'));
  const {validateProject}=await import('../src/core.mjs');validateProject(project);
  const nextMedia=new Map();
  for(const asset of project.assets){
    if(typeof asset.file!=='string'||path.isAbsolute(asset.file)||asset.file.split(/[\\/]/).includes('..'))throw new Error('Media references must stay inside the project folder.');
    const resolved=path.resolve(path.dirname(file),...asset.file.split(/[\\/]/));
    asset.url=`surface://app/media/${encodeURIComponent(asset.id)}?v=${randomUUID()}`;asset.missing=false;
    try{if(!(await fs.stat(resolved)).isFile())throw new Error();nextMedia.set(asset.id,{path:resolved,type:asset.type});}catch{asset.missing=true;}
  }
  media=nextMedia;projectPath=file;project.clock={elapsed:0,startedAt:Date.now()};project.blackout=false;project.calibration=false;project.isolate=null;
  return {project,path:file};
});
ipcMain.handle('new-project',event=>{if(isEditor(event)){projectPath=null;media.clear();return true;}return false;});
ipcMain.handle('open-output',async(event,displayId)=>{
  if(!isEditor(event))throw new Error('Unauthorized');
  const display=screen.getAllDisplays().find(d=>d.id===displayId);if(!display)throw new Error('Display is no longer available.');
  if(output&&!output.isDestroyed()){output.setFullScreen(false);output.setBounds(display.bounds);output.displayId=display.id;output.setFullScreen(true);return true;}
  output=new BrowserWindow({...display.bounds,backgroundColor:'#000000',frame:false,autoHideMenuBar:true,webPreferences:settings});
  output.displayId=display.id;secure(output);
  output.webContents.on('before-input-event',(e,input)=>{if(input.type==='keyDown'&&input.key==='Escape'){output.close();e.preventDefault();}else if(input.type==='keyDown'&&(input.key==='b'||input.key==='B')){editor.webContents.send('toggle-blackout');}});
  output.on('closed',()=>{output=null;editor?.webContents.send('output-status',{open:false});});
  await output.loadURL('surface://app/output.html');output.setFullScreen(true);sendOutput();
  editor.webContents.send('output-status',{open:true});return true;
});
ipcMain.handle('close-output',event=>{if(isEditor(event))output?.close();});
ipcMain.on('sync-project',(event,state)=>{if(isEditor(event)){latest=state;sendOutput();}});
ipcMain.on('transport',(event,action)=>{if(isEditor(event))output?.webContents.send('transport',action);});
ipcMain.handle('confirm-discard',async event=>{
  if(!isEditor(event))return false;
  const {response}=await dialog.showMessageBox(editor,{type:'question',message:'Discard unsaved changes?',detail:'Save your project first if you want to keep these changes.',buttons:['Keep editing','Discard changes'],defaultId:0,cancelId:0});return response===1;
});
ipcMain.handle('quit',event=>{if(isEditor(event)){closing=true;editor.close();}});
app.on('window-all-closed',()=>app.quit());

ipcMain.handle('copy-masks',async(event,surfaces)=>{if(!isEditor(event))throw new Error('Unauthorized');const {encodeMasks}=await import('../src/core.mjs');await clipboard.writeText(encodeMasks(surfaces));return true;});
ipcMain.handle('paste-masks',async(event,width,height)=>{if(!isEditor(event))throw new Error('Unauthorized');const {decodeMasks}=await import('../src/core.mjs');return decodeMasks(await clipboard.readText(),width,height);});
