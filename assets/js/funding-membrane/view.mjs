import {createIonSprites} from './ion-sprites.mjs?v=friction8-20261010';
import {SPECIES,SETTINGS,GEOMETRY} from './core.mjs?v=friction8-20261010';
import {createLogoArtwork} from './logos.mjs?v=prepare-20261113';
const artwork=await createLogoArtwork();
const ionSprites=createIonSprites(SPECIES.map(species=>species.color));
const canvas=document.querySelector('#scene'),ctx=canvas.getContext('2d'),worker=new Worker(new URL('./worker.mjs?v=friction8-20261010',import.meta.url),{type:'module'});
const PLAYBACK_RATE=1.5;
let state=null,paused=false,pending=false,timer=0,requestedAt=0,dpr=1,w=1000,h=238,visible=false;
let membraneColor='#182d38';
const reduced=matchMedia('(prefers-reduced-motion: reduce)');paused=reduced.matches;
const active=()=>!paused&&visible&&!document.hidden;
const fieldIndicator=document.querySelector('#electric-field-indicator');
function size(){membraneColor=getComputedStyle(canvas).getPropertyValue('--site-ink').trim()||'#182d38';const r=canvas.getBoundingClientRect();w=r.width;h=r.height;dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);draw();}
function draw(){
 if(!state)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const sx=w/state.width,sy=h/state.viewHeight,C=state.center-state.viewY,mh=state.membraneHalf;
 const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.5,'#ffffff');gradient.addColorStop(1,'#ffffff');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
 const fieldOn=state.field>0;
 if(fieldIndicator)fieldIndicator.hidden=!fieldOn;
 canvas.dataset.fieldIndicator=fieldOn?'on':'off';
 if(fieldOn){
  // 90% transparent: tint the background only, leaving ions and logo ink clear.
  ctx.fillStyle='rgba(255,210,45,0.10)';ctx.fillRect(0,0,w,h);
 }
 canvas.dataset.pulseBackground=fieldOn?'yellow-10-percent':'off';canvas.dataset.pulsePeak=SETTINGS.pulsePeak;canvas.dataset.poreCharge=SETTINGS.poreCharge;canvas.dataset.ionCoulomb=SETTINGS.ionCoulomb;canvas.dataset.poreCoulomb=SETTINGS.coulomb;canvas.dataset.naDepth=SETTINGS.naDepth;
 // A single scale on both axes preserves all original logo proportions.
 const artScale=w/artwork.art.width;
 ctx.drawImage(artwork.art,0,0,artwork.art.width*artScale,artwork.art.height*artScale);
 canvas.dataset.logoScaleX=String(artScale);canvas.dataset.logoScaleY=String(artScale);
 canvas.dataset.artworkSize=artwork.art.width+'×'+artwork.art.height;
 let left=-1;const segments=[];for(const p of state.pores){segments.push([left,p.x-p.width/2]);left=p.x+p.width/2;}segments.push([left,state.width+1]);
 // A smooth teal surface replaces the dotted lattice. All details stay outside
 // the physical aperture; light is decorative and does not change collision geometry.
 const top=(C-mh)*sy,bottom=(C+mh)*sy,thickness=bottom-top;
 const surface=ctx.createLinearGradient(0,top,0,bottom);
 surface.addColorStop(0,'#8b9fa8');surface.addColorStop(.16,'#536f7e');
 surface.addColorStop(.43,membraneColor);surface.addColorStop(.82,'#223c4b');surface.addColorStop(1,'#6a8795');
 const sheen=ctx.createLinearGradient(0,top,0,top+thickness*.22);
 sheen.addColorStop(0,'#d5e1e799');sheen.addColorStop(1,'#d5e1e700');
 const shadow=ctx.createLinearGradient(0,bottom,0,bottom+thickness*.5);
 shadow.addColorStop(0,'#182d3820');shadow.addColorStop(1,'#182d3800');
 const corner=state.edgeRadius*sx;
 const poreEdge=ctx.createLinearGradient(0,top,0,bottom);
 poreEdge.addColorStop(0,'#ff7770');poreEdge.addColorStop(.5,'#b5222a');poreEdge.addColorStop(1,'#ff8a80');
 for(const [l,r] of segments){
  const x=l*sx,width=(r-l)*sx,right=r*sx;
  ctx.fillStyle=shadow;ctx.beginPath();ctx.roundRect(x,bottom-thickness*.2,width,thickness*.7,corner);ctx.fill();
  ctx.save();ctx.beginPath();ctx.roundRect(x,top,width,thickness,corner);ctx.clip();
  ctx.fillStyle=surface;ctx.fillRect(x,top,width,thickness);ctx.fillStyle=sheen;ctx.fillRect(x,top,width,thickness*.22);
  // Circular arcs match the collision model; the red liner remains inside the solid.
  ctx.strokeStyle=poreEdge;ctx.lineWidth=sx*.16;
  ctx.beginPath();ctx.moveTo(x+corner,top);ctx.arc(x+corner,top+corner,corner,-Math.PI/2,-Math.PI,true);ctx.lineTo(x,bottom-corner);ctx.arc(x+corner,bottom-corner,corner,Math.PI,Math.PI/2,true);ctx.stroke();
  ctx.beginPath();ctx.moveTo(right-corner,top);ctx.arc(right-corner,top+corner,corner,-Math.PI/2,0);ctx.lineTo(right,bottom-corner);ctx.arc(right-corner,bottom-corner,corner,0,Math.PI/2);ctx.stroke();
  ctx.restore();
 }
 canvas.dataset.membraneStyle='rounded-entrance-red-lined';canvas.dataset.poreWidth=GEOMETRY.poreWidth;canvas.dataset.entranceRadius=GEOMETRY.edgeRadius;
 ctx.save();
 const radius=sx*GEOMETRY.radius;
 // Draw halos behind every sphere, only for ions residing in a pore core.
 for(let i=0;i<state.x.length;i++)if(state.poreGlow[i]){
  const x=state.x[i]*sx,y=(state.y[i]-state.viewY)*sy,extent=radius*3.2;
  ctx.globalAlpha=.9;ctx.drawImage(ionSprites[state.type[i]].halo,x-extent,y-extent,extent*2,extent*2);
 }
 for(let i=0;i<state.x.length;i++){
  const type=state.type[i],x=state.x[i]*sx,y=(state.y[i]-state.viewY)*sy,r=radius;
  if(y+r<0||y-r>h)continue;
  const lit=state.poreGlow[i],sprite=ionSprites[type];
  ctx.globalAlpha=lit?1:type===2?.05:.10;
  // 64px sprite has a 30px physical radius: retain the existing ion/pore size ratio.
  const extent=r*32/30;ctx.drawImage(sprite.body,x-extent,y-extent,extent*2,extent*2);
  if(lit){ctx.globalAlpha=.9;ctx.drawImage(sprite.light,x-r,y-r,r*2,r*2);}
 }
 ctx.restore();canvas.dataset.potassiumOpacity='0.10';canvas.dataset.sodiumOpacity='0.10';canvas.dataset.trappedOpacity='1';canvas.dataset.playbackRate=state.playbackRate;canvas.dataset.membraneColor=membraneColor;canvas.dataset.poreLiningColor='#e3443c';canvas.dataset.ionStyle='shaded-sphere-trapped-glow';canvas.dataset.ionDiameterPx=String(2*GEOMETRY.radius*sx);canvas.dataset.poreWidthPx=String(GEOMETRY.poreWidth*sx);canvas.dataset.ionPoreRatio=String(2*GEOMETRY.radius/GEOMETRY.poreWidth);canvas.dataset.chlorideOpacity='0.05';canvas.dataset.chlorideVisible='true';canvas.dataset.pulsePeriod=SETTINGS.pulsePeriod;canvas.dataset.friction=SETTINGS.friction;canvas.dataset.kFriction=SETTINGS.kFriction;canvas.dataset.membraneThickness=2*mh;
 canvas.dataset.domain=state.width+'×'+state.height;canvas.dataset.viewHeight=state.viewHeight;canvas.dataset.viewY=state.viewY;canvas.dataset.field=state.field.toFixed(3);canvas.dataset.initialTrapped=state.initialTrapped;canvas.dataset.counts=state.type.reduce((counts,type)=>(counts[type]++,counts),[0,0,0]).join(',');canvas.dataset.ions=state.x.length;canvas.dataset.pores=state.pores.length;canvas.dataset.time=state.time.toFixed(3);canvas.dataset.glowingIons=state.poreGlow.reduce((sum,lit)=>sum+lit,0);


}
function schedule(){clearTimeout(timer);if(active()&&!pending)timer=setTimeout(()=>{pending=true;requestedAt=performance.now();worker.postMessage({type:'step'});},Math.max(0,1000/(30*PLAYBACK_RATE)-(performance.now()-requestedAt)));}
worker.onmessage=({data})=>{pending=false;if(data.error){paused=true;canvas.dataset.error=data.error;pause.textContent='Animation unavailable';return;}state=data;draw();schedule();};
const pause=document.querySelector('#pause');function sync(){pause.textContent=paused?'Play animation':'Pause animation';pause.setAttribute('aria-pressed',String(paused));schedule();}
pause.onclick=()=>{paused=!paused;sync();};
 document.addEventListener('visibilitychange',sync);new ResizeObserver(size).observe(canvas);window.addEventListener('pagehide',()=>clearTimeout(timer));window.addEventListener('pageshow',sync);new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;canvas.dataset.visible=String(visible);schedule();}).observe(canvas.closest('.funding-membrane'));reduced.addEventListener('change',()=>{paused=reduced.matches;sync();});worker.onerror=()=>{paused=true;canvas.dataset.error='Worker unavailable';pause.textContent='Animation unavailable';};pending=true;worker.postMessage({type:'reset',obstacleMask:artwork.mask});sync();
