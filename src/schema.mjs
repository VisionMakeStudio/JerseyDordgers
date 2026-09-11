import {z} from 'zod';
const text=z.string().max(10000), short=z.string().max(300), id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const link=z.string().max(2000).refine(v=>!v||/^https:\/\//i.test(v),'Use an https:// link');
const image=z.string().max(2000).refine(v=>!v||/^\/assets\/[a-zA-Z0-9_.-]+$/.test(v)||/^\/api\/images\/[a-zA-Z0-9_.-]+$/.test(v),'Choose an uploaded image');
const video=z.string().max(2000).refine(v=>!v||/^\/api\/videos\/[a-f0-9-]+\.(mp4|webm)$/.test(v),'Choose an uploaded MP4 or WebM video');
const metric=z.string().max(30).refine(v=>!v||v==='-'||/^\d*(\.\d+)?$/.test(v),'Use a number or dash');
const stats=z.record(z.string().max(40),metric);
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/,'Choose a valid color');
const optionalId=z.union([z.literal(''),id]);
export const schemas={
 settings:z.object({teamName:short.min(1),founded:short,tagline:short,heroTitle:short,heroText:text,heroImage:image,logo:image,scriptLogo:image,leagueName:short,leagueLogo:image,leagueJoinUrl:link.default('https://www.primetimebaseballleague.com/teams/?u=PRIMETIMEBASEBALLLEA&s=baseball'),instagram:link,youtube:link.default('https://youtube.com/@JerseyDodgers?si=FP33CxgYEcQ_az5B'),contactEmail:z.union([z.literal(''),z.email()]),applicationEmail:z.union([z.literal(''),z.email()]).default(''),currentSeason:id,championshipTitle:short,championshipText:text,championshipImage:image,tryoutsTitle:short,tryoutsText:text,tryoutsLink:link,sponsorTitle:short,sponsorText:text,footerText:short,creatorName:short.default('Vision Make Studio'),creatorUrl:link.default('https://VisionMakeStudio.com')}),
 seasons:z.object({id,name:short.min(1),status:z.enum(['active','archived','upcoming']),note:text}),
 fields:z.object({id,name:short.min(1),address:short,mapsUrl:link,notes:text}),
 teams:z.object({id,name:short.min(1),abbreviation:z.string().max(5),logo:image}),
 games:z.object({id,season:id,opponent:id,field:id,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string().regex(/^\d{2}:\d{2}$/),timezone:z.enum(['America/New_York']),home:z.boolean(),status:z.enum(['scheduled','live','final','postponed','cancelled']),statusReason:short.default(''),rescheduledDate:z.string().refine(v=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v),'Use a valid new date').default(''),rescheduledTime:z.string().refine(v=>!v||/^\d{2}:\d{2}$/.test(v),'Use a valid new time').default(''),ourScore:z.number().int().min(0).max(200).nullable(),theirScore:z.number().int().min(0).max(200).nullable(),gameLink:link,recap:text,weather:short}).refine(g=>g.status!=='final'||(g.ourScore!==null&&g.theirScore!==null),'Final games need both scores').refine(g=>!g.rescheduledTime||g.rescheduledDate,'Choose a new date when adding a new time'),
 players:z.object({id,name:short.min(1),number:z.string().max(10),position:short,bats:short,throws:short,bio:text,photo:image,active:z.boolean()}),
 rosters:z.object({id,season:id,player:id,number:z.string().max(10),position:short,active:z.boolean().default(true)}),
 jerseyRecords:z.object({id,player:optionalId.default(''),playerName:short.min(1),number:z.string().max(10),season:optionalId.default(''),year:z.string().max(4).refine(v=>!v||/^20\d{2}$/.test(v),'Use a four-digit year').default(''),jerseySize:short.default(''),source:short.default('Jersey history'),notes:text.default('')}),
 stats:z.object({id,season:id,player:id,bat:stats,pitch:stats,fielding:stats,source:short}),
 standings:z.object({id,season:id,team:id,w:z.number().int().nonnegative(),l:z.number().int().nonnegative(),t:z.number().int().nonnegative(),pct:metric,gb:metric,rs:z.number().int().nonnegative(),ra:z.number().int().nonnegative(),streak:short,home:short,away:short,order:z.number().int().nonnegative(),source:short}),
 media:z.object({id,title:short.min(1),caption:text,image,video:video.default(''),link,category:z.enum(['Photos','News','Video','Instagram']),date:z.string().max(10),photographerName:z.preprocess(v=>v||'Sandy Cordero',short),photographerInstagram:z.preprocess(v=>v||'https://www.instagram.com/creative.lens93/',link),showPhotographerCredit:z.boolean().default(true),featured:z.boolean().default(false),featureOrder:z.number().int().min(0).max(99).default(0),published:z.boolean()}),
 channels:z.object({id,name:short.min(1),eyebrow:short,description:text,logo:image,link,color:color.default('#168bff'),order:z.number().int().min(0).max(999),active:z.boolean()}),
 sponsors:z.object({id,name:short.min(1),logo:image,link,buttonLabel:short.default('Visit sponsor'),description:text,active:z.boolean()}),
 achievements:z.object({id,year:z.string().max(10),title:short.min(1),organization:short}),
 spotlights:z.object({id,season:id,player:id,type:z.enum(['Player of the Week','Game Highlight']),title:short.min(1),summary:text,statLine:short,photo:image,date:z.string().max(10),published:z.boolean(),order:z.number().int().nonnegative()})
};
export const contentSchema=z.object({
 settings:schemas.settings,
 seasons:z.array(schemas.seasons).max(100),
 fields:z.array(schemas.fields).max(500),
 teams:z.array(schemas.teams).max(500),
 games:z.array(schemas.games).max(5000),
 players:z.array(schemas.players).max(1000),
 rosters:z.array(schemas.rosters).max(5000).default([]),
 jerseyRecords:z.array(schemas.jerseyRecords).max(10000).default([]),
 stats:z.array(schemas.stats).max(10000),
 standings:z.array(schemas.standings).max(3000),
 media:z.array(schemas.media).max(2000),
 channels:z.array(schemas.channels).max(100).default([
  {id:'youtube',name:'Jersey Dodgers on YouTube',eyebrow:'OFFICIAL YOUTUBE',description:'Introductions, game highlights and team stories.',logo:'',link:'https://youtube.com/@JerseyDodgers?si=FP33CxgYEcQ_az5B',color:'#ff334c',order:1,active:true},
  {id:'instagram',name:'@jerseydodgers',eyebrow:'OFFICIAL INSTAGRAM',description:'Photos, highlights and game-day posts.',logo:'',link:'https://www.instagram.com/jerseydodgers/',color:'#d946ef',order:2,active:true},
  {id:'gamechanger',name:'Jersey Dodgers on GameChanger',eyebrow:'LIVE SCORES & STREAMS',description:'Follow the team and open live broadcasts.',logo:'',link:'',color:'#22c55e',order:3,active:true}
 ]),
 sponsors:z.array(schemas.sponsors).max(300),
 achievements:z.array(schemas.achievements).max(100),
 spotlights:z.array(schemas.spotlights).max(1000)
}).superRefine((d,ctx)=>{
 const fail=message=>ctx.addIssue({code:'custom',message});
 for(const key of Object.keys(d).filter(k=>k!=='settings')){const ids=d[key].map(v=>v.id);if(new Set(ids).size!==ids.length)fail('Duplicate IDs in '+key)}
 const has=(key,id)=>d[key].some(v=>v.id===id);
 if(!has('seasons',d.settings.currentSeason))fail('Current season does not exist');
 for(const g of d.games){if(!has('seasons',g.season)||!has('teams',g.opponent)||!has('fields',g.field))fail('A game references a missing season, team or field')}
 for(const r of d.rosters){if(!has('seasons',r.season)||!has('players',r.player))fail('A roster entry references a missing player or season')}
 for(const j of d.jerseyRecords){if(j.player&&!has('players',j.player))fail('A jersey history entry references a missing player');if(j.season&&!has('seasons',j.season))fail('A jersey history entry references a missing season')}
 for(const s of d.stats){if(!has('seasons',s.season)||!has('players',s.player))fail('Stats reference a missing player or season')}
 for(const s of d.standings){if(!has('seasons',s.season)||!has('teams',s.team))fail('Standings reference a missing team or season')}
 for(const s of d.spotlights){if(!has('seasons',s.season)||!has('players',s.player))fail('A player spotlight references a missing player or season')}
 const statKeys=d.stats.map(s=>s.season+':'+s.player);if(new Set(statKeys).size!==statKeys.length)fail('Only one stats entry per player and season is allowed');
 const rosterKeys=d.rosters.map(r=>r.season+':'+r.player);if(new Set(rosterKeys).size!==rosterKeys.length)fail('Only one roster entry per player and season is allowed');
});
export function canEdit(user,adminEmail){return Boolean(user?.id&&adminEmail&&user.email?.toLowerCase()===adminEmail.toLowerCase())}
export function publicContent(data){
 const normalized=contentSchema.parse(data);
 const {jerseyRecords,...safe}=normalized;
 return {...safe,rosters:normalized.rosters.filter(x=>x.active),media:normalized.media.filter(x=>x.published),channels:normalized.channels.filter(x=>x.active),sponsors:normalized.sponsors.filter(x=>x.active),spotlights:normalized.spotlights.filter(x=>x.published)};
}
