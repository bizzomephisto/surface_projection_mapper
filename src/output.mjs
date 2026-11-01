import {ProjectionRenderer} from './renderer.mjs';
const canvas=document.querySelector('canvas'),renderer=new ProjectionRenderer(canvas,console.error);
window.desktop.onState(project=>{if(canvas.width!==project.width)canvas.width=project.width;if(canvas.height!==project.height)canvas.height=project.height;canvas.style.aspectRatio=`${project.width}/${project.height}`;canvas.style.width=`min(100vw, calc(100vh * ${project.width/project.height}))`;renderer.update(project);});
window.desktop.onTransport(action=>{if(action==='restart')renderer.restart();});
