(() => {
  'use strict';

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const CANVAS_W=1080,CANVAS_H=1350;
  const SCRIPT_LOGO='/assets/jd-script-logo-official.png';
  const D_MARK='/assets/jd-d-mark-official.png';
  let data=null,access=null,active=false;
  let selectedPlayerId='',selectedSeasonId='',phase='regular';
  let photoSource='',photoImage=null,photoLabel='';
  let cutoutCanvas=null,cutoutSource='';
  let playerScale=1,playerX=0,playerY=0,drag=null;
  let logoScript=null,logoMark=null;
  let generated=false;

  async function api(url){
    const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});
    let b={};try{b=await r.json()}catch{}
    if(!r.ok)throw Object.assign(new Error(b.error||'Request failed.'),{status:r.status});
    return b;
  }
  function setStatus(text,error=false){const n=$('#status');if(n){n.textContent=text;n.className=error?'error':'success'}}
  function seasonYear(s){return Number(String(s?.name||'').match(/\b(20\d{2})\b/)?.[1]||0)}
  function termRank(name=''){if(/fall/i.test(name))return 4;if(/summer/i.test(name))return 3;if(/spring/i.test(name))return 2;if(/winter/i.test(name))return 1;return 0}
  function seasons(){return [...(data?.seasons||[])].sort((a,b)=>seasonYear(b)-seasonYear(a)||termRank(b.name)-termRank(a.name)||String(b.name).localeCompare(String(a.name)))}
  function currentSeason(){return data?.settings?.currentSeason||seasons()[0]?.id||''}
  function rosterArray(){return phase==='playoffs'?(data?.playoffRosters||[]):(data?.rosters||[])}
  function statsArray(){return phase==='playoffs'?(data?.playoffStats||[]):(data?.stats||[])}
  function playerById(id){return (data?.players||[]).find(p=>String(p.id)===String(id))}
  function rosterPlayers(){
    const rows=rosterArray().filter(r=>r.season===selectedSeasonId),pmap=new Map((data?.players||[]).map(p=>[String(p.id),p]));
    if(rows.length){
      return rows.filter(r=>r.active!==false).map(r=>{const p=pmap.get(String(r.player));return p?{...p,number:r.number||p.number||'',position:r.position||p.position||''}:null}).filter(Boolean).sort((a,b)=>num(a.number)-num(b.number)||String(a.name).localeCompare(String(b.name)));
    }
    const seen=new Set();return statsArray().filter(s=>s.season===selectedSeasonId).map(s=>{if(seen.has(String(s.player)))return null;seen.add(String(s.player));return pmap.get(String(s.player))||null}).filter(Boolean).sort((a,b)=>num(a.number)-num(b.number)||String(a.name).localeCompare(String(b.name)));
  }
  function num(v){const m=String(v||'').match(/\d+/);return m?Number(m[0]):9999}
  function statRecord(){return statsArray().find(s=>s.season===selectedSeasonId&&String(s.player)===String(selectedPlayerId))||null}
  function seasonName(){return data?.seasons?.find(s=>s.id===selectedSeasonId)?.name||''}
  function selectedPlayer(){return playerById(selectedPlayerId)}
  function metricLabel(key){
    const map={AVG:'AVG',OBP:'OBP',OPS:'OPS',SLG:'SLG',H:'HITS',HR:'HOME RUNS',RBI:'RBI',R:'RUNS',SB:'STOLEN BASES',PA:'PLATE APPEARANCES',AB:'AT BATS',SO:'STRIKEOUTS',W:'WINS',SV:'SAVES',IP:'INNINGS PITCHED',ERA:'ERA',WHIP:'WHIP',FPCT:'FIELDING %',PO:'PUTOUTS',A:'ASSISTS',DP:'DOUBLE PLAYS'};
    return map[key]||String(key||'STAT').replace(/_/g,' ');
  }
  function metricEntries(){
    const st=statRecord();if(!st)return[];
    const out=[];[['bat','BATTING'],['pitch','PITCHING'],['fielding','FIELDING']].forEach(([group,title])=>{
      Object.entries(st[group]||{}).forEach(([key,value])=>{if(value===undefined||value===null||value===''||value==='-')return;out.push({id:`${group}:${key}`,group,key,value:String(value),label:metricLabel(key),title})});
    });
    return out;
  }
  function suggestedMetrics(){
    const all=metricEntries(),map=new Map(all.map(x=>[x.id,x]));
    const preferred=['bat:AVG','bat:H','bat:RBI','bat:SB','bat:HR','bat:R','pitch:SO','pitch:ERA','pitch:W','pitch:IP'];
    const picked=[];
    for(const id of preferred){const m=map.get(id);if(!m)continue;const n=Number(m.value);if(['bat:HR','bat:RBI','bat:SB','bat:H','bat:R','pitch:SO','pitch:W'].includes(id)&&(!Number.isFinite(n)||n<=0))continue;picked.push(m);if(picked.length===4)break}
    for(const m of all){if(picked.some(x=>x.id===m.id))continue;picked.push(m);if(picked.length===4)break}
    while(picked.length<4)picked.push({id:'custom',value:'',label:'STAT',title:'CUSTOM'});
    return picked;
  }
  function metricOptions(selected='custom'){
    const all=metricEntries(),groups=new Map();
    all.forEach(m=>{if(!groups.has(m.title))groups.set(m.title,[]);groups.get(m.title).push(m)});
    let html=`<option value="custom" ${selected==='custom'?'selected':''}>Custom stat</option>`;
    for(const [title,items] of groups)html+=`<optgroup label="${esc(title)}">${items.map(m=>`<option value="${esc(m.id)}" ${m.id===selected?'selected':''}>${esc(m.label)} · ${esc(m.value)}</option>`).join('')}</optgroup>`;
    return html;
  }
  function loadImage(src){
    return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This image could not be loaded.'));img.src=src});
  }
  async function loadLogos(){
    if(!logoScript)logoScript=await loadImage(SCRIPT_LOGO).catch(()=>null);
    if(!logoMark)logoMark=await loadImage(D_MARK).catch(()=>null);
  }
  async function useProfilePhoto(){
    const p=selectedPlayer();
    if(!p?.photo){photoSource='';photoImage=null;photoLabel='No profile photo';cutoutCanvas=null;cutoutSource='';paintPhotoPreview();renderPoster();return}
    photoSource=p.photo;photoLabel='Profile photo';cutoutCanvas=null;cutoutSource='';
    try{photoImage=await loadImage(photoSource);paintPhotoPreview();renderPoster()}catch(e){setBgStatus(e.message,'error')}
  }
  async function useUploadedPhoto(file){
    if(!file)return;
    if(photoSource?.startsWith('blob:'))URL.revokeObjectURL(photoSource);
    photoSource=URL.createObjectURL(file);photoLabel=file.name||'Uploaded photo';cutoutCanvas=null;cutoutSource='';
    try{photoImage=await loadImage(photoSource);paintPhotoPreview();renderPoster()}catch(e){setBgStatus(e.message,'error')}
  }
  function paintPhotoPreview(){
    const wrap=$('#jd-graphic-photo-preview');if(!wrap)return;
    const p=selectedPlayer();
    wrap.innerHTML=photoSource?`<img src="${esc(photoSource)}" alt=""><span><strong>${esc(photoLabel||'Player photo')}</strong><small>${cutoutCanvas?'Background removed':'Original image'} · ${esc(p?.name||'')}</small></span>`:`<span><strong>No photo selected</strong><small>Use the profile photo or upload a full-body image.</small></span>`;
  }
  function setBgStatus(text,kind=''){const n=$('#jd-bg-status');if(n){n.textContent=text;n.className=`jd-bg-status ${kind}`}}

  async function removeBackground(){
    if(!photoImage||!photoSource)throw Error('Choose a player photo first.');
    if(cutoutCanvas&&cutoutSource===photoSource)return cutoutCanvas;
    if(!window.SelfieSegmentation)throw Error('Background-removal model did not load. Check your internet connection and try again.');
    setBgStatus('Loading player cutout model…','busy');
    const max=1600,ratio=Math.min(1,max/Math.max(photoImage.naturalWidth||photoImage.width,photoImage.naturalHeight||photoImage.height));
    const w=Math.max(1,Math.round((photoImage.naturalWidth||photoImage.width)*ratio)),h=Math.max(1,Math.round((photoImage.naturalHeight||photoImage.height)*ratio));
    const input=document.createElement('canvas');input.width=w;input.height=h;input.getContext('2d').drawImage(photoImage,0,0,w,h);
    const segmenter=new window.SelfieSegmentation({locateFile:file=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/${file}`});
    segmenter.setOptions({modelSelection:0});
    const result=await new Promise(async(resolve,reject)=>{
      let timer=setTimeout(()=>reject(Error('Background removal timed out. Try the photo again.')),45000);
      segmenter.onResults(results=>{
        clearTimeout(timer);
        try{
          const out=document.createElement('canvas');out.width=w;out.height=h;const ctx=out.getContext('2d');
          ctx.clearRect(0,0,w,h);ctx.drawImage(results.segmentationMask,0,0,w,h);ctx.globalCompositeOperation='source-in';ctx.drawImage(input,0,0,w,h);ctx.globalCompositeOperation='source-over';
          resolve(trimTransparent(out));
        }catch(e){reject(e)}
      });
      try{await segmenter.send({image:input})}catch(e){clearTimeout(timer);reject(e)}
    });
    try{await segmenter.close?.()}catch{}
    cutoutCanvas=result;cutoutSource=photoSource;setBgStatus('Background removed. Ready to generate.','good');paintPhotoPreview();renderPoster();return result;
  }
  function trimTransparent(canvas){
    const ctx=canvas.getContext('2d'),im=ctx.getImageData(0,0,canvas.width,canvas.height),d=im.data;let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for(let y=0;y<canvas.height;y+=2){for(let x=0;x<canvas.width;x+=2){if(d[(y*canvas.width+x)*4+3]>12){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}}}
    if(maxX<0)return canvas;const pad=18;minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(canvas.width-1,maxX+pad);maxY=Math.min(canvas.height-1,maxY+pad);
    const out=document.createElement('canvas');out.width=maxX-minX+1;out.height=maxY-minY+1;out.getContext('2d').drawImage(canvas,minX,minY,out.width,out.height,0,0,out.width,out.height);return out;
  }

  function roundedRect(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath()}
  function fitText(ctx,text,maxWidth,startSize,minSize=24,font='Impact, Haettenschweiler, Arial Narrow Bold, sans-serif'){
    let size=startSize;while(size>minSize){ctx.font=`900 ${size}px ${font}`;if(ctx.measureText(text).width<=maxWidth)break;size-=2}return size;
  }
  function drawImageContain(ctx,img,x,y,w,h,alpha=1){if(!img)return;const r=Math.min(w/img.width,h/img.height),dw=img.width*r,dh=img.height*r;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);ctx.restore()}
  function posterStats(){return $$('.jd-stat-row').map(row=>({value:row.querySelector('.jd-stat-value')?.value?.trim()||'—',label:(row.querySelector('.jd-stat-label')?.value?.trim()||'STAT').toUpperCase()}))}
  function drawNoise(ctx){let seed=10801350;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};ctx.save();for(let i=0;i<1550;i++){const a=.015+rand()*.025;ctx.fillStyle=`rgba(255,255,255,${a})`;const s=rand()<.95?1:2;ctx.fillRect(rand()*CANVAS_W,rand()*CANVAS_H,s,s)}ctx.restore()}
  function drawSkyline(ctx){ctx.save();ctx.globalAlpha=.5;ctx.fillStyle='#09121d';const base=1180;let x=570,seed=29;const rand=()=>{seed=(seed*9301+49297)%233280;return seed/233280};while(x<CANVAS_W){const w=18+rand()*34,h=35+rand()*115;ctx.fillRect(x,base-h,w,h);if(rand()>.72){ctx.fillRect(x+w*.42,base-h-22,w*.16,22)}x+=w+4+rand()*8}ctx.strokeStyle='rgba(55,143,230,.3)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(610,1165);ctx.quadraticCurveTo(790,1055,1035,1166);ctx.stroke();ctx.restore()}
  function renderPoster(){
    const canvas=$('#jd-potw-canvas');if(!canvas)return;const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,CANVAS_W,CANVAS_H);
    const bg=ctx.createLinearGradient(0,0,CANVAS_W,CANVAS_H);bg.addColorStop(0,'#07111d');bg.addColorStop(.48,'#07101a');bg.addColorStop(1,'#02060b');ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    const glow=ctx.createRadialGradient(230,410,40,260,470,690);glow.addColorStop(0,'rgba(16,96,176,.34)');glow.addColorStop(1,'rgba(5,15,26,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    if(logoMark)drawImageContain(ctx,logoMark,140,80,710,710,.075);
    ctx.save();ctx.fillStyle='rgba(16,139,255,.12)';ctx.beginPath();ctx.moveTo(0,930);ctx.lineTo(530,630);ctx.lineTo(420,1350);ctx.lineTo(0,1350);ctx.closePath();ctx.fill();ctx.restore();
    ctx.save();ctx.strokeStyle='#ef3e45';ctx.lineWidth=12;ctx.lineCap='round';[[66,282,148,178],[102,418,183,308],[72,548,136,463]].forEach(v=>{ctx.beginPath();ctx.moveTo(v[0],v[1]);ctx.lineTo(v[2],v[3]);ctx.stroke()});ctx.restore();
    drawNoise(ctx);drawSkyline(ctx);
    if(logoScript)drawImageContain(ctx,logoScript,45,30,300,180,1);
    ctx.fillStyle='#d8e7f7';ctx.font='700 22px Arial, sans-serif';ctx.letterSpacing='6px';ctx.fillText('JERSEY DODGERS',628,112);
    ctx.fillStyle='#ef3e45';ctx.fillRect(590,145,78,8);ctx.fillRect(978,145,58,8);
    ctx.fillStyle='#fff';const titleSize=fitText(ctx,'PLAYER',455,158,110);ctx.font=`900 ${titleSize}px Impact, Haettenschweiler, Arial Narrow Bold, sans-serif`;ctx.fillText('PLAYER',590,302);
    ctx.fillStyle='#168bff';const weekSize=fitText(ctx,'OF THE WEEK',455,76,52);ctx.font=`900 ${weekSize}px Impact, Haettenschweiler, Arial Narrow Bold, sans-serif`;ctx.fillText('OF THE WEEK',590,382);
    const p=selectedPlayer()||{};const name=String(p.name||'PLAYER NAME').toUpperCase(),number=String(rosterPlayers().find(x=>String(x.id)===String(p.id))?.number||p.number||'');
    ctx.fillStyle='#ef3e45';ctx.font='900 50px Impact, Arial Narrow Bold, sans-serif';ctx.fillText(number?`#${number}`:'#—',595,455);ctx.fillStyle='#fff';const nameSize=fitText(ctx,name,315,44,25,'Arial Narrow, Arial, sans-serif');ctx.font=`900 ${nameSize}px Arial Narrow, Arial, sans-serif`;ctx.fillText(name,735,452);
    const stats=posterStats(),sx=590,sy=500,sw=210,sh=150,gap=18;stats.slice(0,4).forEach((s,i)=>{const col=i%2,row=Math.floor(i/2),x=sx+col*(sw+gap),y=sy+row*(sh+gap);ctx.save();roundedRect(ctx,x,y,sw,sh,4);ctx.fillStyle='rgba(3,10,17,.78)';ctx.fill();ctx.strokeStyle='rgba(35,104,168,.72)';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff';const valueSize=fitText(ctx,s.value,sw-24,55,32);ctx.font=`900 ${valueSize}px Impact, Arial Narrow Bold, sans-serif`;ctx.textAlign='center';ctx.fillText(s.value,x+sw/2,y+73);ctx.fillStyle='#d6e4f2';ctx.font='800 18px Arial Narrow, Arial, sans-serif';const label=String(s.label||'STAT');if(ctx.measureText(label).width>sw-20){const parts=label.split(' '),mid=Math.ceil(parts.length/2);ctx.fillText(parts.slice(0,mid).join(' '),x+sw/2,y+110);ctx.fillText(parts.slice(mid).join(' '),x+sw/2,y+133)}else ctx.fillText(label,x+sw/2,y+121);ctx.restore()});
    ctx.textAlign='left';ctx.fillStyle='#a5bad0';ctx.font='700 15px Arial, sans-serif';ctx.fillText(($('#jd-week-label')?.value||`${seasonName()} · ${phase==='playoffs'?'PLAYOFFS':'REGULAR SEASON'}`).toUpperCase(),592,862);
    ctx.fillStyle='#168bff';ctx.fillRect(592,882,68,5);ctx.fillStyle='#b9c9da';ctx.font='700 15px Arial, sans-serif';ctx.fillText('FAMILY  |  COMPETE  |  DEVELOP  |  REPRESENT',592,920);
    const playerArt=cutoutCanvas||photoImage;
    if(playerArt){
      const iw=playerArt.width||playerArt.naturalWidth,ih=playerArt.height||playerArt.naturalHeight;baseDrawPlayer(ctx,playerArt,iw,ih,true);baseDrawPlayer(ctx,playerArt,iw,ih,false);
    }else{ctx.save();ctx.fillStyle='rgba(22,139,255,.12)';roundedRect(ctx,58,250,490,1010,8);ctx.fill();ctx.fillStyle='#6f89a5';ctx.font='800 25px Arial, sans-serif';ctx.fillText('SELECT A PLAYER PHOTO',125,760);ctx.restore()}
    ctx.fillStyle='rgba(3,8,14,.94)';ctx.fillRect(0,1210,CANVAS_W,140);ctx.fillStyle='#168bff';ctx.fillRect(0,1200,CANVAS_W,10);ctx.strokeStyle='rgba(239,62,69,.85)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(640,1197);ctx.lineTo(1080,1160);ctx.stroke();
    if(logoMark)drawImageContain(ctx,logoMark,52,1230,80,80,1);
    ctx.fillStyle='#93a7bd';ctx.font='700 13px Arial, sans-serif';ctx.fillText('VISIT OUR WEBSITE',158,1253);ctx.fillStyle='#fff';ctx.font='900 28px Arial, sans-serif';ctx.fillText('JERSEYDODGERS.COM',158,1292);ctx.fillStyle='#8fa5bd';ctx.font='700 14px Arial, sans-serif';ctx.fillText('@JERSEYDODGERS',807,1291);ctx.fillStyle='#cbd9e7';ctx.font='700 13px Arial, sans-serif';ctx.fillText('MORE THAN A TEAM · A FAMILY',807,1252);
    generated=true;const dl=$('#jd-download-graphic');if(dl)dl.disabled=false;
  }
  function baseDrawPlayer(ctx,img,iw,ih,shadow){
    const targetH=1160*playerScale,targetW=targetH*(iw/ih),cx=294+playerX,base=1260+playerY,x=cx-targetW/2,y=base-targetH;
    ctx.save();if(shadow){ctx.globalAlpha=.18;ctx.filter='grayscale(1) brightness(.45) contrast(1.15)';ctx.drawImage(img,x-135,y+48,targetW*.9,targetH*.9)}else{ctx.globalAlpha=1;ctx.filter='drop-shadow(0 18px 24px rgba(0,0,0,.45))';ctx.drawImage(img,x,y,targetW,targetH)}ctx.restore();
  }
  function renderStatRows(){
    const wrap=$('#jd-graphic-stats');if(!wrap)return;const picks=suggestedMetrics();wrap.innerHTML=picks.map((m,i)=>`<div class="jd-stat-row" data-stat-row="${i}"><select class="jd-stat-key">${metricOptions(m.id)}</select><input class="jd-stat-value" value="${esc(m.value)}" placeholder="Value"><input class="jd-stat-label" value="${esc(m.label)}" placeholder="Label"></div>`).join('');
    $$('.jd-stat-row',wrap).forEach(row=>{const sel=$('.jd-stat-key',row),val=$('.jd-stat-value',row),label=$('.jd-stat-label',row);sel.addEventListener('change',()=>{const m=metricEntries().find(x=>x.id===sel.value);if(m){val.value=m.value;label.value=m.label}renderPoster()});val.addEventListener('input',renderPoster);label.addEventListener('input',renderPoster)});
  }
  function playerOptions(){const players=rosterPlayers();return players.map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(selectedPlayerId)?'selected':''}>#${esc(p.number||'—')} · ${esc(p.name)}</option>`).join('')}
  async function onPlayerChanged(){
    const select=$('#jd-graphic-player');selectedPlayerId=select?.value||'';playerScale=1;playerX=0;playerY=0;syncPlacement();renderStatRows();await useProfilePhoto();
  }
  function syncPlacement(){const scale=$('#jd-player-scale');if(scale){scale.value=String(playerScale);$('#jd-player-scale-value').textContent=`${Math.round(playerScale*100)}%`}}
  function renderControls(){
    const content=$('#section-content');if(!content)return;
    const seasonOpts=seasons().map(s=>`<option value="${esc(s.id)}" ${s.id===selectedSeasonId?'selected':''}>${esc(s.name)}</option>`).join('');
    content.innerHTML=`<div class="jd-graphic-shell">
      <div class="jd-graphic-intro"><div><span class="eyebrow">SOCIAL GRAPHICS</span><h2>Player of the Week Generator</h2><p>Create a finished Jersey Dodgers Instagram post from the player profile, an uploaded full-body photo, and the stats you choose. The final file is rendered locally in your browser.</p></div><span class="jd-graphic-size">1080 × 1350 · 4:5</span></div>
      <div class="jd-graphic-layout">
        <div class="jd-graphic-controls">
          <section><h3>1. Player & season</h3><div class="jd-graphic-field-grid"><label>Season<select id="jd-graphic-season">${seasonOpts}</select></label><label>Stat set<select id="jd-graphic-phase"><option value="regular" ${phase==='regular'?'selected':''}>Regular season</option><option value="playoffs" ${phase==='playoffs'?'selected':''}>Playoffs</option></select></label></div><label>Player<select id="jd-graphic-player">${playerOptions()}</select></label><label>Week / caption line<input id="jd-week-label" value="${esc(`${seasonName()} · ${phase==='playoffs'?'PLAYOFFS':'REGULAR SEASON'}`)}" placeholder="WEEK 3 · FALL 2026"></label></section>
          <section><h3>2. Player photo</h3><p>Use the saved profile photo or upload a better full-body image just for this graphic.</p><div class="jd-graphic-photo-row"><button class="button" id="jd-use-profile-photo" type="button">Use profile photo</button><label class="button" for="jd-graphic-upload-photo">Upload different photo</label><input id="jd-graphic-upload-photo" type="file" accept="image/*"></div><div class="jd-graphic-photo-preview" id="jd-graphic-photo-preview"></div><div class="jd-bg-actions"><label class="jd-bg-toggle"><input id="jd-auto-remove-bg" type="checkbox" checked>Auto-remove background when Generate is pressed</label><button type="button" id="jd-remove-bg">Remove background now</button></div><div id="jd-bg-status" class="jd-bg-status">The first background removal may take a few seconds while the model loads.</div></section>
          <section><h3>3. Featured stats</h3><p>Pick any four saved stats or switch a row to Custom and type the week/game value yourself.</p><div id="jd-graphic-stats"></div></section>
          <section><h3>4. Player placement</h3><p>Drag the player directly on the poster preview. Use the slider to make the cutout larger or smaller.</p><div class="jd-placement-row"><input id="jd-player-scale" type="range" min="0.65" max="1.5" step="0.01" value="1"><output id="jd-player-scale-value">100%</output></div><button type="button" id="jd-reset-placement">Reset placement</button></section>
          <section class="jd-graphic-actions"><button class="button primary" id="jd-generate-graphic" type="button">Generate Player of the Week Graphic</button><button type="button" id="jd-download-graphic" disabled>Download PNG</button><button type="button" id="jd-reset-graphic">Reset graphic</button></section>
          <div class="jd-generator-note"><strong>Background removal:</strong> it runs on your device using a person-segmentation model. Your uploaded player photo is not sent to a separate background-removal service.</div>
        </div>
        <div class="jd-graphic-stage-wrap"><div class="jd-graphic-stage-head"><strong>POST PREVIEW</strong><span>1080 × 1350 PNG</span></div><div class="jd-graphic-canvas-shell"><canvas id="jd-potw-canvas" width="1080" height="1350" aria-label="Player of the Week graphic preview"></canvas></div><div class="jd-graphic-help"><span><strong>Drag:</strong> move the player</span><span><strong>Scale:</strong> use the player size slider</span></div></div>
      </div></div>`;
    bindControls();renderStatRows();paintPhotoPreview();renderPoster();
  }
  function bindControls(){
    $('#jd-graphic-season')?.addEventListener('change',async e=>{selectedSeasonId=e.target.value;const ps=rosterPlayers();selectedPlayerId=ps[0]?.id||'';renderControls();await onPlayerChanged()});
    $('#jd-graphic-phase')?.addEventListener('change',async e=>{phase=e.target.value==='playoffs'?'playoffs':'regular';const ps=rosterPlayers();selectedPlayerId=ps[0]?.id||'';renderControls();await onPlayerChanged()});
    $('#jd-graphic-player')?.addEventListener('change',onPlayerChanged);
    $('#jd-week-label')?.addEventListener('input',renderPoster);
    $('#jd-use-profile-photo')?.addEventListener('click',useProfilePhoto);
    $('#jd-graphic-upload-photo')?.addEventListener('change',e=>useUploadedPhoto(e.target.files?.[0]));
    $('#jd-remove-bg')?.addEventListener('click',async()=>{const b=$('#jd-remove-bg');try{b.disabled=true;await removeBackground()}catch(e){setBgStatus(e.message,'error')}finally{b.disabled=false}});
    $('#jd-player-scale')?.addEventListener('input',e=>{playerScale=Number(e.target.value);$('#jd-player-scale-value').textContent=`${Math.round(playerScale*100)}%`;renderPoster()});
    $('#jd-reset-placement')?.addEventListener('click',()=>{playerScale=1;playerX=0;playerY=0;syncPlacement();renderPoster()});
    $('#jd-generate-graphic')?.addEventListener('click',async()=>{const b=$('#jd-generate-graphic');try{b.disabled=true;b.textContent='Generating…';if($('#jd-auto-remove-bg')?.checked&&photoImage&&cutoutSource!==photoSource)await removeBackground();renderPoster();setStatus('Player of the Week graphic generated.')}catch(e){setBgStatus(e.message,'error');setStatus(e.message,true)}finally{b.disabled=false;b.textContent='Generate Player of the Week Graphic'}});
    $('#jd-download-graphic')?.addEventListener('click',downloadPoster);
    $('#jd-reset-graphic')?.addEventListener('click',async()=>{cutoutCanvas=null;cutoutSource='';playerScale=1;playerX=0;playerY=0;syncPlacement();renderStatRows();await useProfilePhoto();setBgStatus('Graphic reset.','')});
    const canvas=$('#jd-potw-canvas');if(canvas){
      const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*CANVAS_W/r.width,y:(e.clientY-r.top)*CANVAS_H/r.height}};
      canvas.addEventListener('pointerdown',e=>{drag=point(e);canvas.setPointerCapture?.(e.pointerId);canvas.classList.add('dragging')});
      canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=point(e);playerX+=p.x-drag.x;playerY+=p.y-drag.y;drag=p;renderPoster()});
      const end=()=>{drag=null;canvas.classList.remove('dragging')};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
    }
  }
  function downloadPoster(){
    const canvas=$('#jd-potw-canvas');if(!canvas)return;const p=selectedPlayer();canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a'),safe=String(p?.name||'player').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');a.href=url;a.download=`jersey-dodgers-player-of-the-week-${safe||'player'}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200)},'image/png');
  }
  async function openGenerator(){
    active=true;document.body.classList.remove('admin-menu-open');$('#admin-nav')?.classList.remove('open');$('#admin-menu-toggle')?.setAttribute('aria-expanded','false');$$('#admin-nav [data-section],#jd-staff-nav').forEach(b=>b.classList.remove('active'));$('#jd-graphic-nav')?.classList.add('active');
    const saveState=$('#save-state'),saveButton=$('#save-all');if(saveState)saveState.hidden=true;if(saveButton)saveButton.hidden=true;const heading=$('.admin-heading h1');if(heading)heading.textContent='Graphic Generator';const help=$('.admin-help');if(help)help.textContent='Build a 1080×1350 Jersey Dodgers Player of the Week post from a real player photo and the stats you choose.';
    try{const payload=await api('/api/admin/content');data=payload.data||payload;selectedSeasonId=selectedSeasonId&&data.seasons.some(s=>s.id===selectedSeasonId)?selectedSeasonId:currentSeason();const ps=rosterPlayers();selectedPlayerId=ps.some(p=>String(p.id)===String(selectedPlayerId))?selectedPlayerId:(ps[0]?.id||'');await loadLogos();renderControls();await useProfilePhoto()}catch(e){setStatus(e.message,true)}
  }
  async function install(){
    const nav=$('#admin-nav');if(!nav||$('#jd-graphic-nav'))return;
    try{access=await api('/api/admin/access');if(!access.media)return;const b=document.createElement('button');b.id='jd-graphic-nav';b.type='button';b.textContent='Graphic Generator';b.addEventListener('click',openGenerator);const staff=$('#jd-staff-nav'),mobile=nav.querySelector('.admin-mobile-site');nav.insertBefore(b,staff||mobile||null)}catch{}
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-section],#jd-staff-nav')){active=false;$('#jd-graphic-nav')?.classList.remove('active')}});
  const observer=new MutationObserver(()=>install());observer.observe(document.documentElement,{childList:true,subtree:true});[450,900,1600,2800].forEach(t=>setTimeout(install,t));
})();
