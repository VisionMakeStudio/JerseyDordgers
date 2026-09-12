import {getUser,admin,verifyRequestOrigin} from '@netlify/identity';

const rolesFor=(user:any)=>[...(Array.isArray(user?.roles)?user.roles:[]),...(Array.isArray(user?.appMetadata?.roles)?user.appMetadata.roles:[]),...(user?.role?[user.role]:[])];
const hasAccess=(user:any)=>{
 const roles=rolesFor(user);
 const ownerEmail=String(Netlify.env.get('DODGERS_ADMIN_EMAIL')||'').toLowerCase();
 const owner=Boolean(user?.id&&((user.email||'').toLowerCase()===ownerEmail||roles.includes('dodgers-owner')));
 return owner||roles.includes('dodgers-coach')||roles.includes('dodgers-media');
};

export default async(req:Request)=>{
 const jsonHeaders={'Cache-Control':'no-store','Content-Type':'application/json'};
 const error=(message:string,status=400)=>new Response(JSON.stringify({error:message}),{status,headers:jsonHeaders});
 try{
  if(req.method!=='POST')return error('Method not allowed.',405);
  verifyRequestOrigin(req);

  let user=await getUser();
  try{if(user?.id)user=await admin.getUser(user.id)}catch{}
  if(!hasAccess(user))return error(user?.id?'This account does not have Jersey Dodgers access.':'Administrator sign-in required.',403);

  const apiKey=String(Netlify.env.get('PHOTOROOM_API_KEY')||'').trim();
  if(!apiKey)return error('PhotoRoom is not configured yet. Add PHOTOROOM_API_KEY in Netlify environment variables.',503);

  const contentType=String(req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const allowed=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
  if(!allowed.has(contentType))return error('Use a JPEG, PNG, WebP or HEIC player photo.',415);

  const declared=Number(req.headers.get('content-length')||0);
  if(declared>8_000_000)return error('Player photo is too large. Use an image under 8 MB.',413);
  const bytes=await req.arrayBuffer();
  if(!bytes.byteLength)return error('No player photo was received.',400);
  if(bytes.byteLength>8_000_000)return error('Player photo is too large. Use an image under 8 MB.',413);

  const ext=contentType.includes('png')?'png':contentType.includes('webp')?'webp':contentType.includes('hei')?'heic':'jpg';
  const form=new FormData();
  form.append('image_file',new Blob([bytes],{type:contentType}),`jersey-dodgers-player.${ext}`);
  form.append('format','png');
  form.append('channels','rgba');
  form.append('size','full');
  form.append('crop','true');

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),55_000);
  let result:Response;
  try{
   result=await fetch('https://sdk.photoroom.com/v1/segment',{
    method:'POST',
    headers:{'x-api-key':apiKey},
    body:form,
    signal:controller.signal
   });
  }finally{clearTimeout(timer)}

  if(!result.ok){
   let detail='';
   try{detail=(await result.text()).slice(0,400)}catch{}
   if(result.status===401||result.status===403)return error('PhotoRoom rejected the API key. Check PHOTOROOM_API_KEY in Netlify.',502);
   if(result.status===402)return error('PhotoRoom API credits are unavailable. Check your PhotoRoom API plan.',502);
   if(result.status===429)return error('PhotoRoom is temporarily rate-limiting requests. Try again in a moment.',429);
   return error(`PhotoRoom could not remove the background${detail?`: ${detail}`:'.'}`,502);
  }

  const upstreamType=String(result.headers.get('content-type')||'').toLowerCase();
  if(upstreamType&&!upstreamType.startsWith('image/')){
   let detail='';try{detail=(await result.text()).slice(0,300)}catch{}
   return error(`PhotoRoom returned an unexpected response${detail?`: ${detail}`:'.'}`,502);
  }
  const output=await result.arrayBuffer();
  if(!output.byteLength)return error('PhotoRoom returned an empty image.',502);
  return new Response(output,{status:200,headers:{
   'Content-Type':upstreamType.startsWith('image/')?upstreamType:'image/png',
   'Content-Length':String(output.byteLength),
   'Cache-Control':'no-store, private',
   'X-JD-Background-Removal':'photoroom'
  }});
 }catch(e:any){
  if(e?.name==='AbortError')return error('PhotoRoom took too long to process this photo. Try again with a smaller image.',504);
  if(Number(e?.status)===403)return error('Request origin not allowed.',403);
  return error(e?.message||'Unable to remove the background.',500);
 }
};

export const config={path:'/api/admin/remove-background'};
