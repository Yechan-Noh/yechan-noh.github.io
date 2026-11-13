/* Shared, versioned preparation only. Never starts an off-screen animation. */
(() => {
  const VERSION='20261113-prepare1';
  const jobs=new Map();
  let tail=Promise.resolve();
  const idle=()=>new Promise(resolve=>{
    if('requestIdleCallback' in window) requestIdleCallback(resolve,{timeout:1200});
    else setTimeout(resolve,32);
  });
  function cached(source){
    try { const value=JSON.parse(sessionStorage.getItem('cmbl-shadow:'+VERSION+':'+source.src));
      return value&&typeof value.href==='string'&&value.href.startsWith('data:image/png;')&&value.aspect>0?value:null;
    } catch { return null; }
  }
  function boxBlur(src,w,h,r){
    if(r<1)return src.slice();const tmp=new Float32Array(w*h),out=new Float32Array(w*h),n=2*r+1;
    for(let y=0;y<h;y++){let acc=0;for(let x=-r;x<=r;x++)acc+=src[y*w+Math.min(w-1,Math.max(0,x))];for(let x=0;x<w;x++){tmp[y*w+x]=acc/n;acc+=src[y*w+Math.min(w-1,x+r+1)]-src[y*w+Math.max(0,x-r)]}}
    for(let x=0;x<w;x++){let acc=0;for(let y=-r;y<=r;y++)acc+=tmp[Math.min(h-1,Math.max(0,y))*w+x];for(let y=0;y<h;y++){out[y*w+x]=acc/n;acc+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x]}}
    return out;
  }

  function calculate(source){
      const nw=source.naturalWidth,nh=source.naturalHeight;if(!nw||!nh)return;
      const pad=0.06,s=Math.min(1,320/nw),iw=Math.max(1,Math.round(nw*s)),ih=Math.max(1,Math.round(nh*s)),px=Math.round(iw*pad),py=Math.round(ih*pad*2.5);
      const W=iw+2*px,H=ih+2*py,c=document.createElement('canvas');c.width=W;c.height=H;
      const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(source,px,py,iw,ih);
      const d=x.getImageData(0,0,W,H),a=new Float32Array(W*H);
      for(let i=0;i<W*H;i++){const k=i*4,ink=1-(.299*d.data[k]+.587*d.data[k+1]+.114*d.data[k+2])/255,t=Math.min(1,Math.max(0,(ink-.05)/.3));a[i]=d.data[k+3]/255*t*t*(3-2*t)}
      // Contact hardening: the bottom of a logo is nearest the floor, so its shadow is sharper and darker.
      const sharp=boxBlur(boxBlur(a,W,H,Math.round(W*.004)),W,H,Math.round(W*.004)),soft=boxBlur(boxBlur(boxBlur(a,W,H,Math.round(W*.014)),W,H,Math.round(W*.014)),W,H,Math.round(W*.014));
      for(let yy=0;yy<H;yy++){const v=Math.min(1,Math.max(0,(yy-py)/ih)),mix=Math.pow(1-v,.8),fade=.42+.58*v;for(let xx=0;xx<W;xx++){const i=yy*W+xx,k=i*4;d.data[k]=16;d.data[k+1]=30;d.data[k+2]=38;d.data[k+3]=Math.round(255*fade*(sharp[i]*(1-mix)+soft[i]*mix))}}
      x.putImageData(d,0,0);return {href:c.toDataURL(),aspect:nw/nh,px:px/iw,py:py/ih};
  }
  async function prepareShadow(source){
    const hit=cached(source);if(hit)return hit;
    if(jobs.has(source.src))return jobs.get(source.src);
    const job=tail.then(async()=>{
      try {
        if(!source.complete||!source.naturalWidth)await source.decode();
        await idle();
        const value=calculate(source);
        if(value)try{sessionStorage.setItem('cmbl-shadow:'+VERSION+':'+source.src,JSON.stringify(value));}catch{}
        return value;
      }catch{return null;}
    });
    tail=job.catch(()=>null);
    jobs.set(source.src,job);return job;
  }
  window.CMBLPreparation={idle,cached,prepareShadow};
})();
