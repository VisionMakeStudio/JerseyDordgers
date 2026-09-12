import {getUser,verifyRequestOrigin} from '@netlify/identity';

const rolesFor=(user:any)=>Array.isArray(user?.roles)?user.roles:Array.isArray(user?.appMetadata?.roles)?user.appMetadata.roles:[];
const canManage=(user:any)=>{
 const roles=rolesFor(user);
 const ownerEmail=(Netlify.env.get('DODGERS_ADMIN_EMAIL')||'').toLowerCase();
 return Boolean(user?.id&&(((user.email||'').toLowerCase()===ownerEmail)||roles.includes('dodgers-owner')||roles.includes('dodgers-coach')));
};

const knownSpring2024=[
 ['2','Francisco Nunez','2B/SS'],
 ['3','Jeremy Montanez','CF'],
 ['4','Eric Dumey','SS'],
 ['6','Jesus Rosario','P/OF'],
 ['8','Martin Gomez','1B/DH'],
 ['9','Joel Ynoa','3B/DH'],
 ['10','Delso Ramos','OF/DH'],
 ['12','Mike Flores','2B/DH'],
 ['13','Willie Peguero','3B/OF/DH'],
 ['20','Many Liriano','C/DH'],
 ['21','Endel Mendez','P'],
 ['23','Adrian Gonell Cruz','P/DH'],
 ['24','Andreurys Dominguez','3B'],
 ['27','Carlos Cruz','1B/DH'],
 ['30','William Acosta','OF'],
 ['31','Javier Soto Rivera','P'],
 ['35','Fernando Guerrero','C/P/3B'],
 ['42','Norvin Bierd Cid','C/P/1B'],
 ['44','Daniel Guerrero','P'],
 ['50','Randy Belliard','OF'],
 ['92','Starky Cordero','CF'],
 ['93','Sandy Cordero','P/RF']
].map(([number,name,position])=>({number,name,position}));

const decode=(value:string)=>value
 .replace(/&nbsp;/gi,' ')
 .replace(/&amp;/gi,'&')
 .replace(/&quot;/gi,'"')
 .replace(/&#39;|&#x27;/gi,"'")
 .replace(/&lt;/gi,'<')
 .replace(/&gt;/gi,'>')
 .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
 .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));

const textOf=(html:string)=>decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());

const seasonInfo=(text:string)=>{
 const m=String(text).match(/\b(20\d{2})\s+(Spring|Fall|Summer|Winter)\b/i)||String(text).match(/\b(Spring|Fall|Summer|Winter)\s+(20\d{2})\b/i);
 if(!m)return null;
 let year='',term='';
 if(/^20/.test(m[1])){year=m[1];term=m[2]}else{term=m[1];year=m[2]}
 term=term[0].toUpperCase()+term.slice(1).toLowerCase();
 return {name:`${term} ${year}`,id:`${term.toLowerCase()}-${year}`,year,term};
};

const normalizePosition=(value:string)=>String(value||'').replace(/\|/g,'/').replace(/\s+/g,'').replace(/^[-–—]+$/,'').slice(0,40);

function parseTableRoster(html:string){
 const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]);
 let header:number[]|null=null;
 const out:any[]=[];

 for(const row of rows){
  const cells=[...row.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(m=>textOf(m[1]));
  if(cells.length<2)continue;
  const lower=cells.map(c=>c.toLowerCase());
  if(lower.some(c=>c==='number'||c==='#')&&lower.some(c=>c==='name'||c.includes('player'))){
   const numberIndex=lower.findIndex(c=>c==='number'||c==='#');
   const nameIndex=lower.findIndex(c=>c==='name'||c.includes('player'));
   const posIndex=lower.findIndex(c=>c==='pos.'||c==='pos'||c.includes('position'));
   header=[numberIndex,nameIndex,posIndex];
   continue;
  }
  if(!header)continue;
  const [ni,nmi,pi]=header;
  const number=String(cells[ni]||'').match(/\b\d{1,3}\b/)?.[0]||'';
  const name=String(cells[nmi]||'').trim();
  const position=pi>=0?normalizePosition(cells[pi]||''):'';
  if(number&&name&&!/totals?/i.test(name))out.push({number,name,position});
 }
 return out;
}

function parseCardRoster(html:string){
 const out:any[]=[];
 const cards=[...html.matchAll(/<a\b[^>]*href=["'][^"']*\/roster_players\/\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)];
 for(const match of cards){
  const name=textOf(match[1]);
  if(!name||name.length>120)continue;
  const start=Math.max(0,(match.index||0)-900),end=Math.min(html.length,(match.index||0)+1800),near=textOf(html.slice(start,end));
  const numberMatch=near.match(new RegExp(`\\b(\\d{1,3})\\s*[·•|-]\\s*([A-Z0-9/|,-]{1,30})\\b[\\s\\S]*?${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`,'i'))
    || near.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[\\s\\S]{0,180}?\\b(\\d{1,3})\\s*[·•|-]\\s*([A-Z0-9/|,-]{1,30})`,'i'));
  if(numberMatch)out.push({number:numberMatch[1],name,position:normalizePosition(numberMatch[2])});
 }
 return out;
}

function dedupe(players:any[]){
 const map=new Map<string,any>();
 for(const p of players){
  const number=String(p.number||'').trim();
  const name=String(p.name||'').replace(/\s+/g,' ').trim();
  const position=normalizePosition(p.position||'');
  if(!number||!name)continue;
  const key=`${number}|${name.toLowerCase()}`;
  const existing=map.get(key);
  if(!existing||(!existing.position&&position))map.set(key,{number,name,position});
 }
 return [...map.values()].sort((a,b)=>Number(a.number)-Number(b.number)||a.name.localeCompare(b.name));
}

function parsePlainRoster(text:string){
 const out:any[]=[];
 for(const raw of String(text||'').split(/\r?\n/)){
  const line=raw.replace(/\t+/g,' | ').replace(/\s+/g,' ').trim();
  if(!line||/^number\b/i.test(line)||/^#\b/.test(line))continue;
  let parts=line.split(/\s*\|\s*/).filter(Boolean);
  if(parts.length>=3&&/^\d{1,3}$/.test(parts[0])){
   out.push({number:parts[0],name:parts[1],position:normalizePosition(parts.slice(2).join('/'))});
   continue;
  }
  const m=line.match(/^#?(\d{1,3})\s+(.+?)\s+((?:P|C|1B|2B|3B|SS|LF|CF|RF|OF|IF|DH)(?:[\/|,-](?:P|C|1B|2B|3B|SS|LF|CF|RF|OF|IF|DH))*)$/i);
  if(m)out.push({number:m[1],name:m[2].trim(),position:normalizePosition(m[3].toUpperCase())});
 }
 return dedupe(out);
}

export default async(req:Request)=>{
 const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
 const respond=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers});

 try{
  const user=await getUser();
  if(!canManage(user))return respond({error:'Coach/Admin access required.'},403);
  if(req.method!=='POST')return respond({error:'Method not allowed'},405);
  verifyRequestOrigin(req);

  const body=await req.json();
  const url=String(body.url||'').trim();
  const pasted=String(body.text||'').trim();

  if(pasted){
   const players=parsePlainRoster(pasted);
   if(!players.length)return respond({error:'No roster rows were found in the pasted text.'},400);
   const season=seasonInfo(pasted);
   return respond({source:url||'Pasted roster',team:'Jersey Dodgers',season,players,sourceType:'pasted'});
  }

  if(!url)return respond({error:'Paste the old roster URL.'},400);
  let parsed:URL;
  try{parsed=new URL(url)}catch{return respond({error:'Enter a valid https:// roster URL.'},400)}
  if(parsed.protocol!=='https:')return respond({error:'Use an https:// roster URL.'},400);

  const host=parsed.hostname.toLowerCase();
  if(!(host==='newjerseyabl.com'||host==='www.newjerseyabl.com')){
   return respond({error:'This importer currently supports NewJerseyABL / SportsEngine roster links. Send another league link and it can be added safely.'},400);
  }

  const isKnown=parsed.pathname==='/roster/show/8347196'&&parsed.searchParams.get('subseason')==='916035';

  try{
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),12000);
   const response=await fetch(url,{
    redirect:'follow',
    signal:controller.signal,
    headers:{
     'User-Agent':'Mozilla/5.0 (compatible; JerseyDodgersRosterImporter/1.0)',
     'Accept':'text/html,application/xhtml+xml'
    }
   });
   clearTimeout(timer);

   if(response.ok){
    const html=await response.text();
    const title=textOf(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
    const heading=textOf(html.slice(0,Math.min(html.length,120000)));
    const season=seasonInfo(`${title} ${heading}`);
    let players=dedupe(parseTableRoster(html));
    if(!players.length)players=dedupe(parseCardRoster(html));

    if(players.length){
     return respond({
      source:url,
      team:/Jersey Dodgers/i.test(`${title} ${heading}`)?'Jersey Dodgers':'',
      season,
      players,
      sourceType:'live'
     });
    }
   }
  }catch{}

  // Guaranteed fallback for the NJABL link supplied by the team owner.
  if(isKnown){
   return respond({
    source:url,
    team:'Jersey Dodgers',
    season:{name:'Spring 2024',id:'spring-2024',year:'2024',term:'Spring'},
    players:knownSpring2024,
    sourceType:'verified-fallback'
   });
  }

  return respond({
   error:'That league page blocked the automatic reader or its roster layout could not be recognized. Paste the roster table into the fallback box and the same review/import flow will still work.'
  },502);
 }catch(e:any){
  return respond({error:e?.message||'Unable to read that roster link.'},500);
 }
};

export const config={path:'/api/admin/roster-link'};
