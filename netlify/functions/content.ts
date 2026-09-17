import {getStore,getDeployStore} from '@netlify/blobs';
import {getUser,admin,verifyRequestOrigin} from '@netlify/identity';
import {contentSchema,publicContent} from '../../src/schema.mjs';
import {rankStandings,syncStandings} from '../../src/standings.mjs';
import seed from '../../seed.json';

const rolesFor=(user:any)=>[...(Array.isArray(user?.roles)?user.roles:[]),...(Array.isArray(user?.appMetadata?.roles)?user.appMetadata.roles:[]),...(user?.role?[user.role]:[])];
const accessFor=(user:any)=>{
 const roles=rolesFor(user);
 const ownerEmail=(Netlify.env.get('DODGERS_ADMIN_EMAIL')||'').toLowerCase();
 const owner=Boolean(user?.id&&((user.email||'').toLowerCase()===ownerEmail||roles.includes('dodgers-owner')));
 const coach=owner||roles.includes('dodgers-coach');
 const media=coach||roles.includes('dodgers-media');
 return {owner,coach,media,roles};
};
const same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);

export default async(req,context)=>{
 const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
 const respond=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try{
  const store=context.deploy.context==='production'?getStore({name:'dodgers-content',consistency:'strong'}):getDeployStore('dodgers-content');
  const path=new URL(req.url).pathname;

  if(req.method==='GET'&&path==='/api/content'){
   const record=await store.get('published',{type:'json'});
   return respond(publicContent(record?.data||seed));
  }

  let user=await getUser();
  try{if(user?.id)user=await admin.getUser(user.id)}catch{}
  const access=accessFor(user);
  if(!access.media)return respond({error:user?.id?'This account is signed in but does not have Jersey Dodgers access. Ask the Owner to refresh this staff account.':'Administrator sign-in required.'},403);

  if(req.method==='GET'){
   const record=await store.get('published',{type:'json'});
   const data=contentSchema.parse(record?.data||seed);
   return respond(record?{...record,data:{...data,standings:rankStandings(data.standings)}}:{revision:'initial',data:{...data,standings:rankStandings(data.standings)}});
  }

  if(req.method!=='PUT')return respond({error:'Method not allowed'},405);
  verifyRequestOrigin(req);

  if(Number(req.headers.get('content-length')||0)>4000000)return respond({error:'Content too large'},413);
  const raw=await req.text();
  if(raw.length>4000000)return respond({error:'Content too large'},413);

  const input=JSON.parse(raw);
  const result=contentSchema.safeParse(input.data);
  if(!result.success)return respond({error:result.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ')},400);

  const before=await store.get('published',{type:'json'});
  if(input.revision!==(before?.revision||'initial'))return respond({error:'Another update was saved. Reload before saving your changes.'},409);

  // Media staff can work only in media/watch-follow sections.
  // Coach/Admin and Owner keep full team-management access.
  if(!access.coach){
   const previous=contentSchema.parse(before?.data||seed);
   for(const key of Object.keys(result.data)){
    if(key==='media'||key==='channels')continue;
    const priorValue=key==='standings'?rankStandings(previous.standings):(previous as any)[key];
    if(!same(priorValue,(result.data as any)[key])){
     return respond({error:'Your Media access can only change photos, videos and Watch & Follow links.'},403);
    }
   }
  }

  const previous=contentSchema.parse(before?.data||seed);
  const updated=syncStandings(previous,result.data,before?.standingsGameResults);
  const parsed=contentSchema.parse(updated.data);
  if(before)await store.setJSON('history/'+before.revision,before);
  const record={revision:crypto.randomUUID(),updatedAt:new Date().toISOString(),data:parsed,standingsGameResults:updated.appliedResults};
  await store.setJSON('published',record);
  return respond(record);
 }catch(e:any){
  return respond({error:e?.status===403?'Request origin not allowed.':'Unable to complete the request. Please try again.'},e?.status===403?403:500);
 }
};

export const config={path:['/api/content','/api/admin/content']};
