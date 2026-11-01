export const LED_VERTEX=`attribute vec2 a_position;attribute float a_index;attribute float a_strength;varying float v_index;varying float v_strength;void main(){gl_Position=vec4(a_position,0.,1.);v_index=a_index;v_strength=a_strength;}`;
export const LED_FRAGMENT=`precision highp float;
varying float v_index;varying float v_strength;
uniform float u_time,u_count,u_speed,u_intensity,u_opacity,u_brightness,u_grouping,u_spacing,u_reverse,u_mirror;
uniform int u_effect;uniform vec3 u_color0,u_color1,u_color2;
float hash(float x){return fract(sin(x*127.1+19.7)*43758.5453);}
float noise(float x){float i=floor(x),f=fract(x);return mix(hash(i),hash(i+1.),f*f*(3.-2.*f));}
vec3 hue(float h){return clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);}
vec3 palette(float t){t=fract(t);return t<.5?mix(u_color0,u_color1,t*2.):mix(u_color1,u_color2,(t-.5)*2.);}
void main(){
 float led=floor(clamp(v_index,0.,u_count-1.)),i=led;if(u_reverse>.5)i=u_count-1.-i;if(u_mirror>.5)i=min(i,u_count-1.-i)*2.;
 float block=u_grouping+u_spacing;if(mod(i,block)>=u_grouping){gl_FragColor=vec4(0.);return;}i=floor(i/block);
 float n=max(1.,ceil(u_count/block)),u=i/max(1.,n-1.),t=u_time*(.08+u_speed/255.*3.),intensity=u_intensity/255.,phase=fract(t*.22);vec3 c=u_color0;float light=1.;
 if(u_effect==1)light=step(.5,fract(t));
 else if(u_effect==2)light=.03+.97*pow(.5+.5*sin(t*3.),1.+intensity*2.);
 else if(u_effect==3){c=palette(u);light=step(u,phase);}
 else if(u_effect==4)c=hue(fract(u+t*.1));
 else if(u_effect==5)c=hue(fract(t*.1));
 else if(u_effect==6){float band=fract(u*(2.+intensity*10.)-t*.3);c=mix(u_color0,u_color1,step(.5,band));light=.05+.95*step(.65,band);}
 else if(u_effect==7){float d=mod(phase-u+1.,1.);c=palette(u);light=exp(-d*(6.+intensity*30.));}
 else if(u_effect==8){float head=abs(fract(t*.15)*2.-1.);c=palette(u);light=exp(-abs(u-head)*(8.+intensity*35.));}
 else if(u_effect==9){float heat=clamp((1.-u)*.75+noise(i*.75+t*5.)*.65+.2*intensity,0.,1.);c=heat<.5?mix(vec3(.15,0.,0.),vec3(1.,.16,0.),heat*2.):mix(vec3(1.,.16,0.),vec3(1.,.95,.6),(heat-.5)*2.);}
 else if(u_effect==10){float seed=hash(i*17.);light=step(1.-(.03+intensity*.45),hash(i+floor(t*.8)*71.))*pow(max(0.,sin(fract(t*.8+seed)*3.14159)),2.);c=palette(seed);}
 else if(u_effect==11){c=palette(hash(i));light=step(.995-intensity*.09,hash(i+floor(t*6.)*37.));}
 else if(u_effect==12){c=palette(u);light=1.-step(.5,mod(i-floor(t*3.),3.));}
 else if(u_effect==13){c=u_color0;light=pow(.5+.5*sin(u*(12.+intensity*30.)-t*3.),2.);}
 else if(u_effect==14)c=palette(u+t*.08);
 else if(u_effect==15){float d=fract(u*(1.+floor(intensity*4.))-t*.25);c=palette(u+t*.05);light=exp(-d*18.);}
 else if(u_effect==16)c=palette(noise(u*8.+t*.4)+noise(u*13.-t*.2)*.3);
 else if(u_effect==17){c=u_color0;light=.45+.4*noise(t*7.)+.15*noise(i*.5+t*3.);}
 else if(u_effect==18)c=palette(sin(u*8.+t)*.2+sin(u*13.-t*.7)*.2+t*.06);
 else if(u_effect==19)light=step(.86,fract(t*8.));
 c*=light*u_brightness;float alpha=u_opacity*v_strength;if(v_strength<.99)alpha*=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c,alpha);
}`;
