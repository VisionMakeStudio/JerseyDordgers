(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MANAGER_NAME='Daniel Guerrero',MANAGER_NUMBER='44';let last={route:'',season:''},frame=0;
  function style(){if($('#jd-v25-site-style'))return;const e=document.createElement('style');e.id='jd-v25-site-style';e.textContent=`
    .home-schedule-section{display:none!important}.jd-result-badge{display:inline-grid;place-items:center;min-width:17px;height:17px;margin-left:5px;padding:0 4px;border-radius:4px;font:900 9px/1 system-ui,sans-serif;vertical-align:middle}.jd-result-badge.win{background:#143d2a;color:#68e69d;border:1px solid #267e51}.jd-result-badge.loss{background:#451923;color:#ff7185;border:1px solid #9f3044}
    .jd-manager-label{display:inline-flex;margin-left:5px;padding:2px 6px;border:1px solid #2873b7;border-radius:999px;color:#80c4ff;background:#0c2037;font-size:8px;font-weight:900;letter-spacing:.08em}
    .jd-game-albums{margin:0 0 34px}.jd-album-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.jd-album-card{border:1px solid #27394d;border-radius:7px;background:#0c1621;overflow:hidden}.jd-album-cover{position:relative;display:block;width:100%;aspect-ratio:4/3;padding:0;border:0;background:#111;overflow:hidden;text-align:left}.jd-album-cover img{width:100%;height:100%;object-fit:cover}.jd-album-cover:after{content:'';position:absolute;inset:40% 0 0;background:linear-gradient(transparent,rgba(0,0,0,.88))}.jd-album-cover span{position:absolute;z-index:2;left:12px;right:12px;bottom:11px;color:#fff}.jd-album-cover strong,.jd-album-cover small{display:block}.jd-album-cover strong{font-size:13px}.jd-album-cover small{margin-top:3px;color:#abc0d5;font-size:9px}.jd-album-body{padding:10px 12px}.jd-album-body>a{font-size:10px;font-weight:800}.jd-album-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:9px}.jd-album-photos[hidden]{display:none}.jd-album-photos .photo-button{aspect-ratio:1/1}.jd-album-photos img{width:100%;height:100%;object-fit:cover}
    @media(max-width:700px){.jd-album-grid{grid-template-columns:1fr 1fr;gap:8px}.jd-album-cover strong{font-size:11px}.jd-album-photos{grid-template-columns:repeat(2,1fr)}}
  `;document.head.append(e)}
  function data(){return window.__JD_SITE_DATA||null}
  function routeNow(){return location.pathname.split('/').filter(Boolean)[0]||'home'}
  function removeAroundDiamond(){if((last.route||routeNow())==='home')$('.home-schedule-section')?.remove()}
  function polishNav(){const nav=$('#nav');if(!nav)return;const schedule=$('a[href="/schedule/"]',nav),scores=$('a[href="/scores/"]',nav);if(schedule)schedule.textContent='Schedule & Scores';scores?.remove();const all=$('.all-scores');if(all){all.href='/schedule/';all.textContent='Schedule & scores'}if((last.route||routeNow())==='schedule')$('.section-head h2')?.replaceChildren('Schedule & Scores')}
  function polishTicker(){
    $$('.score-card').forEach(card=>{const small=$('small',card);if(!small||!/FINAL/i.test(small.textContent))return;const scores=$$(':scope > span > strong',card);if(scores.length<2)return;const ours=Number(scores[0].textContent),theirs=Number(scores[1].textContent);if(!Number.isFinite(ours)||!Number.isFinite(theirs)||ours===theirs)return;const win=ours>theirs;scores[0].style.color=win?'#62df94':'#ff6378';scores[1].style.color=win?'#ff6378':'#62df94';if(!$('.jd-result-badge',small)){const badge=document.createElement('span');badge.className=`jd-result-badge ${win?'win':'loss'}`;badge.textContent=win?'W':'L';small.append(badge)}})
  }
  function removeZeroLeaders(){
    $$('.leader-grid').forEach(grid=>{for(const card of $$('.leader-card',grid)){const value=parseFloat(($(':scope > b',card)?.textContent||'').replace(/[^0-9.-]/g,''));if(Number.isFinite(value)&&value===0)card.remove()}if(!$('.leader-card',grid)&&!$('.jd-no-positive-leaders',grid)){const p=document.createElement('p');p.className='note jd-no-positive-leaders';p.textContent='Leaders will appear once a player records a qualifying stat.';grid.append(p)}})
  }
  function managerCard(card){const text=card.textContent||'';return text.includes(MANAGER_NAME)||/#44\b/.test(text)}
  function markManager(){
    const home=$('.home-roster-grid');if(home){const card=$$('.home-player-card',home).find(managerCard);if(card){home.prepend(card);const small=$('small',card);if(small&&!/MANAGER/i.test(small.textContent))small.textContent=`MANAGER · ${small.textContent}`}}
    const roster=$('.roster-grid');if(roster){const card=$$('.player-card',roster).find(managerCard);if(card){roster.prepend(card);const small=$('small',card);if(small&&!/MANAGER/i.test(small.textContent))small.innerHTML=`#${MANAGER_NUMBER} <span class="jd-manager-label">MANAGER</span>${small.textContent.replace(/^#?44\s*/,'')?` · ${esc(small.textContent.replace(/^#?44\s*/,''))}`:''}`}}
    const profile=$('.player-profile');if(profile&&$('h1',profile)?.textContent.trim()===MANAGER_NAME){const p=$('p',profile),eyebrow=$('.eyebrow',profile);if(p&&!/^Manager\b/i.test(p.textContent))p.textContent=`Manager · ${p.textContent}`;if(eyebrow)eyebrow.textContent=`TEAM MANAGER · #${MANAGER_NUMBER}`}
  }
  function recapSeason(recap,d){const game=(d.games||[]).find(g=>String(g.id)===String(recap.gameId));if(game)return game.season;const same=(d.games||[]).find(g=>g.date===recap.date&&String((d.teams||[]).find(t=>t.id===g.opponent)?.name||'').toLowerCase()===String(recap.opponent||'').toLowerCase());return same?.season||''}
  function recapCardHtml(r){return `<a class="recap-card" href="/recaps/${encodeURIComponent(r.id)}/">${r.image?`<img src="${esc(r.image)}" alt="" loading="lazy">`:''}<div><span class="eyebrow">${esc(r.date)} · GAME RECAP</span><h3>${esc(r.title)}</h3>${r.ourScore!==null&&r.ourScore!==undefined&&r.theirScore!==null&&r.theirScore!==undefined?`<div class="recap-card-score"><span><small>JERSEY DODGERS</small><strong>${esc(r.ourScore)}</strong></span><b>FINAL</b><span><small>${esc(r.opponent)}</small><strong>${esc(r.theirScore)}</strong></span></div>`:''}<p>${esc(r.summary||String(r.body||'').slice(0,150))}</p><span>Read the full recap →</span></div></a>`}
  function filterRecaps(){
    const d=data(),sid=last.season;if(!d||!sid)return;const route=last.route||routeNow();if(!['home','recaps'].includes(route))return;
    const posts=(d.gameRecaps||[]).filter(r=>r.published&&recapSeason(r,d)===sid).sort((a,b)=>String(b.date).localeCompare(String(a.date))),allowed=new Set(posts.map(r=>String(r.id)));
    if(route==='home'){
      const section=$('.home-recaps');if(section){const grid=$('.recap-grid',section);if(!posts.length)section.remove();else if(grid)grid.innerHTML=posts.slice(0,2).map(recapCardHtml).join('')}
    }else{
      $$('.recap-card').forEach(card=>{const id=card.getAttribute('href')?.match(/\/recaps\/([^/]+)\//)?.[1]||'';if(id&&!allowed.has(decodeURIComponent(id)))card.remove()});
      const grid=$('.recap-grid');if(grid&&!$('.recap-card',grid)){grid.innerHTML='<div class="empty"><h3>No recaps for this season yet</h3><p>Published game stories for the selected season will appear here.</p></div>'}
    }
    if(route==='recaps'&&!location.pathname.split('/').filter(Boolean)[1]){
      const wrap=$('#main .wrap');if(wrap&&!$('#jd-recap-season')){const bar=document.createElement('div');bar.className='season-bar';bar.id='jd-recap-season';bar.innerHTML=`<span>GAME RECAPS</span><label>Season <select>${(d.seasons||[]).map(s=>`<option value="${esc(s.id)}" ${s.id===sid?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>`;wrap.prepend(bar);$('select',bar).onchange=e=>{location.href=`/recaps/?season=${encodeURIComponent(e.target.value)}`}}}
  }
  const albumBase=title=>String(title||'').replace(/\s·\s\d+\s*$/,'').trim();
  function gameForAlbum(base,d){const m=base.match(/—\s*(\d{4}-\d{2}-\d{2})\s*$/);if(!m)return null;return (d.games||[]).find(g=>g.date===m[1])||null}
  function gameAlbums(){
    if((last.route||routeNow())!=='media')return;const d=data(),wrap=$('#main .wrap');if(!d||!wrap)return;$('#jd-game-albums')?.remove();const groups=new Map();for(const m of d.media||[]){if(m.category!=='Photos'||!m.image)continue;const base=albumBase(m.title);if(base===m.title)continue;if(!groups.has(base))groups.set(base,[]);groups.get(base).push(m)}const albums=[...groups.entries()].filter(([,items])=>items.length>1).sort((a,b)=>String(b[1][0]?.date||'').localeCompare(String(a[1][0]?.date||'')));if(!albums.length)return;
    const section=document.createElement('section');section.id='jd-game-albums';section.className='jd-game-albums';section.innerHTML=`<div class="section-head"><div><span class="eyebrow">GAME DAY MEDIA</span><h2>Game photo albums</h2></div></div><div class="jd-album-grid">${albums.map(([base,items],i)=>{const game=gameForAlbum(base,d);return `<article class="jd-album-card"><button class="jd-album-cover" type="button" data-jd-album="${i}"><img src="${esc(items[0].image)}" alt=""><span><strong>${esc(base)}</strong><small>${items.length} photos · tap to open</small></span></button><div class="jd-album-body">${game?`<a href="/game/${encodeURIComponent(game.id)}/">View linked game →</a>`:''}<div class="jd-album-photos" data-jd-album-panel="${i}" hidden>${items.map(m=>`<button class="photo-button" data-photo="${esc(m.id)}" aria-label="Open ${esc(m.title)}"><img src="${esc(m.image)}" alt="${esc(m.title)}" loading="lazy"></button>`).join('')}</div></div></article>`}).join('')}</div>`;
    const heading=$('.section-head',wrap);if(heading)heading.insertAdjacentElement('afterend',section);else wrap.prepend(section);
    $$('[data-jd-album]',section).forEach(b=>b.onclick=()=>{const panel=$(`[data-jd-album-panel="${b.dataset.jdAlbum}"]`,section);panel.hidden=!panel.hidden});
    const grouped=new Set(albums.map(([base])=>base));$$('.media-card').forEach(card=>{const h=$('h3',card);if(h&&grouped.has(albumBase(h.textContent)))card.hidden=true});
  }
  function apply(detail=last){last={...last,...detail};style();removeAroundDiamond();polishNav();polishTicker();removeZeroLeaders();markManager();filterRecaps();gameAlbums()}
  function schedule(detail){last={...last,...(detail||{})};cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>apply(last))}
  document.addEventListener('jd-site-render',e=>schedule(e.detail||{}));
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>schedule({route:routeNow()}),80));
  setTimeout(()=>schedule({route:routeNow()}),250);
})();
