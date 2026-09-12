import {getUser,admin,requestPasswordRecovery,verifyRequestOrigin} from '@netlify/identity';

const roleLabels:Record<string,string>={
 'dodgers-owner':'Owner',
 'dodgers-coach':'Coach / Admin',
 'dodgers-media':'Media'
};
const allowedRoles=new Set(['dodgers-coach','dodgers-media']);

const userRoles=(user:any)=>[...(Array.isArray(user?.roles)?user.roles:[]),...(Array.isArray(user?.appMetadata?.roles)?user.appMetadata.roles:[]),...(user?.role?[user.role]:[])];
const ownerEmail=()=>String(Netlify.env.get('DODGERS_ADMIN_EMAIL')||'').toLowerCase();
const isOwner=(user:any)=>Boolean(user?.id&&((user.email||'').toLowerCase()===ownerEmail()||userRoles(user).includes('dodgers-owner')));

const publicUser=(user:any)=>{
 const roles=userRoles(user);
 const owner=(user.email||'').toLowerCase()===ownerEmail()||roles.includes('dodgers-owner');
 const role=owner?'dodgers-owner':roles.find((r:string)=>allowedRoles.has(r))||'';
 return {
  id:user.id,
  email:user.email||'',
  name:user.name||user.userMetadata?.full_name||'',
  role,
  roleLabel:roleLabels[role]||'No Jersey Dodgers access',
  owner,
  createdAt:user.createdAt||'',
  updatedAt:user.updatedAt||'',
  lastSignInAt:user.lastSignInAt||'',
  invitedAt:user.invitedAt||'',
  confirmedAt:user.confirmedAt||''
 };
};

export default async(req:Request)=>{
 const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
 const respond=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers});

 try{
  const current=await getUser();
  if(!isOwner(current))return respond({error:'Owner access required.'},403);

  if(req.method==='GET'){
   const users=await admin.listUsers({page:1,perPage:500});
   const staff=users
    .filter((u:any)=>{
     const roles=userRoles(u);
     return (u.email||'').toLowerCase()===ownerEmail()||roles.some((r:string)=>r.startsWith('dodgers-'));
    })
    .map(publicUser)
    .sort((a:any,b:any)=>Number(b.owner)-Number(a.owner)||a.email.localeCompare(b.email));
   return respond({staff});
  }

  verifyRequestOrigin(req);

  if(req.method==='POST'){
   const body=await req.json();
   const email=String(body.email||'').trim().toLowerCase();
   const name=String(body.name||'').trim().slice(0,120);
   const role=String(body.role||'dodgers-coach');

   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return respond({error:'Enter a valid email address.'},400);
   if(!allowedRoles.has(role))return respond({error:'Choose Coach / Admin or Media access.'},400);
   if(email===ownerEmail())return respond({error:'The owner account already has full access.'},400);

   const users=await admin.listUsers({page:1,perPage:500});
   let target=users.find((u:any)=>(u.email||'').toLowerCase()===email);

   if(!target){
    const tempPassword=`JD-${crypto.randomUUID()}-${crypto.randomUUID()}`;
    target=await admin.createUser({
     email,
     password:tempPassword,
     data:{user_metadata:{full_name:name}}
    });
   }

   target=await admin.updateUser(target.id,{role});
   await requestPasswordRecovery(email);

   return respond({
    staff:publicUser(target),
    message:`Access added for ${email}. Netlify Identity sent a secure password-setup email.`
   });
  }

  if(req.method==='PATCH'){
   const body=await req.json();
   const id=String(body.id||'');
   const role=String(body.role||'');
   if(!id)return respond({error:'Missing staff member.'},400);
   if(!allowedRoles.has(role))return respond({error:'Choose Coach / Admin or Media access.'},400);

   const target=await admin.getUser(id);
   if((target.email||'').toLowerCase()===ownerEmail())return respond({error:'Owner access cannot be changed here.'},400);
   const updated=await admin.updateUser(id,{role});
   return respond({staff:publicUser(updated),message:'Staff role updated. The change applies on their next sign-in or token refresh.'});
  }

  if(req.method==='DELETE'){
   const body=await req.json();
   const id=String(body.id||'');
   if(!id)return respond({error:'Missing staff member.'},400);
   const target=await admin.getUser(id);
   if((target.email||'').toLowerCase()===ownerEmail())return respond({error:'The owner account cannot be removed.'},400);
   await admin.deleteUser(id);
   return respond({ok:true,message:'Staff access removed.'});
  }

  if(req.method==='PUT'){
   const body=await req.json();
   const id=String(body.id||'');
   if(!id)return respond({error:'Missing staff member.'},400);
   const target=await admin.getUser(id);
   if(!target.email)return respond({error:'This staff member has no email address.'},400);
   await requestPasswordRecovery(target.email);
   return respond({ok:true,message:`Password-setup email sent to ${target.email}.`});
  }

  return respond({error:'Method not allowed'},405);
 }catch(e:any){
  const status=Number(e?.status)||500;
  return respond({error:e?.message||'Unable to manage staff access.'},status>=400&&status<600?status:500);
 }
};

export const config={path:'/api/admin/staff'};
