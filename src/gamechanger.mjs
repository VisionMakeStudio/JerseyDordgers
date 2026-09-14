const allowedHosts=new Set(['gc.com','www.gc.com','web.gc.com']);
const ordinal=value=>{const n=Number(value),mod100=n%100;if(mod100>=11&&mod100<=13)return `${n}th`;return `${n}${n%10===1?'st':n%10===2?'nd':n%10===3?'rd':'th'}`};
const localDate=(value,timezone='America/New_York')=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)),get=type=>parts.find(part=>part.type===type)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`};
const gameDateLabel=(value,timezone)=>new Intl.DateTimeFormat('en-US',{timeZone:timezone||'America/New_York',month:'long',day:'numeric',year:'numeric'}).format(new Date(value));
const localTime=(value,timezone='America/New_York')=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)),get=type=>parts.find(part=>part.type===type)?.value||'';return `${get('hour')}:${get('minute')}`};
const scoringText=(name,scores=[])=>{const innings=scores.map((runs,index)=>({runs:Number(runs)||0,inning:index+1})).filter(item=>item.runs>0);if(!innings.length)return `${name} did not score.`;return `${name} scored in ${innings.map(item=>`the ${ordinal(item.inning)} (${item.runs})`).join(', ')} ${innings.length>1?'innings':'inning'}.`};

export function parseGameChangerUrl(value){
 let url;try{url=new URL(String(value||'').trim())}catch{throw Error('Paste a valid GameChanger game link first.')}
 if(url.protocol!=='https:'||!allowedHosts.has(url.hostname.toLowerCase()))throw Error('Paste a valid https:// GameChanger game link first.');
 let path=decodeURIComponent(url.pathname);if(!/\/schedule\//.test(path)){const deep=url.searchParams.get('deep_link_value');if(deep)path=decodeURIComponent(deep)}
 const match=path.match(/\/teams\/([^/]+)\/(?:[^/]+\/)?schedule\/([0-9a-f-]{36})(?:\/|$)/i);if(!match)throw Error('Use the GameChanger link for one specific game, not the team homepage.');
 return {teamId:match[1],eventId:match[2].toLowerCase(),source:`https://web.gc.com/teams/${encodeURIComponent(match[1])}/schedule/${match[2].toLowerCase()}/info`};
}

export function buildGameChangerRecap({details,team,source}){
 const teamName=String(team?.name||'Jersey Dodgers'),opponent=String(details?.opponent_team?.name||'Opponent'),scoreReady=typeof details?.score?.team==='number'&&typeof details?.score?.opponent_team==='number',ourScore=scoreReady?details.score.team:null,theirScore=scoreReady?details.score.opponent_team:null;
 const timezone=details.timezone||'America/New_York',date=localDate(details.start_ts,timezone),time=localTime(details.start_ts,timezone),dateLabel=gameDateLabel(details.start_ts,timezone),status=details.game_status==='completed'?'final':details.game_status==='live'?'live':'scheduled',home=details.home_away==='home';
 if(!scoreReady)return {title:`${teamName} vs. ${opponent}`,date,time,home,status,teamName,opponent,ourScore:null,theirScore:null,source,summary:`${teamName} will face ${opponent} on ${dateLabel}.`,body:'',lineScore:'',boxScore:'',warnings:['Game details imported. GameChanger has not posted a score for this game yet; import again during or after the game to refresh it.']};
 const won=ourScore>theirScore,lost=ourScore<theirScore;
 const title=won?`${teamName} defeat ${opponent}, ${ourScore}–${theirScore}`:lost?`${opponent} edge ${teamName}, ${theirScore}–${ourScore}`:`${teamName} and ${opponent} finish tied, ${ourScore}–${theirScore}`;
 const summary=won?`${teamName} earned a ${ourScore}–${theirScore} win over ${opponent} on ${dateLabel}.`:lost?`${teamName} finished a close game against ${opponent}, falling ${theirScore}–${ourScore} on ${dateLabel}.`:`${teamName} and ${opponent} finished tied ${ourScore}–${theirScore} on ${dateLabel}.`;
 const own=details.line_score?.team,other=details.line_score?.opponent_team,innings=Math.max(own?.scores?.length||0,other?.scores?.length||0),headers=Array.from({length:innings},(_,index)=>String(index+1)),row=(name,line)=>[name,...Array.from({length:innings},(_,index)=>String(line?.scores?.[index]??0)),String(line?.totals?.[0]??''),String(line?.totals?.[1]??''),String(line?.totals?.[2]??'')].join('\t');
 let lineScore='';if(innings){const rows=details.home_away==='home'?[[opponent,other],[teamName,own]]:[[teamName,own],[opponent,other]];lineScore=[['Team',...headers,'R','H','E'].join('\t'),...rows.map(([name,line])=>row(name,line))].join('\n')}
 const totals=[];if(own?.totals?.length>=3)totals.push(`${teamName} recorded ${own.totals[0]} runs on ${own.totals[1]} hits with ${own.totals[2]} ${Number(own.totals[2])===1?'error':'errors'}.`);if(other?.totals?.length>=3)totals.push(`${opponent} recorded ${other.totals[0]} runs on ${other.totals[1]} hits with ${other.totals[2]} ${Number(other.totals[2])===1?'error':'errors'}.`);
 const body=[scoringText(teamName,own?.scores),scoringText(opponent,other?.scores),totals.join(' ')].filter(Boolean).join('\n\n');
 return {title,date,time,home,status,teamName,opponent,ourScore,theirScore,source,summary,body,lineScore,boxScore:'',warnings:['Score and inning totals imported. GameChanger keeps its written recap and player box score behind account access, so those can still be pasted manually if desired.']};
}
