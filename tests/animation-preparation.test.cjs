const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const code=fs.readFileSync('assets/cmbl/js/animation-preparation.js','utf8');
function setup(storage=new Map(),blocked=false){
 let calculations=0;
 const context={console,setTimeout,requestIdleCallback:cb=>setTimeout(cb,0),sessionStorage:{getItem:k=>{if(blocked)throw Error('blocked');return storage.get(k)||null},setItem:(k,v)=>{if(blocked)throw Error('blocked');storage.set(k,v)}},document:{createElement:()=>{
  const c={width:0,height:0,getContext:()=>({drawImage(){calculations++},getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4).fill(100)}),putImageData(){}}),toDataURL:()=> 'data:image/png;base64,test'};return c;
 }}};context.window=context;vm.createContext(context);vm.runInContext(code,context);return {api:context.CMBLPreparation,calculations:()=>calculations};
}
const img={src:'https://example.org/logo.png',complete:true,naturalWidth:32,naturalHeight:16};
test('Concurrent shadow jobs calculate once and survive page navigation',async()=>{
 const storage=new Map(),a=setup(storage);const [first,second]=await Promise.all([a.api.prepareShadow(img),a.api.prepareShadow(img)]);
 assert.equal(first,second);assert.equal(a.calculations(),1);const b=setup(storage);assert.deepEqual(await b.api.prepareShadow(img),b.api.cached(img));assert.equal(b.calculations(),0);
});
test('Blocked browser storage does not break rendering',async()=>{
 const a=setup(new Map(),true);assert.equal((await a.api.prepareShadow(img)).aspect,2);assert.equal(a.calculations(),1);
});
test('Undecodable logos fail independently, allowing next logo',async()=>{
 const a=setup();assert.equal(await a.api.prepareShadow({...img,src:'bad',complete:false,decode:async()=>{throw Error('bad image')}}),null);assert.ok(await a.api.prepareShadow(img));
});
test('Unavailable IndexedDB is a safe cache miss',async()=>{
 const {readArtwork}=await import('../assets/js/funding-membrane/artwork-cache.mjs');assert.equal(await readArtwork(1000,238),null);
});
function navigation({saveData=false,loaded=true,fail=false}={}){
 const fetched=[],events={};const context={URL,AbortSignal,console,setTimeout,location:{href:'https://example.org/',origin:'https://example.org'},navigator:{connection:{saveData}},document:{readyState:loaded?'complete':'loading',hidden:false,currentScript:{dataset:{root:'/'}},addEventListener:(n,f)=>events[n]=f},addEventListener:(n,f)=>events[n]=f,DOMParser:class{parseFromString(){return {querySelectorAll:()=>[],querySelector:()=>null};}},fetch:async url=>{fetched.push(url);if(fail&&url.includes('publications'))throw Error('offline');return {ok:true,text:async()=>'',arrayBuffer:async()=>new ArrayBuffer(0)}},CMBLPreparation:{idle:async()=>{}}};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('assets/cmbl/js/navigation-warmup.js','utf8'),context);return {fetched,events};
}
test('Warmup waits for page load and never visits private routes',async()=>{
 const a=navigation({loaded:false});await new Promise(r=>setTimeout(r,5));assert.equal(a.fetched.length,0);a.events.load();await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(a.fetched.map(x=>new URL(x).pathname),['/publications/','/research/','/people/','/news/','/gallery/','/contact/']);
});
test('Data saver disables automatic prefetch',async()=>{const a=navigation({saveData:true});await new Promise(r=>setTimeout(r,5));assert.equal(a.fetched.length,0);});
test('A failed destination does not block the other pages',async()=>{const a=navigation({fail:true});await new Promise(r=>setTimeout(r,10));assert.equal(a.fetched.length,6);assert.ok(a.fetched.at(-1).endsWith('/contact/'));});
