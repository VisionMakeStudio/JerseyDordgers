import {z} from 'zod';
const text=z.string().max(10000), short=z.string().max(300), id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const link=z.string().max(2000).refine(v=>!v||/^https:\/\//i.test(v),'Use an https:// link');
const image=z.string().max(2000).refine(v=>!v||/^\/assets\/[a-zA-Z0-9_.-]+$/.test(v)||/^\/api\/images\/[a-zA-Z0-9_.-]+$/.test(v),'Choose an uploaded image');
const metric=z.string().max(30).refine(v=>!v||v==='-'||/^\d*(\.\d+)?$/.test(v),'Use a number or dash');
const stats=z.record(z.string().max(40),metric);
export const schemas={
 settings:z.object({teamName:short.min(1),founded:short,tagline:short,heroTitle:short,heroText:text,heroImage:image,logo:image,scriptLogo:image,leagueName:short,leagueLogo:image,instagram:link,youtube:link,contactEmail:z.union([z.literal(''),z.email()]),currentSeason:id,championshipTitle:short,championshipText:text,championshipImage:image,tryoutsTitle:short,tryoutsText:text,tryoutsLink:link,sponsorTitle:short,sponsorText:text,footerText:short}),
 seasons:z.object({id,name:short.min(1),status:z.enum(['active','archived','upcoming']),note:text}),
 fields:z.object({id,name:short.min(1),address:short,mapsUrl:link,notes:text}),
 teams:z.object({id,name:short.min(1),abbreviation:z.string().max(5),logo:image}),
 games:z.object({id,season:id,opponent:id,field:id,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string().regex(/^\d{2}:\d{2}$/),timezone:z.enum(['America/New_York']),home:z.boolean(),status:z.enum(['scheduled','final','postponed','cancelled']),ourScore:z.number().int().min(0).max(200).nullable(),theirScore:z.number().int().min(0).max(200).nullable(),gameLink:link,recap:text,weather:short}).refine(g=>g.status!=='final'||(g.ourScore!==null&&g.theirScore!==null),'Final games need both scores'),
 players:z.object({id,name:short.min(1),number:z.string().max(10),position:short,bats:short,throws:short,bio:text,photo:image,active:z.boolean()}),
 stats:z.object({id,season:id,player:id,bat:stats,pitch:stats,fielding:stats,source:short}),
 standings:z.object({id,season:id,team:id,w:z.number().int().nonnegative(),l:z.number().int().nonnegative(),t:z.number().int().nonnegative(),pct:metric,gb:metric,rs:z.number().int().nonnegative(),ra:z.number().int().nonnegative(),streak:short,home:short,away:short,order:z.number().int().nonnegative(),source:short}),
 media:z.object({id,title:short.min(1),caption:text,image,link,category:z.enum(['Photos','News','Video']),date:z.string().max(10),published:z.boolean()}),
 sponsors:z.object({id,name:short.min(1),logo:image,link,description:text,active:z.boolean()}),
 achievements:z.object({id,year:z.string().max(10),title:short.min(1),organization:short}),
 spotlights:z.object({id,season:id,player:id,type:z.enum(['Player of the Week','Game Highlight']),title:short.min(1),summary:text,statLine:short,photo:image,date:z.string().max(10),published:z.boolean(),order:z.number().int().nonnegative()})
};
export const contentSchema=z.object({settings:schemas.settings,seasons:z.array(schemas.seasons).max(100),fields:z.array(schemas.fields).max(500),teams:z.array(schemas.teams).max(500),games:z.array(schemas.games).max(5000),players:z.array(schemas.players).max(1000),stats:z.array(schemas.stats).max(10000),standings:z.array(schemas.standings).max(3000),media:z.array(schemas.media).max(2000),sponsors:z.array(schemas.sponsors).max(300),achievements:z.array(schemas.achievements).max(100),spotlights:z.array(schemas.spotlights).max(1000)}).superRefine((d,ctx)=>{
 const fail=message=>ctx.addIssue({code:'custom',message});
 for(const key of Object.keys(d).filter(k=>k!=='settings')){const ids=d[key].map(v=>v.id);if(new Set(ids).size!==ids.length)fail('Duplicate IDs in '+key)}
 const has=(key,id)=>d[key].some(v=>v.id===id);
 if(!has('seasons',d.settings.currentSeason))fail('Current season does not exist');
 for(const g of d.games){if(!has('seasons',g.season)||!has('teams',g.opponent)||!has('fields',g.field))fail('A game references a missing season, team or field')}
 for(const s of d.stats){if(!has('seasons',s.season)||!has('players',s.player))fail('Stats reference a missing player or season')}
 for(const s of d.standings){if(!has('seasons',s.season)||!has('teams',s.team))fail('Standings reference a missing team or season')}
 for(const s of d.spotlights){if(!has('seasons',s.season)||!has('players',s.player))fail('A player spotlight references a missing player or season')}
 const keys=d.stats.map(s=>s.season+':'+s.player);if(new Set(keys).size!==keys.length)fail('Only one stats entry per player and season is allowed');
});
export function canEdit(user,adminEmail){return Boolean(user?.id&&adminEmail&&user.email?.toLowerCase()===adminEmail.toLowerCase())}
export function publicContent(data){return {...data,media:data.media.filter(x=>x.published),sponsors:data.sponsors.filter(x=>x.active),spotlights:data.spotlights.filter(x=>x.published)}}
