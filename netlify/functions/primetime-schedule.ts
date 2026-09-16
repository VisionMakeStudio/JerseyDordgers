import {getUser,admin,verifyRequestOrigin} from '@netlify/identity';

const rolesFor=(user:any)=>[...(Array.isArray(user?.roles)?user.roles:[]),...(Array.isArray(user?.appMetadata?.roles)?user.appMetadata.roles:[]),...(user?.role?[user.role]:[])];
const canManage=(user:any)=>{
 const roles=rolesFor(user);
 const ownerEmail=(Netlify.env.get('DODGERS_ADMIN_EMAIL')||'').toLowerCase();
 return Boolean(user?.id&&(((user.email||'').toLowerCase()===ownerEmail)||roles.includes('dodgers-owner')||roles.includes('dodgers-coach')));
};
const TEAM='Jersey Dodgers';
const DEFAULT_URL='https://www.primetimebaseballleague.com/teams/default.asp?u=PRIMETIMEBASEBALLLEA&s=baseball&p=schedule&format=List&d=ALL';
const decode=(value:string)=>value
 .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&#x27;/gi,"'")
 .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
const textOf=(html:string)=>decode(String(html||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
const norm=(v:string)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const seasonInfo=(text:string)=>{const m=String(text).match(/\b(Fall|Spring|Summer|Winter)\s+(20\d{2})\b/i)||String(text).match(/\b(20\d{2})\s+(Fall|Spring|Summer|Winter)\b/i);if(!m)return null;const term=/^20/.test(m[1])?m[2]:m[1],year=/^20/.test(m[1])?m[1]:m[2],name=`${term[0].toUpperCase()+term.slice(1).toLowerCase()} ${year}`;return{name,year,term:name.split(' ')[0]}};
function isoDate(value:string,seasonYear=''){
 const v=String(value||'').trim();let m=v.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);if(m){const y=m[3].length===2?`20${m[3]}`:m[3];return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`}
 m=v.match(/\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)?\s*,?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:,?\s*(20\d{2}))?/i);if(m){const months:any={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12},month=months[m[1].toLowerCase()],year=m[3]||seasonYear||String(new Date().getFullYear());return `${year}-${String(month).padStart(2,'0')}-${m[2].padStart(2,'0')}`}
 return '';
}
function time24(value:string){const v=String(value||'').trim();let m=v.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);if(m){let h=Number(m[1]);if(m[3].toUpperCase()==='PM'&&h!==12)h+=12;if(m[3].toUpperCase()==='AM'&&h===12)h=0;return `${String(h).padStart(2,'0')}:${m[2]}`}m=v.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);return m?`${m[1].padStart(2,'0')}:${m[2]}`:''}
const cleanTeam=(v:string)=>String(v||'').replace(/^@\s*/,'').replace(/\s+/g,' ').trim();
const likelyNonTeam=(v:string)=>/^(date|time|home|away|visitor|team|field|location|venue|status|result|score|game|division|league)$/i.test(v)||!!isoDate(v)||!!time24(v)||/^\d+[-:]\d+$/.test(v);
function headerIndexes(cells:string[]){const l=cells.map(v=>v.toLowerCase());const find=(re:RegExp)=>l.findIndex(x=>re.test(x));return{date:find(/^date$|game date/),time:find(/^time$|start/),home:find(/^home$|home team/),away:find(/^away$|visitor|visiting/),field:find(/field|location|venue|park/)};}
function parseTables(html:string,seasonYear=''){
 const games:any[]=[];const tables=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(m=>m[1]);
 for(const table of tables){const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]);let header:any=null;
  for(const row of rows){const cells=[...row.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(m=>textOf(m[1]));if(cells.length<2)continue;const joined=cells.join(' | ');if(!header&&/date|time|home|away|visitor|location|field/i.test(joined)){const idx=headerIndexes(cells);if(Object.values(idx).some(v=>Number(v)>=0)){header=idx;continue}}
   if(!/jersey\s*dodgers/i.test(joined))continue;
   const idx=header||headerIndexes(cells),date=idx.date>=0?isoDate(cells[idx.date],seasonYear):isoDate(joined,seasonYear),time=idx.time>=0?time24(cells[idx.time]):time24(joined);let home='',away='';
   if(idx.home>=0)home=cleanTeam(cells[idx.home]||'');if(idx.away>=0)away=cleanTeam(cells[idx.away]||'');
   if(!home&&!away){const teamCells=cells.filter(c=>!likelyNonTeam(c)&&/[A-Za-z]/.test(c)&&c.length<80);const jd=teamCells.findIndex(c=>/jersey\s*dodgers/i.test(c));if(jd>=0){away=teamCells[jd]||'';home=teamCells[jd+1]||teamCells[jd-1]||''}}
   const isHome=/jersey\s*dodgers/i.test(home),isAway=/jersey\s*dodgers/i.test(away);let opponent=isHome?away:isAway?home:'';
   if(!opponent){opponent=cells.find(c=>!likelyNonTeam(c)&&/[A-Za-z]/.test(c)&&!/jersey\s*dodgers/i.test(c)&&c.length<80)||''}
   let field=idx.field>=0?cells[idx.field]||'':'';if(!field){field=cells.find(c=>/(field|park|stadium|ballpark|complex|school)/i.test(c)&&!/jersey\s*dodgers/i.test(c))||''}
   if(date&&opponent)games.push({date,time,home:isHome||(!isAway&&cells.indexOf(home)>cells.indexOf(away)),opponent:cleanTeam(opponent),field:String(field||'').trim(),raw:joined});
  }
 }
 return games;
}
function parsePlain(text:string,seasonYear=''){
 const games:any[]=[];for(const raw of String(text||'').split(/\r?\n/)){const line=raw.replace(/\s+/g,' ').trim();if(!/jersey\s*dodgers/i.test(line))continue;const date=isoDate(line,seasonYear),time=time24(line);if(!date)continue;const parts=line.split(/\s{2,}|\t+|\s*\|\s*/).map(s=>s.trim()).filter(Boolean);let opponent='';for(const p of parts){if(!likelyNonTeam(p)&&/[A-Za-z]/.test(p)&&!/jersey\s*dodgers/i.test(p)&&p.length<80){opponent=p;break}}if(opponent)games.push({date,time,home:/\bvs\.?\s*Jersey Dodgers/i.test(line)?false:!/@Jersey Dodgers/i.test(line),opponent:cleanTeam(opponent),field:'',raw:line})}return games;
}
function dedupeAndClassify(rows:any[]){const map=new Map<string,any>();for(const r of rows){if(!r.date||!r.opponent)continue;const key=[r.date,r.time,norm(r.opponent),norm(r.field),r.home?'H':'A'].join('|');if(!map.has(key))map.set(key,r)}const out=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||String(a.time).localeCompare(String(b.time)));const groups=new Map<string,any[]>();for(const g of out){const key=[g.date,norm(g.opponent),norm(g.field),g.home?'H':'A'].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(g)}for(const items of groups.values()){items.sort((a,b)=>String(a.time).localeCompare(String(b.time)));if(items.length>=2){items.slice(0,2).forEach((g,i)=>{g.seriesType='doubleheader';g.gameNumber=i+1;g.innings=7})}else{items[0].seriesType='single';items[0].gameNumber=1;items[0].innings=9}}return out;}
export default async(req:Request)=>{const headers={'Cache-Control':'no-store','Content-Type':'application/json'};const respond=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers});try{let user=await getUser();try{if(user?.id)user=await admin.getUser(user.id)}catch{}if(!canManage(user))return respond({error:'Coach/Admin access required.'},403);if(req.method!=='POST')return respond({error:'Method not allowed'},405);verifyRequestOrigin(req);const body=await req.json();const url=String(body.url||DEFAULT_URL).trim(),pasted=String(body.text||'').trim();let parsed:URL;try{parsed=new URL(url)}catch{return respond({error:'Enter a valid PrimeTime schedule URL.'},400)}if(parsed.protocol!=='https:'||!/(^|\.)primetimebaseballleague\.com$/i.test(parsed.hostname))return respond({error:'Use a PrimeTimeBaseballLeague.com https:// schedule link.'},400);
 let html='',sourceType='live';if(pasted){html=pasted;sourceType='pasted'}else{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);try{const r=await fetch(url,{redirect:'follow',signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; JerseyDodgersScheduleImporter/1.0)','Accept':'text/html,application/xhtml+xml'}});clearTimeout(timer);if(!r.ok)throw Error(`PrimeTime returned ${r.status}.`);html=await r.text()}catch(e:any){clearTimeout(timer);return respond({error:'PrimeTime blocked the automatic reader or timed out. Paste the schedule table into the fallback box and use the same review flow.',detail:e?.message||''},502)}}
 const title=textOf(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''),pageText=textOf(html),season=seasonInfo(title)||seasonInfo(pageText),seasonYear=season?.year||'';let games=parseTables(html,seasonYear);if(!games.length)games=parsePlain(pasted||pageText,seasonYear);games=dedupeAndClassify(games);if(!games.length)return respond({error:'No Jersey Dodgers games were recognized on that schedule page. Try the List view or paste the Jersey Dodgers schedule rows into the fallback box.'},400);return respond({source:url,sourceType,team:TEAM,season,games});}catch(e:any){return respond({error:e?.message||'Unable to read the PrimeTime schedule.'},500)}};
export const config={path:'/api/admin/primetime-schedule'};
