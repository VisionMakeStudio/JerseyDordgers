import {getStore,getDeployStore} from '@netlify/blobs';
import {getUser,verifyRequestOrigin} from '@netlify/identity';
import {canEdit} from '../../src/schema.mjs';

const MAX_VIDEO_BYTES=250*1024*1024;
const MAX_CHUNK_BYTES=4*1024*1024;
const MAX_CHUNKS=80;
const MAX_RESPONSE_BYTES=4*1024*1024;

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const typeFor=ext=>ext==='webm'?'video/webm':'video/mp4';
const manifestKey=id=>`manifest-${id}.json`;
const chunkKey=(id,index)=>`chunk-${id}-${index}`;

function validUploadId(value){
 return /^[a-f0-9-]{20,60}$/i.test(value||'');
}

function parseVideoKey(value=''){
 const match=value.match(/^([a-f0-9-]{20,60})\.(mp4|webm)$/i);
 return match?{id:match[1],ext:match[2].toLowerCase()}:null;
}

function parseRange(range,total,maxBytes=MAX_RESPONSE_BYTES){
 if(total<=0)return null;

 let start=0,end=total-1;
 let requested=Boolean(range);

 if(range){
  const match=range.match(/^bytes=(\d*)-(\d*)$/);
  if(!match)return null;

  if(!match[1]){
   const suffix=Math.max(1,Number(match[2]||0));
   start=Math.max(0,total-suffix);
   end=total-1;
  }else{
   start=Number(match[1]);
   end=match[2]?Number(match[2]):total-1;
  }
 }

 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||start>=total||end<start)return null;

 end=Math.min(end,total-1,start+maxBytes-1);

 return {start,end,partial:requested||start>0||end<total-1};
}

function responseHeaders(ext,length,total,range){
 const headers={
  'Content-Type':typeFor(ext),
  'Cache-Control':'public,max-age=31536000,immutable',
  'X-Content-Type-Options':'nosniff',
  'Accept-Ranges':'bytes',
  'Content-Length':String(length)
 };

 if(range?.partial)headers['Content-Range']=`bytes ${range.start}-${range.end}/${total}`;
 return headers;
}

async function serveChunked(req,store,info,manifest){
 const total=Number(manifest.totalSize||0);
 const sizes=Array.isArray(manifest.chunkSizes)?manifest.chunkSizes.map(Number):[];

 if(!total||!sizes.length||sizes.some(v=>!Number.isFinite(v)||v<=0))
  return new Response('Not found',{status:404});

 if(req.method==='HEAD'){
  return new Response(null,{
   status:200,
   headers:{
    'Content-Type':typeFor(info.ext),
    'Content-Length':String(total),
    'Accept-Ranges':'bytes',
    'Cache-Control':'public,max-age=31536000,immutable'
   }
  });
 }

 const range=parseRange(req.headers.get('range'),total);
 if(!range)return new Response('Requested range not satisfiable',{
  status:416,
  headers:{'Content-Range':`bytes */${total}`}
 });

 const pieces=[];
 let outputLength=0;
 let absolute=0;

 for(let i=0;i<sizes.length;i++){
  const size=sizes[i];
  const chunkStart=absolute;
  const chunkEnd=absolute+size-1;
  absolute+=size;

  if(chunkEnd<range.start)continue;
  if(chunkStart>range.end)break;

  const raw=await store.get(chunkKey(info.id,i),{type:'arrayBuffer'});
  if(!raw)return new Response('Video data is incomplete',{status:503});

  const bytes=new Uint8Array(raw);
  const from=Math.max(0,range.start-chunkStart);
  const to=Math.min(bytes.length-1,range.end-chunkStart);
  const slice=bytes.slice(from,to+1);

  pieces.push(slice);
  outputLength+=slice.length;
 }

 const output=new Uint8Array(outputLength);
 let offset=0;
 for(const piece of pieces){
  output.set(piece,offset);
  offset+=piece.length;
 }

 return new Response(output,{
  status:range.partial?206:200,
  headers:responseHeaders(info.ext,output.length,total,range)
 });
}

async function serveLegacy(req,store,key,info){
 const raw=await store.get(key,{type:'arrayBuffer'});
 if(!raw)return new Response('Not found',{status:404});

 const bytes=new Uint8Array(raw);
 const total=bytes.length;

 if(req.method==='HEAD'){
  return new Response(null,{
   status:200,
   headers:{
    'Content-Type':typeFor(info.ext),
    'Content-Length':String(total),
    'Accept-Ranges':'bytes',
    'Cache-Control':'public,max-age=31536000,immutable'
   }
  });
 }

 const range=parseRange(req.headers.get('range'),total);
 if(!range)return new Response('Requested range not satisfiable',{
  status:416,
  headers:{'Content-Range':`bytes */${total}`}
 });

 const slice=bytes.slice(range.start,range.end+1);
 return new Response(slice,{
  status:range.partial?206:200,
  headers:responseHeaders(info.ext,slice.length,total,range)
 });
}

export default async(req,context)=>{
 const store=context.deploy.context==='production'
  ?getStore({name:'dodgers-videos',consistency:'strong'})
  :getDeployStore('dodgers-videos');

 try{
  if(req.method==='GET'||req.method==='HEAD'){
   const key=context.params.key||'';
   const info=parseVideoKey(key);
   if(!info)return new Response('Not found',{status:404});

   const manifest=await store.get(manifestKey(info.id),{type:'json'});
   if(manifest&&manifest.ext===info.ext){
    return serveChunked(req,store,info,manifest);
   }

   return serveLegacy(req,store,key,info);
  }

  if(req.method!=='POST')return new Response(null,{status:405});

  const user=await getUser();
  if(!canEdit(user,Netlify.env.get('DODGERS_ADMIN_EMAIL')))
   return json({error:'Administrator sign-in required.'},403);

  verifyRequestOrigin(req);

  const url=new URL(req.url);
  const uploadId=url.searchParams.get('uploadId');
  const chunk=Number(url.searchParams.get('chunk'));
  const total=Number(url.searchParams.get('total'));
  const ext=(url.searchParams.get('ext')||'').toLowerCase();
  const declaredFileSize=Number(url.searchParams.get('fileSize')||0);

  if(!validUploadId(uploadId))
   return json({error:'Invalid video upload session.'},400);

  if(!Number.isInteger(chunk)||chunk<0||
     !Number.isInteger(total)||total<1||total>MAX_CHUNKS||chunk>=total||
     !['mp4','webm'].includes(ext))
   return json({error:'Invalid video upload chunk.'},400);

  if(!Number.isFinite(declaredFileSize)||declaredFileSize<12||declaredFileSize>MAX_VIDEO_BYTES)
   return json({error:'Choose a video under 250 MB.'},400);

  const bytes=new Uint8Array(await req.arrayBuffer());
  if(bytes.length<1||bytes.length>MAX_CHUNK_BYTES)
   return json({error:'Video chunk is too large. Please try the upload again.'},400);

  if(chunk===0){
   const mp4=bytes.length>=8&&new TextDecoder().decode(bytes.slice(4,8))==='ftyp';
   const webm=bytes.length>=4&&[0x1a,0x45,0xdf,0xa3].every((v,i)=>bytes[i]===v);

   if((ext==='mp4'&&!mp4)||(ext==='webm'&&!webm))
    return json({error:'Use a valid MP4 or WebM video.'},400);
  }

  await store.set(chunkKey(uploadId,chunk),bytes.buffer,{
   metadata:{
    size:bytes.length,
    ext,
    total,
    declaredFileSize,
    createdAt:Date.now()
   }
  });

  if(chunk<total-1){
   return json({ok:true,chunk,total});
  }

  // Finalize using metadata only. We deliberately do NOT join a 250 MB file
  // inside one function invocation.
  const chunkSizes=[];
  let actualSize=0;

  for(let i=0;i<total;i++){
   const meta=await store.getMetadata(chunkKey(uploadId,i));
   const size=Number(meta?.metadata?.size||0);

   if(!meta||!size)
    return json({error:'A video upload chunk is missing. Please upload the video again.'},400);

   actualSize+=size;
   if(actualSize>MAX_VIDEO_BYTES)
    return json({error:'Choose a video under 250 MB.'},400);

   chunkSizes.push(size);
  }

  if(Math.abs(actualSize-declaredFileSize)>2)
   return json({error:'The uploaded video size did not match. Please upload it again.'},400);

  await store.setJSON(manifestKey(uploadId),{
   version:2,
   ext,
   total,
   totalSize:actualSize,
   chunkSizes,
   createdAt:Date.now()
  });

  return json({
   url:`/api/videos/${uploadId}.${ext}`,
   size:actualSize
  });
 }catch(error){
  console.error('videos function error',error);
  return json({error:'Video upload failed. Please try again.'},500);
 }
};

export const config={path:['/api/videos','/api/videos/:key']};
