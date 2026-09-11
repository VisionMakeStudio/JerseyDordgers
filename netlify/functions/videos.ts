import {getStore,getDeployStore} from '@netlify/blobs';
import {getUser,verifyRequestOrigin} from '@netlify/identity';
import {canEdit} from '../../src/schema.mjs';

export default async(req,context)=>{
 const store=context.deploy.context==='production'?getStore({name:'dodgers-videos',consistency:'strong'}):getDeployStore('dodgers-videos');
 try{
  if(req.method==='GET'){
   const key=context.params.key;if(!/^[a-f0-9-]+\.(mp4|webm)$/.test(key||''))return new Response('Not found',{status:404});
   const blob=await store.get(key,{type:'arrayBuffer'});if(!blob)return new Response('Not found',{status:404});
   return new Response(blob,{headers:{'Content-Type':key.endsWith('.mp4')?'video/mp4':'video/webm','Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'}})
  }
  if(req.method!=='POST')return new Response(null,{status:405});
  const user=await getUser();if(!canEdit(user,Netlify.env.get('DODGERS_ADMIN_EMAIL')))return Response.json({error:'Administrator sign-in required.'},{status:403});
  verifyRequestOrigin(req);
  const bytes=new Uint8Array(await req.arrayBuffer());if(bytes.length>5000000||bytes.length<12)return Response.json({error:'Choose a short video under 5 MB. For longer videos, paste a YouTube link.'},{status:400});
  const mp4=new TextDecoder().decode(bytes.slice(4,8))==='ftyp',webm=[0x1a,0x45,0xdf,0xa3].every((v,i)=>bytes[i]===v);
  if(!mp4&&!webm)return Response.json({error:'Use an MP4 or WebM video.'},{status:400});
  const key=crypto.randomUUID()+'.'+(mp4?'mp4':'webm');await store.set(key,bytes.buffer);
  return Response.json({url:'/api/videos/'+key},{headers:{'Cache-Control':'no-store'}})
 }catch{return Response.json({error:'Video upload failed. Please try again.'},{status:500})}
};
export const config={path:['/api/videos','/api/videos/:key']};
