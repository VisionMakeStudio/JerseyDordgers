// Runs every evening. If the Dodgers play tomorrow, email subscribers a reminder (once per game day).
import {getStore} from '@netlify/blobs';
import {sendToAll} from '../../src/updates-email.mjs';

const etDate=(offsetDays=0)=>{const d=new Date(Date.now()+offsetDays*864e5);return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)};
const fmtTime=(t:string)=>{const [h,m]=String(t||'00:00').split(':');return `${Number(h)%12||12}:${m} ${Number(h)<12?'AM':'PM'}`};
const fmtDay=(d:string)=>new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));

export default async()=>{
 const apiKey=Netlify.env.get('RESEND_API_KEY'),from=Netlify.env.get('JERSEY_DODGERS_FROM');
 if(!apiKey||!from){console.log('Game reminder skipped: email not configured');return}
 const content=getStore({name:'dodgers-content',consistency:'strong'}),subsStore=getStore({name:'dodgers-subscribers',consistency:'strong'});
 const record:any=await content.get('published',{type:'json'});const data=record?.data;if(!data)return;
 const tomorrow=etDate(1);
 const games=(data.games||[]).filter((g:any)=>['scheduled','live'].includes(g.status)&&(g.rescheduledDate||g.date)===tomorrow).sort((a:any,b:any)=>String(a.rescheduledTime||a.time).localeCompare(String(b.rescheduledTime||b.time)));
 if(!games.length)return;
 const sentKey='reminded/'+tomorrow;if(await subsStore.get(sentKey))return;
 const {blobs}=await subsStore.list({prefix:'sub/'});const subs:any[]=[];
 for(const b of blobs){const v:any=await subsStore.get(b.key,{type:'json'});if(v?.email)subs.push(v)}
 if(!subs.length)return;
 const team=(id:string)=>(data.teams||[]).find((t:any)=>t.id===id)?.name||'Opponent';
 const field=(data.fields||[]).find((f:any)=>f.id===games[0].field);
 const opps=[...new Set(games.map((g:any)=>team(g.opponent)))];
 const dh=games.length>1;
 const times=games.map((g:any)=>fmtTime(g.rescheduledTime||g.time));
 const title=`${dh?'Doubleheader tomorrow':'Game day tomorrow'}: ${games[0].home?'vs':'at'} ${opps.join(' & ')}`;
 const text=`${fmtDay(tomorrow)}. ${dh?`First pitch ${times[0]}, game two at ${times.slice(1).join(', ')}.`:`First pitch ${times[0]}.`}\n${field?`${field.name}${field.address?' · '+field.address:''}`:'Field to be announced.'}\nCome out and support the Dodgers.`;
 const result=await sendToAll(subs,{kind:'reminder',kicker:'Game reminder',title,subject:title,text,url:`/game/${games[0].id}/`,cta:'Game details & directions'},{apiKey,from});
 await subsStore.setJSON(sentKey,{at:new Date().toISOString(),...result});
 console.log('Game reminder sent',tomorrow,result);
};

// 22:00 UTC = 6 PM Eastern (5 PM in winter)
export const config={schedule:'0 22 * * *'};
