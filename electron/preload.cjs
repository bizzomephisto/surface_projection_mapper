const {contextBridge,ipcRenderer}=require('electron');
const listen=(channel,callback)=>{const listener=(_event,...args)=>callback(...args);ipcRenderer.on(channel,listener);return()=>ipcRenderer.removeListener(channel,listener);};
contextBridge.exposeInMainWorld('desktop',{
  copyMasks:surfaces=>ipcRenderer.invoke('copy-masks',surfaces),pasteMasks:(width,height)=>ipcRenderer.invoke('paste-masks',width,height),
  displays:()=>ipcRenderer.invoke('displays'),
  importMedia:()=>ipcRenderer.invoke('import-media'),relinkMedia:id=>ipcRenderer.invoke('relink-media',id),
  saveProject:(project,saveAs=false)=>ipcRenderer.invoke('save-project',project,saveAs),
  loadProject:()=>ipcRenderer.invoke('load-project'),newProject:()=>ipcRenderer.invoke('new-project'),
  openOutput:id=>ipcRenderer.invoke('open-output',id),closeOutput:()=>ipcRenderer.invoke('close-output'),
  sync:state=>ipcRenderer.send('sync-project',state),transport:action=>ipcRenderer.send('transport',action),
  confirmDiscard:()=>ipcRenderer.invoke('confirm-discard'),quit:()=>ipcRenderer.invoke('quit'),
  onState:cb=>listen('project-state',cb),onTransport:cb=>listen('transport',cb),
  onDisplays:cb=>listen('displays-changed',cb),onOutput:cb=>listen('output-status',cb),
  onBlackout:cb=>listen('toggle-blackout',cb),onClose:cb=>listen('request-close',cb)
});
