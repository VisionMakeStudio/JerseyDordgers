(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const uuid=()=>crypto.randomUUID();
  const DEFAULT_URL='https://www.primetimebaseballleague.com/teams/default.asp?u=PRIMETIMEBASEBALLLEA&s=baseball&p=schedule&format=List&d=ALL';
  let frame=0;

  async function api(url,options={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});let body={};try{body=await r.json()}catch{}if(!r.ok)throw Error(body.error||'Request failed.');return body}
  const year=s=>Number(String(s?.name||'').match(/20\d{2}/)?.[0]||0),term=s=>/fall/i.test(s?.name||'')?4:/summer/i.test(s?.name||'')?3:/spring/i.test(s?.name||'')?2:/winter/i.test(s?.name||'')?1:0;
  const sortSeasons=a=>[...(a||[])].sort((x,y)=>year(y)-year(x)||term(y)-term(x)||String(y.name).localeCompare(String(x.name)));
  const seasonOptions=(data,selected='')=>sortSeasons(data.seasons).map(s=>`<option value="${esc(s.id)}" ${s.id===selected?'selected':''}>${esc(s.name)}</option>`).join('');
  const bestSeason=(data,name='')=>data.seasons.find(s=>norm(s.name)===norm(name))?.id||data.settings.currentSeason||sortSeasons(data.seasons)[0]?.id||'';
  function matchTeam(data,name){return data.teams.find(t=>norm(t.name)===norm(name))||data.teams.find(t=>norm(t.name)&&[norm(t.name),norm(name)].some((x,i)=>i?x.includes(norm(t.name)):norm(name).includes(x)))}
  function matchField(data,name){if(!name)return null;return data.fields.find(f=>norm(f.name)===norm(name))||data.fields.find(f=>norm(f.name)&&norm(name).includes(norm(f.name)))||data.fields.find(f=>norm(name)&&norm(f.name).includes(norm(name)))}
  function abbreviation(name){return String(name||'').split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,5).toUpperCase()||'OPP'}
  function metaStatus(g){if(g.seriesType==='doubleheader')return `JDMETA:DH7:${g.group||''}:${g.gameNumber||1}`;return 'JDMETA:S9:single:1'}

  function reviewHtml(result,data,sid){
    return `<section class="jd-v27-review"><div class="jd-v27-review-head"><div><span class="eyebrow">IMPORT REVIEW</span><h3>Jersey Dodgers schedule</h3><p>${result.games.length} game${result.games.length===1?'':'s'} detected. Nothing is published until you press Apply schedule.</p></div><label>Destination season<select id="jd-v27-import-season">${seasonOptions(data,sid)}</select></label></div><div class="jd-v27-review-table"><table><thead><tr><th>Date</th><th>Time</th><th>Type</th><th>H/A</th><th>Opponent / saved profile</th><th>Field / saved field</th></tr></thead><tbody>${result.games.map((g,i)=>{const tm=matchTeam(data,g.opponent),fm=matchField(data,g.field);return `<tr data-v27-game="${i}" data-opponent="${esc(g.opponent)}" data-field="${esc(g.field||'')}"><td>${esc(g.date)}</td><td>${esc(g.time||'TBA')}</td><td><span class="jd-v27-type ${g.seriesType==='doubleheader'?'dh':''}">${g.seriesType==='doubleheader'?`DH · G${g.gameNumber} · 7`:'SINGLE · 9'}</span></td><td>${g.home?'HOME':'AWAY'}</td><td><strong>${esc(g.opponent)}</strong><select data-team-match><option value="__create__">Create new team profile</option>${data.teams.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t=>`<option value="${esc(t.id)}" ${tm?.id===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></td><td><strong>${esc(g.field||'Field not listed')}</strong><select data-field-match><option value="__create__">${g.field?'Create saved field':'Create “Field TBD”'}</option>${data.fields.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(f=>`<option value="${esc(f.id)}" ${fm?.id===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select></td></tr>`}).join('')}</tbody></table></div><div class="jd-v27-review-actions"><button class="button" id="jd-v27-apply" type="button">Apply schedule</button><button id="jd-v27-cancel-review" type="button">Cancel review</button></div><p id="jd-v27-apply-status" class="jd-v27-status" role="status"></p></section>`;
  }

  async function openImporter(){
    const dialog=$('#editor'),content=$('#editor-content');if(!dialog||!content)return;
    const payload=await api('/api/admin/content'),data=payload.data,sid=data.settings.currentSeason||sortSeasons(data.seasons)[0]?.id||'';
    content.innerHTML=`<div class="jd-player-editor-heading"><span class="eyebrow">SCHEDULE & SCORES</span><h2>Import PrimeTime schedule</h2><p>Paste the PrimeTime league schedule link. Only Jersey Dodgers games are imported. Existing opponent profiles/logos and saved fields are reused automatically.</p></div><form id="jd-v27-import-form" class="jd-v27-import-form"><label>PrimeTime schedule link<input id="jd-v27-url" type="url" value="${esc(DEFAULT_URL)}" required></label><details><summary>Fallback: paste schedule text</summary><p>If PrimeTime blocks the reader, paste the schedule rows here and use the same review flow.</p><textarea id="jd-v27-text" rows="7" placeholder="Paste the Jersey Dodgers schedule rows here…"></textarea></details><div class="jd-v27-import-actions"><button class="button" type="submit">Read schedule</button><button type="button" id="jd-v27-close">Cancel</button></div><p id="jd-v27-status" class="jd-v27-status" role="status"></p><div id="jd-v27-review"></div></form>`;
    if(!dialog.open)dialog.showModal();$('#jd-v27-close').onclick=()=>dialog.close();
    $('#jd-v27-import-form').onsubmit=async e=>{e.preventDefault();const btn=$('[type=submit]',e.currentTarget),status=$('#jd-v27-status'),box=$('#jd-v27-review');btn.disabled=true;btn.textContent='Reading…';status.textContent='Reading PrimeTime and filtering Jersey Dodgers games…';box.innerHTML='';try{const result=await api('/api/admin/primetime-schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:$('#jd-v27-url').value.trim(),text:$('#jd-v27-text').value.trim()})});const target=bestSeason(data,result.season?.name||'');box.innerHTML=reviewHtml(result,data,target);status.textContent=`Detected ${result.games.length} Jersey Dodgers game${result.games.length===1?'':'s'}. Review team and field matches.`;$('#jd-v27-cancel-review').onclick=()=>box.innerHTML='';$('#jd-v27-apply').onclick=()=>applyImport(result,data,payload.revision,dialog)}catch(err){status.textContent=err.message}finally{btn.disabled=false;btn.textContent='Read schedule'}};
  }

  async function applyImport(result,data,revision,dialog){
    const btn=$('#jd-v27-apply'),status=$('#jd-v27-apply-status'),sid=$('#jd-v27-import-season').value,rows=$$('[data-v27-game]');if(!rows.length)return;btn.disabled=true;btn.textContent='Publishing…';status.textContent='Matching teams and fields, then publishing schedule…';
    try{
      const latest=await api('/api/admin/content'),draft=structuredClone(latest.data),createdTeams=new Map(),createdFields=new Map(),groupMap=new Map();let added=0,skipped=0;
      rows.forEach((tr,i)=>{const g=result.games[i];let teamId=$('[data-team-match]',tr).value,fieldId=$('[data-field-match]',tr).value;
        if(teamId==='__create__'){const key=norm(g.opponent);let team= draft.teams.find(t=>norm(t.name)===key);if(!team){team=createdTeams.get(key);if(!team){team={id:`team-${key.slice(0,35)||'opponent'}-${uuid().slice(0,6)}`,name:g.opponent,abbreviation:abbreviation(g.opponent),logo:''};draft.teams.push(team);createdTeams.set(key,team)}}teamId=team.id}
        if(fieldId==='__create__'){const fieldName=String(g.field||'Field TBD').trim()||'Field TBD',key=norm(fieldName);let field=draft.fields.find(f=>norm(f.name)===key);if(!field){field=createdFields.get(key);if(!field){field={id:`field-${key.slice(0,35)||'tbd'}-${uuid().slice(0,6)}`,name:fieldName,address:'',mapsUrl:'',notes:'Imported from PrimeTime schedule. Add the Google Maps link/address in Admin when available.'};draft.fields.push(field);createdFields.set(key,field)}}fieldId=field.id}
        const dupe=draft.games.find(x=>x.season===sid&&x.date===g.date&&x.time===(g.time||'00:00')&&String(x.opponent)===String(teamId));if(dupe){skipped++;return}
        let group='single';if(g.seriesType==='doubleheader'){const key=[g.date,teamId,fieldId,g.home?'H':'A'].join('|');if(!groupMap.has(key))groupMap.set(key,uuid());group=groupMap.get(key)}
        draft.games.push({id:uuid(),season:sid,opponent:teamId,field:fieldId,date:g.date,time:g.time||'00:00',timezone:'America/New_York',home:Boolean(g.home),status:'scheduled',statusReason:g.seriesType==='doubleheader'?`JDMETA:DH7:${group}:${g.gameNumber||1}`:'JDMETA:S9:single:1',rescheduledDate:'',rescheduledTime:'',ourScore:null,theirScore:null,gameLink:'',recap:'',weather:''});added++;
      });
      await api('/api/admin/content',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:latest.revision,data:draft})});status.textContent=`Published ${added} game${added===1?'':'s'}${skipped?` · skipped ${skipped} duplicate${skipped===1?'':'s'}`:''}.`;btn.textContent='Published ✓';setTimeout(()=>{dialog.close();sessionStorage.setItem('jd-v26-return-section','games');location.reload()},650)
    }catch(err){status.textContent=err.message;btn.disabled=false;btn.textContent='Apply schedule'}
  }

  function enhanceGames(){
    if(document.body.dataset.adminSection!=='games')return;const root=$('#section-content');if(!root||$('#jd-v27-import-schedule',root))return;const toolbar=$('.list-toolbar',root)||root.firstElementChild;if(!toolbar)return;const button=document.createElement('button');button.id='jd-v27-import-schedule';button.type='button';button.className='button jd-v27-import-button';button.textContent='Import PrimeTime schedule';button.onclick=openImporter;const add=$('#add-item',root),dh=$('.jd-v26-double',root);(dh||add)?.insertAdjacentElement('afterend',button);
  }
  function apply(){enhanceGames()}
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(apply)}
  document.addEventListener('jd-admin-render',schedule);document.addEventListener('DOMContentLoaded',()=>{setTimeout(schedule,150);setTimeout(schedule,700)});
})();
