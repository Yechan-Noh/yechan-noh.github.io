(() => {
  const gallery=document.querySelector('.journal-exhibition');
  if(!gallery)return;
  const original=[...gallery.querySelectorAll('.journal-item img')];if(!original.length)return;
  const priority=['Physical Review Letters','Science Advances','Nature Communications','ACS Nano','Nano Letters','small'];
  const logoEmphasis=name=>['The Journal of Physical Chemistry Letters','The Journal of Physical Chemistry B'].includes(name)?1.08:(priority.includes(name)?1.2:.9);
  const rank=name=>{const n=priority.indexOf(name);return n<0?priority.length+original.findIndex(i=>i.alt===name):n};
  const sources=[...original].sort((a,b)=>rank(a.alt)-rank(b.alt));
  const NS='http://www.w3.org/2000/svg';
  const node=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text)n.textContent=text;return n};
  const params=new URLSearchParams(location.search);let mode=[1,2,3,4].includes(Number(params.get('orbits')))?Number(params.get('orbits')):4;
  const svg=node('svg',{role:'img','aria-label':'Journal logos rotating at uniform intervals, with subtle fading at the back'});svg.classList.add('elliptical-stage');svg.style.isolation='isolate';
  const configs={1:[[400,120,15,130]],2:[[400,160,9,134],[250,90,6,116]],3:[[400,180,5,142],[265,115,5,116],[135,50,5,90]]};
  let logos=[],phase=0,last=0,inView=false,frameId=0;
  let mobileBoost=1,depthOrder=[];
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');let paused=reduce.matches;
  const button=document.createElement('button');button.type='button';button.className='orbit-pause';
  function status(){button.textContent=paused?'Play animation':'Pause animation';button.setAttribute('aria-label',paused?'Play journal rotation':'Pause journal rotation');button.setAttribute('aria-pressed',String(paused));last=0;scheduleOrbit()}
  button.addEventListener('click',()=>{paused=!paused;status()});
  let options;
  if(params.get('study')==='1'){
    options=document.createElement('div');options.className='orbit-options';options.setAttribute('aria-label','Orbit design comparison');
    [1,2,3,4].forEach(n=>{const b=document.createElement('button');b.type='button';b.textContent=n===4?'분야별 궤도':`${n}개 궤도`;b.dataset.orbits=n;b.onclick=()=>{mode=n;phase=0;build();const q=new URLSearchParams(location.search);q.set('orbits',n);history.replaceState(null,'',`${location.pathname}?${q}`)};options.append(b)});gallery.append(options);
  }
  const viewport=document.createElement('div');viewport.className='orbit-viewport';viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label','Rotating journal logos; scroll horizontally on smaller screens');viewport.append(svg);gallery.append(viewport,button);gallery.classList.add('is-elliptical');
  new ResizeObserver(()=>{mobileBoost=viewport.clientWidth<650 ? 1.15 : 1;viewport.scrollLeft=Math.max(0,(viewport.scrollWidth-viewport.clientWidth)/2);draw();}).observe(viewport);
  function build(){
    svg.replaceChildren();logos=[];depthOrder=[];
    if(mode===4){buildFields();if(options)options.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.orbits)===mode));draw();return;}
    const cy=mode===1?195:235;
    svg.setAttribute('viewBox',`0 0 1000 ${mode===1?390:470}`);
    const rings=configs[mode];rings.forEach(([rx,ry])=>svg.append(node('ellipse',{cx:500,cy,rx,ry,fill:'none',stroke:'#e7edef','stroke-width':1})));
    svg.append(node('text',{x:500,y:cy+19,'text-anchor':'middle',fill:'#7b8d96','font-size':8,'font-family':'Inter, Arial, sans-serif','letter-spacing':1.6},'PUBLICATION VENUES'));
    const groups=rings.map(()=>[]);
    sources.forEach(source=>{const available=groups.map((g,j)=>({g,j})).filter(({g,j})=>g.length<rings[j][2]);available.sort((a,b)=>a.g.length-b.g.length||a.j-b.j);available[0].g.push(source)});
    groups.forEach((group,j)=>group.forEach((source,i)=>{const slot=i===0?0:(i%2===1?(i+1)/2:-i/2);const g=node('g'),img=node('image',{href:source.src,preserveAspectRatio:'xMidYMid meet'});g.style.mixBlendMode='multiply';g.append(node('title',{},source.alt),img);svg.append(g);logos.push({g,img,ring:j,slot,cy,emphasis:logoEmphasis(source.alt)})}));
    if(options)options.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.orbits)===mode));draw();
  }
  // Keep the projected orbital depth at approximately 10% of its width.
  const elevation=Math.asin(.1), cameraDistance=1700;
  const sinElevation=Math.sin(elevation),cosElevation=Math.cos(elevation);
  function projectPoint(field,groundX,groundY){
    const depth=groundY*cosElevation,perspective=cameraDistance/(cameraDistance-depth);
    return {x:500+groundX*perspective,y:145+(field.offsetY||0)+groundY*sinElevation*perspective,depth,scale:.86*perspective};
  }
  function projectOrbit(field,a){return projectPoint(field,field.cx-500+field.rx*Math.cos(a),field.rx*Math.sin(a));}
  // Grounding shadows: logos stay on the orbit; a floor lies FLOOR_DROP below the orbit plane under a high,
  // soft key light from the viewer's side (elevation LIGHT_ELEV, azimuth LIGHT_AZ). At this camera height each
  // logo casts a short contact shadow (core) with a soft ambient halo; rear shadows nearly vanish.
  const FLOOR_DROP=26,LIGHT_ELEV=65*Math.PI/180,LIGHT_AZ=0,SHADOW_ALPHA=.6,REAR_SHADOW_FADE=.7;
  const CORE_BLUR='4 1.6',HALO_BLUR='16 4',HALO_ALPHA=.5;
  const lightRun=1/Math.tan(LIGHT_ELEV),lightX=Math.sin(LIGHT_AZ)*lightRun,lightY=-Math.cos(LIGHT_AZ)*lightRun;
  function project3(field,gx,gy,z){
    const depth=gy*cosElevation+z*sinElevation,p=cameraDistance/(cameraDistance-depth);
    return {x:500+gx*p,y:145+(field.offsetY||0)+(gy*sinElevation-z*cosElevation)*p,p};
  }
  const silhouettes=new Map();
  function boxBlur(src,w,h,r){
    if(r<1)return src.slice();const tmp=new Float32Array(w*h),out=new Float32Array(w*h),n=2*r+1;
    for(let y=0;y<h;y++){let acc=0;for(let x=-r;x<=r;x++)acc+=src[y*w+Math.min(w-1,Math.max(0,x))];for(let x=0;x<w;x++){tmp[y*w+x]=acc/n;acc+=src[y*w+Math.min(w-1,x+r+1)]-src[y*w+Math.max(0,x-r)]}}
    for(let x=0;x<w;x++){let acc=0;for(let y=-r;y<=r;y++)acc+=tmp[Math.min(h-1,Math.max(0,y))*w+x];for(let y=0;y<h;y++){out[y*w+x]=acc/n;acc+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x]}}
    return out;
  }
  function makeSilhouette(source){
    const done=()=>{try{
      const nw=source.naturalWidth,nh=source.naturalHeight;if(!nw||!nh)return;
      const pad=0.06,s=Math.min(1,320/nw),iw=Math.max(1,Math.round(nw*s)),ih=Math.max(1,Math.round(nh*s)),px=Math.round(iw*pad),py=Math.round(ih*pad*2.5);
      const W=iw+2*px,H=ih+2*py,c=document.createElement('canvas');c.width=W;c.height=H;
      const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(source,px,py,iw,ih);
      const d=x.getImageData(0,0,W,H),a=new Float32Array(W*H);
      for(let i=0;i<W*H;i++){const k=i*4,ink=1-(.299*d.data[k]+.587*d.data[k+1]+.114*d.data[k+2])/255,t=Math.min(1,Math.max(0,(ink-.05)/.3));a[i]=d.data[k+3]/255*t*t*(3-2*t)}
      // Contact hardening: the bottom of a logo is nearest the floor, so its shadow is sharper and darker.
      const sharp=boxBlur(boxBlur(a,W,H,Math.round(W*.004)),W,H,Math.round(W*.004)),soft=boxBlur(boxBlur(boxBlur(a,W,H,Math.round(W*.014)),W,H,Math.round(W*.014)),W,H,Math.round(W*.014));
      for(let yy=0;yy<H;yy++){const v=Math.min(1,Math.max(0,(yy-py)/ih)),mix=Math.pow(1-v,.8),fade=.42+.58*v;for(let xx=0;xx<W;xx++){const i=yy*W+xx,k=i*4;d.data[k]=16;d.data[k+1]=30;d.data[k+2]=38;d.data[k+3]=Math.round(255*fade*(sharp[i]*(1-mix)+soft[i]*mix))}}
      x.putImageData(d,0,0);silhouettes.set(source.alt,{href:c.toDataURL(),aspect:nw/nh,px:px/iw,py:py/ih});draw();
    }catch(e){}};
    if(source.complete&&source.naturalWidth)done();else source.addEventListener('load',done,{once:true});
  }
  function buildFields(){
    svg.setAttribute('viewBox','0 8 1000 232');
    const fields=[
      {name:'Publication venues',offsetY:-12,cx:500,cy:145,rx:410,ry:41,width:116,speed:1,venues:[
        'Science Advances','Physical Review E','Nano Letters','The Journal of Physical Chemistry B',
        'Nature Communications','Applied Physics Letters','small','The Journal of Chemical Physics',
        'ACS Nano','Physical Review Materials','nanoscale','The Journal of Physical Chemistry Letters',
        'Scientific Reports','Physical Review Letters','applied science'
      ]}
    ];
    const defs=node('defs'),gradient=node('linearGradient',{id:'orbital-depth',x1:0,y1:65,x2:0,y2:255,gradientUnits:'userSpaceOnUse'});
    gradient.append(node('stop',{offset:0,'stop-color':'#e0e9ed'}),node('stop',{offset:1,'stop-color':'#91a8b3'}));defs.append(gradient);
    // The floor fades out before the stage edges so cast shadows never end in a hard clip.
    const fadeX=node('linearGradient',{id:'floor-fade-x',x1:0,y1:0,x2:1000,y2:0,gradientUnits:'userSpaceOnUse'}),fadeY=node('linearGradient',{id:'floor-fade-y',x1:0,y1:214,x2:0,y2:240,gradientUnits:'userSpaceOnUse'});
    [[0,0],[.12,1],[.88,1],[1,0]].forEach(([o,v])=>fadeX.append(node('stop',{offset:o,'stop-color':'#fff','stop-opacity':v})));
    [[0,1],[1,0]].forEach(([o,v])=>fadeY.append(node('stop',{offset:o,'stop-color':'#fff','stop-opacity':v})));
    const maskX=node('mask',{id:'floor-mask-x',maskUnits:'userSpaceOnUse',x:-200,y:0,width:1400,height:300}),maskY=node('mask',{id:'floor-mask-y',maskUnits:'userSpaceOnUse',x:-200,y:0,width:1400,height:300});
    maskX.append(node('rect',{x:-200,y:0,width:1400,height:300,fill:'url(#floor-fade-x)'}));maskY.append(node('rect',{x:-200,y:0,width:1400,height:300,fill:'url(#floor-fade-y)'}));
    defs.append(fadeX,fadeY,maskX,maskY);svg.append(defs);
    fields.forEach((f,j)=>{
      const points=Array.from({length:181},(_,i)=>projectOrbit(f,i*Math.PI/90));
      const d=points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')+' Z';
      const floor=node('g',{'data-layer':'floor',mask:'url(#floor-mask-x)'}),fadeBottom=node('g',{mask:'url(#floor-mask-y)'});
      const coreBlur=node('filter',{id:'shadow-core-blur',x:'-20%',y:'-200%',width:'140%',height:'500%'}),haloBlur=node('filter',{id:'shadow-halo-blur',x:'-30%',y:'-400%',width:'160%',height:'900%'});
      coreBlur.append(node('feGaussianBlur',{stdDeviation:CORE_BLUR}));haloBlur.append(node('feGaussianBlur',{stdDeviation:HALO_BLUR}));defs.append(coreBlur,haloBlur);
      const shadows=node('g',{'data-layer':'floor-shadows',id:'shadow-core',filter:'url(#shadow-core-blur)'}),halo=node('g',{filter:'url(#shadow-halo-blur)',opacity:HALO_ALPHA});
      halo.append(node('use',{href:'#shadow-core'}));fadeBottom.append(halo,shadows);floor.append(fadeBottom);svg.append(floor);
      svg.append(node('path',{d,fill:'none',stroke:'url(#orbital-depth)','stroke-width':1.15,'data-orbit':f.name}));
      f.venues.forEach((venue,i)=>{
        const source=original.find(s=>s.alt===venue);if(!source)return;
        const slot=j===2?(Math.floor(i/2)+.5)*(i%2?-1:1):(i===0?0:(i%2===1?(i+1)/2:-i/2));
        const g=node('g',{'data-field':f.name}),img=node('image',{href:source.src,preserveAspectRatio:'xMidYMid meet'});
        g.style.mixBlendMode='multiply';g.append(node('title',{},source.alt),img);svg.append(g);const shadow=node('image',{x:0,y:0,width:1,height:1,preserveAspectRatio:'none',visibility:'hidden'});shadows.append(shadow);makeSilhouette(source);logos.push({g,img,slot,field:f,shadow,name:source.alt,emphasis:logoEmphasis(source.alt)});
      });
    });
  }
  function draw(){
    const ordered=[];
    logos.forEach(({g,img,ring,slot,cy,field,shadow,name,emphasis=1})=>{
      const [rx,ry,n,baseWidth]=field?[field.rx,field.ry,field.venues.length,field.width]:configs[mode][ring],speed=field?field.speed:[1,-.8,.6][ring];
      const cx=field?field.cx:500;cy=field?field.cy:cy;
      const a=Math.PI/2+slot*2*Math.PI/n+phase*speed;
      const projected=field?projectOrbit(field,a):{x:cx+rx*Math.cos(a),y:cy+ry*Math.sin(a),depth:(Math.sin(a)+1)/2,scale:.58+.42*(Math.sin(a)+1)/2};
      const {x,y,depth,scale}=projected;
      // The near-front view compresses spacing at either end: taper logos there.
      const endScale=field ? .58+.42*Math.pow(Math.abs(Math.sin(a)),.6) : 1;
      const w=baseWidth*scale*emphasis*endScale*mobileBoost,h=36*scale*emphasis*endScale*mobileBoost;
      img.setAttribute('x',x-w/2);img.setAttribute('y',y-h/2);
      img.setAttribute('width',w);img.setAttribute('height',h);
      const rear=Math.max(0,-Math.sin(a));
      const sil=field&&silhouettes.get(name);
      if(sil){
        // Drawn image area inside the meet-fitted box, expanded by the silhouette padding.
        const p=scale/.86,gx=field.cx-500+field.rx*Math.cos(a),gy=field.rx*Math.sin(a);
        let dw=w,dh=h;if(w/h>sil.aspect)dw=h*sil.aspect;else dh=w/sil.aspect;
        const left=x-dw/2-sil.px*dw,right=x+dw/2+sil.px*dw,top=y-dh/2-sil.py*dh,bottom=y+dh/2+sil.py*dh;
        const cast=(sx,sy)=>{const lift=FLOOR_DROP+(y-sy)/(cosElevation*p);return project3(field,gx+(sx-x)/p+lightX*lift,gy+lightY*lift,-FLOOR_DROP)};
        const o=cast(left,top),u=cast(right,top),v=cast(left,bottom);
        if(shadow.getAttribute('href')!==sil.href){shadow.setAttribute('href',sil.href);shadow.setAttribute('visibility','visible')}
        shadow.setAttribute('transform',`matrix(${(u.x-o.x).toFixed(3)} ${(u.y-o.y).toFixed(3)} ${(v.x-o.x).toFixed(3)} ${(v.y-o.y).toFixed(3)} ${o.x.toFixed(3)} ${o.y.toFixed(3)})`);
        shadow.setAttribute('opacity',(SHADOW_ALPHA*(1-REAR_SHADOW_FADE*rear)).toFixed(3));
      }
      g.style.opacity=String(1-.28*rear);
      const filter=rear?`blur(${(.65*rear).toFixed(3)}px)`:'none';
      if(g.style.filter!==filter)g.style.filter=filter;
      ordered.push({g,depth});
    });
    ordered.sort((a,b)=>a.depth-b.depth);
    // Reparenting every logo every frame invalidates the SVG tree even when
    // the overlap order has not changed. Only reorder at actual crossings.
    if(ordered.some(({g},i)=>depthOrder[i]!==g)){
      depthOrder=ordered.map(({g})=>g);
      svg.append(...depthOrder);
    }
  }
  function scheduleOrbit(){if(!paused&&inView&&!document.hidden&&!frameId)frameId=requestAnimationFrame(frame);}
  function frame(now){
    frameId=0;
    if(paused||!inView||document.hidden){last=0;return;}
    const dt=last?Math.min((now-last)/1000,.05):0;last=now;
    phase+=dt*2*Math.PI*.7/45;draw();scheduleOrbit();
  }
  document.addEventListener('visibilitychange',()=>{last=0;scheduleOrbit()});
  new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;last=0;scheduleOrbit()}).observe(gallery);
  reduce.addEventListener('change',e=>{paused=e.matches;status()});status();build();
})();
