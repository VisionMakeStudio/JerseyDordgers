(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let token=0;
  function meta(g){
    const m=String(g?.statusReason||'').match(/^JDMETA:(DH7|S9):([^:]+)?(?::([12]))?$/);
    return m?{type:m[1],group:m[2]||'',game:Number(m[3]||0)}:null;
  }
  function fixSchedule(){
    if(location.pathname.split('/').filter(Boolean)[0]!=='schedule')return;
    const data=window.__JD_SITE_DATA,list=$('.game-list');
    if(!data||!list)return;
    const byId=new Map((data.games||[]).map(g=>[String(g.id),g]));
    for(const group of $$('.jd-dh-group',list)){
      const cards=$$('.jd-dh-games > .game-row',group);
      const pairs=cards.map(card=>{
        const id=decodeURIComponent(card.getAttribute('href')?.match(/\/game\/([^/]+)\//)?.[1]||'');
        return {card,g:byId.get(id)};
      });
      // Explicit SINGLE GAME correction in Admin always wins over inferred doubleheader grouping.
      if(pairs.some(x=>meta(x.g)?.type==='S9')){
        const before=group;
        for(const {card,g} of pairs){
          const m=meta(g),badge=$('.jd-game-type-badge',card)||document.createElement('span');
          badge.className='jd-game-type-badge';
          badge.textContent=m?.type==='DH7'?`GAME ${m.game||1} · 7 INNINGS`:'SINGLE GAME · 9 INNINGS';
          if(!badge.isConnected)card.prepend(badge);
          before.parentNode.insertBefore(card,before);
        }
        group.remove();
        continue;
      }
      $('.jd-dh-head strong',group)?.remove();
    }
  }
  function run(){const t=++token;requestAnimationFrame(()=>{if(t===token)fixSchedule()})}
  document.addEventListener('jd-site-render',run);
  document.addEventListener('DOMContentLoaded',()=>setTimeout(run,120));
})();
