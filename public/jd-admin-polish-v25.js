(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const MANAGER_NAME='Daniel Guerrero',MANAGER_NUMBER='44';
  let frame=0,adminDataPromise=null;

  function style(){
    if($('#jd-v25-admin-style'))return;
    const el=document.createElement('style');el.id='jd-v25-admin-style';el.textContent=`
      .jd-manager-badge{display:inline-flex;align-items:center;margin-left:7px;padding:2px 6px;border:1px solid #2f7fc8;border-radius:999px;color:#8bc8ff;background:#0c2440;font-size:8px;font-weight:900;letter-spacing:.09em;vertical-align:middle}
      .jd-jersey-history-collapse{grid-column:1/-1;border:1px solid #2b425a;border-radius:7px;background:#0a1520;overflow:hidden}
      .jd-jersey-history-collapse>summary{cursor:pointer;padding:11px 13px;color:#c9dbed;font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;list-style:none}
      .jd-jersey-history-collapse>summary::-webkit-details-marker{display:none}.jd-jersey-history-collapse>summary:after{content:'+';float:right;color:#78baff;font-size:16px}.jd-jersey-history-collapse[open]>summary:after{content:'–'}
      .jd-jersey-history-collapse>#jd-v9-number-live{padding:0 12px 12px}
      #jd-v9-player-form .is-saving{opacity:.75;cursor:wait!important}
      .jd-game-album-helper{grid-column:1/-1;padding:12px;border:1px solid #2f4e6b;border-radius:7px;background:#0d1d2c}.jd-game-album-helper strong{display:block;color:#eaf4ff;margin-bottom:4px}.jd-game-album-helper p{margin:0 0 9px;color:#849ab2;font-size:10px;line-height:1.5}.jd-game-album-helper select{width:100%}
    `;document.head.append(el);
  }
  const norm=v=>String(v||'').trim().toLowerCase();
  function managerRow(row){return norm($('.jd-season-player-copy strong',row)?.textContent)===norm(MANAGER_NAME)||norm($('.jd-season-player-number',row)?.textContent).replace('#','')===MANAGER_NUMBER}
  function decorateRoster(){
    const list=$('.jd-season-player-list');if(!list)return;
    const rows=$$('.jd-season-player-row',list),manager=rows.find(managerRow);if(!manager)return;
    list.prepend(manager);
    const name=$('.jd-season-player-copy strong',manager);if(name&&!$('.jd-manager-badge',name.parentElement)){const badge=document.createElement('span');badge.className='jd-manager-badge';badge.textContent='MANAGER';name.insertAdjacentElement('afterend',badge)}
  }
  function restorePlayerButton(form,error=false){
    const button=$('[type="submit"]',form);if(!button)return;clearTimeout(button._jdSaveTimer);button.disabled=false;button.classList.remove('is-saving');button.textContent=button.dataset.jdOriginal||(/save/i.test(button.textContent)?'Save player':'Add to roster');if(error)button.focus({preventScroll:true});
  }
  function enhancePlayerEditor(){
    const form=$('#jd-v9-player-form');if(!form||form.dataset.jdV25)return;form.dataset.jdV25='1';
    const live=$('#jd-v9-number-live',form);if(live&&!live.closest('.jd-jersey-history-collapse')){const details=document.createElement('details');details.className='wide jd-jersey-history-collapse';const summary=document.createElement('summary');summary.textContent='Jersey number history & reservation';live.parentNode.insertBefore(details,live);details.append(summary,live)}
    const existing=$('#jd-v9-existing',form),msg=$('.form-message',form),button=$('[type="submit"]',form);if(button)button.dataset.jdOriginal=button.textContent;
    existing?.addEventListener('change',()=>{if(existing.value&&msg)msg.textContent='Returning player selected. Press Add to roster once — the button will show when the save is finished.'});
    form.addEventListener('submit',()=>{
      if(!button)return;button.dataset.jdOriginal ||= button.textContent;button.disabled=true;button.classList.add('is-saving');button.textContent='Saving…';if(msg)msg.textContent='Saving player and roster… Please wait. Do not press the button again.';
      button._jdSaveTimer=setTimeout(()=>{if(form.isConnected&&button.disabled){restorePlayerButton(form,true);if(msg&&!/error|required|exists|reserved/i.test(msg.textContent))msg.textContent='This is taking longer than expected. You can try again, or check the roster before resubmitting.'}},20000);
    },true);
    if(msg)new MutationObserver(()=>{if(!button?.disabled)return;const t=msg.textContent.toLowerCase();if(t&&t!=='saving player and roster… please wait. do not press the button again.'&&(/error|required|exists|choose|could not|failed|reserved/.test(t)))restorePlayerButton(form,true)}).observe(msg,{childList:true,subtree:true,characterData:true});
  }
  async function adminData(){
    if(!adminDataPromise)adminDataPromise=fetch('/api/admin/content',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Could not load games.'))).then(r=>r.data||r).finally(()=>setTimeout(()=>adminDataPromise=null,15000));
    return adminDataPromise;
  }
  async function enhanceBulkGallery(){
    const form=$('.bulk-form');if(!form||form.dataset.jdGameAlbums)return;form.dataset.jdGameAlbums='1';
    const title=$('#bulk-title'),date=$('#bulk-date');if(!title)return;
    const helper=document.createElement('div');helper.className='jd-game-album-helper';helper.innerHTML='<strong>Game photo album</strong><p>Optional. Pick a game and this gallery will be named consistently so the public Media page can group all of its photos into one game folder.</p><label>Link gallery to a game<select id="jd-v25-gallery-game"><option value="">Custom / not tied to a game</option></select></label>';
    form.prepend(helper);
    try{
      const data=await adminData(),teams=new Map((data.teams||[]).map(t=>[String(t.id),t.name])),seasons=new Map((data.seasons||[]).map(s=>[String(s.id),s.name]));
      const games=[...(data.games||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))),select=$('#jd-v25-gallery-game',helper);
      select.insertAdjacentHTML('beforeend',games.map(g=>`<option value="${String(g.id).replace(/"/g,'&quot;')}" data-date="${g.date}" data-opponent="${String(teams.get(String(g.opponent))||'Opponent').replace(/"/g,'&quot;')}">${seasons.get(String(g.season))||'Season'} · ${g.date} · ${teams.get(String(g.opponent))||'Opponent'}</option>`).join(''));
      select.addEventListener('change',()=>{const opt=select.selectedOptions[0];if(!select.value)return;title.value=`Game vs ${opt.dataset.opponent} — ${opt.dataset.date}`;if(date)date.value=opt.dataset.date;title.dispatchEvent(new Event('input',{bubbles:true}))});
    }catch{helper.querySelector('p').textContent='Game list unavailable right now. You can still use a consistent gallery title to create an album.'}
  }
  function statusChanged(){
    const form=$('#jd-v9-player-form'),button=form&&$('[type="submit"]',form),status=$('#status');if(!form||!button||!button.disabled||!status)return;
    const text=status.textContent||'';
    if(status.classList.contains('success')&&/saved to|restored|published/i.test(text)){
      clearTimeout(button._jdSaveTimer);button.textContent='Saved ✓';setTimeout(()=>{const dialog=$('#editor');if(dialog?.open)dialog.close();decorateRoster()},450);
    }else if(status.classList.contains('error'))restorePlayerButton(form,true);
  }
  function enhance(){style();decorateRoster();enhancePlayerEditor();}
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(enhance)}
  document.addEventListener('jd-admin-render',schedule);
  document.addEventListener('click',e=>{if(e.target.closest('#bulk-media'))setTimeout(enhanceBulkGallery,0)});
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  const status=$('#status');if(status)new MutationObserver(statusChanged).observe(status,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
  schedule();
})();
