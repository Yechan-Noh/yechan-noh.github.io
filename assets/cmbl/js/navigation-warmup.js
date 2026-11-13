/* Warm only public navigation resources, after the current page has loaded.
   No iframes, analytics execution, simulations, or dashboard requests. */
(() => {
  const prep=window.CMBLPreparation;
  if(!prep)return;
  const script=document.currentScript;
  const root=new URL(script.dataset.root||'/',location.href);
  const publicRoutes=['publications/','research/','people/','news/','gallery/','contact/',''];
  const pages=new Map(publicRoutes.map(path=>[new URL(path,root).href,{url:new URL(path,root).href,state:'new'}]));
  const assets=new Map(),retainedImages=[];
  const constrained=()=>navigator.connection?.saveData||/^(slow-)?2g$/.test(navigator.connection?.effectiveType||'');
  let queue=[],running=false,loaded=document.readyState==='complete';
  const current=new URL(location.href);current.search='';current.hash='';
  function localURL(value,base){
    try {const u=new URL(value,base);return u.origin===location.origin?u:null;}catch{return null;}
  }
  async function bytes(url){
    const response=await fetch(url,{cache:'force-cache',priority:'low',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Asset unavailable');
    return response;
  }
  function asset(url,image=false){
    if(assets.has(url))return assets.get(url);
    const task=(async()=>{
      try{
        if(!image){await (await bytes(url)).arrayBuffer();return null;}
        // Fetch first to bound failures; Image.decode primes the decoded-image cache too.
        await (await bytes(url)).arrayBuffer();
        const img=new Image();img.decoding='async';img.fetchPriority='low';img.src=url;
        await img.decode();retainedImages.push(img);return img;
      }catch{return null;}
    })();
    assets.set(url,task);return task;
  }
  async function preparePage(page){
    const response=await bytes(page.url);
    const doc=new DOMParser().parseFromString(await response.text(),'text/html');
    const styles=[...doc.querySelectorAll('link[rel="stylesheet"][href]')].map(n=>n.getAttribute('href'));
    const scripts=[...doc.querySelectorAll('script[src]')].map(n=>n.getAttribute('src'));
    for(const value of [...styles,...scripts]){
      const u=localURL(value,page.url);if(!u||!u.pathname.includes('/assets/')||u.pathname.includes('/owner/'))continue;
      await prep.idle();await asset(u.href);
    }
    const journal=[...doc.querySelectorAll('.journal-item img')];
    // All orbit logos; otherwise only the first visible images, never a whole photo archive.
    const pictures=journal.length?journal:[...doc.querySelectorAll('img[src]')].slice(0,3);
    for(const picture of pictures){
      const u=localURL(picture.getAttribute('src'),page.url);if(!u)continue;
      await prep.idle();const img=await asset(u.href,true);
      if(img&&journal.length)await prep.prepareShadow(img);
    }
    if(doc.querySelector('.funding-membrane')){
      // Stable module URLs exactly match the live view and its imports.
      const modules=['view.mjs?v=prepare-20261113','logos.mjs?v=prepare-20261113',
        'artwork-cache.mjs?v=prepare-20261113','ion-sprites.mjs?v=friction8-20261010','worker.mjs?v=friction8-20261010',
        'core.mjs?v=friction8-20261010','core.mjs?v=fast-contacts-20261010',
        'contact-grid.mjs?v=fast-contacts-20261010','rounded-walls.mjs?v=fast-contacts-20261010',
        'pore-glow.mjs?v=friction8-20261010'];
      for(const file of modules){await prep.idle();await asset(new URL('assets/js/funding-membrane/'+file,root).href);}
      const logos=['access-logo.svg','UND-logo.png','NCSA.png','TACC.jpg','nsf-logo.png','UIUC.png','UC_Berkeley.webp','Kwanjeong.png','nist-logo.png','CU_Coulder.png'];
      for(const file of logos){await prep.idle();await asset(new URL('assets/img/funding/'+file,root).href,true);}
      await prep.idle();
      try{const module=await import(new URL('assets/js/funding-membrane/logos.mjs?v=prepare-20261113',root).href);await module.createLogoArtwork();}catch{}
    }
  }
  async function drain(){
    if(running||!loaded||document.hidden||constrained())return;
    running=true;
    try{
      while(queue.length&&!document.hidden&&!constrained()){
        const page=queue.shift();if(page.state==='done')continue;
        page.state='loading';await prep.idle();
        try{await preparePage(page);page.state='done';}catch{page.state='failed';}
      }
    }finally{running=false;}
  }
  function enqueue(url,urgent=false){
    const page=pages.get(url);if(!page||page.url===current.href||page.state==='loading'||page.state==='done')return;
    queue=queue.filter(p=>p!==page);urgent?queue.unshift(page):queue.push(page);drain();
  }
  function start(){loaded=true;if(constrained())return;for(const page of pages.values())enqueue(page.url);}
  function intent(event){
    const link=event.target.closest?.('.masthead a[href]');if(!link)return;
    const u=localURL(link.getAttribute('href'),location.href);if(u){u.hash='';u.search='';enqueue(u.href,true);}
  }
  for(const name of ['pointerover','focusin','touchstart'])document.addEventListener(name,intent,{passive:true});
  document.addEventListener('visibilitychange',drain);
  if(loaded)start();else window.addEventListener('load',start,{once:true});
})();
