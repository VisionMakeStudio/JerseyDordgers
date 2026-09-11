import {getStore,getDeployStore} from '@netlify/blobs';
import {getUser,verifyRequestOrigin} from '@netlify/identity';
import {canEdit} from '../../src/schema.mjs';

const MAX_VIDEO_BYTES=60*1024*1024;
const MAX_CHUNK_BYTES=4*1024*1024;
const MAX_CHUNKS=20;

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

function videoHeaders(key,length,extra={}){
 return {
  'Content-Type':key.endsWith('.mp4')?'video/mp4':'video/webm',
  'Cache-Control':'public,max-age=31536000,immutable',
  'X-Content-Type-Options':'nosniff',
  'Accept-Ranges':'bytes',
  'Content-Length':String(length),
  ...extra
 };
}

function validUploadId(value){
 return /^[a-f0-9-]{20,60}$/i.test(value||'');
}

export default async(req,context)=>{
 const store=context.deploy.context==='production'
  ?getStore({name:'dodgers-videos',consistency:'strong'})
  :getDeployStore('dodgers-videos');

 try{
  if(req.method==='GET'){
   const key=context.params.key;
   if(!/^[a-f0-9-]+\.(mp4|webm)$/.test(key||''))return new Response('Not found',{status:404});

   const raw=await store.get(key,{type:'arrayBuffer'});
   if(!raw)return new Response('Not found',{status:404});

   const bytes=new Uint8Array(raw);
   const range=req.headers.get('range');

   if(range){
    const match=range.match(/^bytes=(\d*)-(\d*)$/);
    if(match){
     const start=match[1]?Number(match[1]):0;
     const end=match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;

     if(start>=0&&end>=start&&start<bytes.length){
      const slice=bytes.slice(start,end+1);
      return new Response(slice,{
       status:206,
       headers:videoHeaders(key,slice.length,{
        'Content-Range':`bytes ${start}-${end}/${bytes.length}`
       })
      });
     }
    }
   }

   return new Response(bytes,{headers:videoHeaders(key,bytes.length)});
  }

  if(req.method!=='POST')return new Response(null,{status:405});

  const user=await getUser();
  if(!canEdit(user,Netlify.env.get('DODGERS_ADMIN_EMAIL')))
   return json({error:'Administrator sign-in required.'},403);

  verifyRequestOrigin(req);

  const url=new URL(req.url);
  const uploadId=url.searchParams.get('uploadId');
  const chunkParam=url.searchParams.get('chunk');
  const totalParam=url.searchParams.get('total');
  const extParam=(url.searchParams.get('ext')||'').toLowerCase();

  // New chunked upload path for larger phone/Reel/Story videos.
  if(uploadId||chunkParam!==null||totalParam!==null){
   if(!validUploadId(uploadId))return json({error:'Invalid video upload session.'},400);

   const chunk=Number(chunkParam);
   const total=Number(totalParam);
   const ext=extParam==='webm'?'webm':extParam==='mp4'?'mp4':'';

   if(!Number.isInteger(chunk)||chunk<0||!Number.isInteger(total)||total<1||total>MAX_CHUNKS||chunk>=total||!ext)
    return json({error:'Invalid video upload chunk.'},400);

   const bytes=new Uint8Array(await req.arrayBuffer());
   if(bytes.length<1||bytes.length>MAX_CHUNK_BYTES)
    return json({error:'Video chunk is too large. Please try the upload again.'},400);

   const prefix=`upload-${uploadId}`;
   await store.set(`${prefix}-${chunk}`,bytes.buffer);

   if(chunk<total-1){
    return json({ok:true,chunk,total});
   }

   const chunks=[];
   let size=0;

   for(let i=0;i<total;i++){
    const part=await store.get(`${prefix}-${i}`,{type:'arrayBuffer'});
    if(!part)return json({error:'A video upload chunk is missing. Please upload the video again.'},400);

    const view=new Uint8Array(part);
    size+=view.length;

    if(size>MAX_VIDEO_BYTES)
     return json({error:'Choose a video under 60 MB or use a YouTube link.'},400);

    chunks.push(view);
   }

   const combined=new Uint8Array(size);
   let offset=0;
   for(const part of chunks){
    combined.set(part,offset);
    offset+=part.length;
   }

   const mp4=combined.length>=8&&new TextDecoder().decode(combined.slice(4,8))==='ftyp';
   const webm=combined.length>=4&&[0x1a,0x45,0xdf,0xa3].every((v,i)=>combined[i]===v);

   if((ext==='mp4'&&!mp4)||(ext==='webm'&&!webm))
    return json({error:'Use a valid MP4 or WebM video.'},400);

   const key=crypto.randomUUID()+'.'+ext;
   await store.set(key,combined.buffer);

   // Best-effort temp cleanup.
   await Promise.allSettled(
    Array.from({length:total},(_,i)=>store.delete(`${prefix}-${i}`))
   );

   return json({url:'/api/videos/'+key,size});
  }

  // Keep the original single-request path for small videos.
  const bytes=new Uint8Array(await req.arrayBuffer());
  if(bytes.length>5000000||bytes.length<12)
   return json({error:'For larger videos, reopen this media post and use the updated uploader.'},400);

  const mp4=new TextDecoder().decode(bytes.slice(4,8))==='ftyp';
  const webm=[0x1a,0x45,0xdf,0xa3].every((v,i)=>bytes[i]===v);

  if(!mp4&&!webm)return json({error:'Use an MP4 or WebM video.'},400);

  const key=crypto.randomUUID()+'.'+(mp4?'mp4':'webm');
  await store.set(key,bytes.buffer);

  return json({url:'/api/videos/'+key,size:bytes.length});
 }catch(error){
  console.error('videos function error',error);
  return json({error:'Video upload failed. Please try again.'},500);
 }
};

export const config={path:['/api/videos','/api/videos/:key']};
