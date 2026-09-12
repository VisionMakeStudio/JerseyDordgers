(() => {
  'use strict';

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>crypto.randomUUID();
  const K_SECTION='jd-v9-section',K_SEASON='jd-v9-player-season',K_REMOVED='jd-v9-show-removed';
  let state=null,rendering=false,restored=false;

  async function api(url,options={}){
    const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    let body={};try{body=await r.json()}catch{}
    if(!r.ok)throw Error(body.error||'Request failed.');
    return body;
  }
  async function refreshState(){state=await api('/api/admin/content');state.data.rosters||=[];state.data.jerseyRecords||=[];return state;}
  function setStatus(text,error=false){const n=$('#status');if(n){n.textContent=text;n.className=error?'error':'success';}}
  function active(){return Boolean($('[data-section="players"].active'));}
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
  function numVal(v){const m=String(v||'').match(/\d+/);return m?Number(m[0]):9999;}

  function effectiveRoster(data,sid,includeRemoved=false){
    const pmap=new Map((data.players||[]).map(p=>[String(p.id),p]));
    const explicit=(data.rosters||[]).filter(r=>r.season===sid),represented=new Set(explicit.map(r=>String(r.player)));
    const rows=explicit.map(r=>{const p=pmap.get(String(r.player));return p?{rosterId:r.id,playerId:p.id,player:p,number:r.number||p.number||'',position:r.position||p.position||'',active:r.active!==false,inferred:false}:null;}).filter(Boolean);
    (data.stats||[]).filter(s=>s.season===sid&&!represented.has(String(s.player))).forEach(s=>{const p=pmap.get(String(s.player));if(p)rows.push({rosterId:'',playerId:p.id,player:p,number:p.number||'',position:p.position||'',active:true,inferred:true});});
    return rows.filter(r=>includeRemoved||r.active).sort((a,b)=>numVal(a.number)-numVal(b.number)||String(a.player.name).localeCompare(String(b.player.name)));
  }

  function numberUsages(data,number){
    const wanted=String(number||'').trim();if(!wanted)return[];
    const pmap=new Map((data.players||[]).map(p=>[String(p.id),p])),smap=new Map((data.seasons||[]).map(s=>[String(s.id),s])),seenPairs=new Set(),out=[];
    (data.rosters||[]).forEach(r=>{seenPairs.add(`${r.season}:${r.player}`);if(r.active===false||String(r.number||'').trim()!==wanted)return;const p=pmap.get(String(r.player)),s=smap.get(String(r.season));out.push({playerId:p?.id||'',playerName:p?.name||'Unknown player',seasonName:s?.name||r.season,year:yearOf(s),source:r.source?'Imported roster link':'Roster',sourceUrl:r.source||''});});
    (data.stats||[]).forEach(s=>{const key=`${s.season}:${s.player}`;if(seenPairs.has(key))return;const p=pmap.get(String(s.player));if(!p||String(p.number||'').trim()!==wanted)return;const season=smap.get(String(s.season));out.push({playerId:p.id,playerName:p.name,seasonName:season?.name||s.season,year:yearOf(season),source:'Imported stats (legacy)'});});
    (data.jerseyRecords||[]).forEach(j=>{if(String(j.number||'').trim()!==wanted)return;const p=j.player?pmap.get(String(j.player)):null,s=j.season?smap.get(String(j.season)):null;out.push({playerId:p?.id||j.player||'',playerName:p?.name||j.playerName||'Unknown player',seasonName:s?.name||(j.year?`Jersey record · ${j.year}`:'Jersey record'),year:Number(j.year||yearOf(s)||0),source:j.source||'Jersey history',jerseySize:j.jerseySize||''});});
    const seen=new Set();return out.filter(u=>{const k=[u.playerId||norm(u.playerName),u.seasonName,u.source].join('|');if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>(b.year||0)-(a.year||0)||String(a.playerName).localeCompare(String(b.playerName)));
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
    const latest=await api('/api/admin/content');latest.data.rosters||=[];latest.data.jerseyRecords||=[];await mutator(latest.data);
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
      const sid=currentSeason();sessionStorage.setItem(K_SEASON,sid);
      const showRemoved=sessionStorage.getItem(K_REMOVED)==='1',rows=effectiveRoster(state.data,sid,showRemoved),activeRows=effectiveRoster(state.data,sid,false),season=state.data.seasons.find(s=>s.id===sid),content=$('#section-content');if(!content)return;
      content.innerHTML=`<div class="jd-players-toolbar"><button class="button" id="jd-v9-add-player" type="button">+ Add player</button><details class="jd-player-tools"><summary>Tools</summary><div><button data-team-tool="gamechanger" type="button">Upload GameChanger CSV</button><button data-team-tool="supplied" type="button">Import supplied history</button><button data-team-tool="roster-link" type="button">Import roster from link</button><button data-team-tool="number" type="button">Check jersey number</button><button data-team-tool="jersey" type="button">Import jersey / Google Form CSV</button><button data-team-tool="removed" type="button">${showRemoved?'Hide removed players':'Show removed players'}</button></div></details><label class="jd-player-season-picker"><span>Season</span><select id="jd-v9-season">${seasonOptions(sid)}</select></label></div>
      <div class="jd-season-roster-summary"><div><span class="eyebrow">${esc(season?.name||'SEASON')}</span><strong>${activeRows.length}</strong><small>${activeRows.length===1?'player':'players'} on this roster</small></div><p>Player profiles are permanent. Jersey number and position belong to this season, so old rosters stay accurate.</p></div>
      <div class="jd-season-player-list">${rows.length?rows.map(r=>`<article class="jd-season-player-row ${r.active?'':'is-removed'}"><div class="jd-season-player-thumb">${r.player.photo?`<img src="${esc(r.player.photo)}" alt="">`:`<span>${esc(r.number||'—')}</span>`}</div><div class="jd-season-player-number">#${esc(r.number||'—')}</div><div class="jd-season-player-copy"><strong>${esc(r.player.name)}</strong><span>${esc(r.position||'Position not set')}${r.inferred?' · Imported before season rosters':''}${!r.active?' · Removed from this season':''}</span></div><details class="jd-team-actions"><summary>Actions</summary><div><button data-team-action="edit" data-player="${esc(r.playerId)}" type="button">Edit player</button><button data-team-action="${r.active?'remove':'restore'}" data-player="${esc(r.playerId)}" type="button">${r.active?`Remove from ${esc(season?.name||'season')}`:`Restore to ${esc(season?.name||'season')}`}</button><a href="/roster/${encodeURIComponent(r.playerId)}/?season=${encodeURIComponent(sid)}" target="_blank" rel="noopener">View public profile</a></div></details></article>`).join(''):`<div class="jd-empty-season-roster"><strong>No players in ${esc(season?.name||'this season')} yet.</strong><p>Add a player manually or use GameChanger import. An empty season stays empty on the public roster.</p></div>`}</div>`;
      $('#jd-v9-season')?.addEventListener('change',e=>{sessionStorage.setItem(K_SEASON,e.target.value);renderPlayers()});
      $('#jd-v9-add-player')?.addEventListener('click',()=>openPlayerEditor('',sid));
    }catch(e){setStatus(e.message,true)}finally{rendering=false}
  }

  async function openPlayerEditor(playerId='',sid=currentSeason()){
    await refreshState();const data=state.data,player=playerId?data.players.find(p=>String(p.id)===String(playerId)):null;
    let roster=(data.rosters||[]).find(r=>r.season===sid&&String(r.player)===String(playerId));
    if(!roster&&player&&data.stats.some(s=>s.season===sid&&String(s.player)===String(playerId)))roster={number:player.number||'',position:player.position||'',active:true};
    const profiles=[...data.players].sort((a,b)=>String(a.name).localeCompare(String(b.name))),season=data.seasons.find(s=>s.id===sid);
    const c=showEditor(`<div class="jd-player-editor-heading"><span class="eyebrow">PLAYERS · ${esc(season?.name||'')}</span><h2>${player?'Edit player':'Add player'}</h2><p>The profile/photo follows the player. Jersey number and position below belong only to ${esc(season?.name||'this season')}.</p></div><form id="jd-v9-player-form">${!player?`<label class="wide jd-existing-profile">Returning player? Link a saved profile<select id="jd-v9-existing"><option value="">Create a new player profile</option>${profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · #${esc(p.number||'—')}</option>`).join('')}</select></label>`:''}<div class="form-grid"><label>Full name<input name="name" value="${esc(player?.name||'')}" required></label><label>Bats<select name="bats">${['','R','L','S'].map(v=>`<option value="${v}" ${player?.bats===v?'selected':''}>${v||'Not set'}</option>`).join('')}</select></label><label>Throws<select name="throws">${['','R','L'].map(v=>`<option value="${v}" ${player?.throws===v?'selected':''}>${v||'Not set'}</option>`).join('')}</select></label><label class="wide">Player bio<textarea name="bio" rows="3">${esc(player?.bio||'')}</textarea></label><section class="wide jd-player-photo-editor"><div class="jd-player-photo-preview">${player?.photo?`<img src="${esc(player.photo)}" alt="">`:'<span>NO PHOTO</span>'}</div><div><strong>Player headshot</strong><p>The same 4:5 headshot is reused when the player returns in another season.</p><input type="file" id="jd-v9-photo-file" accept="image/jpeg,image/png,image/webp"><button id="jd-v9-remove-photo" type="button">Remove photo</button></div><input name="photo" type="hidden" value="${esc(player?.photo||'')}"></section><section class="wide jd-season-roster-fields"><div><span class="eyebrow">SEASON ROSTER</span><h3>${esc(season?.name||'Season')}</h3></div><label>Jersey number<input name="seasonNumber" value="${esc(roster?.number||player?.number||'')}" maxlength="10" inputmode="numeric" required></label><label>Position<input name="seasonPosition" value="${esc(roster?.position||player?.position||'')}" placeholder="C, P, IF, OF"></label><div class="wide" id="jd-v9-number-live"></div></section></div><p class="form-message" role="status"></p><div class="form-actions"><button class="button" type="submit">${player?'Save player':'Add to roster'}</button><button id="jd-v9-cancel-player" type="button">Cancel</button></div></form>`);
    if(!c)return;const form=$('#jd-v9-player-form',c),existing=$('#jd-v9-existing',c),photo=$('[name="photo"]',form),preview=$('.jd-player-photo-preview',form),number=$('[name="seasonNumber"]',form),live=$('#jd-v9-number-live',form);let linked=player?.id||'';
    const paint=()=>live.innerHTML=availabilityHtml(availability(state.data,number.value,linked),number.value,linked);number.addEventListener('input',paint);paint();
    existing?.addEventListener('change',()=>{linked=existing.value||'';const p=state.data.players.find(x=>String(x.id)===String(linked));if(!p)return;$('[name="name"]',form).value=p.name||'';$('[name="bats"]',form).value=p.bats||'';$('[name="throws"]',form).value=p.throws||'';$('[name="bio"]',form).value=p.bio||'';photo.value=p.photo||'';preview.innerHTML=p.photo?`<img src="${esc(p.photo)}" alt="">`:'<span>NO PHOTO</span>';const rr=state.data.rosters.find(r=>r.season===sid&&String(r.player)===String(p.id));number.value=rr?.number||p.number||'';$('[name="seasonPosition"]',form).value=rr?.position||p.position||'';paint();});
    $('#jd-v9-photo-file',form)?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;const msg=$('.form-message',form);try{msg.textContent='Crop and upload the headshot…';const url=await uploadHeadshot(file);if(!url){msg.textContent='Photo change canceled.';return}photo.value=url;preview.innerHTML=`<img src="${esc(url)}" alt="">`;msg.textContent='Headshot uploaded. Save the player to finish.'}catch(err){msg.textContent=err.message}});
    $('#jd-v9-remove-photo',form)?.addEventListener('click',()=>{photo.value='';preview.innerHTML='<span>NO PHOTO</span>'});$('#jd-v9-cancel-player',form)?.addEventListener('click',closeEditor);
    form.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form),msg=$('.form-message',form),name=String(fd.get('name')||'').trim(),jersey=String(fd.get('seasonNumber')||'').trim(),position=String(fd.get('seasonPosition')||'').trim();if(!name||!jersey){msg.textContent='Player name and jersey number are required.';return}
      try{const id=linked||uid();if(!linked){const same=state.data.players.filter(p=>norm(p.name)===norm(name));if(same.length===1){msg.innerHTML=`A saved profile already exists for <strong>${esc(same[0].name)}</strong>. Choose that player from “Returning player?” instead of creating a duplicate.`;return}}
        await publishReload(data=>{data.rosters||=[];let p=data.players.find(x=>String(x.id)===String(id));if(!p){p={id,name,number:jersey,position,bats:String(fd.get('bats')||''),throws:String(fd.get('throws')||''),bio:String(fd.get('bio')||''),photo:String(fd.get('photo')||''),active:true};data.players.push(p)}else{p.name=name;p.bats=String(fd.get('bats')||'');p.throws=String(fd.get('throws')||'');p.bio=String(fd.get('bio')||'');p.photo=String(fd.get('photo')||'');if(!p.number||sid===data.settings.currentSeason)p.number=jersey;if(!p.position||sid===data.settings.currentSeason)p.position=position;if(sid===data.settings.currentSeason)p.active=true}
          let rr=data.rosters.find(r=>r.season===sid&&String(r.player)===String(id));if(!rr){rr={id:uid(),season:sid,player:id,number:jersey,position,active:true,source:''};data.rosters.push(rr)}else{rr.number=jersey;rr.position=position;rr.active=true}},`${name} saved to ${season?.name||'the season'} roster.`);
      }catch(err){msg.textContent=err.message}});
  }

  async function setRosterActive(playerId,on){
    const sid=currentSeason(),row=effectiveRoster(state.data,sid,true).find(r=>String(r.playerId)===String(playerId));if(!row)return;
    await publishReload(data=>{data.rosters||=[];let rr=data.rosters.find(r=>r.season===sid&&String(r.player)===String(playerId));if(!rr){rr={id:uid(),season:sid,player:playerId,number:row.number||row.player.number||'',position:row.position||row.player.position||'',active:on,source:''};data.rosters.push(rr)}else rr.active=on;},on?'Player restored to this season.':'Player removed from this season. Career history was kept.');
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
    const m=String(filename).match(/\b(Spring|Fall|Summer|Winter)\s+(20\d{2})\b/i);
    if(!m)return null;
    const term=m[1][0].toUpperCase()+m[1].slice(1).toLowerCase(),year=m[2];
    return{name:`${term} ${year}`,id:`${term.toLowerCase()}-${year}`,term,year};
  }

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
      const marker=String(row[0]||'').trim();if(!marker||marker==='Totals'||marker==='Glossary')continue;
      const name=`${String(row[2]||'').trim()} ${String(row[1]||'').trim()}`.replace(/\s+/g,' ').trim();if(!name)continue;
      const batting=valueMap(headers,row,3,pi),pitching=valueMap(headers,row,pi,fi),fielding=valueMap(headers,row,fi,headers.length);
      out.push({importIndex:out.length,number:marker,name,key:norm(name),batting,pitching,fielding,position:inferPosition(fielding)});
    }
    if(!out.length)throw Error('No player rows were found.');
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
    let filename=preset?.filename||'',text=preset?.text||'',detected=seasonFromFilename(filename);
    const existingDetected=detected?state.data.seasons.find(s=>s.name.toLowerCase()===detected.name.toLowerCase()):null;
    const selected=existingDetected?.id||(detected?'__create__':currentSeason());
    const c=showEditor(`<div class="jd-import-heading"><span class="eyebrow">GAMECHANGER</span><h2>Import roster & stats</h2><p>This one file updates the selected season roster plus batting, pitching and fielding. Returning players stay linked to the same permanent profile/photo.</p></div><div class="jd-import-form">${preset?`<div class="jd-import-preset"><strong>${esc(filename)}</strong><span>Supplied in this project</span></div>`:`<label>GameChanger CSV<input type="file" id="jd-v9-gc-file" accept=".csv,text/csv"></label>`}<label>Season<select id="jd-v9-gc-season">${seasonOptions(selected,true,detected)}</select></label><p id="jd-v9-gc-message"></p><div id="jd-v9-gc-preview"></div><div class="jd-import-actions"><button class="button" id="jd-v9-gc-review" type="button">Review import</button><button class="button" id="jd-v9-gc-apply" type="button" hidden>Import & publish</button></div></div>`);
    if(!c)return;
    const fileInput=$('#jd-v9-gc-file',c),seasonSelect=$('#jd-v9-gc-season',c),message=$('#jd-v9-gc-message',c),preview=$('#jd-v9-gc-preview',c),apply=$('#jd-v9-gc-apply',c);
    let parsed=null,reviews=[];
    fileInput?.addEventListener('change',async()=>{const f=fileInput.files?.[0];if(!f)return;filename=f.name;text=await f.text();detected=seasonFromFilename(filename);if(detected){const existing=state.data.seasons.find(s=>s.name.toLowerCase()===detected.name.toLowerCase());seasonSelect.innerHTML=seasonOptions(existing?.id||'__create__',true,detected)}parsed=null;preview.innerHTML='';apply.hidden=true;message.textContent=detected?`Detected ${detected.name}. Choose Review import.`:'Choose the season, then Review import.'});

    $('#jd-v9-gc-review',c).onclick=async()=>{
      try{
        if(!text){const f=fileInput?.files?.[0];if(!f)throw Error('Choose a GameChanger CSV.');if(f.size>4_000_000)throw Error('Choose a CSV under 4 MB.');filename=f.name;text=await f.text()}
        parsed=parseGameChanger(text);reviews=[];let exact=0,fresh=0;
        parsed.forEach(row=>{const same=state.data.players.filter(p=>norm(p.name)===row.key),match=same.find(p=>String(p.number||'').trim()===String(row.number||'').trim());row.exactPlayerId=match?.id||'';row.sameNameCandidates=same;if(match)exact++;else if(same.length)reviews.push(row);else fresh++});
        const seasonLabel=seasonSelect.value==='__create__'?(seasonFromFilename(filename)?.name||'New season'):(state.data.seasons.find(s=>s.id===seasonSelect.value)?.name||seasonSelect.value);
        preview.innerHTML=`<div class="jd-import-summary"><div><strong>${parsed.length}</strong><span>players</span></div><div><strong>${exact}</strong><span>profile matches</span></div><div><strong>${fresh}</strong><span>new profiles</span></div><div class="${reviews.length?'needs-review':''}"><strong>${reviews.length}</strong><span>need review</span></div></div><div class="jd-import-season-confirm"><strong>${esc(seasonLabel)}</strong><span>The roster and stats for this season will be refreshed.</span></div><div class="jd-gc-player-review">${parsed.map(row=>{const cls=row.exactPlayerId?'matched':row.sameNameCandidates.length?'review':'new',label=row.exactPlayerId?'MATCHED':row.sameNameCandidates.length?'NEEDS REVIEW':'NEW PLAYER';return`<div class="jd-gc-player-line ${cls}"><b>#${esc(row.number)}</b><span><strong>${esc(row.name)}</strong><small>${esc(row.position||'Position from GameChanger')}</small></span><em>${label}</em>${row.sameNameCandidates.length&&!row.exactPlayerId?`<select data-gc-review="${row.importIndex}"><option value="">Choose match…</option>${row.sameNameCandidates.map(p=>`<option value="existing:${esc(p.id)}">Same player: ${esc(p.name)} #${esc(p.number||'—')}</option>`).join('')}<option value="new">Create separate player</option></select>`:''}</div>`}).join('')}</div>`;
        message.textContent=reviews.length?'Resolve every Needs Review row, then import.':'Everything is ready.';apply.hidden=false;
      }catch(e){parsed=null;apply.hidden=true;preview.innerHTML='';message.textContent=e.message}
    };

    apply.onclick=async()=>{
      if(!parsed)return;
      try{
        const choices=new Map();for(const s of $$('[data-gc-review]',preview)){if(!s.value)throw Error('Choose a match for every player marked Needs Review.');choices.set(Number(s.dataset.gcReview),s.value)}
        apply.disabled=true;message.textContent='Importing season roster and stats…';
        await publish(data=>{
          data.rosters||=[];data.jerseyRecords||=[];
          const info=seasonFromFilename(filename);let sid=seasonSelect.value;
          if(sid==='__create__'){
            if(!info)throw Error('Choose an existing season because a season could not be detected from this filename.');
            const existing=data.seasons.find(s=>s.name.toLowerCase()===info.name.toLowerCase());
            if(existing)sid=existing.id;else{sid=info.id;data.seasons.push({id:sid,name:info.name,status:sid===data.settings.currentSeason?'active':'archived',note:'Imported from GameChanger'})}
          }
          const label=data.seasons.find(s=>s.id===sid)?.name||sid;sessionStorage.setItem(K_SEASON,sid);
          const pmap=new Map(data.players.map(p=>[String(p.id),p])),assigned=new Map();
          parsed.forEach(row=>{
            let p=data.players.find(x=>norm(x.name)===row.key&&String(x.number||'').trim()===String(row.number||'').trim());
            if(!p){const choice=choices.get(row.importIndex);if(choice?.startsWith('existing:'))p=pmap.get(choice.slice(9))}
            if(!p){p={id:uid(),name:row.name,number:row.number||'',position:row.position||'',bats:'',throws:'',bio:'',photo:'',active:sid===data.settings.currentSeason};data.players.push(p);pmap.set(p.id,p)}
            if(!p.number||sid===data.settings.currentSeason)p.number=row.number||p.number;if(!p.position||sid===data.settings.currentSeason)p.position=row.position||p.position;if(sid===data.settings.currentSeason)p.active=true;assigned.set(row.importIndex,p);
          });
          data.stats=data.stats.filter(s=>s.season!==sid);data.rosters=data.rosters.filter(r=>r.season!==sid);
          const grouped=new Map();parsed.forEach(row=>{const p=assigned.get(row.importIndex);if(!grouped.has(p.id))grouped.set(p.id,[]);grouped.get(p.id).push(row)});
          grouped.forEach((rows,pid)=>{const merged=mergeStats(rows),primary=rows.find(r=>r.number)||rows[0];data.rosters.push({id:uid(),season:sid,player:pid,number:primary.number||'',position:primary.position||'',active:true,source:''});data.stats.push({id:uid(),season:sid,player:pid,bat:merged.bat,pitch:merged.pitch,fielding:merged.fielding,source:`GameChanger · ${label}`})});
        },'GameChanger roster and stats imported.');
        closeEditor();sessionStorage.setItem(K_SECTION,'players');setTimeout(()=>location.reload(),300);
      }catch(e){apply.disabled=false;message.textContent=e.message}
    };
  }


  async function openRosterLinkImport(){
    await refreshState();
    const defaultUrl='https://www.newjerseyabl.com/roster/show/8347196?subseason=916035';
    const c=showEditor(`
      <div class="jd-import-heading">
        <span class="eyebrow">HISTORICAL ROSTER</span>
        <h2>Import roster from link</h2>
        <p>Paste an old NewJerseyABL / SportsEngine roster link. The importer reads player name, jersey number and position, then lets you match returning Dodgers before anything is saved.</p>
      </div>
      <div class="jd-import-form">
        <label class="wide">Roster URL
          <input id="jd-v10-roster-url" type="url" value="${esc(defaultUrl)}" placeholder="https://www.newjerseyabl.com/roster/show/...">
        </label>
        <details class="jd-roster-paste-fallback">
          <summary>Page blocks the link? Paste the roster table instead</summary>
          <textarea id="jd-v10-roster-text" rows="7" placeholder="Example:
10 | Delso Ramos | OF/DH
31 | Javier Soto Rivera | P"></textarea>
        </details>
        <button class="button" id="jd-v10-roster-read" type="button">Read roster</button>
        <p id="jd-v10-roster-message"></p>
        <div id="jd-v10-roster-review"></div>
        <button class="button" id="jd-v10-roster-apply" type="button" hidden>Import roster & publish</button>
      </div>
    `);
    if(!c)return;

    const urlInput=$('#jd-v10-roster-url',c),textInput=$('#jd-v10-roster-text',c),read=$('#jd-v10-roster-read',c),message=$('#jd-v10-roster-message',c),review=$('#jd-v10-roster-review',c),apply=$('#jd-v10-roster-apply',c);
    let result=null,rows=[],detected=null;

    read.onclick=async()=>{
      try{
        read.disabled=true;apply.hidden=true;review.innerHTML='';message.textContent='Reading the roster…';
        result=await api('/api/admin/roster-link',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({url:urlInput.value.trim(),text:textInput.value.trim()})
        });
        rows=result.players||[];
        detected=result.season||null;
        if(!rows.length)throw Error('No roster players were found.');

        const existingDetected=detected?state.data.seasons.find(s=>s.name.toLowerCase()===detected.name.toLowerCase()):null;
        const selected=existingDetected?.id||(detected?'__create__':currentSeason());

        rows.forEach((row,index)=>{
          row.importIndex=index;
          row.key=norm(row.name);
          const same=state.data.players.filter(p=>norm(p.name)===row.key);
          const exact=same.find(p=>String(p.number||'').trim()===String(row.number||'').trim());
          row.exactPlayerId=exact?.id||'';
          row.sameNameCandidates=same;
        });

        const exact=rows.filter(r=>r.exactPlayerId).length;
        const needs=rows.filter(r=>!r.exactPlayerId&&r.sameNameCandidates.length).length;
        const fresh=rows.length-exact-needs;

        review.innerHTML=`
          <div class="jd-link-import-head">
            <div>
              <span class="eyebrow">${esc(result.team||'JERSEY DODGERS')}</span>
              <h3>${esc(detected?.name||'Choose season')}</h3>
              <small>${esc(result.sourceType==='verified-fallback'?'Verified NJABL roster fallback':result.sourceType==='live'?'Read directly from league page':'Pasted roster')}</small>
            </div>
            <label>Season
              <select id="jd-v10-roster-season">${seasonOptions(selected,true,detected)}</select>
            </label>
          </div>
          <div class="jd-import-summary">
            <div><strong>${rows.length}</strong><span>players</span></div>
            <div><strong>${exact}</strong><span>profile matches</span></div>
            <div><strong>${fresh}</strong><span>new profiles</span></div>
            <div class="${needs?'needs-review':''}"><strong>${needs}</strong><span>need review</span></div>
          </div>
          <div class="jd-gc-player-review">
            ${rows.map(row=>{
              const cls=row.exactPlayerId?'matched':row.sameNameCandidates.length?'review':'new';
              const label=row.exactPlayerId?'MATCHED':row.sameNameCandidates.length?'NEEDS REVIEW':'NEW PLAYER';
              return `<div class="jd-gc-player-line ${cls}">
                <b>#${esc(row.number)}</b>
                <span><strong>${esc(row.name)}</strong><small>${esc(row.position||'Position not listed')}</small></span>
                <em>${label}</em>
                ${row.sameNameCandidates.length&&!row.exactPlayerId?`
                  <select data-roster-review="${row.importIndex}">
                    <option value="">Choose match…</option>
                    ${row.sameNameCandidates.map(p=>`<option value="existing:${esc(p.id)}">Same player: ${esc(p.name)} #${esc(p.number||'—')}</option>`).join('')}
                    <option value="new">Create separate player</option>
                  </select>
                `:''}
              </div>`;
            }).join('')}
          </div>
          <div class="jd-link-source">
            <strong>Source</strong>
            <span>${esc(result.source||urlInput.value.trim()||'Pasted roster')}</span>
          </div>
        `;
        message.textContent=needs?'Resolve each Needs Review player, then import.':'Roster is ready to import.';
        apply.hidden=false;
      }catch(e){
        result=null;rows=[];message.textContent=e.message;apply.hidden=true;
      }finally{read.disabled=false}
    };

    apply.onclick=async()=>{
      if(!result||!rows.length)return;
      try{
        const choices=new Map();
        for(const select of $$('[data-roster-review]',review)){
          if(!select.value)throw Error('Choose a match for every player marked Needs Review.');
          choices.set(Number(select.dataset.rosterReview),select.value);
        }

        const seasonSelect=$('#jd-v10-roster-season',review);
        if(!seasonSelect)throw Error('Choose the season.');
        apply.disabled=true;message.textContent='Importing historical roster…';

        await publish(data=>{
          data.rosters||=[];
          let sid=seasonSelect.value;
          if(sid==='__create__'){
            if(!detected)throw Error('Choose an existing season because this page did not identify one.');
            const existing=data.seasons.find(s=>s.name.toLowerCase()===detected.name.toLowerCase());
            if(existing)sid=existing.id;
            else{
              sid=detected.id;
              data.seasons.push({id:sid,name:detected.name,status:sid===data.settings.currentSeason?'active':'archived',note:'Imported historical roster'});
            }
          }

          sessionStorage.setItem(K_SEASON,sid);
          const pmap=new Map(data.players.map(p=>[String(p.id),p]));

          rows.forEach(row=>{
            let p=data.players.find(x=>norm(x.name)===row.key&&String(x.number||'').trim()===String(row.number||'').trim());
            if(!p){
              const choice=choices.get(row.importIndex);
              if(choice?.startsWith('existing:'))p=pmap.get(choice.slice(9));
            }
            if(!p){
              p={id:uid(),name:row.name,number:row.number||'',position:row.position||'',bats:'',throws:'',bio:'',photo:'',active:sid===data.settings.currentSeason};
              data.players.push(p);pmap.set(p.id,p);
            }

            if(!p.number||sid===data.settings.currentSeason)p.number=row.number||p.number;
            if(!p.position||sid===data.settings.currentSeason)p.position=row.position||p.position;
            if(sid===data.settings.currentSeason)p.active=true;

            let rr=data.rosters.find(r=>r.season===sid&&String(r.player)===String(p.id));
            if(!rr){
              rr={id:uid(),season:sid,player:p.id,number:row.number||'',position:row.position||'',active:true,source:String(result.source||urlInput.value.trim()||'')};
              data.rosters.push(rr);
            }else{
              rr.number=row.number||rr.number;
              rr.position=row.position||rr.position;
              rr.active=true;
              rr.source=String(result.source||urlInput.value.trim()||rr.source||'');
            }
          });
        },`${rows.length} roster players imported.`);

        closeEditor();sessionStorage.setItem(K_SECTION,'players');setTimeout(()=>location.reload(),300);
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

  function tool(name){
    if(name==='gamechanger')return openGameChanger();
    if(name==='supplied')return openSupplied();
    if(name==='roster-link')return openRosterLinkImport();
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
    if(nav&&!nav.matches('[data-section="players"]'))sessionStorage.removeItem(K_SECTION);
    if(nav?.matches('[data-section="stats"]'))[80,180,350].forEach(d=>setTimeout(hideLegacyStatsImporter,d));

    if(e.target.closest('[data-section="players"]')){sessionStorage.setItem(K_SECTION,'players');[80,180,350].forEach(d=>setTimeout(renderPlayers,d));return}
    const t=e.target.closest('[data-team-tool]');if(t){e.preventDefault();tool(t.dataset.teamTool);return}
    const a=e.target.closest('[data-team-action]');if(a){e.preventDefault();const id=a.dataset.player;if(a.dataset.teamAction==='edit')openPlayerEditor(id,currentSeason());if(a.dataset.teamAction==='remove')setRosterActive(id,false);if(a.dataset.teamAction==='restore')setRosterActive(id,true)}
  });

  function restore(){
    if(restored||sessionStorage.getItem(K_SECTION)!=='players')return;
    const b=$('[data-section="players"]');if(!b)return;restored=true;b.click();
  }
  [800,1300,2100,3200].forEach(d=>setTimeout(restore,d));
})();
