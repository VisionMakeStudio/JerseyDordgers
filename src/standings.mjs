const whole=value=>Number.isInteger(value)&&value>=0?value:0;
const key=(season,team)=>`${season}:${team}`;
const recordKeys=['w','l','t','rs','ra','home','away'];

export function finalGameResults(games){
 const results={};
 for(const game of games||[]){
  if(game.status!=='final'||!Number.isInteger(game.ourScore)||!Number.isInteger(game.theirScore))continue;
  results[game.id]={season:game.season,opponent:game.opponent,home:Boolean(game.home),ourScore:game.ourScore,theirScore:game.theirScore};
 }
 return results;
}

export function rankStandings(rows){
 const groups=new Map();
 for(const row of rows||[]){if(!groups.has(row.season))groups.set(row.season,[]);groups.get(row.season).push({...row})}
 const ranked=[];
 for(const seasonRows of groups.values()){
  seasonRows.sort((a,b)=>{
   const gamesA=whole(a.w)+whole(a.l)+whole(a.t),gamesB=whole(b.w)+whole(b.l)+whole(b.t);
   const pctA=gamesA?(whole(a.w)+whole(a.t)/2)/gamesA:0,pctB=gamesB?(whole(b.w)+whole(b.t)/2)/gamesB:0;
   return pctB-pctA||whole(b.w)-whole(a.w)||whole(a.l)-whole(b.l)||whole(a.order)-whole(b.order)||String(a.team).localeCompare(String(b.team));
  });
  const leader=seasonRows[0];
  for(const [order,row] of seasonRows.entries()){
   const games=whole(row.w)+whole(row.l)+whole(row.t);
   const gamesBack=leader?Math.max(0,((whole(leader.w)-whole(row.w))+(whole(row.l)-whole(leader.l)))/2):0;
   ranked.push({...row,pct:(games?(whole(row.w)+whole(row.t)/2)/games:0).toFixed(3),gb:gamesBack?String(Number(gamesBack.toFixed(1))):'-',order});
  }
 }
 return ranked;
}

function changeRow(row,win,loss,tie,scored,allowed,venue,sign){
 row.w=Math.max(0,whole(row.w)+sign*win);
 row.l=Math.max(0,whole(row.l)+sign*loss);
 row.t=Math.max(0,whole(row.t)+sign*tie);
 row.rs=Math.max(0,whole(row.rs)+sign*scored);
 row.ra=Math.max(0,whole(row.ra)+sign*allowed);
 const match=String(row[venue]||'').match(/^(\d+)-(\d+)(?:-(\d+))?$/);
 if(match){
  const wins=Math.max(0,Number(match[1])+sign*win),losses=Math.max(0,Number(match[2])+sign*loss),ties=Math.max(0,Number(match[3]||0)+sign*tie);
  row[venue]=`${wins}-${losses}${ties?'-'+ties:''}`;
 }
}

export function syncStandings(previous,next,appliedResults){
 // Older records have no ledger. Their existing final games are treated as part of the manually entered baseline.
 const prior=appliedResults&&typeof appliedResults==='object'?appliedResults:finalGameResults(previous.games);
 const current=finalGameResults(next.games);
 const priorRows=new Map((previous.standings||[]).map(row=>[key(row.season,row.team),row]));
 const nextRows=(next.standings||[]).map(row=>({...row}));
 const byTeam=new Map(nextRows.map(row=>[key(row.season,row.team),row]));
 const manual=new Set(nextRows.filter(row=>{
  const earlier=priorRows.get(key(row.season,row.team));
  return !earlier||recordKeys.some(field=>row[field]!==earlier[field]);
 }).map(row=>key(row.season,row.team)));
 const ourTeam=next.teams.find(team=>team.name.trim().toLowerCase()===next.settings.teamName.trim().toLowerCase())?.id;
 const previousTeam=previous.teams.find(team=>team.name.trim().toLowerCase()===previous.settings.teamName.trim().toLowerCase())?.id||ourTeam;
 if(!ourTeam)throw Error('The website team needs a saved team profile before scores can update standings.');
 const rowFor=(season,team)=>{
  const id=key(season,team);let row=byTeam.get(id);
  if(!row){row={id:crypto.randomUUID(),season,team,w:0,l:0,t:0,pct:'0.000',gb:'-',rs:0,ra:0,streak:'',home:'0-0',away:'0-0',order:nextRows.length,source:'Scores entered in Admin'};nextRows.push(row);byTeam.set(id,row)}
  return row;
 };
 const apply=(result,sign,teamId)=>{
  if(!result)return;
  const {season,opponent,home,ourScore,theirScore}=result;
  if(teamId===opponent)return;
  const ourWin=Number(ourScore>theirScore),theirWin=Number(theirScore>ourScore),tie=Number(ourScore===theirScore);
  if(!manual.has(key(season,teamId)))changeRow(rowFor(season,teamId),ourWin,theirWin,tie,ourScore,theirScore,home?'home':'away',sign);
  if(!manual.has(key(season,opponent)))changeRow(rowFor(season,opponent),theirWin,ourWin,tie,theirScore,ourScore,home?'away':'home',sign);
 };
 for(const id of new Set([...Object.keys(prior),...Object.keys(current)])){
  const oldResult=prior[id],newResult=current[id];
  if(JSON.stringify(oldResult)===JSON.stringify(newResult))continue;
  apply(oldResult,-1,previousTeam);apply(newResult,1,ourTeam);
 }
 return {data:{...next,standings:rankStandings(nextRows)},appliedResults:current};
}
