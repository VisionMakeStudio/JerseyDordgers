(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  let navToken=0, renderSequence=0, sectionObserver=null, observedSection=null, editorObserver=null, observedEditor=null;

  function currentSection(){return window.JDAdminSection?.()||document.body.dataset.adminSection||''}
  function emitRender(){
    const section=currentSection();
    if(!section)return;
    document.body.dataset.adminSection=section;
    document.dispatchEvent(new CustomEvent('jd-admin-render',{detail:{section,source:'v33-remount'}}));
  }
  function scheduleRemount(){
    const token=++navToken;
    const seen=renderSequence;
    setTimeout(()=>{
      if(token!==navToken)return;
      mountObservers();
      mountGameTypeEditor();
      // The base Admin emits this event after changing sections. Only send a
      // fallback when a click did not produce that render.
      if(renderSequence===seen)emitRender();
    },220);
  }

  function mountObservers(){
    const root=$('#section-content');
    if(root&&root!==observedSection){
      sectionObserver?.disconnect();observedSection=root;
      let queued=false;
      sectionObserver=new MutationObserver(()=>{
        if(queued)return;queued=true;
        requestAnimationFrame(()=>{queued=false;mountGameTypeEditor()});
      });
      sectionObserver.observe(root,{childList:true});
    }
    const editor=$('#editor-content');
    if(editor&&editor!==observedEditor){
      editorObserver?.disconnect();observedEditor=editor;
      editorObserver=new MutationObserver(()=>requestAnimationFrame(mountGameTypeEditor));
      editorObserver.observe(editor,{childList:true});
    }
  }

  function parseMeta(value){
    const m=String(value||'').match(/^JDMETA:(DH7|S9):([^:]+)?(?::([12]))?$/);
    return m?{type:m[1],group:m[2]||'',game:Number(m[3]||0)}:null;
  }
  function mountGameTypeEditor(){
    if(currentSection()!=='games')return;
    const form=$('#record-form'),reason=form?.querySelector('[name="statusReason"]');
    if(!form||!reason||form.querySelector('.jd-v33-game-format'))return;
    const meta=parseMeta(reason.value),status=form.querySelector('[name="status"]');
    const panel=document.createElement('section');
    panel.className='jd-v33-game-format';
    panel.innerHTML=`<div><strong>Game format</strong><small>Correct the PDF import here if a game was read as the wrong format.</small></div><label>Format<select id="jd-v33-format"><option value="S9">Single game · 9 innings</option><option value="DH7">Doubleheader game · 7 innings</option></select></label><label id="jd-v33-game-number">Doubleheader game<select id="jd-v33-number"><option value="1">Game 1</option><option value="2">Game 2</option></select></label>`;
    const first=form.querySelector('.recap-editor-intro');
    if(first)first.insertAdjacentElement('afterend',panel);else form.prepend(panel);
    const format=$('#jd-v33-format',panel),number=$('#jd-v33-number',panel),numberLabel=$('#jd-v33-game-number',panel);
    format.value=meta?.type||'S9';number.value=String(meta?.game||1);
    const syncVisibility=()=>numberLabel.hidden=format.value!=='DH7';syncVisibility();
    const writeMeta=()=>{
      syncVisibility();
      panel.dataset.changed='1';
      if(status&&['postponed','cancelled'].includes(status.value))return;
      reason.value=format.value==='DH7'?`JDMETA:DH7::${number.value}`:'JDMETA:S9:';
      reason.dispatchEvent(new Event('input',{bubbles:true}));
    };
    format.addEventListener('change',writeMeta);number.addEventListener('change',writeMeta);
    status?.addEventListener('change',()=>{
      if(!['postponed','cancelled'].includes(status.value)&&panel.dataset.changed==='1')writeMeta();
    });
    form.addEventListener('submit',()=>{
      if(panel.dataset.changed==='1'&&!['postponed','cancelled'].includes(status?.value))writeMeta();
    },true);
  }

  function style(){
    if($('#jd-v33-admin-style'))return;
    const s=document.createElement('style');s.id='jd-v33-admin-style';s.textContent=`
      .jd-v33-game-format{display:grid;grid-template-columns:minmax(0,1fr) 220px 180px;gap:10px;align-items:end;margin:0 0 16px;padding:13px 14px;border:1px solid #31516f;border-left:3px solid #168bff;border-radius:7px;background:#0b1a29}.jd-v33-game-format>div{align-self:center}.jd-v33-game-format strong,.jd-v33-game-format small{display:block}.jd-v33-game-format strong{color:#eef6ff;font-size:12px}.jd-v33-game-format small{margin-top:3px;color:#8197af;font-size:9px;line-height:1.4}.jd-v33-game-format label{display:grid;gap:5px;color:#9bb0c6;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.jd-v33-game-format select{width:100%}.jd-v33-game-format label[hidden]{display:none!important}
      @media(max-width:700px){.jd-v33-game-format{grid-template-columns:1fr}.jd-v33-game-format>div{margin-bottom:3px}}
    `;document.head.append(s);
  }

  // Navigation buttons are owned by the base Admin. This only asks enhancement modules
  // to remount after navigation settles; it never changes the selected section itself.
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-admin-group],[data-section]'))scheduleRemount();
    if(e.target.closest('[data-edit]'))setTimeout(mountGameTypeEditor,0);
  },true);
  document.addEventListener('jd-admin-render',()=>{renderSequence++;style();mountObservers();mountGameTypeEditor()});
  document.addEventListener('DOMContentLoaded',()=>{style();mountObservers();setTimeout(scheduleRemount,180)});
  setTimeout(()=>{style();mountObservers();mountGameTypeEditor()},450);
})();
