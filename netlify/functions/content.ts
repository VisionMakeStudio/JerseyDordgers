import {getStore,getDeployStore} from '@netlify/blobs';
import {getUser,verifyRequestOrigin} from '@netlify/identity';
import {contentSchema,canEdit,publicContent} from '../../src/schema.mjs';
import seed from '../../seed.json';
export default async(req,context)=>{
 const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
 const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try{
  const store=context.deploy.context==='production'?getStore({name:'dodgers-content',consistency:'strong'}):getDeployStore('dodgers-content');
  const path=new URL(req.url).pathname;
  if(req.method==='GET'&&path==='/api/content'){const record=await store.get('published',{type:'json'});return respond(publicContent(record?.data||seed))}
  const user=await getUser();
  if(!canEdit(user,Netlify.env.get('DODGERS_ADMIN_EMAIL')))return respond({error:'Administrator sign-in required.'},403);
  if(req.method==='GET'){const record=await store.get('published',{type:'json'});return respond(record?{...record,data:contentSchema.parse(record.data)}:{revision:'initial',data:contentSchema.parse(seed)})}
  if(req.method!=='PUT')return respond({error:'Method not allowed'},405);
  verifyRequestOrigin(req);
  if(Number(req.headers.get('content-length')||0)>4000000)return respond({error:'Content too large'},413);
  const raw=await req.text();if(raw.length>4000000)return respond({error:'Content too large'},413);
  const input=JSON.parse(raw);const result=contentSchema.safeParse(input.data);
  if(!result.success)return respond({error:result.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ')},400);
  const before=await store.get('published',{type:'json'});
  if(input.revision!==(before?.revision||'initial'))return respond({error:'Another update was saved. Reload before saving your changes.'},409);
  if(before)await store.setJSON('history/'+before.revision,before);
  const record={revision:crypto.randomUUID(),updatedAt:new Date().toISOString(),data:result.data};
  await store.setJSON('published',record);
  return respond(record);
 }catch(e){return respond({error:e?.status===403?'Request origin not allowed.':'Unable to complete the request. Please try again.'},e?.status===403?403:500)}
};
export const config={path:['/api/content','/api/admin/content']};
