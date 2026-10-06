import {getStore,getDeployStore} from '@netlify/blobs';
import {getUser,admin,verifyRequestOrigin} from '@netlify/identity';
import {normalizeEmail,emailKey,token,sendToAll,unsubscribeUrl,updateHtml,updateText} from '../../src/updates-email.mjs';

const rolesFor=(user:any)=>[...(Array.isArray(user?.roles)?user.roles:[]),...(Array.isArray(user?.appMetadata?.roles)?user.appMetadata.roles:[]),...(user?.role?[user.role]:[])];
const accessFor=(user:any)=>{
 const roles=rolesFor(user);
 const ownerEmail=(Netlify.env.get('DODGERS_ADMIN_EMAIL')||'').toLowerCase();
 const owner=Boolean(user?.id&&((user.email||'').toLowerCase()===ownerEmail||roles.includes('dodgers-owner')));
 const coach=owner||roles.includes('dodgers-coach');
 const media=coach||roles.includes('dodgers-media');
 return {owner,coach,media};
};
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const page=(title:string,text:string)=>new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#06122A;color:#E9F0FA;font-family:Arial,Helvetica,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px"><div><img src="/assets/d-mark.png" width="64" height="64" alt=""><h1 style="text-transform:uppercase;letter-spacing:1px">${title}</h1><p style="color:#8FA3C2">${text}</p><p><a href="/" style="color:#7CC0EC">Back to jerseydodgers.com</a></p></div></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});

async function allSubs(store:any){
 const {blobs}=await store.list({prefix:'sub/'});
 const out:any[]=[];
 for(const b of blobs){const v=await store.get(b.key,{type:'json'});if(v?.email)out.push(v)}
 return out.sort((a,b)=>String(b.created).localeCompare(String(a.created)));
}

export default async(req:Request,context:any)=>{
 const store=context.deploy.context==='production'?getStore({name:'dodgers-subscribers',consistency:'strong'}):getDeployStore('dodgers-subscribers');
 const url=new URL(req.url),path=url.pathname;
 try{
  /* public: sign up */
  if(path==='/api/subscribe'&&req.method==='POST'){
   const body=await req.json().catch(()=>({}));
   if(body.company)return json({ok:true});            // honeypot
   const email=normalizeEmail(body.email);
   if(!email)return json({error:'Enter a valid email address.'},400);
   const key=await emailKey(email),existing=await store.get('sub/'+key,{type:'json'});
   if(existing)return json({ok:true,already:true});
   const sub={key,email,token:token(),created:new Date().toISOString()};
   await store.setJSON('sub/'+key,sub);
   const apiKey=Netlify.env.get('RESEND_API_KEY'),from=Netlify.env.get('JERSEY_DODGERS_FROM');
   if(apiKey&&from){
    const unsubscribe=unsubscribeUrl(key,sub.token),m={kicker:'You are on the list',title:'Welcome to Jersey Dodgers updates',text:'You will get an email when we post game recaps, final scores, new photos and team news, plus a reminder the day before each game.',url:'/',cta:'Visit the website',unsubscribe};
    fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[email],subject:'You are subscribed to Jersey Dodgers updates',html:updateHtml(m),text:updateText(m),headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}})}).catch(()=>{});
   }
   return json({ok:true});
  }
  /* public: unsubscribe (link click = GET, mail client one-click = POST) */
  if(path==='/api/unsubscribe'){
   const key=url.searchParams.get('k')||'',tok=url.searchParams.get('t')||'';
   const sub=key?await store.get('sub/'+key,{type:'json'}):null;
   if(sub&&sub.token===tok)await store.delete('sub/'+key);
   if(req.method==='POST')return json({ok:true});
   return page(sub&&sub.token===tok?'You are unsubscribed':'Already unsubscribed','You will not get any more Jersey Dodgers update emails.');
  }

  /* admin */
  let user:any=await getUser();
  try{if(user?.id)user=await admin.getUser(user.id)}catch{}
  const access=accessFor(user);
  if(!access.media)return json({error:'Administrator sign-in required.'},403);

  if(path==='/api/admin/subscribers'&&req.method==='GET'){
   const subs=await allSubs(store);
   return json({count:subs.length,subscribers:subs.map(s=>({key:s.key,email:s.email,created:s.created})),configured:Boolean(Netlify.env.get('RESEND_API_KEY')&&Netlify.env.get('JERSEY_DODGERS_FROM'))});
  }
  if(path==='/api/admin/subscribers'&&req.method==='DELETE'){
   verifyRequestOrigin(req);
   const key=url.searchParams.get('key')||'';if(key)await store.delete('sub/'+key);
   return json({ok:true});
  }
  if(path==='/api/admin/subscribers'&&req.method==='POST'){
   verifyRequestOrigin(req);
   const b=await req.json().catch(()=>({}));
   const email=normalizeEmail(b.email);if(!email)return json({error:'Enter a valid email address.'},400);
   const key=await emailKey(email);if(!(await store.get('sub/'+key,{type:'json'})))await store.setJSON('sub/'+key,{key,email,token:token(),created:new Date().toISOString(),addedBy:'admin'});
   return json({ok:true});
  }
  if(path==='/api/admin/notify'&&req.method==='POST'){
   verifyRequestOrigin(req);
   if(!access.coach)return json({error:'Only the owner or coaches can email subscribers.'},403);
   const b=await req.json().catch(()=>({}));
   const title=String(b.title||'').trim().slice(0,160);
   if(!title)return json({error:'Add a headline for the email.'},400);
   const m={kind:String(b.kind||'update'),kicker:String(b.kicker||'').slice(0,60),title,subject:String(b.subject||title).slice(0,160),text:String(b.text||'').slice(0,4000),url:String(b.url||'/').slice(0,400),cta:String(b.cta||'See it on the website').slice(0,40),image:String(b.image||'').slice(0,400)};
   const apiKey=Netlify.env.get('RESEND_API_KEY'),from=Netlify.env.get('JERSEY_DODGERS_FROM');
   if(!apiKey||!from)return json({error:'Email sending is not set up. RESEND_API_KEY and JERSEY_DODGERS_FROM are missing in Netlify.'},500);
   const subs=await allSubs(store);
   if(!subs.length)return json({sent:0,failed:0,message:'No subscribers yet.'});
   const result=await sendToAll(subs,m,{apiKey,from});
   await store.setJSON('log/'+Date.now(),{at:new Date().toISOString(),by:user?.email||'',title,kind:m.kind,...result});
   return json(result);
  }
  return json({error:'Not found'},404);
 }catch(e:any){
  console.error(e);
  return json({error:e?.message||'Something went wrong.'},500);
 }
};

export const config={path:['/api/subscribe','/api/unsubscribe','/api/admin/subscribers','/api/admin/notify']};
