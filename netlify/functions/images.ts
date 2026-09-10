import {getStore,getDeployStore} from '@netlify/blobs';
import {getUser,verifyRequestOrigin} from '@netlify/identity';
import {canEdit} from '../../src/schema.mjs';
export default async(req,context)=>{
 const store=context.deploy.context==='production'?getStore({name:'dodgers-images',consistency:'strong'}):getDeployStore('dodgers-images');
 try{
  if(req.method==='GET'){
   const key=context.params.key;if(!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key||''))return new Response('Not found',{status:404});
   const blob=await store.get(key,{type:'arrayBuffer'});if(!blob)return new Response('Not found',{status:404});
   return new Response(blob,{headers:{'Content-Type':key.endsWith('.jpg')?'image/jpeg':key.endsWith('.png')?'image/png':'image/webp','Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff'}})
  }
  if(req.method!=='POST')return new Response(null,{status:405});
  const user=await getUser();if(!canEdit(user,Netlify.env.get('DODGERS_ADMIN_EMAIL')))return Response.json({error:'Administrator sign-in required.'},{status:403});
  verifyRequestOrigin(req);
  const bytes=new Uint8Array(await req.arrayBuffer());if(bytes.length>4000000||bytes.length<12)return Response.json({error:'Choose an image under 4 MB.'},{status:400});
  let ext='';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)ext='jpg';else if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))ext='png';else if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')ext='webp';
  if(!ext)return Response.json({error:'Use a JPEG, PNG or WebP image.'},{status:400});
  const key=crypto.randomUUID()+'.'+ext;await store.set(key,bytes.buffer);return Response.json({url:'/api/images/'+key},{headers:{'Cache-Control':'no-store'}})
 }catch{return Response.json({error:'Image upload failed. Please try again.'},{status:500})}
};
export const config={path:['/api/images','/api/images/:key']};
