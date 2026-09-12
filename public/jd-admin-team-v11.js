(() => {
  'use strict';

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>crypto.randomUUID();
  const K_SECTION='jd-v9-section',K_SEASON='jd-v9-player-season',K_REMOVED='jd-v9-show-removed',K_ROSTER_PHASE='jd-v11-roster-phase';
  let state=null,rendering=false,renderingStats=false,restored=false;

  async function api(url,options={}){
    const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    let body={};try{body=await r.json()}catch{}
    if(!r.ok)throw Error(body.error||'Request failed.');
    return body;
  }
  async function refreshState(){state=await api('/api/admin/content');state.data.rosters||=[];state.data.playoffRosters||=[];state.data.jerseyRecords||=[];state.data.playoffStats||=[];return state;}
  function setStatus(text,error=false){const n=$('#status');if(n){n.textContent=text;n.className=error?'error':'success';}}
  function active(){return Boolean($('[data-section="players"].active'));}
  function activeStats(){return Boolean($('[data-section="stats"].active'));}
  function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\([^)]*\)/g,'').replace(/[^a-z0-9]/g,'');}
  function yearOf(s){const name=typeof s==='string'?(state?.data?.seasons?.find(x=>x.id===s)?.name||s):(s?.name||'');return Number(String(name).match(/\b(20\d{2})\b/)?.[1]||0);}
  function termRank(name=''){if(/fall/i.test(name))return 3;if(/summer/i.test(name))return 2;if(/spring/i.test(name))return 1;return 0;}
  function specific(s){return /(spring|fall|summer|winter)/i.test(s?.name||'');}
  function seasons(data=state?.data){
    const all=[...(data?.seasons||[])],years=new Set(all.filter(specific).map(yearOf).filter(Boolean));
    return all.filter(s=>!(/history/i.test(s.name)&&years.has(yearOf(s)))).sort((a,b)=>yearOf(b)-yearOf(a)||termRank(b.name)-termRank(a.name)||String(b.name).localeCompare(String(a.name)));
  }
  function seasonOptions(selected,create=false,detected=null){
    const all=seasons(),groups=new Map();let html='';
    if(create&&detected&&!all.some(s=>s.name.toLowerCase()===detected.name.toLowerCase()))html+=`<option value="__create__" selected>Create ${esc(detected.name)}</option>`;
    all.forEach(s=>{const y=yearOf(s)||'Other';if(!groups.has(y))groups.set(y,[]);groups.get(y).push(s);});
    for(const [y,items] of groups){html+=`<optgroup label="${esc(y)}">${items.map(s=>`<option value="${esc(s.id)}" ${s.id===selected?'selected':''}>${esc(s.name)}</option>`).join('')}</optgroup>`;}
    return html;
  }
  function currentSeason(){const saved=sessionStorage.getItem(K_SEASON),all=seasons();if(saved&&all.some(s=>s.id===saved))return saved;if(all.some(s=>s.id===state?.data?.settings?.currentSeason))return state.data.settings.currentSeason;return all[0]?.id||'';}
  function currentRosterPhase(){return sessionStorage.getItem(K_ROSTER_PHASE)==='playoffs'?'playoffs':'regular';}
  function rosterList(data,phase=currentRosterPhase()){return phase==='playoffs'?(data.playoffRosters||[]):(data.rosters||[]);}
  function statsList(data,phase=currentRosterPhase()){return phase==='playoffs'?(data.playoffStats||[]):(data.stats||[]);}
  function phaseLabel(phase=currentRosterPhase()){return phase==='playoffs'?'Playoffs':'Regular season';}
    function numVal(v){const m=String(v||'').match(/\d+/);return m?Number(m[0]):9999;}

  function effectiveRoster(data,sid,includeRemoved=false,phase=currentRosterPhase()){
    const pmap=new Map((data.players||[]).map(p=>[String(p.id),p]));
    const explicit=rosterList(data,phase).filter(r=>r.season===sid),represented=new Set(explicit.map(r=>String(r.player)));
    const rows=explicit.map(r=>{const p=pmap.get(String(r.player));return p?{rosterId:r.id,playerId:p.id,player:p,number:r.number||p.number||'',position:r.position||p.position||'',active:r.active!==false,inferred:false,phase}:null;}).filter(Boolean);
    const legacy=statsList(data,phase),legacySeen=new Set();
    legacy.filter(st=>st.season===sid&&!represented.has(String(st.player))).forEach(st=>{if(legacySeen.has(String(st.player)))return;legacySeen.add(String(st.player));const p=pmap.get(String(st.player));if(p)rows.push({rosterId:'',playerId:p.id,player:p,number:p.number||'',position:p.position||'',active:true,inferred:true,phase});});
    return rows.filter(r=>includeRemoved||r.active).sort((a,b)=>numVal(a.number)-numVal(b.number)||String(a.player.name).localeCompare(String(b.player.name)));
  }

  function numberUsages(data,number){
    const wanted=String(number||'').trim();if(!wanted)return[];
    const pmap=new Map((data.players||[]).map(p=>[String(p.id),p])),smap=new Map((data.seasons||[]).map(s=>[String(s.id),s])),out=[];
    const collectRoster=(rows,phase)=>{
      const represented=new Set();
      (rows||[]).forEach(r=>{represented.add(`${r.season}:${r.player}`);if(r.active===false||String(r.number||'').trim()!==wanted)return;const p=pmap.get(String(r.player)),season=smap.get(String(r.season));out.push({playerId:p?.id||'',playerName:p?.name||'Unknown player',seasonName:`${season?.name||r.season}${phase==='playoffs'?' · Playoffs':''}`,year:yearOf(season),source:r.source?'Imported roster link':phase==='playoffs'?'Playoff roster':'Roster',sourceUrl:r.source||''})});
      return represented;
    };
    const regularSeen=collectRoster(data.rosters,'regular'),playoffSeen=collectRoster(data.playoffRosters,'playoffs');
    (data.stats||[]).forEach(st=>{const key=`${st.season}:${st.player}`;if(regularSeen.has(key))return;const p=pmap.get(String(st.player));if(!p||String(p.number||'').trim()!==wanted)return;const season=smap.get(String(st.season));out.push({playerId:p.id,playerName:p.name,seasonName:season?.name||st.season,year:yearOf(season),source:'Imported stats (legacy)'})});
    (data.playoffStats||[]).forEach(st=>{const key=`${st.season}:${st.player}`;if(playoffSeen.has(key))return;const p=pmap.get(String(st.player));if(!p||String(p.number||'').trim()!==wanted)return;const season=smap.get(String(st.season));out.push({playerId:p.id,playerName:p.name,seasonName:`${season?.name||st.season} · Playoffs`,year:yearOf(season),source:'Imported playoff stats (legacy)'})});
    (data.jerseyRecords||[]).forEach(j=>{if(String(j.number||'').trim()!==wanted)return;const p=j.player?pmap.get(String(j.player)):null,season=j.season?smap.get(String(j.season)):null;out.push({playerId:p?.id||j.player||'',playerName:p?.name||j.playerName||'Unknown player',seasonName:season?.name||(j.year?`Jersey record · ${j.year}`:'Jersey record'),year:Number(j.year||yearOf(season)||0),source:j.source||'Jersey history',jerseySize:j.jerseySize||''})});
    const seen=new Set();return out.filter(u=>{const key=[u.playerId||norm(u.playerName),u.seasonName,u.source].join('|');if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>(b.year||0)-(a.year||0)||String(a.playerName).localeCompare(String(b.playerName)));
  }
  function availability(data,number,exclude=''){
    const uses=numberUsages(data,number),now=new Date().getFullYear();
    const blocking=uses.filter(u=>{if(!u.year)return true;if(exclude&&String(u.playerId)===String(exclude))return false;return now<=u.year+3;});
    const owned=uses.filter(u=>exclude&&String(u.playerId)===String(exclude)&&(!u.year||now<=u.year+3));
    const latest=uses.reduce((m,u)=>Math.max(m,u.year||0),0);
    return{uses,blocking,owned,available:blocking.length===0,reservedThrough:latest?latest+3:0};
  }
  function availabilityHtml(result,number,current=''){
    if(!String(number||'').trim())return`<div class="jd-number-state neutral">Enter a jersey number to check its history.</div>`;
    const own=current&&result.available&&result.owned.length,cls=result.available?(own?'owned':'available'):'reserved';
    const heading=result.available?(own?`#${esc(number)} IS RESERVED TO THIS PLAYER`:`#${esc(number)} IS AVAILABLE`):`#${esc(number)} IS RESERVED`;
    return `<div class="jd-number-state ${cls}"><strong>${heading}</strong>${result.reservedThrough?`<span>Most recent reservation runs through ${result.reservedThrough}.</span>`:''}</div><div class="jd-number-history">${result.uses.length?result.uses.map(u=>`<div class="jd-number-history-row"><strong>#${esc(number)} · ${esc(u.playerName)}</strong><span>${esc(u.seasonName)}${u.year?` · reserved through ${u.year+3}`:''}</span><small>${esc(u.source)}${u.jerseySize?` · Jersey ${esc(u.jerseySize)}`:''}</small></div>`).join(''):'<p>No saved player or jersey history uses this number.</p>'}</div>`;
  }

  async function publish(mutator,msg='Published.'){
    const latest=await api('/api/admin/content');latest.data.rosters||=[];latest.data.playoffRosters||=[];latest.data.jerseyRecords||=[];latest.data.playoffStats||=[];await mutator(latest.data);
    state=await api('/api/admin/content',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:latest.revision,data:latest.data})});setStatus(msg);return state;
  }
  async function publishReload(mutator,msg){sessionStorage.setItem(K_SECTION,'players');sessionStorage.setItem(K_SEASON,currentSeason());await publish(mutator,msg);setTimeout(()=>location.reload(),250);}
  function showEditor(html){const d=$('#editor'),c=$('#editor-content');if(!d||!c)return null;c.innerHTML=html;if(!d.open)d.showModal();return c;}
  function closeEditor(){const d=$('#editor');if(d?.open)d.close();}

  async function imageSource(file){
    if('createImageBitmap'in window){try{return await createImageBitmap(file,{imageOrientation:'from-image'})}catch{}}
    return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('This photo could not be opened.'))};img.src=url;});
  }
  async function cropHeadshot(file){
    const d=$('#cropper'),canvas=$('#crop-canvas'),zoomInput=$('#crop-zoom');if(!d||!canvas||!zoomInput)return file;
    const ctx=canvas.getContext('2d'),source=await imageSource(file);let zoom=1,cx=source.width/2,cy=source.height/2,drag=null;
    const clamp=()=>{const scale=Math.max(canvas.width/source.width,canvas.height/source.height)*zoom,hw=canvas.width/(2*scale),hh=canvas.height/(2*scale);cx=Math.min(source.width-hw,Math.max(hw,cx));cy=Math.min(source.height-hh,Math.max(hh,cy));};
    const paint=()=>{clamp();const scale=Math.max(canvas.width/source.width,canvas.height/source.height)*zoom;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,canvas.width/2-cx*scale,canvas.height/2-cy*scale,source.width*scale,source.height*scale);};
    const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}};
    zoomInput.value='1';zoomInput.oninput=()=>{zoom=Number(zoomInput.value);paint()};canvas.onpointerdown=e=>{drag=point(e);canvas.setPointerCapture?.(e.pointerId)};canvas.onpointermove=e=>{if(!drag)return;const p=point(e),scale=Math.max(canvas.width/source.width,canvas.height/source.height)*zoom;cx-=(p.x-drag.x)/scale;cy-=(p.y-drag.y)/scale;drag=p;paint()};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
    $('#crop-reset').onclick=()=>{zoom=1;cx=source.width/2;cy=source.height/2;zoomInput.value='1';paint()};paint();d.showModal();
    return new Promise(resolve=>{let done=false;const finish=v=>{if(done)return;done=true;d.close();source.close?.();resolve(v)};$('#crop-cancel').onclick=()=>finish(null);d.oncancel=e=>{e.preventDefault();finish(null)};$('#crop-use').onclick=()=>canvas.toBlob(blob=>finish(blob),'image/jpeg',.9);});
  }
  async function uploadHeadshot(file){const cropped=await cropHeadshot(file);if(!cropped)return null;const r=await api('/api/images',{method:'POST',body:cropped,headers:{'Content-Type':cropped.type||'image/jpeg'}});return r.url;}

  async function renderPlayers(){
    if(rendering||!active())return;rendering=true;
    try{
      await refreshState();if(!active())return;
      const sid=currentSeason(),phase=currentRosterPhase();sessionStorage.setItem(K_SEASON,sid);sessionStorage.setItem(K_ROSTER_PHASE,phase);
      const showRemoved=sessionStorage.getItem(K_REMOVED)==='1',rows=effectiveRoster(state.data,sid,showRemoved,phase),activeRows=effectiveRoster(state.data,sid,false,phase),season=state.data.seasons.find(s=>s.id===sid),content=$('#section-content');if(!content)return;
      const phaseName=phaseLabel(phase);
      content.innerHTML=`<div class="jd-players-toolbar"><button class="button" id="jd-v9-add-player" type="button">+ Add player</button><div class="jd-player-tools"><button class="button jd-tools-button" id="jd-v11-tools-toggle" type="button" aria-expanded="false">Tools</button><div class="jd-player-tools-menu" id="jd-v11-tools-menu" hidden><button data-team-tool="gamechanger" type="button">Upload GameChanger CSV</button><button data-team-tool="supplied" type="button">Import supplied history</button><button data-team-tool="roster-link" type="button">Import roster + stats from link</button><button data-team-tool="stats-link" type="button">Add stats from link</button><button data-team-tool="number" type="button">Check jersey number</button><button data-team-tool="jersey" type="button">Import jersey / Google Form CSV</button><button data-team-tool="reset-season" class="danger" type="button">Reset ${esc(phaseName)}</button><button data-team-tool="removed" type="button">${showRemoved?'Hide removed players':'Show removed players'}</button></div></div><label class="jd-player-season-picker"><span>Season</span><select id="jd-v9-season">${seasonOptions(sid)}</select></label><label class="jd-player-season-picker jd-roster-phase-picker"><span>Roster set</span><select id="jd-v11-roster-phase"><option value="regular" ${phase==='regular'?'selected':''}>Regular season</option><option value="playoffs" ${phase==='playoffs'?'selected':''}>Playoffs</option></select></label></div>
      <div class="jd-season-roster-summary"><div><span class="eyebrow">${esc(season?.name||'SEASON')} · ${esc(phaseName.toUpperCase())}</span><strong>${activeRows.length}</strong><small>${activeRows.length===1?'player':'players'} on this ${phase==='playoffs'?'playoff':'regular-season'} roster</small></div><p>Regular-season and playoff rosters stay separate. The permanent player profile and photo are reused in both.</p></div>
      <div class="jd-season-player-list">${rows.length?rows.map(r=>`<article class="jd-season-player-row ${r.active?'':'is-removed'}"><div class="jd-season-player-thumb">${r.player.photo?`<img src="${esc(r.player.photo)}" alt="">`:`<span>${esc(r.number||'—')}</span>`}</div><div class="jd-season-player-number">#${esc(r.number||'—')}</div><div class="jd-season-player-copy"><strong>${esc(r.player.name)}</strong><span>${esc(r.position||'Position not set')}${r.inferred?' · Imported before explicit roster':''}${!r.active?' · Removed from this roster':''}</span></div><details class="jd-team-actions"><summary>Actions</summary><div><button data-team-action="edit" data-player="${esc(r.playerId)}" type="button">Edit player</button><button data-team-action="${r.active?'remove':'restore'}" data-player="${esc(r.playerId)}" type="button">${r.active?`Remove from ${esc(phaseName)}`:`Restore to ${esc(phaseName)}`}</button><button data-team-action="delete-season" data-player="${esc(r.playerId)}" class="danger" type="button">Delete from ${esc(phaseName)}</button><a href="/roster/${encodeURIComponent(r.playerId)}/?season=${encodeURIComponent(sid)}&phase=${encodeURIComponent(phase)}" target="_blank" rel="noopener">View public profile</a></div></details></article>`).join(''):`<div class="jd-empty-season-roster"><strong>No ${esc(phaseName.toLowerCase())} players in ${esc(season?.name||'this season')} yet.</strong><p>Add a player manually or import the correct roster. Regular season and playoffs remain separate.</p></div>`}</div>`;
      $('#jd-v9-season')?.addEventListener('change',e=>{sessionStorage.setItem(K_SEASON,e.target.value);renderPlayers()});
      $('#jd-v11-roster-phase')?.addEventListener('change',e=>{sessionStorage.setItem(K_ROSTER_PHASE,e.target.value==='playoffs'?'playoffs':'regular');renderPlayers()});
      $('#jd-v9-add-player')?.addEventListener('click',()=>openPlayerEditor('',sid,phase));
      const toolsToggle=$('#jd-v11-tools-toggle'),toolsMenu=$('#jd-v11-tools-menu');
      toolsToggle?.addEventListener('click',e=>{e.stopPropagation();const open=toolsMenu?.hasAttribute('hidden');if(open)toolsMenu?.removeAttribute('hidden');else toolsMenu?.setAttribute('hidden','');toolsToggle.setAttribute('aria-expanded',String(Boolean(open)))});
    }catch(e){setStatus(e.message,true)}finally{rendering=false}
  }

  function profileHistoryLabel(data,profile){
    const seasonsById=new Map((data.seasons||[]).map(s=>[String(s.id),s]));
    const rows=[...(data.rosters||[]),...(data.playoffRosters||[])].filter(r=>String(r.player)===String(profile.id));
    const names=[...new Set(rows.map(r=>seasonsById.get(String(r.season))?.name).filter(Boolean))].slice(0,3);
    const numbers=[...new Set(rows.map(r=>String(r.number||'').trim()).filter(Boolean))].slice(0,3);
    const parts=[];if(numbers.length)parts.push(numbers.map(n=>`#${n}`).join('/'));if(names.length)parts.push(names.join(', '));
    return `${profile.name}${parts.length?' · '+parts.join(' · '):''}`;
  }

  function mergeStatInto(target,source){
    const filled=group=>Object.values(group||{}).filter(v=>v!==''&&v!==undefined&&v!==null&&v!=='-').length;
    for(const group of ['bat','pitch','fielding']){
      target[group]||={};const incoming=source?.[group]||{};
      if(filled(incoming)>filled(target[group]))target[group]={...target[group],...incoming};
      else for(const [key,value] of Object.entries(incoming)){if(target[group][key]===undefined||target[group][key]===''||target[group][key]==='-')target[group][key]=value}
    }
    if(source?.source)target.source=target.source||source.source;
  }

  function mergePlayerRefs(data,fromId,toId){
    const source=data.players.find(p=>String(p.id)===String(fromId)),target=data.players.find(p=>String(p.id)===String(toId));
    if(!source||!target||String(fromId)===String(toId))throw Error('Choose a different existing player profile.');
    for(const key of ['photo','bio','bats','throws','number','position'])if(!target[key]&&source[key])target[key]=source[key];
    target.active=Boolean(target.active||source.active);

    const mergeRosterCollection=key=>{
      const list=data[key]||[];
      const sourceRows=list.filter(r=>String(r.player)===String(fromId));
      sourceRows.forEach(row=>{
        const existing=list.find(r=>String(r.player)===String(toId)&&String(r.season)===String(row.season));
        if(existing){
          if(row.number)existing.number=row.number;
          if(row.position)existing.position=row.position;
          if(row.source)existing.source=row.source;
          existing.active=existing.active!==false||row.active!==false;
        }else row.player=toId;
      });
      data[key]=list.filter(r=>!(String(r.player)===String(fromId)&&list.some(t=>t!==r&&String(t.player)===String(toId)&&String(t.season)===String(r.season))));
    };
    mergeRosterCollection('rosters');mergeRosterCollection('playoffRosters');

    const mergeStatsCollection=key=>{
      const list=data[key]||[];
      const remove=new Set();
      list.filter(st=>String(st.player)===String(fromId)).forEach(row=>{
        const existing=list.find(st=>String(st.player)===String(toId)&&String(st.season)===String(row.season));
        if(existing){mergeStatInto(existing,row);remove.add(row.id)}else row.player=toId;
      });
      data[key]=list.filter(st=>!remove.has(st.id));
    };
    mergeStatsCollection('stats');mergeStatsCollection('playoffStats');

    (data.jerseyRecords||[]).forEach(j=>{if(String(j.player)===String(fromId)){j.player=toId;j.playerName=target.name||j.playerName}});
    const jerseySeen=new Set();data.jerseyRecords=(data.jerseyRecords||[]).filter(j=>{const key=[j.player||norm(j.playerName),j.number,j.season||'',j.year||'',j.source||''].join('|');if(jerseySeen.has(key))return false;jerseySeen.add(key);return true});
    (data.spotlights||[]).forEach(item=>{if(String(item.player)===String(fromId))item.player=toId});
    data.players=data.players.filter(p=>String(p.id)!==String(fromId));
  }

  async function mergePlayerProfiles(fromId,toId){
    await refreshState();
    const source=state.data.players.find(p=>String(p.id)===String(fromId)),target=state.data.players.find(p=>String(p.id)===String(toId));
    if(!source||!target)throw Error('The selected profile could not be found.');
    if(!confirm(`Merge “${source.name}” into “${target.name}”?\n\nAll season rosters, regular-season stats, playoff rosters/stats, jersey history and spotlights will point to ${target.name}. The duplicate ${source.name} profile will then be deleted.`))return;
    await publishReload(data=>mergePlayerRefs(data,fromId,toId),`${source.name} merged into ${target.name}. The duplicate profile was deleted.`);
  }

  async function openPlayerEditor(playerId='',sid=currentSeason(),phase=currentRosterPhase()){
    await refreshState();const data=state.data,player=playerId?data.players.find(p=>String(p.id)===String(playerId)):null,collection=rosterList(data,phase),phaseStats=statsList(data,phase);
    let roster=collection.find(r=>r.season===sid&&String(r.player)===String(playerId));
    if(!roster&&player&&phaseStats.some(st=>st.season===sid&&String(st.player)===String(playerId)))roster={number:player.number||'',position:player.position||'',active:true};
    const profiles=[...data.players].sort((a,b)=>String(a.name).localeCompare(String(b.name))),season=data.seasons.find(s=>s.id===sid),phaseName=phaseLabel(phase);
    const mergeProfiles=player?profiles.filter(p=>String(p.id)!==String(player.id)):[];
    const mergeOptions=mergeProfiles.map((p,i)=>({id:p.id,label:`${profileHistoryLabel(data,p)}${mergeProfiles.filter(x=>profileHistoryLabel(data,x)===profileHistoryLabel(data,p)).length>1?` · profile ${i+1}`:''}`}));
    const mergeLookup=new Map(mergeOptions.map(x=>[x.label,x.id]));
    const mergeBlock=player?`<section class="wide jd-profile-merge"><div><span class="eyebrow">DUPLICATE PROFILE FIX</span><h3>Link / merge this player into an existing profile</h3><p>If this player should be the same person as an older saved profile, search below. The season data moves to the existing profile and this duplicate profile is deleted.</p></div><label>Existing player profile<input id="jd-v111-merge-profile" list="jd-v111-profile-list" placeholder="Search player name…" autocomplete="off"><datalist id="jd-v111-profile-list">${mergeOptions.map(x=>`<option value="${esc(x.label)}"></option>`).join('')}</datalist></label><div id="jd-v111-merge-preview" class="jd-merge-preview"></div><button id="jd-v111-merge-button" class="jd-merge-button" type="button" disabled>Merge profiles</button></section>`:'';
    const c=showEditor(`<div class="jd-player-editor-heading"><span class="eyebrow">PLAYERS · ${esc(season?.name||'')} · ${esc(phaseName.toUpperCase())}</span><h2>${player?'Edit player':'Add player'}</h2><p>The profile/photo follows the player. Jersey number and position below belong only to the ${esc(phaseName.toLowerCase())} roster for ${esc(season?.name||'this season')}.</p></div><form id="jd-v9-player-form">${!player?`<label class="wide jd-existing-profile">Returning player? Link a saved profile<select id="jd-v9-existing"><option value="">Create a new player profile</option>${profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · #${esc(p.number||'—')}</option>`).join('')}</select></label>`:''}<div class="form-grid">${mergeBlock}<label>Full name<input name="name" value="${esc(player?.name||'')}" required></label><label>Bats<select name="bats">${['','R','L','S'].map(v=>`<option value="${v}" ${player?.bats===v?'selected':''}>${v||'Not set'}</option>`).join('')}</select></label><label>Throws<select name="throws">${['','R','L'].map(v=>`<option value="${v}" ${player?.throws===v?'selected':''}>${v||'Not set'}</option>`).join('')}</select></label><label class="wide">Player bio<textarea name="bio" rows="3">${esc(player?.bio||'')}</textarea></label><section class="wide jd-player-photo-editor"><div class="jd-player-photo-preview">${player?.photo?`<img src="${esc(player.photo)}" alt="">`:'<span>NO PHOTO</span>'}</div><div><strong>Player headshot</strong><p>The same 4:5 headshot is reused when the player returns in another season or in the playoffs.</p><input type="file" id="jd-v9-photo-file" accept="image/jpeg,image/png,image/webp"><button id="jd-v9-remove-photo" type="button">Remove photo</button></div><input name="photo" type="hidden" value="${esc(player?.photo||'')}"></section><section class="wide jd-season-roster-fields"><div><span class="eyebrow">${esc(phaseName.toUpperCase())} ROSTER</span><h3>${esc(season?.name||'Season')}</h3></div><label>Jersey number<input name="seasonNumber" value="${esc(roster?.number||player?.number||'')}" maxlength="10" inputmode="numeric" required></label><label>Position<input name="seasonPosition" value="${esc(roster?.position||player?.position||'')}" placeholder="C, P, IF, OF"></label><div class="wide" id="jd-v9-number-live"></div></section></div><p class="form-message" role="status"></p><div class="form-actions"><button class="button" type="submit">${player?'Save player':'Add to roster'}</button><button id="jd-v9-cancel-player" type="button">Cancel</button></div></form>`);
    if(!c)return;const form=$('#jd-v9-player-form',c),existing=$('#jd-v9-existing',c),photo=$('[name="photo"]',form),preview=$('.jd-player-photo-preview',form),number=$('[name="seasonNumber"]',form),live=$('#jd-v9-number-live',form);let linked=player?.id||'';
    const paint=()=>live.innerHTML=availabilityHtml(availability(state.data,number.value,linked),number.value,linked);number.addEventListener('input',paint);paint();
    existing?.addEventListener('change',()=>{linked=existing.value||'';const saved=state.data.players.find(x=>String(x.id)===String(linked));if(!saved)return;$('[name="name"]',form).value=saved.name||'';$('[name="bats"]',form).value=saved.bats||'';$('[name="throws"]',form).value=saved.throws||'';$('[name="bio"]',form).value=saved.bio||'';photo.value=saved.photo||'';preview.innerHTML=saved.photo?`<img src="${esc(saved.photo)}" alt="">`:'<span>NO PHOTO</span>';const rr=rosterList(state.data,phase).find(r=>r.season===sid&&String(r.player)===String(saved.id));number.value=rr?.number||saved.number||'';$('[name="seasonPosition"]',form).value=rr?.position||saved.position||'';paint();});
    const mergeInput=$('#jd-v111-merge-profile',form),mergeButton=$('#jd-v111-merge-button',form),mergePreview=$('#jd-v111-merge-preview',form);
    const paintMerge=()=>{if(!mergeInput||!mergeButton)return;const targetId=mergeLookup.get(mergeInput.value.trim())||'';mergeButton.disabled=!targetId;const target=state.data.players.find(p=>String(p.id)===String(targetId));if(mergePreview)mergePreview.innerHTML=target?`${target.photo?`<img src="${esc(target.photo)}" alt="">`:`<span>#${esc(target.number||'—')}</span>`}<div><strong>${esc(target.name)}</strong><small>${esc(profileHistoryLabel(state.data,target))}</small></div>`:'<small>Choose an existing profile from the search list.</small>';};
    mergeInput?.addEventListener('input',paintMerge);paintMerge();
    mergeButton?.addEventListener('click',async()=>{const targetId=mergeLookup.get(mergeInput.value.trim())||'';if(!targetId)return;mergeButton.disabled=true;try{await mergePlayerProfiles(player.id,targetId)}catch(err){mergeButton.disabled=false;$('.form-message',form).textContent=err.message}});
    $('#jd-v9-photo-file',form)?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;const msg=$('.form-message',form);try{msg.textContent='Crop and upload the headshot…';const url=await uploadHeadshot(file);if(!url){msg.textContent='Photo change canceled.';return}photo.value=url;preview.innerHTML=`<img src="${esc(url)}" alt="">`;msg.textContent='Headshot uploaded. Save the player to finish.'}catch(err){msg.textContent=err.message}});
    $('#jd-v9-remove-photo',form)?.addEventListener('click',()=>{photo.value='';preview.innerHTML='<span>NO PHOTO</span>'});$('#jd-v9-cancel-player',form)?.addEventListener('click',closeEditor);
    form.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form),msg=$('.form-message',form),name=String(fd.get('name')||'').trim(),jersey=String(fd.get('seasonNumber')||'').trim(),position=String(fd.get('seasonPosition')||'').trim();if(!name||!jersey){msg.textContent='Player name and jersey number are required.';return}
      try{const id=linked||uid();if(!linked){const same=state.data.players.filter(p=>norm(p.name)===norm(name));if(same.length===1){msg.innerHTML=`A saved profile already exists for <strong>${esc(same[0].name)}</strong>. Choose that player from “Returning player?” instead of creating a duplicate.`;return}}
        await publishReload(data=>{data.rosters||=[];data.playoffRosters||=[];let saved=data.players.find(x=>String(x.id)===String(id));if(!saved){saved={id,name,number:jersey,position,bats:String(fd.get('bats')||''),throws:String(fd.get('throws')||''),bio:String(fd.get('bio')||''),photo:String(fd.get('photo')||''),active:true};data.players.push(saved)}else{saved.name=name;saved.bats=String(fd.get('bats')||'');saved.throws=String(fd.get('throws')||'');saved.bio=String(fd.get('bio')||'');saved.photo=String(fd.get('photo')||'');if(phase==='regular'&&(!saved.number||sid===data.settings.currentSeason))saved.number=jersey;if(phase==='regular'&&(!saved.position||sid===data.settings.currentSeason))saved.position=position;if(sid===data.settings.currentSeason)saved.active=true}
          const list=phase==='playoffs'?data.playoffRosters:data.rosters;let rr=list.find(r=>r.season===sid&&String(r.player)===String(id));if(!rr){rr={id:uid(),season:sid,player:id,number:jersey,position,active:true,source:''};list.push(rr)}else{rr.number=jersey;rr.position=position;rr.active=true}},`${name} saved to ${season?.name||'the season'} · ${phaseName}.`);
      }catch(err){msg.textContent=err.message}});
  }

  async function setRosterActive(playerId,on){
    const sid=currentSeason(),phase=currentRosterPhase(),row=effectiveRoster(state.data,sid,true,phase).find(r=>String(r.playerId)===String(playerId));if(!row)return;
    await publishReload(data=>{data.rosters||=[];data.playoffRosters||=[];const list=phase==='playoffs'?data.playoffRosters:data.rosters;let rr=list.find(r=>r.season===sid&&String(r.player)===String(playerId));if(!rr){rr={id:uid(),season:sid,player:playerId,number:row.number||row.player.number||'',position:row.position||row.player.position||'',active:on,source:''};list.push(rr)}else rr.active=on;},on?`Player restored to ${phaseLabel(phase)}.`:`Player removed from ${phaseLabel(phase)}. Career history was kept.`);
  }

  async function deleteSeasonPlayer(playerId){
    await refreshState();
    const sid=currentSeason(),phase=currentRosterPhase(),season=state.data.seasons.find(s=>s.id===sid),player=state.data.players.find(p=>String(p.id)===String(playerId)),phaseName=phaseLabel(phase);
    if(!player)return;
    if(!confirm(`Delete ${player.name} from ${season?.name||'this season'} · ${phaseName}?\n\nThis deletes only this ${phaseName.toLowerCase()} roster assignment and stats. The permanent player profile, photo, the other roster set, and other seasons stay saved.`))return;
    await publishReload(data=>{
      if(phase==='playoffs'){data.playoffRosters=(data.playoffRosters||[]).filter(r=>!(r.season===sid&&String(r.player)===String(playerId)));data.playoffStats=(data.playoffStats||[]).filter(st=>!(st.season===sid&&String(st.player)===String(playerId)))}
      else{data.rosters=(data.rosters||[]).filter(r=>!(r.season===sid&&String(r.player)===String(playerId)));data.stats=(data.stats||[]).filter(st=>!(st.season===sid&&String(st.player)===String(playerId)))}
    },`${player.name} deleted from ${season?.name||'this season'} · ${phaseName}. Permanent profile kept.`);
  }

  async function resetSeason(){
    await refreshState();
    const sid=currentSeason(),phase=currentRosterPhase(),season=state.data.seasons.find(s=>s.id===sid),phaseName=phaseLabel(phase),rosterCount=rosterList(state.data,phase).filter(r=>r.season===sid).length,statCount=statsList(state.data,phase).filter(st=>st.season===sid).length;
    if(!confirm(`Reset ${season?.name||'this season'} · ${phaseName}?\n\nThis will delete ${rosterCount} roster assignments and ${statCount} stat rows from this ${phaseName.toLowerCase()} set. Permanent player profiles, photos, the other roster set, other seasons and imported jersey-history records stay saved.`))return;
    await publishReload(data=>{
      if(phase==='playoffs'){data.playoffRosters=(data.playoffRosters||[]).filter(r=>r.season!==sid);data.playoffStats=(data.playoffStats||[]).filter(st=>st.season!==sid)}
      else{data.rosters=(data.rosters||[]).filter(r=>r.season!==sid);data.stats=(data.stats||[]).filter(st=>st.season!==sid)}
    },`${season?.name||'Season'} · ${phaseName} roster and stats reset. Player profiles were kept.`);
  }

  function openNumberChecker(){
    const c=showEditor(`<div class="jd-number-checker-heading"><span class="eyebrow">ADMIN ONLY</span><h2>Check jersey number</h2><p>The checker looks across every season roster plus imported jersey/Google Form history. A number stays reserved for three years after its most recent use.</p></div><label class="jd-number-check-input">Jersey number<input id="jd-v9-number-check" inputmode="numeric" maxlength="10" placeholder="10"></label><div id="jd-v9-number-result"></div>`);
    if(!c)return;const input=$('#jd-v9-number-check',c),out=$('#jd-v9-number-result',c),paint=()=>out.innerHTML=availabilityHtml(availability(state.data,input.value.trim()),input.value.trim());input.addEventListener('input',paint);paint();input.focus();
  }


  function parseCSV(text){
    const rows=[];let row=[],value='',quote=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quote&&text[i+1]==='"'){value+='"';i++}else quote=!quote}
      else if(c===','&&!quote){row.push(value);value=''}
      else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(Boolean))rows.push(row);row=[];value=''}
      else value+=c;
    }
    if(value||row.length){row.push(value);rows.push(row)}
    return rows;
  }

  function seasonFromFilename(filename=''){
    const value=String(filename),m=value.match(/\b(Spring|Fall|Summer|Winter)\s+(20\d{2})\b/i)||value.match(/\b(20\d{2})\s+(Spring|Fall|Summer|Winter)\b/i);
    if(!m)return null;
    const year=/^20/.test(m[1])?m[1]:m[2],raw=/^20/.test(m[1])?m[2]:m[1],term=raw[0].toUpperCase()+raw.slice(1).toLowerCase();
    return{name:`${term} ${year}`,id:`${term.toLowerCase()}-${year}`,term,year};
  }
  const phaseFromText=value=>/playoff|postseason|post-season/i.test(String(value||''))?'playoffs':'regular';

  function cleanMetric(v){
    const s=String(v??'').trim();if(!s)return'';if(s==='-')return'-';
    const n=s.replace(/%$/,'');return /^-?\d*(?:\.\d+)?$/.test(n)?n:'';
  }

  function valueMap(headers,row,start,end){
    return Object.fromEntries(headers.slice(start,end).map((k,i)=>[String(k||'').trim(),cleanMetric(row[start+i])]).filter(([k])=>k));
  }

  function inferPosition(fielding={}){
    const keys=['P','C','1B','2B','3B','SS','LF','CF','RF'];let best='',bestValue=0;
    keys.forEach(k=>{const v=Number(fielding[k]||0);if(Number.isFinite(v)&&v>bestValue){best=k;bestValue=v}});
    if(['LF','CF','RF'].includes(best))return'OF';if(['1B','2B','3B','SS'].includes(best))return'IF';return best;
  }

  function parseGameChanger(text){
    const rows=parseCSV(text),hi=rows.findIndex(r=>r[0]==='Number'&&r[1]==='Last'&&r[2]==='First');
    if(hi<1)throw Error('This does not look like a GameChanger team stats export.');
    const groups=rows[hi-1],headers=rows[hi],pi=groups.indexOf('Pitching'),fi=groups.indexOf('Fielding');
    if(pi<0||fi<0)throw Error('Batting, Pitching and Fielding sections were not found.');
    const out=[];
    for(const row of rows.slice(hi+1)){
      const marker=String(row[0]||'').trim();if(marker==='Totals'||marker==='Glossary')continue;
      const name=`${String(row[2]||'').trim()} ${String(row[1]||'').trim()}`.replace(/\s+/g,' ').trim();if(!name)continue;
      const batting=valueMap(headers,row,3,pi),pitching=valueMap(headers,row,pi,fi),fielding=valueMap(headers,row,fi,headers.length);
      out.push({importIndex:out.length,number:marker,name,key:norm(name),batting,pitching,fielding,position:inferPosition(fielding)});
    }
    if(!out.length)throw Error('No player rows were found.');
    const numbersByName=new Map();out.forEach(r=>{if(!r.number)return;if(!numbersByName.has(r.key))numbersByName.set(r.key,new Set());numbersByName.get(r.key).add(r.number)});out.forEach(r=>{const nums=numbersByName.get(r.key);if(!r.number&&nums?.size===1)r.number=[...nums][0]});
    return out;
  }

  const metricNumber=v=>{const n=Number(String(v??'').trim());return Number.isFinite(n)?n:0};
  function ipOuts(v){const s=String(v??'0');if(!s||s==='-')return 0;const [w,f='0']=s.split('.');return(Number(w)||0)*3+Math.max(0,Math.min(2,Number(f[0])||0))}
  function outsIp(o){const n=Math.max(0,Math.round(o||0));return`${Math.floor(n/3)}.${n%3}`}
  function rate(v){if(!Number.isFinite(v))return'-';const s=Math.max(0,v).toFixed(3);return s.startsWith('0.')?s.slice(1):s}

  function mergeStats(rows){
    if(rows.length===1)return{bat:rows[0].batting,pitch:rows[0].pitching,fielding:rows[0].fielding};
    const sumGroup=(group,rateKeys=new Set())=>{
      const keys=new Set(rows.flatMap(r=>Object.keys(r[group]||{}))),result={};
      keys.forEach(k=>{if(rateKeys.has(k))return;const vals=rows.map(r=>r[group]?.[k]).filter(v=>v!==undefined&&v!=='');if(vals.length)result[k]=String(vals.reduce((a,v)=>a+metricNumber(v),0))});
      return result;
    };
    const bat=sumGroup('batting',new Set(['AVG','OBP','OPS','SLG','SB%','QAB%','PA/BB','BB/K','C%','LD%','FB%','GB%','BABIP','BA/RISP','PS/PA','2S+3%','6+%','AB/HR']));
    const pitch=sumGroup('pitching',new Set(['SV%','SB%','ERA','WHIP','BAA','P/IP','P/BF','<3%','FIP','S%','FPS%','FPSO%','FPSW%','FPSH%','BB/INN','SM%','K/BF','K/BB','WEAK%','HHB%','GO/AO','LD%','FB%','GB%','BABIP','BA/RISP']));
    const fielding=sumGroup('fielding',new Set(['FPCT','CS%']));
    const ab=metricNumber(bat.AB),h=metricNumber(bat.H),bb=metricNumber(bat.BB),hbp=metricNumber(bat.HBP),sf=metricNumber(bat.SF);
    const tb=metricNumber(bat.TB)||metricNumber(bat['1B'])+2*metricNumber(bat['2B'])+3*metricNumber(bat['3B'])+4*metricNumber(bat.HR);
    bat.TB=String(tb);bat.AVG=ab?rate(h/ab):'-';const obd=ab+bb+hbp+sf;bat.OBP=obd?rate((h+bb+hbp)/obd):'-';bat.SLG=ab?rate(tb/ab):'-';bat.OPS=bat.OBP!=='-'&&bat.SLG!=='-'?rate(metricNumber(bat.OBP)+metricNumber(bat.SLG)):'-';
    const po=rows.reduce((a,r)=>a+ipOuts(r.pitching.IP),0),innings=po/3;pitch.IP=outsIp(po);pitch.ERA=innings?rate(metricNumber(pitch.ER)*7/innings):'-';pitch.WHIP=innings?rate((metricNumber(pitch.H)+metricNumber(pitch.BB))/innings):'-';
    const fo=rows.reduce((a,r)=>a+ipOuts(r.fielding.INN),0);fielding.INN=outsIp(fo);const tc=metricNumber(fielding.TC);fielding.FPCT=tc?rate((metricNumber(fielding.A)+metricNumber(fielding.PO))/tc):'-';
    return{bat,pitch,fielding};
  }

  async function openGameChanger(preset=null){
    await refreshState();
    let filename=preset?.filename||'',text=preset?.text||'',detected=seasonFromFilename(filename),phase=phaseFromText(filename);
    const detectedTarget=()=>detected?(state.data.seasons.find(s=>s.name.toLowerCase()===detected.name.toLowerCase())?.id||'__create__'):currentSeason();
    const c=showEditor(`<div class="jd-import-heading"><span class="eyebrow">GAMECHANGER</span><h2>Import roster & stats</h2><p>Regular-season and playoff totals stay separate. When the filename identifies a season, the import is locked to that season so Fall data cannot accidentally land in Spring.</p></div><div class="jd-import-form">${preset?`<div class="jd-import-preset"><strong>${esc(filename)}</strong><span>Supplied in this project</span></div>`:`<label>GameChanger CSV<input type="file" id="jd-v11-gc-file" accept=".csv,text/csv"></label>`}<label>Stats set<select id="jd-v11-gc-phase"><option value="regular" ${phase==='regular'?'selected':''}>Regular season</option><option value="playoffs" ${phase==='playoffs'?'selected':''}>Playoffs</option></select></label><label>Season<select id="jd-v11-gc-season">${seasonOptions(detectedTarget(),true,detected)}</select></label><div id="jd-v11-gc-lock"></div><p id="jd-v11-gc-message"></p><div id="jd-v11-gc-preview"></div><div class="jd-import-actions"><button class="button" id="jd-v11-gc-review" type="button">Review import</button><button class="button" id="jd-v11-gc-apply" type="button" hidden>Import & publish</button></div></div>`);
    if(!c)return;
    const fileInput=$('#jd-v11-gc-file',c),seasonSelect=$('#jd-v11-gc-season',c),phaseSelect=$('#jd-v11-gc-phase',c),lock=$('#jd-v11-gc-lock',c),message=$('#jd-v11-gc-message',c),preview=$('#jd-v11-gc-preview',c),apply=$('#jd-v11-gc-apply',c);
    let parsed=null,reviews=[];
    const applyDetected=()=>{if(detected){const existing=state.data.seasons.find(s=>s.name.toLowerCase()===detected.name.toLowerCase());seasonSelect.innerHTML=seasonOptions(existing?.id||'__create__',true,detected);seasonSelect.disabled=true;lock.innerHTML=`<div class="jd-season-lock"><strong>LOCKED TO ${esc(detected.name)}</strong><span>Detected from the GameChanger filename.</span></div>`}else{seasonSelect.disabled=false;seasonSelect.innerHTML=seasonOptions(currentSeason());lock.innerHTML='<div class="jd-season-lock neutral"><strong>SEASON NOT DETECTED</strong><span>Choose the correct season before importing.</span></div>'}};
    applyDetected();
    fileInput?.addEventListener('change',async()=>{const f=fileInput.files?.[0];if(!f)return;filename=f.name;text=await f.text();detected=seasonFromFilename(filename);phase=phaseFromText(filename);phaseSelect.value=phase;applyDetected();parsed=null;preview.innerHTML='';apply.hidden=true;message.textContent=detected?`Detected ${detected.name}${phase==='playoffs'?' playoffs':''}. Choose Review import.`:'Choose the season and stats set, then Review import.'});

    $('#jd-v11-gc-review',c).onclick=async()=>{
      try{
        if(!text){const f=fileInput?.files?.[0];if(!f)throw Error('Choose a GameChanger CSV.');if(f.size>4_000_000)throw Error('Choose a CSV under 4 MB.');filename=f.name;text=await f.text();detected=seasonFromFilename(filename);applyDetected()}
        parsed=parseGameChanger(text);reviews=[];let exact=0,fresh=0;
        parsed.forEach(row=>{const same=state.data.players.filter(p=>norm(p.name)===row.key),match=same.find(p=>!row.number||String(p.number||'').trim()===String(row.number||'').trim());row.exactPlayerId=match?.id||'';row.sameNameCandidates=same;if(match)exact++;else if(same.length)reviews.push(row);else fresh++});
        const target=seasonSelect.value,seasonLabel=target==='__create__'?(detected?.name||'New season'):(state.data.seasons.find(s=>s.id===target)?.name||target),phaseLabel=phaseSelect.value==='playoffs'?'Playoffs':'Regular season';
        preview.innerHTML=`<div class="jd-import-summary"><div><strong>${parsed.length}</strong><span>players</span></div><div><strong>${exact}</strong><span>profile matches</span></div><div><strong>${fresh}</strong><span>new profiles</span></div><div class="${reviews.length?'needs-review':''}"><strong>${reviews.length}</strong><span>need review</span></div></div><div class="jd-import-season-confirm"><strong>${esc(seasonLabel)} · ${phaseLabel}</strong><span>${phaseSelect.value==='regular'?'Regular import refreshes this season roster + regular stats.':'Playoff import refreshes the playoff roster + playoff stats and keeps regular-season data.'}</span></div><div class="jd-gc-player-review">${parsed.map(row=>{const cls=row.exactPlayerId?'matched':row.sameNameCandidates.length?'review':'new',label=row.exactPlayerId?'MATCHED':row.sameNameCandidates.length?'NEEDS REVIEW':'NEW PLAYER';return`<div class="jd-gc-player-line ${cls}"><b>#${esc(row.number||'—')}</b><span><strong>${esc(row.name)}</strong><small>${esc(row.position||'Position from GameChanger')}</small></span><em>${label}</em>${row.sameNameCandidates.length&&!row.exactPlayerId?`<select data-gc-review="${row.importIndex}"><option value="">Choose match…</option>${row.sameNameCandidates.map(p=>`<option value="existing:${esc(p.id)}">Same player: ${esc(p.name)} #${esc(p.number||'—')}</option>`).join('')}<option value="new">Create separate player</option></select>`:''}</div>`}).join('')}</div>`;
        message.textContent=reviews.length?'Resolve every Needs Review row, then import.':'Everything is ready.';apply.hidden=false;
      }catch(e){parsed=null;apply.hidden=true;preview.innerHTML='';message.textContent=e.message}
    };

    apply.onclick=async()=>{
      if(!parsed)return;
      try{
        const choices=new Map();for(const select of $$('[data-gc-review]',preview)){if(!select.value)throw Error('Choose a match for every player marked Needs Review.');choices.set(Number(select.dataset.gcReview),select.value)}
        apply.disabled=true;message.textContent='Importing GameChanger data…';const chosenPhase=phaseSelect.value;
        await publish(data=>{
          data.rosters||=[];data.playoffRosters||=[];data.playoffStats||=[];
          let sid=seasonSelect.value;
          if(detected){const existing=data.seasons.find(s=>s.name.toLowerCase()===detected.name.toLowerCase());sid=existing?.id||'__create__'}
          if(sid==='__create__'){
            if(!detected)throw Error('Choose an existing season because a season could not be detected from this filename.');
            sid=detected.id;data.seasons.push({id:sid,name:detected.name,status:sid===data.settings.currentSeason?'active':'archived',note:'Imported from GameChanger'});
          }
          const label=data.seasons.find(s=>s.id===sid)?.name||sid;sessionStorage.setItem(K_SEASON,sid);
          const pmap=new Map(data.players.map(p=>[String(p.id),p])),assigned=new Map();
          parsed.forEach(row=>{
            let p=data.players.find(x=>norm(x.name)===row.key&&(!row.number||String(x.number||'').trim()===String(row.number||'').trim()));
            if(!p){const choice=choices.get(row.importIndex);if(choice?.startsWith('existing:'))p=pmap.get(choice.slice(9))}
            if(!p){p={id:uid(),name:row.name,number:row.number||'',position:row.position||'',bats:'',throws:'',bio:'',photo:'',active:sid===data.settings.currentSeason};data.players.push(p);pmap.set(p.id,p)}
            if(chosenPhase==='regular'&&(!p.number||sid===data.settings.currentSeason))p.number=row.number||p.number;if(chosenPhase==='regular'&&(!p.position||sid===data.settings.currentSeason))p.position=row.position||p.position;if(sid===data.settings.currentSeason)p.active=true;assigned.set(row.importIndex,p);
          });
          const grouped=new Map();parsed.forEach(row=>{const p=assigned.get(row.importIndex);if(!grouped.has(p.id))grouped.set(p.id,[]);grouped.get(p.id).push(row)});
          if(chosenPhase==='regular'){
            data.stats=(data.stats||[]).filter(s=>s.season!==sid);data.rosters=(data.rosters||[]).filter(r=>r.season!==sid);
            grouped.forEach((rows,pid)=>{const merged=mergeStats(rows),primary=rows.find(r=>r.number)||rows[0];data.rosters.push({id:uid(),season:sid,player:pid,number:primary.number||'',position:primary.position||'',active:true,source:''});data.stats.push({id:uid(),season:sid,player:pid,bat:merged.bat,pitch:merged.pitch,fielding:merged.fielding,source:`GameChanger · ${label} · Regular season`})});
          }else{
            data.playoffStats=(data.playoffStats||[]).filter(st=>st.season!==sid);data.playoffRosters=(data.playoffRosters||[]).filter(r=>r.season!==sid);
            grouped.forEach((rows,pid)=>{const merged=mergeStats(rows),primary=rows.find(r=>r.number)||rows[0];data.playoffRosters.push({id:uid(),season:sid,player:pid,number:primary.number||'',position:primary.position||'',active:true,source:''});data.playoffStats.push({id:uid(),season:sid,player:pid,bat:merged.bat,pitch:merged.pitch,fielding:merged.fielding,source:`GameChanger · ${label} · Playoffs`})});
          }
        },chosenPhase==='playoffs'?'GameChanger playoff roster and stats imported.':'GameChanger regular-season roster and stats imported.');
        closeEditor();sessionStorage.setItem(K_SECTION,'players');setTimeout(()=>location.reload(),300);
      }catch(e){apply.disabled=false;message.textContent=e.message}
    };
  }

  function seasonTargetFromDetected(data,detected){
    if(!detected)return'';const existing=data.seasons.find(s=>s.name.toLowerCase()===detected.name.toLowerCase());return existing?.id||'__create__';
  }
  function statsRowKey(row){return norm(row.name)+'|'+String(row.number||'').trim()}

  async function openRosterLinkImport(){
    await refreshState();
    const c=showEditor(`
      <div class="jd-import-heading"><span class="eyebrow">HISTORICAL TEAM DATA</span><h2>Import roster + optional stats</h2><p>Paste the NJABL roster link. If you also have the matching stats page, add it below. Spring/Fall and Regular/Playoffs are detected and kept separate so one import cannot silently merge into another.</p></div>
      <div class="jd-import-form">
        <label class="wide">Roster URL<input id="jd-v11-roster-url" type="url" placeholder="https://www.newjerseyabl.com/roster/show/..."></label>
        <details class="jd-roster-paste-fallback"><summary>Roster page blocked? Paste roster rows instead</summary><textarea id="jd-v11-roster-text" rows="5" placeholder="10 | Delso Ramos | OF/DH"></textarea></details>
        <div class="jd-import-divider"><span>OPTIONAL STATS FOR THE SAME SEASON / ROSTER SET</span></div>
        <label class="wide">Stats URL<input id="jd-v11-history-stats-url" type="url" placeholder="https://www.newjerseyabl.com/...stats..."></label>
        <label>Roster / stats set<select id="jd-v11-history-phase"><option value="regular">Regular season</option><option value="playoffs">Playoffs</option></select></label>
        <details class="jd-roster-paste-fallback"><summary>Stats page blocked? Paste one stats table instead</summary><textarea id="jd-v11-history-stats-text" rows="5" placeholder="Player,Number,PA,AB,H,AVG,..."></textarea></details>
        <button class="button" id="jd-v11-history-read" type="button">Read roster & stats</button><p id="jd-v11-history-message"></p><div id="jd-v11-history-review"></div><button class="button" id="jd-v11-history-apply" type="button" hidden>Import & publish</button>
      </div>`);
    if(!c)return;
    const urlInput=$('#jd-v11-roster-url',c),textInput=$('#jd-v11-roster-text',c),statsUrl=$('#jd-v11-history-stats-url',c),statsText=$('#jd-v11-history-stats-text',c),phaseSelect=$('#jd-v11-history-phase',c),read=$('#jd-v11-history-read',c),message=$('#jd-v11-history-message',c),review=$('#jd-v11-history-review',c),apply=$('#jd-v11-history-apply',c);
    let rosterResult=null,statsResult=null,rows=[],statsRows=[],detected=null;

    read.onclick=async()=>{
      try{
        read.disabled=true;apply.hidden=true;review.innerHTML='';message.textContent='Reading historical team data…';
        rosterResult=await api('/api/admin/roster-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:urlInput.value.trim(),text:textInput.value.trim()})});
        rows=rosterResult.players||[];detected=rosterResult.season||null;if(!rows.length)throw Error('No roster players were found.');
        if(rosterResult.phase)phaseSelect.value=rosterResult.phase;

        const wantsStats=Boolean(statsUrl.value.trim()||statsText.value.trim());statsResult=null;statsRows=[];
        if(wantsStats){
          statsResult=await api('/api/admin/stats-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:statsUrl.value.trim(),text:statsText.value.trim()})});
          statsRows=statsResult.players||[];if(!statsRows.length)throw Error('The stats page did not return player statistics.');
          const statsSeason=statsResult.season;
          if(detected&&statsSeason&&norm(detected.name)!==norm(statsSeason.name))throw Error(`Season mismatch: roster is ${detected.name}, but the stats page appears to be ${statsSeason.name}. Nothing was imported.`);
          if(!detected&&statsSeason)detected=statsSeason;
          if(rosterResult.phase&&statsResult.phase&&rosterResult.phase!==statsResult.phase)throw Error(`Roster-set mismatch: the roster page appears to be ${rosterResult.phase==='playoffs'?'Playoffs':'Regular season'}, but the stats page appears to be ${statsResult.phase==='playoffs'?'Playoffs':'Regular season'}. Use matching roster and stats links.`);
          if(statsResult.phase)phaseSelect.value=statsResult.phase;
        }

        rows.forEach((row,index)=>{row.importIndex=index;row.key=norm(row.name);const same=state.data.players.filter(p=>norm(p.name)===row.key),exact=same.find(p=>!row.number||String(p.number||'').trim()===String(row.number||'').trim());row.exactPlayerId=exact?.id||'';row.sameNameCandidates=same});
        statsRows.forEach((row,index)=>{row.importIndex=index;const candidates=rows.filter(r=>norm(r.name)===norm(row.name)),exact=candidates.find(r=>!row.number||!r.number||String(r.number).trim()===String(row.number).trim());row.rosterImportIndex=exact?exact.importIndex:null;row.rosterCandidates=candidates});
        const exact=rows.filter(r=>r.exactPlayerId).length,needs=rows.filter(r=>!r.exactPlayerId&&r.sameNameCandidates.length).length,fresh=rows.length-exact-needs,statsNeeds=statsRows.filter(r=>r.rosterImportIndex===null).length;
        const target=seasonTargetFromDetected(state.data,detected),seasonDisplay=detected?.name||(state.data.seasons.find(s=>s.id===currentSeason())?.name||'Choose season');
        const seasonControl=detected?`<div class="jd-season-lock"><strong>LOCKED TO ${esc(seasonDisplay)}</strong><span>Detected from the league page. This import cannot be redirected into another Spring/Fall season.</span></div><input id="jd-v11-history-season" type="hidden" value="${esc(target)}">`:`<label>Season<select id="jd-v11-history-season">${seasonOptions(currentSeason())}</select></label>`;
        const setName=phaseSelect.value==='playoffs'?'Playoffs':'Regular season';
        review.innerHTML=`${seasonControl}<div class="jd-season-lock ${detected?'':'neutral'}"><strong>${esc(setName.toUpperCase())}</strong><span>The roster and any supplied stats will be imported into this roster set only.</span></div><div class="jd-import-summary"><div><strong>${rows.length}</strong><span>roster players</span></div><div><strong>${exact}</strong><span>profile matches</span></div><div><strong>${fresh}</strong><span>new profiles</span></div><div class="${needs?'needs-review':''}"><strong>${needs}</strong><span>need review</span></div></div>${statsResult?`<div class="jd-stats-link-summary"><strong>${statsRows.length} stats players found · ${statsRows.length-statsNeeds} matched to roster</strong><span>${esc(setName)} · ${esc(statsResult.source||statsUrl.value)}</span></div>`:''}<div class="jd-gc-player-review">${rows.map(row=>{const cls=row.exactPlayerId?'matched':row.sameNameCandidates.length?'review':'new',label=row.exactPlayerId?'MATCHED':row.sameNameCandidates.length?'NEEDS REVIEW':'NEW PLAYER';return`<div class="jd-gc-player-line ${cls}"><b>#${esc(row.number||'—')}</b><span><strong>${esc(row.name)}</strong><small>${esc(row.position||'Position not listed')}</small></span><em>${label}</em>${row.sameNameCandidates.length&&!row.exactPlayerId?`<select data-roster-review="${row.importIndex}"><option value="">Choose match…</option>${row.sameNameCandidates.map(p=>`<option value="existing:${esc(p.id)}">Same player: ${esc(p.name)} #${esc(p.number||'—')}</option>`).join('')}<option value="new">Create separate player</option></select>`:''}</div>`}).join('')}</div>${statsResult&&statsNeeds?`<div class="jd-import-divider"><span>MATCH UNRESOLVED STATS</span></div><div class="jd-gc-player-review">${statsRows.filter(r=>r.rosterImportIndex===null).map(row=>`<div class="jd-gc-player-line review"><b>#${esc(row.number||'—')}</b><span><strong>${esc(row.name)}</strong><small>Stats row was not matched automatically</small></span><em>NEEDS REVIEW</em><select data-history-stats-review="${row.importIndex}"><option value="">Choose roster player…</option>${rows.map(r=>`<option value="${r.importIndex}">#${esc(r.number||'—')} ${esc(r.name)}</option>`).join('')}<option value="__skip__">Skip this stats row</option></select></div>`).join('')}</div>`:''}<div class="jd-link-source"><strong>Roster source</strong><span>${esc(rosterResult.source||urlInput.value.trim()||'Pasted roster')}</span></div>`;
        message.textContent=(needs||statsNeeds)?'Resolve every Needs Review row, then import.':statsResult?'Roster and stats are ready to import.':'Roster is ready. Stats are optional and can also be added later from Tools.';apply.hidden=false;
      }catch(e){rosterResult=null;statsResult=null;rows=[];statsRows=[];message.textContent=e.message;apply.hidden=true}finally{read.disabled=false}
    };

    apply.onclick=async()=>{
      if(!rosterResult||!rows.length)return;
      try{
        const choices=new Map();for(const select of $$('[data-roster-review]',review)){if(!select.value)throw Error('Choose a match for every player marked Needs Review.');choices.set(Number(select.dataset.rosterReview),select.value)}
        const statsChoices=new Map();for(const select of $$('[data-history-stats-review]',review)){if(!select.value)throw Error('Choose a roster player or Skip for every unmatched stats row.');statsChoices.set(Number(select.dataset.historyStatsReview),select.value)}
        const seasonControl=$('#jd-v11-history-season',review);if(!seasonControl)throw Error('Choose the season.');apply.disabled=true;message.textContent='Publishing historical team data…';const chosenPhase=phaseSelect.value;
        await publish(data=>{
          data.rosters||=[];data.playoffRosters||=[];data.playoffStats||=[];let sid=seasonControl.value;
          if(detected){const existing=data.seasons.find(s=>s.name.toLowerCase()===detected.name.toLowerCase());sid=existing?.id||'__create__'}
          if(sid==='__create__'){if(!detected)throw Error('Choose an existing season.');sid=detected.id;data.seasons.push({id:sid,name:detected.name,status:sid===data.settings.currentSeason?'active':'archived',note:'Imported historical roster'})}
          sessionStorage.setItem(K_SEASON,sid);sessionStorage.setItem(K_ROSTER_PHASE,chosenPhase);
          const pmap=new Map(data.players.map(p=>[String(p.id),p])),assigned=new Map();
          rows.forEach(row=>{
            let p=data.players.find(x=>norm(x.name)===row.key&&(!row.number||String(x.number||'').trim()===String(row.number||'').trim()));
            if(!p){const choice=choices.get(row.importIndex);if(choice?.startsWith('existing:'))p=pmap.get(choice.slice(9))}
            if(!p){p={id:uid(),name:row.name,number:row.number||'',position:row.position||'',bats:'',throws:'',bio:'',photo:'',active:sid===data.settings.currentSeason};data.players.push(p);pmap.set(p.id,p)}
            if(chosenPhase==='regular'&&(!p.number||sid===data.settings.currentSeason))p.number=row.number||p.number;
            if(chosenPhase==='regular'&&(!p.position||sid===data.settings.currentSeason))p.position=row.position||p.position;
            if(sid===data.settings.currentSeason)p.active=true;assigned.set(row.importIndex,p)
          });

          const rosterKey=chosenPhase==='playoffs'?'playoffRosters':'rosters';
          data[rosterKey]=(data[rosterKey]||[]).filter(r=>r.season!==sid);
          rows.forEach(row=>{const p=assigned.get(row.importIndex);data[rosterKey].push({id:uid(),season:sid,player:p.id,number:row.number||p.number||'',position:row.position||p.position||'',active:true,source:String(rosterResult.source||urlInput.value.trim()||'')})});

          if(statsResult&&statsRows.length){
            const target=chosenPhase==='playoffs'?'playoffStats':'stats';data[target]=(data[target]||[]).filter(st=>st.season!==sid);
            statsRows.forEach(row=>{let rosterIndex=row.rosterImportIndex;if(rosterIndex===null||rosterIndex===undefined){const chosen=statsChoices.get(row.importIndex);if(chosen==='__skip__'||chosen===undefined)return;rosterIndex=Number(chosen)}const p=assigned.get(Number(rosterIndex));if(!p)return;data[target].push({id:uid(),season:sid,player:p.id,bat:row.bat||{},pitch:row.pitch||{},fielding:row.fielding||{},source:`NJABL · ${chosenPhase==='playoffs'?'Playoffs':'Regular season'} · ${String(statsResult.source||statsUrl.value).slice(0,220)}`})})
          }
        },statsResult?`Historical ${chosenPhase==='playoffs'?'playoff':'regular-season'} roster and stats imported.`:`Historical ${chosenPhase==='playoffs'?'playoff':'regular-season'} roster imported.`);
        closeEditor();sessionStorage.setItem(K_SECTION,'players');setTimeout(()=>location.reload(),300);
      }catch(e){apply.disabled=false;message.textContent=e.message}
    };
  }

  async function openStatsLinkImport(returnTo='players'){
    await refreshState();
    const sid=currentSeason(),season=state.data.seasons.find(s=>s.id===sid),initialPhase=currentRosterPhase();
    const initialRoster=effectiveRoster(state.data,sid,false,initialPhase);
    const c=showEditor(`<div class="jd-import-heading"><span class="eyebrow">${esc(season?.name||'SEASON')} · STATS</span><h2>Add stats from link</h2><p>This adds statistics to the season you are currently viewing. If the link says a different Spring/Fall season, the import stops. Regular season and Playoffs use separate rosters and separate stats.</p></div><div class="jd-import-form"><div class="jd-season-lock"><strong>TARGET: ${esc(season?.name||sid)}</strong><span>The season is locked to what you selected in Players.</span></div><label class="wide">NJABL stats URL<input id="jd-v11-stats-url" type="url" placeholder="https://www.newjerseyabl.com/...stats..."></label><label>Roster / stats set<select id="jd-v11-stats-phase"><option value="regular" ${initialPhase==='regular'?'selected':''}>Regular season</option><option value="playoffs" ${initialPhase==='playoffs'?'selected':''}>Playoffs</option></select></label><details class="jd-roster-paste-fallback"><summary>Page blocked? Paste one stats table instead</summary><textarea id="jd-v11-stats-text" rows="6" placeholder="Player,Number,PA,AB,H,AVG,..."></textarea></details><div class="jd-stats-link-summary"><strong id="jd-v11-stats-roster-count">${initialRoster.length} players in ${esc(phaseLabel(initialPhase))}</strong><span>Stats will match against this roster set.</span></div><button class="button" id="jd-v11-stats-read" type="button">Read stats</button><p id="jd-v11-stats-message"></p><div id="jd-v11-stats-review"></div><button class="button" id="jd-v11-stats-apply" type="button" hidden>Import stats & publish</button></div>`);
    if(!c)return;
    const url=$('#jd-v11-stats-url',c),text=$('#jd-v11-stats-text',c),phase=$('#jd-v11-stats-phase',c),count=$('#jd-v11-stats-roster-count',c),read=$('#jd-v11-stats-read',c),message=$('#jd-v11-stats-message',c),review=$('#jd-v11-stats-review',c),apply=$('#jd-v11-stats-apply',c);let result=null,rows=[];
    const refreshCount=()=>{const r=effectiveRoster(state.data,sid,false,phase.value);if(count)count.textContent=`${r.length} players in ${phaseLabel(phase.value)}`;return r};
    phase.addEventListener('change',()=>{refreshCount();review.innerHTML='';apply.hidden=true;result=null;rows=[]});

    read.onclick=async()=>{
      try{
        read.disabled=true;apply.hidden=true;review.innerHTML='';message.textContent='Reading stats…';
        result=await api('/api/admin/stats-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url.value.trim(),text:text.value.trim()})});
        rows=result.players||[];if(!rows.length)throw Error('No stats rows were found.');
        if(result.season&&norm(result.season.name)!==norm(season?.name||''))throw Error(`Season mismatch: you are viewing ${season?.name}, but this stats page appears to be ${result.season.name}. Change the Players season first. Nothing was imported.`);
        if(result.phase)phase.value=result.phase;
        const chosenPhase=phase.value,roster=refreshCount(),rosterPlayers=roster.map(r=>r.player),matches=new Map();
        rows.forEach((row,i)=>{row.importIndex=i;const same=roster.filter(r=>norm(r.player.name)===norm(row.name));const exact=same.find(r=>!row.number||String(r.number||'').trim()===String(row.number||'').trim());if(exact)matches.set(i,exact.player.id);else if(same.length===1)matches.set(i,same[0].player.id);row.sameRoster=same});
        const needs=rows.filter(r=>!matches.has(r.importIndex)).length;
        review.innerHTML=`<div class="jd-season-lock"><strong>${esc(phaseLabel(chosenPhase).toUpperCase())}</strong><span>Only this roster/stat set will be changed.</span></div><div class="jd-import-summary"><div><strong>${rows.length}</strong><span>stats players</span></div><div><strong>${rows.length-needs}</strong><span>roster matches</span></div><div class="${needs?'needs-review':''}"><strong>${needs}</strong><span>need review</span></div></div><div class="jd-gc-player-review">${rows.map(row=>{const matched=matches.has(row.importIndex);return`<div class="jd-gc-player-line ${matched?'matched':'review'}"><b>#${esc(row.number||'—')}</b><span><strong>${esc(row.name)}</strong><small>${matched?`Matched to ${esc(phaseLabel(chosenPhase))} roster`:`Choose a player, add to ${esc(phaseLabel(chosenPhase))}, or skip`}</small></span><em>${matched?'MATCHED':'NEEDS REVIEW'}</em>${matched?'':`<select data-stats-review="${row.importIndex}"><option value="">Choose player…</option>${rosterPlayers.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}<option value="__new__">Add this player to ${esc(phaseLabel(chosenPhase))} roster</option><option value="__skip__">Skip this stats row</option></select>`}</div>`}).join('')}</div>`;
        rows.forEach(row=>row.matchedPlayerId=matches.get(row.importIndex)||'');message.textContent=needs?'Resolve unmatched rows, then import.':'Stats are ready to import.';apply.hidden=false
      }catch(e){result=null;rows=[];message.textContent=e.message;apply.hidden=true}finally{read.disabled=false}
    };

    apply.onclick=async()=>{
      if(!result||!rows.length)return;
      try{
        const choices=new Map();for(const select of $$('[data-stats-review]',review)){if(!select.value)throw Error('Choose a player, Add to roster, or Skip for every Needs Review row.');choices.set(Number(select.dataset.statsReview),select.value)}
        apply.disabled=true;const chosenPhase=phase.value;message.textContent='Publishing stats…';
        await publish(data=>{
          data.playoffStats||=[];data.playoffRosters||=[];data.rosters||=[];
          const target=chosenPhase==='playoffs'?'playoffStats':'stats',rosterKey=chosenPhase==='playoffs'?'playoffRosters':'rosters';
          data[target]=(data[target]||[]).filter(st=>st.season!==sid);
          rows.forEach(row=>{
            let pid=row.matchedPlayerId||choices.get(row.importIndex);if(!pid||pid==='__skip__')return;
            if(pid==='__new__'){
              let player=data.players.find(p=>norm(p.name)===norm(row.name)&&(!row.number||String(p.number||'').trim()===String(row.number||'').trim()));
              if(!player){player={id:uid(),name:row.name,number:row.number||'',position:'',bats:'',throws:'',bio:'',photo:'',active:sid===data.settings.currentSeason};data.players.push(player)}
              pid=player.id;
              if(!data[rosterKey].some(r=>r.season===sid&&String(r.player)===String(pid)))data[rosterKey].push({id:uid(),season:sid,player:pid,number:row.number||player.number||'',position:player.position||'',active:true,source:''})
            }
            data[target].push({id:uid(),season:sid,player:pid,bat:row.bat||{},pitch:row.pitch||{},fielding:row.fielding||{},source:`NJABL · ${chosenPhase==='playoffs'?'Playoffs':'Regular season'} · ${String(result.source||url.value).slice(0,220)}`})
          });
        },`${chosenPhase==='playoffs'?'Playoff':'Regular-season'} stats imported for ${season?.name||'this season'}.`);
        sessionStorage.setItem(K_ROSTER_PHASE,chosenPhase);closeEditor();if(returnTo==='stats'){sessionStorage.setItem(K_SECTION,'stats');await refreshState();renderStatsAdmin()}else{sessionStorage.setItem(K_SECTION,'players');setTimeout(()=>location.reload(),300)}
      }catch(e){apply.disabled=false;message.textContent=e.message}
    };
  }

  async function openSupplied(){
    const c=showEditor(`<div class="jd-import-heading"><span class="eyebrow">SUPPLIED HISTORY</span><h2>GameChanger files already provided</h2><p>These are the two actual exports you sent in this chat. Review player matching before the live database is changed.</p></div><div class="jd-supplied-history-list"><button data-history-url="/jd-history/spring-2025.csv" data-history-name="Jersey Dodgers Spring 2025 Stats.csv" type="button"><strong>Spring 2025</strong><span>25 player rows</span></button><button data-history-url="/jd-history/fall-2025.csv" data-history-name="Jersey Dodgers Fall 2025 Stats.csv" type="button"><strong>Fall 2025</strong><span>31 player rows</span></button></div><p class="jd-import-note">For Spring 2026, Fall 2024, or any other season, use Upload GameChanger CSV when you have that file.</p>`);
    if(!c)return;
    $$('[data-history-url]',c).forEach(b=>b.onclick=async()=>{try{b.disabled=true;const r=await fetch(b.dataset.historyUrl,{cache:'no-store'});if(!r.ok)throw Error('The supplied history file could not be opened.');const text=await r.text();closeEditor();await openGameChanger({filename:b.dataset.historyName,text})}catch(e){b.disabled=false;setStatus(e.message,true)}});
  }

  function autoColumn(headers,patterns){
    const low=headers.map(h=>String(h||'').toLowerCase());
    for(const words of patterns){const i=low.findIndex(v=>words.every(w=>v.includes(w)));if(i>=0)return i}
    return-1;
  }
  function mappingOptions(headers,selected=-1,none=true){return`${none?'<option value="-1">Not included</option>':''}${headers.map((h,i)=>`<option value="${i}" ${i===selected?'selected':''}>${esc(h||`Column ${i+1}`)}</option>`).join('')}`}

  async function openJerseyImport(){
    await refreshState();
    const c=showEditor(`<div class="jd-import-heading"><span class="eyebrow">JERSEY HISTORY</span><h2>Import old Google Form / Sheet CSV</h2><p>Export the old responses as CSV. Only player name, jersey number, season/year, jersey size and notes are saved. Email/phone columns are ignored.</p></div><label>CSV file<input type="file" id="jd-v9-jersey-file" accept=".csv,text/csv"></label><div id="jd-v9-map"></div><div id="jd-v9-jersey-preview"></div><p id="jd-v9-jersey-message"></p><button class="button" id="jd-v9-jersey-review" type="button">Review import</button><button class="button" id="jd-v9-jersey-apply" type="button" hidden>Import jersey history</button>`);
    if(!c)return;
    const file=$('#jd-v9-jersey-file',c),map=$('#jd-v9-map',c),preview=$('#jd-v9-jersey-preview',c),message=$('#jd-v9-jersey-message',c),apply=$('#jd-v9-jersey-apply',c);let rows=[],headers=[],records=[];
    file.onchange=async()=>{const f=file.files?.[0];if(!f)return;rows=parseCSV(await f.text());if(rows.length<2){message.textContent='This CSV does not contain response rows.';return}headers=rows[0].map(h=>String(h||'').trim());const nc=autoColumn(headers,[['player','name'],['full','name'],['name']]),jc=autoColumn(headers,[['jersey','number'],['desired','number'],['number']]),sc=autoColumn(headers,[['season']]),yc=autoColumn(headers,[['year'],['timestamp'],['date']]),zc=autoColumn(headers,[['jersey','size'],['shirt','size'],['size']]),oc=autoColumn(headers,[['note'],['comment']]);map.innerHTML=`<div class="jd-column-mapping"><label>Player name<select id="jd-map-name">${mappingOptions(headers,nc,false)}</select></label><label>Jersey number<select id="jd-map-number">${mappingOptions(headers,jc,false)}</select></label><label>Season<select id="jd-map-season">${mappingOptions(headers,sc,true)}</select></label><label>Year / timestamp<select id="jd-map-year">${mappingOptions(headers,yc,true)}</select></label><label>Jersey size<select id="jd-map-size">${mappingOptions(headers,zc,true)}</select></label><label>Notes<select id="jd-map-notes">${mappingOptions(headers,oc,true)}</select></label><label>Default season<select id="jd-map-default"><option value="">No default season</option>${seasonOptions(currentSeason())}</select></label></div>`;message.textContent='Columns detected. Adjust anything that looks wrong, then Review import.';preview.innerHTML='';apply.hidden=true};

    $('#jd-v9-jersey-review',c).onclick=()=>{
      try{
        if(!headers.length)throw Error('Choose a CSV first.');
        const n=Number($('#jd-map-name',map).value),j=Number($('#jd-map-number',map).value),s=Number($('#jd-map-season',map).value),y=Number($('#jd-map-year',map).value),z=Number($('#jd-map-size',map).value),o=Number($('#jd-map-notes',map).value),defaultSeason=$('#jd-map-default',map).value;
        if(n<0||j<0)throw Error('Choose the Player name and Jersey number columns.');
        records=[];
        for(const row of rows.slice(1)){
          const playerName=String(row[n]||'').trim(),raw=String(row[j]||'').trim();if(!playerName||!raw)continue;
          const m=raw.match(/\b\d{1,3}\b/),number=m?m[0]:raw.slice(0,10),seasonText=s>=0?String(row[s]||'').trim():'',matched=state.data.seasons.find(ss=>norm(ss.name)===norm(seasonText)),sid=matched?.id||defaultSeason||'';
          const yearText=y>=0?String(row[y]||'').trim():'',yr=String(yearOf(matched)||Number(yearText.match(/\b(20\d{2})\b/)?.[1]||0)||Number(seasonText.match(/\b(20\d{2})\b/)?.[1]||0)||new Date().getFullYear());
          const matches=state.data.players.filter(p=>norm(p.name)===norm(playerName));
          records.push({player:matches.length===1?matches[0].id:'',playerName,number,season:sid,year:yr,jerseySize:z>=0?String(row[z]||'').trim():'',source:'Imported jersey / Google Form CSV',notes:o>=0?String(row[o]||'').trim():''});
        }
        if(!records.length)throw Error('No rows with both a player name and jersey number were found.');
        preview.innerHTML=`<div class="jd-jersey-import-preview"><strong>${records.length} jersey records ready</strong>${records.slice(0,12).map(r=>`<span><b>#${esc(r.number)}</b> ${esc(r.playerName)} · ${esc(r.season?(state.data.seasons.find(s=>s.id===r.season)?.name||r.year):r.year)}${r.jerseySize?` · ${esc(r.jerseySize)}`:''}</span>`).join('')}${records.length>12?`<small>+ ${records.length-12} more</small>`:''}</div>`;message.textContent='Ready. Duplicate history rows will be skipped.';apply.hidden=false;
      }catch(e){message.textContent=e.message;apply.hidden=true}
    };

    apply.onclick=async()=>{
      try{
        if(!records.length)throw Error('Review the CSV first.');apply.disabled=true;
        await publish(data=>{data.jerseyRecords||=[];const existing=new Set(data.jerseyRecords.map(r=>[r.player||norm(r.playerName),r.number,r.season||'',r.year||'',r.source||''].join('|')));records.forEach(r=>{const k=[r.player||norm(r.playerName),r.number,r.season||'',r.year||'',r.source].join('|');if(existing.has(k))return;data.jerseyRecords.push({id:uid(),...r});existing.add(k)})},'Jersey-number history imported.');
        closeEditor();await refreshState();
      }catch(e){apply.disabled=false;message.textContent=e.message}
    };
  }

  const STAT_FIELDS={
    bat:['GP','PA','AB','H','1B','2B','3B','HR','RBI','R','BB','SO','HBP','SF','SB','CS','AVG','OBP','SLG','OPS'],
    pitch:['GP','GS','IP','W','L','SV','H','R','ER','BB','SO','HBP','HR','ERA','WHIP'],
    fielding:['INN','TC','PO','A','E','DP','FPCT']
  };

  function statText(value){return value===undefined||value===null||value===''?'—':String(value)}
  function statGroupHasValues(group={}){return Object.values(group||{}).some(v=>v!==''&&v!==undefined&&v!==null&&v!=='-')}

  async function renderStatsAdmin(){
    if(renderingStats||!activeStats())return;renderingStats=true;
    try{
      await refreshState();if(!activeStats())return;
      const sid=currentSeason(),phase=currentRosterPhase(),season=state.data.seasons.find(s=>s.id===sid),phaseName=phaseLabel(phase),content=$('#section-content');
      if(!content)return;
      sessionStorage.setItem(K_SEASON,sid);sessionStorage.setItem(K_ROSTER_PHASE,phase);sessionStorage.setItem(K_SECTION,'stats');
      const roster=effectiveRoster(state.data,sid,false,phase),stats=statsList(state.data,phase).filter(st=>st.season===sid),statMap=new Map(stats.map(st=>[String(st.player),st]));
      const rows=roster.map(r=>({roster:r,stat:statMap.get(String(r.playerId))||null}));
      const withStats=rows.filter(x=>x.stat).length;
      content.innerHTML=`
        <div class="jd-stats-admin-head">
          <div><span class="eyebrow">TEAM STATS</span><h2>${esc(season?.name||'Season')}</h2><p>Pick a season once, then manage every player’s stats together. Imports match the full roster instead of creating separate stat sheets one at a time.</p></div>
          <div class="jd-stats-admin-selectors">
            <label><span>Season</span><select id="jd-v111-stats-season">${seasonOptions(sid)}</select></label>
            <label><span>Stats set</span><select id="jd-v111-stats-phase"><option value="regular" ${phase==='regular'?'selected':''}>Regular season</option><option value="playoffs" ${phase==='playoffs'?'selected':''}>Playoffs</option></select></label>
          </div>
        </div>
        <div class="jd-stats-import-bar">
          <button class="button" id="jd-v111-stats-gc" type="button">Upload GameChanger CSV</button>
          <button class="button secondary" id="jd-v111-stats-link" type="button">Add NJABL stats link</button>
          <div class="jd-stats-admin-count"><strong>${withStats}/${rows.length}</strong><span>players with ${phase==='playoffs'?'playoff':'regular-season'} stats</span></div>
        </div>
        <div class="jd-stats-admin-table-wrap">
          ${rows.length?`<table class="jd-stats-admin-table"><thead><tr><th>PLAYER</th><th>#</th><th>GP</th><th>PA</th><th>AVG</th><th>HR</th><th>RBI</th><th>IP</th><th>ERA</th><th>SO</th><th></th></tr></thead><tbody>${rows.map(({roster:r,stat})=>`<tr class="${stat?'has-stats':'no-stats'}"><td><div class="jd-stats-player">${r.player.photo?`<img src="${esc(r.player.photo)}" alt="">`:`<span>#${esc(r.number||'—')}</span>`}<div><strong>${esc(r.player.name)}</strong><small>${esc(r.position||'Position not set')}</small></div></div></td><td>#${esc(r.number||'—')}</td><td>${esc(statText(stat?.bat?.GP??stat?.pitch?.GP))}</td><td>${esc(statText(stat?.bat?.PA))}</td><td>${esc(statText(stat?.bat?.AVG))}</td><td>${esc(statText(stat?.bat?.HR))}</td><td>${esc(statText(stat?.bat?.RBI))}</td><td>${esc(statText(stat?.pitch?.IP))}</td><td>${esc(statText(stat?.pitch?.ERA))}</td><td>${esc(statText(stat?.pitch?.SO))}</td><td><button class="jd-stat-edit" data-stat-edit="${esc(r.playerId)}" type="button">${stat?'Edit':'Add stats'}</button></td></tr>`).join('')}</tbody></table>`:`<div class="jd-empty-season-roster"><strong>No players in ${esc(season?.name||'this season')} · ${esc(phaseName)}.</strong><p>Add or import the roster first. Stats are matched to the players in that roster set.</p></div>`}
        </div>`;
      $('#jd-v111-stats-season')?.addEventListener('change',e=>{sessionStorage.setItem(K_SEASON,e.target.value);renderStatsAdmin()});
      $('#jd-v111-stats-phase')?.addEventListener('change',e=>{sessionStorage.setItem(K_ROSTER_PHASE,e.target.value==='playoffs'?'playoffs':'regular');renderStatsAdmin()});
      $('#jd-v111-stats-gc')?.addEventListener('click',()=>openGameChangerStatsOnly());
      $('#jd-v111-stats-link')?.addEventListener('click',()=>openStatsLinkImport('stats'));
      $$('[data-stat-edit]',content).forEach(button=>button.addEventListener('click',()=>openManualStatsEditor(button.dataset.statEdit,sid,phase)));
    }catch(e){setStatus(e.message,true)}finally{renderingStats=false}
  }

  function statFieldsMarkup(group,record={}){
    return `<div class="jd-stat-field-grid">${STAT_FIELDS[group].map(key=>`<label><span>${esc(key)}</span><input data-stat-field data-group="${group}" data-key="${esc(key)}" inputmode="decimal" value="${esc(record?.[key]??'')}"></label>`).join('')}</div>`;
  }

  async function openManualStatsEditor(playerId,sid=currentSeason(),phase=currentRosterPhase()){
    await refreshState();
    const player=state.data.players.find(p=>String(p.id)===String(playerId)),season=state.data.seasons.find(s=>s.id===sid),list=statsList(state.data,phase),record=list.find(st=>st.season===sid&&String(st.player)===String(playerId));
    const roster=effectiveRoster(state.data,sid,true,phase).find(r=>String(r.playerId)===String(playerId));
    if(!player)return;
    const c=showEditor(`<div class="jd-import-heading"><span class="eyebrow">${esc(season?.name||'SEASON')} · ${esc(phaseLabel(phase).toUpperCase())}</span><h2>${esc(player.name)} stats</h2><p>Edit one player manually without touching anyone else. Blank values stay blank.</p></div><div class="jd-manual-stats-player">${player.photo?`<img src="${esc(player.photo)}" alt="">`:`<span>#${esc(roster?.number||player.number||'—')}</span>`}<div><strong>${esc(player.name)}</strong><small>#${esc(roster?.number||player.number||'—')} · ${esc(roster?.position||player.position||'')}</small></div></div><form id="jd-v111-stat-form"><section><h3>Batting</h3>${statFieldsMarkup('bat',record?.bat||{})}</section><section><h3>Pitching</h3>${statFieldsMarkup('pitch',record?.pitch||{})}</section><section><h3>Fielding</h3>${statFieldsMarkup('fielding',record?.fielding||{})}</section><p class="form-message" role="status"></p><div class="form-actions"><button class="button" type="submit">Save stats</button>${record?'<button class="danger" id="jd-v111-delete-stats" type="button">Delete these stats</button>':''}<button id="jd-v111-cancel-stats" type="button">Cancel</button></div></form>`);
    if(!c)return;const form=$('#jd-v111-stat-form',c),message=$('.form-message',form);
    $('#jd-v111-cancel-stats',form)?.addEventListener('click',closeEditor);
    $('#jd-v111-delete-stats',form)?.addEventListener('click',async()=>{if(!confirm(`Delete ${player.name}'s ${phaseLabel(phase).toLowerCase()} stats for ${season?.name||'this season'}? The roster profile stays saved.`))return;try{await publish(data=>{const key=phase==='playoffs'?'playoffStats':'stats';data[key]=(data[key]||[]).filter(st=>!(st.season===sid&&String(st.player)===String(playerId)))},`${player.name} stats deleted.`);closeEditor();await refreshState();renderStatsAdmin()}catch(err){message.textContent=err.message}});
    form.addEventListener('submit',async e=>{e.preventDefault();try{const groups={bat:{...(record?.bat||{})},pitch:{...(record?.pitch||{})},fielding:{...(record?.fielding||{})}};$$('[data-stat-field]',form).forEach(input=>{const value=String(input.value||'').trim();if(value)groups[input.dataset.group][input.dataset.key]=value;else delete groups[input.dataset.group][input.dataset.key]});await publish(data=>{const key=phase==='playoffs'?'playoffStats':'stats';data[key]||=[];let saved=data[key].find(st=>st.season===sid&&String(st.player)===String(playerId));if(!saved){saved={id:uid(),season:sid,player:playerId,bat:{},pitch:{},fielding:{},source:'Manual Admin'};data[key].push(saved)}saved.bat=groups.bat;saved.pitch=groups.pitch;saved.fielding=groups.fielding;saved.source=record?.source||'Manual Admin'},`${player.name} stats saved.`);closeEditor();await refreshState();renderStatsAdmin()}catch(err){message.textContent=err.message}});
  }

  async function openGameChangerStatsOnly(){
    await refreshState();
    let targetSid=currentSeason(),targetPhase=currentRosterPhase(),filename='',text='',detected=null;
    const c=showEditor(`<div class="jd-import-heading"><span class="eyebrow">GAMECHANGER · STATS ONLY</span><h2>Import season stats</h2><p>Upload one GameChanger team stats CSV. The filename is used to detect Spring/Fall and playoffs. This updates the stats for the detected season without replacing an already-managed roster.</p></div><div class="jd-import-form"><label class="wide">GameChanger CSV<input type="file" id="jd-v111-gc-stats-file" accept=".csv,text/csv"></label><label>Stats set<select id="jd-v111-gc-stats-phase"><option value="regular" ${targetPhase==='regular'?'selected':''}>Regular season</option><option value="playoffs" ${targetPhase==='playoffs'?'selected':''}>Playoffs</option></select></label><div id="jd-v111-gc-stats-target" class="jd-season-lock neutral"><strong>TARGET: ${esc(state.data.seasons.find(s=>s.id===targetSid)?.name||targetSid)} · ${esc(phaseLabel(targetPhase))}</strong><span>Choose a file to detect its season.</span></div><p id="jd-v111-gc-stats-message"></p><div id="jd-v111-gc-stats-preview"></div><div class="jd-import-actions"><button class="button" id="jd-v111-gc-stats-review" type="button">Review import</button><button class="button" id="jd-v111-gc-stats-apply" type="button" hidden>Import stats & publish</button></div></div>`);
    if(!c)return;
    const file=$('#jd-v111-gc-stats-file',c),phaseSelect=$('#jd-v111-gc-stats-phase',c),target=$('#jd-v111-gc-stats-target',c),message=$('#jd-v111-gc-stats-message',c),preview=$('#jd-v111-gc-stats-preview',c),reviewButton=$('#jd-v111-gc-stats-review',c),apply=$('#jd-v111-gc-stats-apply',c);let parsed=null,matches=new Map();
    const resolveTarget=()=>{detected=seasonFromFilename(filename);targetPhase=phaseSelect?.value==='playoffs'?'playoffs':'regular';if(detected){const existing=state.data.seasons.find(s=>norm(s.name)===norm(detected.name));if(!existing)throw Error(`${detected.name} is not created yet. Import that roster first, then upload its stats.`);targetSid=existing.id}const season=state.data.seasons.find(s=>s.id===targetSid);target.innerHTML=`<strong>TARGET: ${esc(season?.name||targetSid)} · ${esc(phaseLabel(targetPhase))}</strong><span>${detected?'Detected from the filename and locked automatically.':'Season could not be detected, so the currently selected Stats season will be used.'}</span>`;};
    file.addEventListener('change',async()=>{const f=file.files?.[0];if(!f)return;filename=f.name;text=await f.text();if(/playoff|postseason|post-season/i.test(filename))phaseSelect.value='playoffs';parsed=null;preview.innerHTML='';apply.hidden=true;try{resolveTarget();message.textContent=detected?`Detected ${detected.name} · ${phaseLabel(targetPhase)}.`:'Season name was not found in the filename. The selected Stats season will be used.'}catch(err){message.textContent=err.message}});
    phaseSelect?.addEventListener('change',()=>{try{resolveTarget();preview.innerHTML='';apply.hidden=true;message.textContent=`Target set changed to ${phaseLabel(targetPhase)}.`}catch(err){message.textContent=err.message}});
    reviewButton.onclick=()=>{try{if(!text)throw Error('Choose a GameChanger CSV first.');resolveTarget();parsed=parseGameChanger(text);const roster=effectiveRoster(state.data,targetSid,false,targetPhase),rosterPlayers=roster.map(r=>r.player),byName=new Map();roster.forEach(r=>{const key=norm(r.player.name);if(!byName.has(key))byName.set(key,[]);byName.get(key).push(r)});matches=new Map();parsed.forEach(row=>{const same=byName.get(row.key)||[],exact=same.find(r=>row.number&&String(r.number||'').trim()===String(row.number||'').trim());if(exact)matches.set(row.importIndex,exact.player.id);else if(same.length===1)matches.set(row.importIndex,same[0].player.id)});const needs=parsed.filter(row=>!matches.has(row.importIndex)).length;preview.innerHTML=`<div class="jd-import-summary"><div><strong>${parsed.length}</strong><span>CSV rows</span></div><div><strong>${parsed.length-needs}</strong><span>roster matches</span></div><div class="${needs?'needs-review':''}"><strong>${needs}</strong><span>need review</span></div></div><div class="jd-gc-player-review">${parsed.map(row=>{const pid=matches.get(row.importIndex),matched=Boolean(pid),matchedPlayer=state.data.players.find(p=>String(p.id)===String(pid));return`<div class="jd-gc-player-line ${matched?'matched':'review'}"><b>#${esc(row.number||'—')}</b><span><strong>${esc(row.name)}</strong><small>${matched?`Matched to ${esc(matchedPlayer?.name||'roster player')}`:'Choose the correct roster player, add a new one, or skip'}</small></span><em>${matched?'MATCHED':'NEEDS REVIEW'}</em>${matched?'':`<select data-v111-gc-stat-review="${row.importIndex}"><option value="">Choose player…</option>${rosterPlayers.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}<option value="__new__">Add this player to roster</option><option value="__skip__">Skip this row</option></select>`}</div>`}).join('')}</div>`;message.textContent=needs?'Resolve the unmatched rows, then import.':'All rows matched. Ready to import.';apply.hidden=false}catch(err){parsed=null;apply.hidden=true;preview.innerHTML='';message.textContent=err.message}};
    apply.onclick=async()=>{if(!parsed)return;try{const choices=new Map();for(const select of $$('[data-v111-gc-stat-review]',preview)){if(!select.value)throw Error('Resolve every unmatched GameChanger row.');choices.set(Number(select.dataset.v111GcStatReview),select.value)}apply.disabled=true;await publish(data=>{const statsKey=targetPhase==='playoffs'?'playoffStats':'stats',rosterKey=targetPhase==='playoffs'?'playoffRosters':'rosters';data[statsKey]||=[];data[rosterKey]||=[];const assigned=new Map(),pmap=new Map(data.players.map(p=>[String(p.id),p]));parsed.forEach(row=>{let pid=matches.get(row.importIndex)||choices.get(row.importIndex);if(!pid||pid==='__skip__')return;if(pid==='__new__'){let saved=data.players.find(p=>norm(p.name)===row.key);if(!saved){saved={id:uid(),name:row.name,number:row.number||'',position:row.position||'',bats:'',throws:'',bio:'',photo:'',active:targetSid===data.settings.currentSeason};data.players.push(saved);pmap.set(saved.id,saved)}pid=saved.id;if(!data[rosterKey].some(r=>r.season===targetSid&&String(r.player)===String(pid)))data[rosterKey].push({id:uid(),season:targetSid,player:pid,number:row.number||saved.number||'',position:row.position||saved.position||'',active:true,source:''})}assigned.set(row.importIndex,pid)});const grouped=new Map();parsed.forEach(row=>{const pid=assigned.get(row.importIndex);if(!pid)return;if(!grouped.has(pid))grouped.set(pid,[]);grouped.get(pid).push(row)});data[statsKey]=(data[statsKey]||[]).filter(st=>st.season!==targetSid);const label=data.seasons.find(s=>s.id===targetSid)?.name||targetSid;grouped.forEach((rows,pid)=>{const merged=mergeStats(rows);data[statsKey].push({id:uid(),season:targetSid,player:pid,bat:merged.bat,pitch:merged.pitch,fielding:merged.fielding,source:`GameChanger · ${label} · ${targetPhase==='playoffs'?'Playoffs':'Regular season'}`})})},`GameChanger stats imported for ${state.data.seasons.find(s=>s.id===targetSid)?.name||'season'} · ${phaseLabel(targetPhase)}.`);sessionStorage.setItem(K_SEASON,targetSid);sessionStorage.setItem(K_ROSTER_PHASE,targetPhase);sessionStorage.setItem(K_SECTION,'stats');closeEditor();await refreshState();renderStatsAdmin()}catch(err){apply.disabled=false;message.textContent=err.message}};
  }


  function tool(name){
    if(name==='gamechanger')return openGameChanger();
    if(name==='supplied')return openSupplied();
    if(name==='roster-link')return openRosterLinkImport();
    if(name==='stats-link')return openStatsLinkImport();
    if(name==='reset-season')return resetSeason();
    if(name==='number')return openNumberChecker();
    if(name==='jersey')return openJerseyImport();
    if(name==='removed'){sessionStorage.setItem(K_REMOVED,sessionStorage.getItem(K_REMOVED)==='1'?'0':'1');return renderPlayers()}
  }

  function hideLegacyStatsImporter(){
    const oldImport=$('#import-csv');
    if(oldImport)oldImport.remove();
  }

  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-section]');
    if(nav&&!nav.matches('[data-section="players"],[data-section="stats"]'))sessionStorage.removeItem(K_SECTION);

    if(e.target.closest('[data-section="players"]')){sessionStorage.setItem(K_SECTION,'players');[80,180,350].forEach(d=>setTimeout(renderPlayers,d));return}
    if(e.target.closest('[data-section="stats"]')){sessionStorage.setItem(K_SECTION,'stats');[80,180,350].forEach(d=>setTimeout(()=>{hideLegacyStatsImporter();renderStatsAdmin()},d));return}

    const tools=$('.jd-player-tools');if(tools&&!tools.contains(e.target)){const menu=$('#jd-v11-tools-menu',tools),toggle=$('#jd-v11-tools-toggle',tools);menu?.setAttribute('hidden','');toggle?.setAttribute('aria-expanded','false')}
    const t=e.target.closest('[data-team-tool]');if(t){e.preventDefault();const menu=$('#jd-v11-tools-menu');const toggle=$('#jd-v11-tools-toggle');menu?.setAttribute('hidden','');toggle?.setAttribute('aria-expanded','false');tool(t.dataset.teamTool);return}
    const a=e.target.closest('[data-team-action]');if(a){e.preventDefault();const id=a.dataset.player;if(a.dataset.teamAction==='edit')openPlayerEditor(id,currentSeason(),currentRosterPhase());if(a.dataset.teamAction==='remove')setRosterActive(id,false);if(a.dataset.teamAction==='restore')setRosterActive(id,true);if(a.dataset.teamAction==='delete-season')deleteSeasonPlayer(id)}
  });

  function restore(){
    if(restored)return;
    const section=sessionStorage.getItem(K_SECTION);if(!['players','stats'].includes(section))return;
    const b=$(`[data-section="${section}"]`);if(!b)return;restored=true;b.click();
  }
  [800,1300,2100,3200].forEach(d=>setTimeout(restore,d));
})();
