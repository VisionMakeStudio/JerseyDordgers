import {getUser,admin,verifyRequestOrigin} from '@netlify/identity';

const rolesFor=(user:any)=>[...(Array.isArray(user?.roles)?user.roles:[]),...(Array.isArray(user?.appMetadata?.roles)?user.appMetadata.roles:[]),...(user?.role?[user.role]:[])];
const canManage=(user:any)=>{
 const roles=rolesFor(user);
 const ownerEmail=(Netlify.env.get('DODGERS_ADMIN_EMAIL')||'').toLowerCase();
 return Boolean(user?.id&&(((user.email||'').toLowerCase()===ownerEmail)||roles.includes('dodgers-owner')||roles.includes('dodgers-coach')));
};

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
const norm=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');

const seasonInfo=(text:string)=>{
 const input=String(text||'');
 const m=input.match(/\b(20\d{2})\s+(Spring|Fall|Summer|Winter)\b/i)||input.match(/\b(Spring|Fall|Summer|Winter)\s+(20\d{2})\b/i);
 if(!m)return null;
 let year='',term='';
 if(/^20/.test(m[1])){year=m[1];term=m[2]}else{term=m[1];year=m[2]}
 term=term[0].toUpperCase()+term.slice(1).toLowerCase();
 return {name:`${term} ${year}`,id:`${term.toLowerCase()}-${year}`,year,term};
};
const phaseInfo=(text:string)=>/playoff|postseason|post-season/i.test(String(text||''))?'playoffs':'regular';

const cleanMetric=(value:string)=>{
 const s=String(value??'').trim().replace(/,/g,'');
 if(!s)return'';
 if(s==='-')return'-';
 const n=s.replace(/%$/,'');
 return /^-?\d*(?:\.\d+)?$/.test(n)?n:'';
};

const headerKey=(value:string)=>String(value||'').toUpperCase().replace(/\s+/g,'').replace(/[.%]/g,'');
const HEADER_ALIASES:Record<string,string>={
 '#':'NUMBER','NO':'NUMBER','NUM':'NUMBER','NUMBER':'NUMBER','JERSEY':'NUMBER','JERSEY#':'NUMBER',
 'PLAYER':'PLAYER','PLAYERNAME':'PLAYER','NAME':'PLAYER','FULLNAME':'PLAYER','FIRST':'FIRST','FIRSTNAME':'FIRST','LAST':'LAST','LASTNAME':'LAST',
 'G':'GP','GP':'GP','GAMES':'GP','PA':'PA','AB':'AB','H':'H','1B':'1B','2B':'2B','3B':'3B','HR':'HR','RBI':'RBI','R':'R','BB':'BB','SO':'SO','K':'SO','HBP':'HBP','SF':'SF','SAC':'SAC','SB':'SB','CS':'CS','AVG':'AVG','BA':'AVG','OBP':'OBP','SLG':'SLG','OPS':'OPS','TB':'TB',
 'IP':'IP','W':'W','L':'L','SV':'SV','SAVES':'SV','ER':'ER','ERA':'ERA','WHIP':'WHIP','WP':'WP','GS':'GS','BF':'BF',
 'TC':'TC','PO':'PO','A':'A','E':'E','FPCT':'FPCT','FLDPCT':'FPCT','DP':'DP','INN':'INN'
};
const canonical=(value:string)=>HEADER_ALIASES[headerKey(value)]||headerKey(value).slice(0,40);

const BATTING_HINTS=new Set(['PA','AB','AVG','OBP','SLG','OPS','RBI','SB','TB']);
const PITCHING_HINTS=new Set(['IP','ERA','WHIP','ER','SV','GS','BF','WP']);
const FIELDING_HINTS=new Set(['TC','PO','A','E','FPCT','DP','INN']);

function classify(headers:string[]){
 const keys=headers.map(canonical);
 const score=(set:Set<string>)=>keys.filter(k=>set.has(k)).length;
 const pitch=score(PITCHING_HINTS),field=score(FIELDING_HINTS),bat=score(BATTING_HINTS);
 if(pitch>=2&&pitch>=bat&&pitch>=field)return'pitch';
 if(field>=2&&field>bat)return'fielding';
 if(bat>=2)return'bat';
 return'';
}

function tableRows(tableHtml:string){
 return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row=>
  [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(cell=>textOf(cell[1]))
 ).filter(row=>row.length);
}

function parseTables(html:string){
 const merged=new Map<string,any>();
 const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(m=>m[0]);

 for(const table of tables){
  const rows=tableRows(table);
  if(rows.length<2)continue;
  let hi=-1,group='';
  for(let i=0;i<Math.min(5,rows.length);i++){
   const candidate=classify(rows[i]);
   const keys=rows[i].map(canonical);
   const hasName=keys.includes('PLAYER')||keys.includes('FIRST')||keys.includes('LAST');
   if(candidate&&hasName){hi=i;group=candidate;break}
  }
  if(hi<0||!group)continue;
  const headers=rows[hi].map(canonical);
  const playerIndex=headers.indexOf('PLAYER'),firstIndex=headers.indexOf('FIRST'),lastIndex=headers.indexOf('LAST'),numberIndex=headers.indexOf('NUMBER');

  for(const row of rows.slice(hi+1)){
   let name=playerIndex>=0?String(row[playerIndex]||'').trim():`${String(row[firstIndex]||'').trim()} ${String(row[lastIndex]||'').trim()}`.replace(/\s+/g,' ').trim();
   if(!name||/totals?|team total|glossary/i.test(name))continue;
   const number=numberIndex>=0?(String(row[numberIndex]||'').match(/\b\d{1,3}\b/)?.[0]||''):'';
   const key=`${norm(name)}|${number}`;
   const existing=merged.get(key)||{name,number,bat:{},pitch:{},fielding:{}};
   headers.forEach((header,index)=>{
    if(['PLAYER','FIRST','LAST','NUMBER'].includes(header)||!header)return;
    const value=cleanMetric(row[index]||'');
    if(value!=='')existing[group][header]=value;
   });
   merged.set(key,existing);
  }
 }
 return [...merged.values()].filter(row=>Object.keys(row.bat).length||Object.keys(row.pitch).length||Object.keys(row.fielding).length);
}

function splitDelimited(line:string,delimiter:string){
 if(delimiter!==',')return line.split(delimiter).map(v=>v.trim());
 const out:string[]=[],re=/\s*(?:"((?:[^"]|"")*)"|([^,]*))\s*(?:,|$)/g;let m;
 while((m=re.exec(line))){out.push((m[1]??m[2]??'').replace(/""/g,'"'));if(m.index+m[0].length>=line.length)break}
 return out;
}
function parsePasted(text:string){
 const lines=String(text||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
 if(lines.length<2)return[];
 const delimiter=lines[0].includes('\t')?'\t':lines[0].includes('|')?'|':',';
 const rows=lines.map(line=>splitDelimited(line,delimiter));
 const headers=rows[0].map(canonical),group=classify(rows[0]);
 if(!group)return[];
 const playerIndex=headers.indexOf('PLAYER'),firstIndex=headers.indexOf('FIRST'),lastIndex=headers.indexOf('LAST'),numberIndex=headers.indexOf('NUMBER');
 if(playerIndex<0&&firstIndex<0&&lastIndex<0)return[];
 const out:any[]=[];
 for(const row of rows.slice(1)){
  const name=playerIndex>=0?String(row[playerIndex]||'').trim():`${String(row[firstIndex]||'').trim()} ${String(row[lastIndex]||'').trim()}`.replace(/\s+/g,' ').trim();
  if(!name||/totals?/i.test(name))continue;
  const number=numberIndex>=0?(String(row[numberIndex]||'').match(/\b\d{1,3}\b/)?.[0]||''):'';
  const record:any={name,number,bat:{},pitch:{},fielding:{}};
  headers.forEach((header,index)=>{if(['PLAYER','FIRST','LAST','NUMBER'].includes(header)||!header)return;const value=cleanMetric(row[index]||'');if(value!=='')record[group][header]=value});
  out.push(record);
 }
 return out;
}

export default async(req:Request)=>{
 const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
 const respond=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try{
  let user=await getUser();
  try{if(user?.id)user=await admin.getUser(user.id)}catch{}
  if(!canManage(user))return respond({error:'Coach/Admin access required.'},403);
  if(req.method!=='POST')return respond({error:'Method not allowed'},405);
  verifyRequestOrigin(req);

  const body=await req.json();
  const url=String(body.url||'').trim();
  const pasted=String(body.text||'').trim();

  if(pasted){
   const players=parsePasted(pasted);
   if(!players.length)return respond({error:'No recognizable NJABL stats rows were found in the pasted table.'},400);
   return respond({source:url||'Pasted stats',team:'Jersey Dodgers',season:seasonInfo(pasted),phase:phaseInfo(pasted),players,sourceType:'pasted'});
  }

  if(!url)return respond({error:'Paste the NJABL stats URL.'},400);
  let parsed:URL;try{parsed=new URL(url)}catch{return respond({error:'Enter a valid https:// stats URL.'},400)}
  if(parsed.protocol!=='https:')return respond({error:'Use an https:// stats URL.'},400);
  const host=parsed.hostname.toLowerCase();
  if(!(host==='newjerseyabl.com'||host==='www.newjerseyabl.com'))return respond({error:'Stats-link import currently supports NewJerseyABL / SportsEngine pages.'},400);

  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  const response=await fetch(url,{redirect:'follow',signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; JerseyDodgersStatsImporter/1.0)','Accept':'text/html,application/xhtml+xml'}});
  clearTimeout(timer);
  if(!response.ok)return respond({error:`NJABL returned ${response.status}. Paste the stats table into the fallback box instead.`},502);
  const html=await response.text();
  if(html.length>3_000_000)return respond({error:'That stats page is too large to import safely.'},413);
  const title=textOf(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
  const ogTitle=decode(html.match(/<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]||'');
  const headingTags=[...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)].slice(0,12).map(m=>textOf(m[1])).join(' · ');
  const firstText=textOf(html.slice(0,Math.min(html.length,160000)));
  const players=parseTables(html);
  if(!players.length)return respond({error:'The NJABL page loaded, but its statistics tables were not recognized. Open the paste-table fallback and paste the stats table instead.'},502);
  const season=seasonInfo(title)||seasonInfo(ogTitle)||seasonInfo(headingTags)||seasonInfo(firstText);
  return respond({source:url,team:/Jersey Dodgers/i.test(`${title} ${ogTitle} ${headingTags} ${firstText}`)?'Jersey Dodgers':'',season,phase:phaseInfo(`${url} ${title} ${ogTitle} ${headingTags}`),players,sourceType:'live'});
 }catch(e:any){
  return respond({error:e?.name==='AbortError'?'The NJABL page took too long to respond. Use the paste-table fallback.':e?.message||'Unable to read that stats link.'},500);
 }
};

export const config={path:'/api/admin/stats-link'};
