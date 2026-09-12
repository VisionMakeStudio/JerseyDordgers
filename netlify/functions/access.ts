import {getUser,admin} from '@netlify/identity';

export default async()=>{
 let user=await getUser();
 if(!user)return Response.json({authenticated:false},{status:401,headers:{'Cache-Control':'no-store'}});
 try{if(user.id)user=await admin.getUser(user.id)}catch{}
 const roles=[...(Array.isArray(user.roles)?user.roles:[]),...(Array.isArray(user.appMetadata?.roles)?user.appMetadata.roles:[]),...(user.role?[user.role]:[])];
 const ownerEmail=String(Netlify.env.get('DODGERS_ADMIN_EMAIL')||'').toLowerCase();
 const owner=(user.email||'').toLowerCase()===ownerEmail||roles.includes('dodgers-owner');
 const coach=owner||roles.includes('dodgers-coach');
 const media=coach||roles.includes('dodgers-media');
 if(!media)return Response.json({authenticated:true,owner:false,coach:false,media:false,error:'This account is signed in but does not have Jersey Dodgers access.'},{status:403,headers:{'Cache-Control':'no-store'}});
 return Response.json({
  authenticated:true,
  email:user.email||'',
  name:user.name||'',
  owner,
  coach,
  media,
  role:owner?'dodgers-owner':coach?'dodgers-coach':'dodgers-media'
 },{headers:{'Cache-Control':'no-store'}});
};
export const config={path:'/api/admin/access'};
