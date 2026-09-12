(() => {
  'use strict';

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let isOwner=null,staffCache=[],staffLoaded=false,openPromise=null;

  async function request(options={}){
    const response=await fetch('/api/admin/staff',{credentials:'same-origin',cache:'no-store',...options});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok)throw Object.assign(new Error(body.error||'Unable to manage staff access.'),{status:response.status});
    return body;
  }

  function status(text,error=false){
    const node=$('#status');
    if(node){node.textContent=text;node.className=error?'error':'success';}
  }

  function roleLabel(role){
    return role==='dodgers-owner'?'Owner':role==='dodgers-media'?'Media':'Coach / Admin';
  }

  function staffCard(user){
    const last=user.lastSignInAt?new Date(user.lastSignInAt).toLocaleDateString():'Not signed in yet';
    return `<article class="jd-staff-card ${user.owner?'is-owner':''}" data-staff-id="${esc(user.id)}">
      <div class="jd-staff-avatar">${esc((user.name||user.email||'?').slice(0,1).toUpperCase())}</div>
      <div class="jd-staff-copy">
        <strong>${esc(user.name||user.email)}</strong>
        <span>${esc(user.email)}</span>
        <small>${user.owner?'Primary site owner':`Last sign-in: ${esc(last)}`}</small>
      </div>
      <div class="jd-staff-role">
        ${user.owner?`<span class="jd-role-pill owner">OWNER</span>`:`
          <select data-staff-role>
            <option value="dodgers-coach" ${user.role==='dodgers-coach'?'selected':''}>Coach / Admin</option>
            <option value="dodgers-media" ${user.role==='dodgers-media'?'selected':''}>Media</option>
          </select>
        `}
      </div>
      <div class="jd-staff-actions">
        ${user.owner?'':`
          <button type="button" data-staff-action="setup">Send password setup</button>
          <button type="button" data-staff-action="remove" class="danger">Remove access</button>
        `}
      </div>
    </article>`;
  }

  function renderStaff(){
    const content=$('#section-content');
    if(!content)return;

    const saveState=$('#save-state');
    const saveButton=$('#save-all');
    if(saveState)saveState.hidden=true;
    if(saveButton)saveButton.hidden=true;

    const heading=$('.admin-heading h1');
    if(heading)heading.textContent='Staff Access';
    const help=$('.admin-help');
    if(help)help.textContent='Invite coaches or media staff with their own email and password. Only the Owner can add, change, or remove staff access.';

    content.innerHTML=`
      <section class="jd-staff-access">
        <div class="jd-staff-intro">
          <div>
            <span class="eyebrow">ADMIN SECURITY</span>
            <h2>Staff Access</h2>
            <p>Each person gets their own sign-in. Coach / Admin can manage the team. Media access is limited server-side to photos, videos and Watch & Follow links.</p>
          </div>
          <button class="button" type="button" id="jd-invite-staff-toggle">+ Invite staff</button>
        </div>

        <form id="jd-invite-staff-form" class="jd-invite-staff-form" hidden>
          <label>Name
            <input name="name" autocomplete="name" placeholder="Coach name">
          </label>
          <label>Email
            <input name="email" type="email" autocomplete="email" placeholder="coach@example.com" required>
          </label>
          <label>Access
            <select name="role">
              <option value="dodgers-coach">Coach / Admin</option>
              <option value="dodgers-media">Media</option>
            </select>
          </label>
          <div class="jd-invite-actions">
            <button class="button" type="submit">Send setup email</button>
            <button type="button" id="jd-invite-staff-cancel">Cancel</button>
          </div>
          <p id="jd-staff-form-message"></p>
        </form>

        <div class="jd-staff-list">
          ${staffCache.length?staffCache.map(staffCard).join(''):'<div class="jd-staff-empty">No staff accounts yet.</div>'}
        </div>

        <div class="jd-staff-security-note">
          <strong>How invitations work</strong>
          <p>The staff account is created securely through Netlify Identity and a password-setup email is sent to that address. They choose their own password, then return to the normal Jersey Dodgers Admin page and sign in fresh with that email and password.</p>
        </div>
      </section>
    `;

    $('#jd-invite-staff-toggle')?.addEventListener('click',()=>{
      $('#jd-invite-staff-form').hidden=false;
      $('#jd-invite-staff-toggle').hidden=true;
      $('#jd-invite-staff-form [name="email"]')?.focus();
    });
    $('#jd-invite-staff-cancel')?.addEventListener('click',()=>{
      $('#jd-invite-staff-form').hidden=true;
      $('#jd-invite-staff-toggle').hidden=false;
    });

    $('#jd-invite-staff-form')?.addEventListener('submit',async event=>{
      event.preventDefault();
      const form=event.currentTarget,fd=new FormData(form),message=$('#jd-staff-form-message');
      const submit=form.querySelector('[type="submit"]');
      try{
        submit.disabled=true;message.textContent='Creating staff access and sending setup email…';
        const body=await request({
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            name:String(fd.get('name')||'').trim(),
            email:String(fd.get('email')||'').trim(),
            role:String(fd.get('role')||'dodgers-coach')
          })
        });
        message.textContent=body.message||'Setup email sent.';
        await loadStaff(false);
        renderStaff();
        status(body.message||'Staff access added.');
      }catch(error){
        message.textContent=error.message;
      }finally{submit.disabled=false}
    });

    $$('[data-staff-role]',content).forEach(select=>{
      select.addEventListener('change',async()=>{
        const card=select.closest('[data-staff-id]');
        try{
          select.disabled=true;
          const body=await request({
            method:'PATCH',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({id:card.dataset.staffId,role:select.value})
          });
          status(body.message||'Staff role updated.');
          await loadStaff(false);
          renderStaff();
        }catch(error){
          status(error.message,true);
          await loadStaff(false);
          renderStaff();
        }
      });
    });

    $$('[data-staff-action]',content).forEach(button=>{
      button.addEventListener('click',async()=>{
        const card=button.closest('[data-staff-id]'),id=card.dataset.staffId,action=button.dataset.staffAction;
        const user=staffCache.find(u=>String(u.id)===String(id));
        if(action==='remove'&&!confirm(`Remove Admin access for ${user?.email||'this staff member'}?`))return;
        try{
          button.disabled=true;
          const body=await request({
            method:action==='remove'?'DELETE':'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({id})
          });
          status(body.message||'Staff access updated.');
          await loadStaff(false);
          renderStaff();
        }catch(error){
          status(error.message,true);
          button.disabled=false;
        }
      });
    });
  }

  async function loadStaff(){
    const body=await request();
    staffCache=body.staff||[];staffLoaded=true;
    return staffCache;
  }

  async function accessInfo(){
    const response=await fetch('/api/admin/access',{credentials:'same-origin',cache:'no-store'});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok)throw Object.assign(new Error(body.error||'No admin access.'),{status:response.status});
    return body;
  }

  async function openStaff(){
    if(openPromise)return openPromise;
    openPromise=(async()=>{
      const content=$('#section-content');
      try{
        const access=await accessInfo();
        isOwner=Boolean(access.owner);
        if(!isOwner){
          if(content)content.innerHTML='<div class="jd-plugin-loading is-error"><strong>Owner access required.</strong><span>Staff Access can only be managed by the Jersey Dodgers owner account.</span></div>';
          return;
        }
        await loadStaff();
        if(document.body.dataset.adminSection==='staff-access')renderStaff();
      }catch(error){
        status(error.message,true);
        if(content)content.innerHTML=`<div class="jd-plugin-loading is-error"><strong>Staff Access could not load.</strong><span>${esc(error.message)}</span></div>`;
        throw error;
      }
    })();
    try{return await openPromise}finally{openPromise=null}
  }

  window.JDStaffAccess={open:openStaff};

})();
