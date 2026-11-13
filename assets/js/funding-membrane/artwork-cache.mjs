// Only reusable artwork and collision masks, never simulation state or analytics.
const KEY='previous108-geometry1000x238-radius024-v1';
function database(){return new Promise(resolve=>{
 if(!('indexedDB' in globalThis)){resolve(null);return;}
 let settled=false;const finish=db=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);resolve(db);};
 const timer=setTimeout(()=>finish(null),400);
 try{
  const request=indexedDB.open('cmbl-animation-artwork',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('artwork');
  request.onsuccess=()=>finish(request.result);request.onerror=()=>finish(null);request.onblocked=()=>finish(null);
 }catch{finish(null);}
});}
async function record(mode,value){
 const db=await database();if(!db)return null;
 return new Promise(resolve=>{
  let result=null;let complete=false;
  const finish=()=>{if(complete)return;complete=true;clearTimeout(timer);db.close();resolve(result);};
  const timer=setTimeout(finish,400);
  try{
   const transaction=db.transaction('artwork',mode),store=transaction.objectStore('artwork');
   const request=mode==='readonly'?store.get(KEY):store.put(value,KEY);
   request.onsuccess=()=>{result=request.result;};transaction.oncomplete=finish;transaction.onerror=finish;transaction.onabort=finish;
  }catch{finish();}
 });
}
export async function readArtwork(width,height){
 try{
  const cached=await record('readonly');
  if(!cached||cached.mask?.length!==width*height||!cached.blob)return null;
  const bitmap=await createImageBitmap(cached.blob);
  if(bitmap.width!==width*2||bitmap.height!==height*2){bitmap.close();return null;}
  const art=document.createElement('canvas');art.width=bitmap.width;art.height=bitmap.height;
  art.getContext('2d').drawImage(bitmap,0,0);bitmap.close();return {art,mask:new Uint8Array(cached.mask)};
 }catch{return null;}
}
export async function saveArtwork({art,mask}){
 try{const blob=await new Promise(resolve=>art.toBlob(resolve,'image/png'));if(blob)await record('readwrite',{blob,mask});}catch{}
}
