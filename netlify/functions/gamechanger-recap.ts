import {getUser,admin,verifyRequestOrigin} from '@netlify/identity';
import {parseGameChangerUrl,buildGameChangerRecap} from '../../src/gamechanger.mjs';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const rolesFor=(user:any)=>[...(Array.isArray(user?.roles)?user.roles:[]),...(Array.isArray(user?.appMetadata?.roles)?user.appMetadata.roles:[]),...(user?.role?[user.role]:[])];
const mayManageContent=(user:any)=>{const roles=rolesFor(user),ownerEmail=String(Netlify.env.get('DODGERS_ADMIN_EMAIL')||'').toLowerCase();return Boolean(user?.id&&((user.email||'').toLowerCase()===ownerEmail||roles.some((role:string)=>['dodgers-owner','dodgers-coach','dodgers-media'].includes(role))))};
const gcFetch=async(path:string,signal:AbortSignal)=>{const response=await fetch(`https://api.team-manager.gc.com${path}`,{signal,headers:{Accept:'application/json','gc-app-name':'web','User-Agent':'JerseyDodgers.com recap importer/1.0'}});if(!response.ok)throw Error(response.status===404?'GameChanger could not find that game.':'GameChanger is temporarily unavailable.');return response.json()};

export default async(req:Request)=>{
 try{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  let user=await getUser();try{if(user?.id)user=await admin.getUser(user.id)}catch{}if(!mayManageContent(user))return json({error:'Administrator sign-in required.'},403);
  verifyRequestOrigin(req);if(Number(req.headers.get('content-length')||0)>4000)return json({error:'Request too large'},413);
  const {url}=await req.json(),parsed=parseGameChangerUrl(url),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{const event:any=await gcFetch(`/public/events/${encodeURIComponent(parsed.eventId)}`,controller.signal),publicTeamId=String(event?.id||parsed.teamId);const [details,team]=await Promise.all([gcFetch(`/public/game-stream-processing/${encodeURIComponent(parsed.eventId)}/details?include=line_scores`,controller.signal),gcFetch(`/public/teams/${encodeURIComponent(publicTeamId)}`,controller.signal)]);return json(buildGameChangerRecap({details,team,source:`https://web.gc.com/teams/${encodeURIComponent(publicTeamId)}/schedule/${parsed.eventId}/info`}))}finally{clearTimeout(timer)}
 }catch(error:any){const message=error?.name==='AbortError'?'GameChanger took too long to respond. Please try again.':error?.message||'Unable to import this GameChanger game.';return json({error:message},/Paste|Use the GameChanger|not posted/.test(message)?400:502)}
};

export const config={path:'/api/admin/gamechanger-recap'};
