export const SITE_URL='https://jerseydodgers.com';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const xml=esc;
const plain=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const absolute=path=>path?new URL(path,SITE_URL).href:'';
const dateLabel=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return value||'';return new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'))};
const defaultImage=data=>absolute(data.settings.shareImage||'/assets/jd-share-team-v40.png');
const staticPages={
 schedule:['Schedule & Scores','See upcoming Jersey Dodgers baseball games, opponents, dates, locations and final scores.','Schedule and scores'],
 scores:['Final Scores','Follow final Jersey Dodgers baseball scores and game results from the current season.','Final scores'],
 standings:['League Standings','See the latest Jersey Dodgers league standings, wins, losses and team positions.','League standings'],
 roster:['Team Roster','Meet the Jersey Dodgers players and explore their profiles and season statistics.','Team roster'],
 stats:['Player Stats & Leaders','Explore Jersey Dodgers batting, pitching, fielding statistics and team leaders.','Player statistics'],
 videos:['Team Videos','Watch Jersey Dodgers baseball videos, interviews and game highlights.','Team videos'],
 media:['Photos & News','Explore Jersey Dodgers team photos, stories and news from the clubhouse.','Photos and news'],
 recaps:['Game Recaps','Read Jersey Dodgers game recaps, scores and stories from the season.','Game recaps'],
 'players-of-the-week':['Players of the Week','See the Jersey Dodgers Players of the Week and their standout performances.','Players of the Week'],
 tryouts:['Tryouts & Join the Team','Learn about Jersey Dodgers baseball tryouts and how to join the team.','Tryouts and team information']
};

export function pageInfo(url,data){
 const parsed=new URL(url,SITE_URL),parts=parsed.pathname.split('/').filter(Boolean),route=parts[0]||'',id=parts[1]||'';
 const seasonParam=parsed.searchParams.get('season');
 const season=data.seasons.find(item=>item.id===seasonParam)||data.seasons.find(item=>item.id===data.settings.currentSeason);
 const seasonQuery=seasonParam&&seasonParam!==data.settings.currentSeason&&season?.id===seasonParam&&['schedule','scores','standings','roster','stats'].includes(route)?`?season=${encodeURIComponent(seasonParam)}`:'';
 const seasonPrefix=season?.name?`${season.name} `:'';
 let title='',description='',heading='',detail='',path=route?`/${route}/`:'/',type='website',image=defaultImage(data),found=true,article=null;
 if(!route){
  title=plain(data.settings.seoTitle)||'Jersey Dodgers Baseball | Schedule, Scores & Team News';
  description=plain(data.settings.seoDescription)||'The official Jersey Dodgers baseball website. Explore the schedule, scores, standings, roster, team news, videos and tryouts.';
  heading=plain(data.settings.heroTitle)||'Jersey Dodgers Baseball';
  detail=plain(data.settings.heroText)||description;
 }else if(id&&route==='roster'){
  const player=data.players.find(item=>item.id===id&&item.active);
  if(!player)found=false;
  else{title=`${player.name} | Jersey Dodgers Roster`;description=`Meet ${player.name}, Jersey Dodgers ${player.position||'baseball player'}. See player details and season statistics.`;heading=player.name;detail=plain(player.bio)||description;path=`/roster/${encodeURIComponent(player.id)}/`;image=absolute(player.photo)||image}
 }else if(id&&route==='game'){
  const game=data.games.find(item=>item.id===id),opponent=game&&data.teams.find(team=>team.id===game.opponent);
  if(!game)found=false;
  else{const matchup=`Jersey Dodgers vs ${opponent?.name||'Opponent'}`;title=`${matchup} | ${dateLabel(game.date)}`;description=game.status==='final'&&game.ourScore!==null&&game.theirScore!==null?`${matchup} final score: ${game.ourScore}–${game.theirScore}. Read game details and recap.`:`${matchup} on ${dateLabel(game.date)}. View the schedule, location and game details.`;heading=matchup;detail=description;path=`/game/${encodeURIComponent(game.id)}/`}
 }else if(id&&route==='recaps'){
  const recap=(data.gameRecaps||[]).find(item=>item.id===id&&item.published);
  if(!recap)found=false;
  else{title=`${recap.title} | Jersey Dodgers Game Recap`;description=plain(recap.summary)||`Read the Jersey Dodgers game recap against ${recap.opponent} on ${dateLabel(recap.date)}.`;heading=recap.title;detail=description;path=`/recaps/${encodeURIComponent(recap.id)}/`;type='article';image=absolute(recap.image)||image;article=recap}
 }else if(!id&&staticPages[route]){
  const [label,summary,pageHeading]=staticPages[route];title=`${seasonQuery?seasonPrefix:''}${label} | Jersey Dodgers Baseball`;description=summary;heading=pageHeading;detail=summary;path=`/${route}/`;
 }else found=false;
 if(parts.length>(id?2:1))found=false;
 if(!found){title='Page not found | Jersey Dodgers';description='This Jersey Dodgers page is unavailable.';heading='Page not found';detail='Return to the Jersey Dodgers homepage.';type='website'}
 const canonical=absolute(path+seasonQuery);
 return {found,title,description:description.slice(0,300),heading,detail:detail.slice(0,500),canonical,image,type,path,article};
}

function structuredData(page,data){
 const result=[];
 if(page.path==='/'){
  const team={"@context":"https://schema.org","@type":"SportsTeam",name:data.settings.teamName,url:SITE_URL+'/',sport:'Baseball',logo:absolute(data.settings.logo||'/assets/d-mark.png')};
  const sameAs=[data.settings.instagram,data.settings.youtube].filter(value=>/^https:\/\//.test(value||''));
  if(sameAs.length)team.sameAs=sameAs;
  result.push(team);
 }
 if(page.article){const recap=page.article;result.push({"@context":"https://schema.org","@type":"Article",headline:recap.title,description:page.description,datePublished:recap.date,mainEntityOfPage:page.canonical,image:page.image,author:{"@type":"Organization",name:data.settings.teamName,url:SITE_URL+'/'}})}
 return result.map(item=>`<script type="application/ld+json">${JSON.stringify(item).replace(/</g,'\\u003c')}</script>`).join('');
}

export function seoHead(page,data){
 const tags=[
  `<title>${esc(page.title)}</title>`,
  `<meta name="description" content="${esc(page.description)}">`,
  `<meta name="robots" content="${page.found?'index,follow,max-image-preview:large':'noindex,follow'}">`,
  `<link rel="canonical" href="${esc(page.canonical)}">`,
  `<meta property="og:type" content="${page.type}">`,
  `<meta property="og:site_name" content="${esc(data.settings.teamName)}">`,
  `<meta property="og:title" content="${esc(page.title)}">`,
  `<meta property="og:description" content="${esc(page.description)}">`,
  `<meta property="og:url" content="${esc(page.canonical)}">`,
  `<meta property="og:image" content="${esc(page.image)}">`,
  `<meta property="og:image:alt" content="${esc(data.settings.teamName+' team photo')}">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:title" content="${esc(page.title)}">`,
  `<meta name="twitter:description" content="${esc(page.description)}">`,
  `<meta name="twitter:image" content="${esc(page.image)}">`,
  structuredData(page,data)
 ];
 return `<!-- JD SEO START -->${tags.filter(Boolean).join('')}<!-- JD SEO END -->`;
}

export function serverPreview(page,data){
 const nav=[['/schedule/','Schedule'],['/scores/','Scores'],['/standings/','Standings'],['/roster/','Roster'],['/stats/','Stats'],['/recaps/','Game recaps'],['/tryouts/','Tryouts']];
 const links=nav.map(([href,label])=>`<a href="${href}">${label}</a>`).join(' · ');
 return `<div class="wrap jd-server-preview"><h1>${esc(page.heading)}</h1><p>${esc(page.detail)}</p><nav aria-label="Jersey Dodgers pages">${links}</nav>${page.found?'':`<p><a href="/">Return to homepage</a></p>`}</div>`;
}

export function injectSeo(html,page,data){
 let result=html.replace(/<!-- JD SEO START -->[\s\S]*?<!-- JD SEO END -->/,()=>seoHead(page,data));
 if(result===html)result=html.replace(/<title>[^<]*<\/title>/,'').replace(/<meta name="description"[^>]*>/,'').replace('</head>',()=>seoHead(page,data)+'</head>');
 return result.replace('<div class="loading">Opening the clubhouse…</div>',()=>serverPreview(page,data));
}

export function sitemapXml(data){
 const urls=['/','/schedule/','/scores/','/standings/','/roster/','/stats/','/videos/','/media/','/recaps/','/players-of-the-week/','/tryouts/'];
 for(const player of data.players||[])if(player.active)urls.push(`/roster/${encodeURIComponent(player.id)}/`);
 for(const game of data.games||[])urls.push(`/game/${encodeURIComponent(game.id)}/`);
 for(const recap of data.gameRecaps||[])if(recap.published)urls.push(`/recaps/${encodeURIComponent(recap.id)}/`);
 for(const season of data.seasons||[]){
  if(season.id===data.settings.currentSeason)continue;
  if((data.games||[]).some(game=>game.season===season.id))urls.push(`/schedule/?season=${encodeURIComponent(season.id)}`);
  if((data.standings||[]).some(row=>row.season===season.id))urls.push(`/standings/?season=${encodeURIComponent(season.id)}`);
  if((data.stats||[]).some(row=>row.season===season.id))urls.push(`/stats/?season=${encodeURIComponent(season.id)}`);
 }
 return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(urls)].map(path=>`<url><loc>${xml(absolute(path))}</loc></url>`).join('')}</urlset>`;
}
