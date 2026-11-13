import {readArtwork,saveArtwork} from './artwork-cache.mjs?v=prepare-20261113';
import {GEOMETRY} from './core.mjs?v=fast-contacts-20261010';
// Original funding artwork, with the same crop windows as the preserved site.
export const LOGOS=[
 ['access-logo.svg',20,8,13,6.50568,100,0,0,'ACCESS'],
 ['UND-logo.png',41,8,14,4.27132,100,0,0,'Notre Dame'],
 ['NCSA.png',62,8,10,2.88864,123.1303,-11.5652,-.6682,'NCSA'],
 ['TACC.jpg',83,8,9.4,2.83036,111.6719,-5.9937,-25,'TACC'],
 ['nsf-logo.png',11,26,6.804,1.97727,102.3488,-1.1994,-6.917,'NSF'],
 ['UIUC.png',27,26,10.152,3.78295,102.459,-1.2295,-58.9147,'Illinois'],
 ['UC_Berkeley.webp',43,26,10.476,4,101.3514,0,-39.1892,'Berkeley'],
 ['Kwanjeong.png',59,26,10.8,4.23154,101.3481,-.793,-3.6913,'Kwanjeong'],
 ['nist-logo.png',75,26,11.556,7.16149,100.2602,-.1735,-1.2422,'NIST'],
 ['CU_Coulder.png',91,26,11.232,4.94845,100,0,0,'Colorado Boulder']
];
export async function createLogoArtwork(){
 const mw=GEOMETRY.maskWidth,mh=GEOMETRY.maskHeight;
 const cached=await readArtwork(mw,mh);if(cached)return cached;
 const yieldWork=()=>new Promise(resolve=>setTimeout(resolve,0));
 const art=document.createElement('canvas');art.width=mw*2;art.height=mh*2;const ctx=art.getContext('2d',{willReadFrequently:true});
 const images=await Promise.all(LOGOS.map(row=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Logo load failed: '+row[0]));img.src=new URL('../../img/funding/'+row[0],import.meta.url).href;})));
 LOGOS.forEach(([file,cx,cy,w,ratio,scale,left,top],i)=>{
  const h=w/ratio,x=(cx-w/2)*20,y=cy/34*art.height-h/2*20,img=images[i],width=w*20,height=h*20;
  ctx.save();ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();ctx.drawImage(img,x+width*left/100,y+height*top/100,width*scale/100,width*scale/100*img.naturalHeight/img.naturalWidth);ctx.restore();
 });
 const rgba=ctx.getImageData(0,0,art.width,art.height);
 // Remove white matte for rendering and derive collisions from the same visible ink.
 for(let p=0;p<rgba.data.length;p+=4){if(p%131072===0)await yieldWork();const ink=1-Math.min(rgba.data[p],rgba.data[p+1],rgba.data[p+2])/255;if(ink<.06)rgba.data[p+3]=0;}
 ctx.putImageData(rgba,0,0);const base=new Uint8Array(mw*mh),mask=new Uint8Array(base.length);
 for(let y=0;y<mh;y++){if(y%16===0)await yieldWork();for(let x=0;x<mw;x++){
  let coverage=0;for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++){const p=((y*2+oy)*art.width+x*2+ox)*4;coverage+=rgba.data[p+3]/255*(1-Math.min(rgba.data[p],rgba.data[p+1],rgba.data[p+2])/255);}
  base[y*mw+x]=coverage/4>.14?1:0;
 }
 }
 // Minkowski expansion by ion radius (0.24 units) for center-based collision queries.
 const expand=Math.ceil(GEOMETRY.radius*mw/GEOMETRY.width);
 for(let y=0;y<mh;y++){if(y%16===0)await yieldWork();for(let x=0;x<mw;x++)if(base[y*mw+x])for(let oy=-expand;oy<=expand;oy++)for(let ox=-expand;ox<=expand;ox++)if(ox*ox+oy*oy<=(GEOMETRY.radius*mw/GEOMETRY.width+.5)**2){const xx=x+ox,yy=y+oy;if(xx>=0&&xx<mw&&yy>=0&&yy<mh)mask[yy*mw+xx]=1;}
 }
 await saveArtwork({art,mask});
 return {art,mask};
}
