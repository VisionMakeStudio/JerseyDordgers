(() => {
  'use strict';
  if (window.__jdGraphicGeneratorV122Loaded) return;
  window.__jdGraphicGeneratorV122Loaded = true;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const CANVAS_W=1080,CANVAS_H=1350;
  const SCRIPT_LOGO='/assets/jd-script-logo-official.png';
  const D_MARK='/assets/jd-d-mark-official.png';
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));

  let data=null,access=null,active=false,installing=false;
  let selectedPlayerId='',selectedSeasonId='',phase='regular';
  let photoSource='',photoImage=null,photoLabel='';
  let cutoutCanvas=null,cutoutSource='';
  let playerScale=.78,playerX=0,playerY=0,drag=null,playerStyle='dramatic';
  let logoScript=null,logoMark=null;
  let generated=false;
  let statRows=[];
  let textState={};

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
  function num(v){const m=String(v||'').match(/\d+/);return m?Number(m[0]):9999}
  function rosterPlayers(){
    const rows=rosterArray().filter(r=>r.season===selectedSeasonId),pmap=new Map((data?.players||[]).map(p=>[String(p.id),p]));
    const byPlayer=new Map(rows.map(r=>[String(r.player),r]));
    const list=[];
    rows.filter(r=>r.active!==false).forEach(r=>{const p=pmap.get(String(r.player));if(p)list.push({...p,number:r.number||p.number||'',position:r.position||p.position||''})});
    statsArray().filter(s=>s.season===selectedSeasonId&&!byPlayer.has(String(s.player))).forEach(s=>{const p=pmap.get(String(s.player));if(p)list.push(p)});
    const seen=new Set();return list.filter(p=>!seen.has(String(p.id))&&seen.add(String(p.id))).sort((a,b)=>num(a.number)-num(b.number)||String(a.name).localeCompare(String(b.name)));
  }
  function statRecord(){return statsArray().find(s=>s.season===selectedSeasonId&&String(s.player)===String(selectedPlayerId))||null}
  function seasonName(){return data?.seasons?.find(s=>s.id===selectedSeasonId)?.name||''}
  function selectedPlayer(){return playerById(selectedPlayerId)}
  function rosterPlayer(){return rosterPlayers().find(p=>String(p.id)===String(selectedPlayerId))||selectedPlayer()||{}}

  function metricLabel(key){
    const map={AVG:'AVG',OBP:'OBP',OPS:'OPS',SLG:'SLG',H:'HITS',HR:'HOME RUNS',RBI:'RBI',R:'RUNS',SB:'STOLEN BASES',PA:'PLATE APPEARANCES',AB:'AT BATS',SO:'STRIKEOUTS',W:'WINS',SV:'SAVES',IP:'INNINGS PITCHED',ERA:'ERA',WHIP:'WHIP',FPCT:'FIELDING %',PO:'PUTOUTS',A:'ASSISTS',DP:'DOUBLE PLAYS',CS:'CAUGHT STEALING'};
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
    for(const id of preferred){const m=map.get(id);if(!m)continue;const n=Number(m.value);if(['bat:HR','bat:RBI','bat:SB','bat:H','bat:R','pitch:SO','pitch:W'].includes(id)&&(!Number.isFinite(n)||n<=0))continue;picked.push({...m});if(picked.length===4)break}
    for(const m of all){if(picked.some(x=>x.id===m.id))continue;picked.push({...m});if(picked.length===4)break}
    while(picked.length<4)picked.push({id:'custom',value:'',label:'STAT',title:'CUSTOM'});
    return picked;
  }
  function resetStats(){statRows=suggestedMetrics().slice(0,4).map(m=>({key:m.id||'custom',value:String(m.value??''),label:String(m.label||'STAT')}))}
  function metricOptions(selected='custom'){
    const all=metricEntries(),groups=new Map();
    all.forEach(m=>{if(!groups.has(m.title))groups.set(m.title,[]);groups.get(m.title).push(m)});
    let html=`<option value="custom" ${selected==='custom'?'selected':''}>Custom stat</option>`;
    for(const [title,items] of groups)html+=`<optgroup label="${esc(title)}">${items.map(m=>`<option value="${esc(m.id)}" ${m.id===selected?'selected':''}>${esc(m.label)} · ${esc(m.value)}</option>`).join('')}</optgroup>`;
    return html;
  }

  function defaultText(){
    const p=rosterPlayer();
    return {
      eyebrow:'JERSEY DODGERS',
      mainTitle:'PLAYER',
      secondTitle:'OF THE WEEK',
      playerName:String(p.name||'PLAYER NAME').toUpperCase(),
      jerseyNumber:String(p.number||''),
      weekLabel:`${seasonName()} · ${phase==='playoffs'?'PLAYOFFS':'REGULAR SEASON'}`.toUpperCase(),
      tagline:'FAMILY | COMPETE | DEVELOP | REPRESENT',
      website:'JERSEYDODGERS.COM',
      social:'@JERSEYDODGERS',
      smallText:'MORE THAN A TEAM · A FAMILY'
    };
  }
  function resetText(){textState=defaultText()}

  function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This image could not be loaded.'));img.src=src})}
  async function loadLogos(){if(!logoScript)logoScript=await loadImage(SCRIPT_LOGO).catch(()=>null);if(!logoMark)logoMark=await loadImage(D_MARK).catch(()=>null)}
  async function useProfilePhoto(){
    const p=selectedPlayer();
    if(!p?.photo){photoSource='';photoImage=null;photoLabel='No profile photo';cutoutCanvas=null;cutoutSource='';paintPhotoPreview();renderPoster();return}
    photoSource=p.photo;photoLabel='Profile photo';cutoutCanvas=null;cutoutSource='';
    try{photoImage=await loadImage(photoSource);paintPhotoPreview();renderPoster()}catch(e){setBgStatus(e.message,'error')}
  }
  async function useUploadedPhoto(file){
    if(!file)return;if(photoSource?.startsWith('blob:'))URL.revokeObjectURL(photoSource);
    photoSource=URL.createObjectURL(file);photoLabel=file.name||'Uploaded photo';cutoutCanvas=null;cutoutSource='';
    try{photoImage=await loadImage(photoSource);paintPhotoPreview();renderPoster()}catch(e){setBgStatus(e.message,'error')}
  }
  function paintPhotoPreview(){
    const wrap=$('#jd-graphic-photo-preview');if(!wrap)return;const p=selectedPlayer();
    wrap.innerHTML=photoSource?`<img src="${esc(photoSource)}" alt=""><span><strong>${esc(photoLabel||'Player photo')}</strong><small>${cutoutCanvas?'Background removed':'Original image'} · ${esc(p?.name||'')}</small></span>`:`<span><strong>No photo selected</strong><small>Use the profile photo or upload a full-body image.</small></span>`;
  }
  function setBgStatus(text,kind=''){const n=$('#jd-bg-status');if(n){n.textContent=text;n.className=`jd-bg-status ${kind}`}}

  async function removeBackground(){
    if(!photoImage||!photoSource)throw Error('Choose a player photo first.');
    if(cutoutCanvas&&cutoutSource===photoSource)return cutoutCanvas;
    if(!window.SelfieSegmentation)throw Error('Background-removal model did not load. Check your internet connection and try again.');
    setBgStatus('Removing the background…','busy');
    const max=1600,ratio=Math.min(1,max/Math.max(photoImage.naturalWidth||photoImage.width,photoImage.naturalHeight||photoImage.height));
    const w=Math.max(1,Math.round((photoImage.naturalWidth||photoImage.width)*ratio)),h=Math.max(1,Math.round((photoImage.naturalHeight||photoImage.height)*ratio));
    const input=document.createElement('canvas');input.width=w;input.height=h;input.getContext('2d').drawImage(photoImage,0,0,w,h);
    const segmenter=new window.SelfieSegmentation({locateFile:file=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/${file}`});segmenter.setOptions({modelSelection:0});
    const result=await new Promise(async(resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Background removal timed out. Try the photo again.')),45000);
      segmenter.onResults(results=>{clearTimeout(timer);try{
        const mask=document.createElement('canvas');mask.width=w;mask.height=h;const mctx=mask.getContext('2d',{willReadFrequently:true});mctx.drawImage(results.segmentationMask,0,0,w,h);
        const maskData=mctx.getImageData(0,0,w,h).data;
        const src=input.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h);
        const out=document.createElement('canvas');out.width=w;out.height=h;const octx=out.getContext('2d');const pixels=octx.createImageData(w,h);
        // MediaPipe's soft mask is tightened here so the old photo background does not leave a cyan/white halo.
        const low=.52,high=.76;
        for(let i=0;i<maskData.length;i+=4){
          const alphaChannel=maskData[i+3]===255?0:maskData[i+3];
          const probability=Math.max(maskData[i],maskData[i+1],maskData[i+2],alphaChannel)/255;
          let a=Math.max(0,Math.min(1,(probability-low)/(high-low)));a=a*a*(3-2*a);
          pixels.data[i]=src.data[i];pixels.data[i+1]=src.data[i+1];pixels.data[i+2]=src.data[i+2];pixels.data[i+3]=Math.round(src.data[i+3]*a);
        }
        octx.putImageData(pixels,0,0);resolve(trimTransparent(out));
      }catch(e){reject(e)}});
      try{await segmenter.send({image:input})}catch(e){clearTimeout(timer);reject(e)}
    });
    try{await segmenter.close?.()}catch{}
    cutoutCanvas=result;cutoutSource=photoSource;setBgStatus('Background removed.','good');paintPhotoPreview();renderPoster();return result;
  }
  function trimTransparent(canvas){
    const ctx=canvas.getContext('2d'),im=ctx.getImageData(0,0,canvas.width,canvas.height),d=im.data;let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for(let y=0;y<canvas.height;y+=2)for(let x=0;x<canvas.width;x+=2)if(d[(y*canvas.width+x)*4+3]>12){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
    if(maxX<0)return canvas;const pad=20;minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(canvas.width-1,maxX+pad);maxY=Math.min(canvas.height-1,maxY+pad);
    const out=document.createElement('canvas');out.width=maxX-minX+1;out.height=maxY-minY+1;out.getContext('2d').drawImage(canvas,minX,minY,out.width,out.height,0,0,out.width,out.height);return out;
  }

  function roundedRect(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath()}
  function fitText(ctx,text,maxWidth,startSize,minSize=18,font='Impact, Haettenschweiler, Arial Narrow Bold, sans-serif'){let size=startSize;while(size>minSize){ctx.font=`900 ${size}px ${font}`;if(ctx.measureText(text).width<=maxWidth)break;size-=2}return size}
  function drawImageContain(ctx,img,x,y,w,h,alpha=1){if(!img)return;const iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight,r=Math.min(w/iw,h/ih),dw=iw*r,dh=ih*r;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);ctx.restore()}
  function posterStats(){return statRows.slice(0,5).map(s=>({value:String(s.value||'—'),label:String(s.label||'STAT').toUpperCase()}))}
  function drawNoise(ctx){let seed=10801350;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};ctx.save();for(let i=0;i<1250;i++){ctx.fillStyle=`rgba(255,255,255,${.012+rand()*.022})`;const s=rand()<.96?1:2;ctx.fillRect(rand()*CANVAS_W,rand()*CANVAS_H,s,s)}ctx.restore()}
  function drawSkyline(ctx){ctx.save();ctx.globalAlpha=.48;ctx.fillStyle='#09121d';const base=1180;let x=570,seed=29;const rand=()=>{seed=(seed*9301+49297)%233280;return seed/233280};while(x<CANVAS_W){const w=18+rand()*34,h=35+rand()*115;ctx.fillRect(x,base-h,w,h);if(rand()>.72)ctx.fillRect(x+w*.42,base-h-22,w*.16,22);x+=w+4+rand()*8}ctx.strokeStyle='rgba(55,143,230,.3)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(610,1165);ctx.quadraticCurveTo(790,1055,1035,1166);ctx.stroke();ctx.restore()}

  function playerRect(img){
    const iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight;
    const targetH=980*playerScale,targetW=targetH*(iw/ih),cx=286+clamp(playerX,-150,150),base=1198+clamp(playerY,-120,100);
    return {x:cx-targetW/2,y:base-targetH,w:targetW,h:targetH};
  }
  function drawPlayer(ctx,img){
    if(!img)return;const r=playerRect(img);
    // Large monochrome ghost gives depth without putting a bright outline around the real player.
    ctx.save();ctx.globalAlpha=.12;ctx.filter='grayscale(1) brightness(.28) contrast(1.35)';ctx.drawImage(img,r.x-122,r.y+46,r.w*.94,r.h*.94);ctx.restore();

    // Main player: crisp color grade + dark editorial shadow. Blue glow is opt-in only.
    ctx.save();ctx.shadowOffsetX=9;ctx.shadowOffsetY=18;
    if(playerStyle==='blue'){
      ctx.shadowColor='rgba(16,110,210,.48)';ctx.shadowBlur=18;ctx.filter='contrast(1.10) saturate(1.16) brightness(.97)';
    }else if(playerStyle==='clean'){
      ctx.shadowColor='rgba(0,0,0,.68)';ctx.shadowBlur=18;ctx.filter='contrast(1.05) saturate(1.03) brightness(.99)';
    }else{
      ctx.shadowColor='rgba(0,0,0,.78)';ctx.shadowBlur=28;ctx.filter='contrast(1.12) saturate(1.10) brightness(.95)';
    }
    ctx.drawImage(img,r.x,r.y,r.w,r.h);ctx.restore();

    // Blend the lower body into the poster instead of leaving a pasted-on cutout edge.
    const fade=ctx.createLinearGradient(0,900,0,1205);fade.addColorStop(0,'rgba(4,10,17,0)');fade.addColorStop(1,'rgba(4,10,17,.76)');ctx.fillStyle=fade;ctx.fillRect(0,875,565,335);
  }
  function statRects(count){
    const x=594,y=505,W=438,g=14;
    if(count===3)return [{x,y,w:(W-g)/2,h:145},{x:x+(W+g)/2,y,w:(W-g)/2,h:145},{x,y:y+160,w:W,h:145}];
    if(count===5){const w3=(W-g*2)/3,w2=(W-g)/2;return [{x,y,w:w3,h:140},{x:x+w3+g,y,w:w3,h:140},{x:x+(w3+g)*2,y,w:w3,h:140},{x,y:y+155,w:w2,h:140},{x:x+w2+g,y:y+155,w:w2,h:140}]}
    const w=(W-g)/2;return [{x,y,w,h:145},{x:x+w+g,y,w,h:145},{x,y:y+160,w,h:145},{x:x+w+g,y:y+160,w,h:145}]
  }
  function drawStats(ctx){
    const stats=posterStats(),rects=statRects(stats.length);stats.forEach((s,i)=>{const r=rects[i];if(!r)return;ctx.save();roundedRect(ctx,r.x,r.y,r.w,r.h,5);ctx.fillStyle='rgba(2,8,14,.91)';ctx.fill();ctx.strokeStyle='rgba(41,126,207,.82)';ctx.lineWidth=2;ctx.stroke();ctx.textAlign='center';ctx.fillStyle='#fff';const vs=fitText(ctx,s.value,r.w-24,52,28);ctx.font=`900 ${vs}px Impact, Arial Narrow Bold, sans-serif`;ctx.fillText(s.value,r.x+r.w/2,r.y+68);ctx.fillStyle='#d8e5f2';const ls=fitText(ctx,s.label,r.w-20,18,12,'Arial Narrow, Arial, sans-serif');ctx.font=`800 ${ls}px Arial Narrow, Arial, sans-serif`;const parts=s.label.split(' ');if(parts.length>1&&ctx.measureText(s.label).width>r.w-18){const mid=Math.ceil(parts.length/2);ctx.fillText(parts.slice(0,mid).join(' '),r.x+r.w/2,r.y+105);ctx.fillText(parts.slice(mid).join(' '),r.x+r.w/2,r.y+128)}else ctx.fillText(s.label,r.x+r.w/2,r.y+117);ctx.restore()})
  }
  function renderPoster(){
    const canvas=$('#jd-potw-canvas');if(!canvas)return;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,CANVAS_W,CANVAS_H);
    const bg=ctx.createLinearGradient(0,0,CANVAS_W,CANVAS_H);bg.addColorStop(0,'#07111d');bg.addColorStop(.5,'#07101a');bg.addColorStop(1,'#02060b');ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    const glow=ctx.createRadialGradient(230,410,40,260,470,690);glow.addColorStop(0,'rgba(17,101,190,.35)');glow.addColorStop(1,'rgba(5,15,26,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    if(logoMark)drawImageContain(ctx,logoMark,115,70,740,740,.065);
    ctx.save();ctx.fillStyle='rgba(16,139,255,.10)';ctx.beginPath();ctx.moveTo(0,930);ctx.lineTo(530,630);ctx.lineTo(420,1350);ctx.lineTo(0,1350);ctx.closePath();ctx.fill();ctx.restore();
    ctx.save();ctx.strokeStyle='#ef3e45';ctx.lineWidth=11;ctx.lineCap='round';[[64,290,146,182],[99,430,181,320],[73,558,137,472]].forEach(v=>{ctx.beginPath();ctx.moveTo(v[0],v[1]);ctx.lineTo(v[2],v[3]);ctx.stroke()});ctx.restore();
    drawNoise(ctx);drawSkyline(ctx);

    // Player is deliberately below every important text/stat layer.
    const playerArt=cutoutCanvas||photoImage;if(playerArt)drawPlayer(ctx,playerArt);else{ctx.save();ctx.fillStyle='rgba(22,139,255,.10)';roundedRect(ctx,55,245,500,950,8);ctx.fill();ctx.fillStyle='#6f89a5';ctx.font='800 25px Arial, sans-serif';ctx.fillText('SELECT A PLAYER PHOTO',120,760);ctx.restore()}
    const readability=ctx.createLinearGradient(500,0,760,0);readability.addColorStop(0,'rgba(2,7,12,.05)');readability.addColorStop(1,'rgba(2,7,12,.78)');ctx.fillStyle=readability;ctx.fillRect(490,0,590,1198);

    // Branding and information layer.
    if(logoScript)drawImageContain(ctx,logoScript,42,28,305,185,1);
    ctx.fillStyle='#d8e7f7';ctx.font='700 22px Arial, sans-serif';ctx.fillText(String(textState.eyebrow||'JERSEY DODGERS').toUpperCase(),628,112);
    ctx.fillStyle='#ef3e45';ctx.fillRect(590,145,78,8);ctx.fillRect(978,145,58,8);
    ctx.fillStyle='#fff';const title=String(textState.mainTitle||'PLAYER').toUpperCase();const ts=fitText(ctx,title,450,156,82);ctx.font=`900 ${ts}px Impact, Haettenschweiler, Arial Narrow Bold, sans-serif`;ctx.fillText(title,590,302);
    ctx.fillStyle='#168bff';const second=String(textState.secondTitle||'OF THE WEEK').toUpperCase();const ss=fitText(ctx,second,450,76,40);ctx.font=`900 ${ss}px Impact, Haettenschweiler, Arial Narrow Bold, sans-serif`;ctx.fillText(second,590,382);
    ctx.fillStyle='#ef3e45';const jersey=String(textState.jerseyNumber||'').replace(/^#/,'');ctx.font='900 48px Impact, Arial Narrow Bold, sans-serif';ctx.fillText(jersey?`#${jersey}`:'#—',595,455);
    ctx.fillStyle='#fff';const pname=String(textState.playerName||'PLAYER NAME').toUpperCase();const ns=fitText(ctx,pname,315,42,24,'Arial Narrow, Arial, sans-serif');ctx.font=`900 ${ns}px Arial Narrow, Arial, sans-serif`;ctx.fillText(pname,735,452);
    drawStats(ctx);
    ctx.textAlign='left';ctx.fillStyle='#a5bad0';const week=String(textState.weekLabel||'').toUpperCase();ctx.font=`700 ${fitText(ctx,week,430,15,11,'Arial, sans-serif')}px Arial, sans-serif`;ctx.fillText(week,594,836);
    ctx.fillStyle='#168bff';ctx.fillRect(594,856,68,5);ctx.fillStyle='#b9c9da';const tag=String(textState.tagline||'').toUpperCase();ctx.font=`700 ${fitText(ctx,tag,430,15,10,'Arial, sans-serif')}px Arial, sans-serif`;ctx.fillText(tag,594,895);

    // Footer is a fixed safe zone.
    ctx.fillStyle='rgba(3,8,14,.96)';ctx.fillRect(0,1200,CANVAS_W,150);ctx.fillStyle='#168bff';ctx.fillRect(0,1198,CANVAS_W,9);ctx.strokeStyle='rgba(239,62,69,.85)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(640,1195);ctx.lineTo(1080,1162);ctx.stroke();
    if(logoMark)drawImageContain(ctx,logoMark,48,1230,78,78,1);
    ctx.fillStyle='#93a7bd';ctx.font='700 12px Arial, sans-serif';ctx.fillText('VISIT OUR WEBSITE',154,1251);ctx.fillStyle='#fff';const website=String(textState.website||'JERSEYDODGERS.COM').toUpperCase();ctx.font=`900 ${fitText(ctx,website,500,28,18,'Arial, sans-serif')}px Arial, sans-serif`;ctx.fillText(website,154,1292);
    ctx.textAlign='right';ctx.fillStyle='#cbd9e7';const small=String(textState.smallText||'').toUpperCase();ctx.font=`700 ${fitText(ctx,small,320,12,9,'Arial, sans-serif')}px Arial, sans-serif`;ctx.fillText(small,1030,1253);ctx.fillStyle='#8fa5bd';const social=String(textState.social||'@JERSEYDODGERS').toUpperCase();ctx.font=`700 ${fitText(ctx,social,320,14,10,'Arial, sans-serif')}px Arial, sans-serif`;ctx.fillText(social,1030,1293);ctx.textAlign='left';
    generated=true;const dl=$('#jd-download-graphic');if(dl)dl.disabled=false;
  }

  function renderStatRows(){
    const wrap=$('#jd-graphic-stats');if(!wrap)return;if(statRows.length<3)resetStats();
    wrap.innerHTML=statRows.map((s,i)=>`<div class="jd-stat-row" data-stat-row="${i}"><select class="jd-stat-key">${metricOptions(s.key)}</select><input class="jd-stat-value" value="${esc(s.value)}" placeholder="Value"><input class="jd-stat-label" value="${esc(s.label)}" placeholder="Label"><div class="jd-stat-actions"><button type="button" data-stat-move="up" aria-label="Move stat up" ${i===0?'disabled':''}>↑</button><button type="button" data-stat-move="down" aria-label="Move stat down" ${i===statRows.length-1?'disabled':''}>↓</button><button type="button" class="danger" data-stat-delete aria-label="Delete stat" ${statRows.length<=3?'disabled':''}>×</button></div></div>`).join('')+`<button type="button" id="jd-add-stat" class="jd-add-stat" ${statRows.length>=5?'disabled':''}>+ Add stat ${statRows.length>=5?'(max 5)':''}</button>`;
    $$('.jd-stat-row',wrap).forEach((row,i)=>{const sel=$('.jd-stat-key',row),val=$('.jd-stat-value',row),label=$('.jd-stat-label',row);sel.addEventListener('change',()=>{const m=metricEntries().find(x=>x.id===sel.value);statRows[i].key=sel.value;if(m){statRows[i].value=m.value;statRows[i].label=m.label;val.value=m.value;label.value=m.label}else{statRows[i].value=val.value;statRows[i].label=label.value}renderPoster()});val.addEventListener('input',()=>{statRows[i].value=val.value;renderPoster()});label.addEventListener('input',()=>{statRows[i].label=label.value;renderPoster()});row.querySelector('[data-stat-delete]')?.addEventListener('click',()=>{if(statRows.length<=3)return;statRows.splice(i,1);renderStatRows();renderPoster()});row.querySelector('[data-stat-move="up"]')?.addEventListener('click',()=>{if(i<1)return;[statRows[i-1],statRows[i]]=[statRows[i],statRows[i-1]];renderStatRows();renderPoster()});row.querySelector('[data-stat-move="down"]')?.addEventListener('click',()=>{if(i>=statRows.length-1)return;[statRows[i+1],statRows[i]]=[statRows[i],statRows[i+1]];renderStatRows();renderPoster()})});
    $('#jd-add-stat')?.addEventListener('click',()=>{if(statRows.length>=5)return;statRows.push({key:'custom',value:'',label:'STAT'});renderStatRows();renderPoster()});
  }
  function playerOptions(){return rosterPlayers().map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(selectedPlayerId)?'selected':''}>#${esc(p.number||'—')} · ${esc(p.name)}</option>`).join('')}
  async function onPlayerChanged(){selectedPlayerId=$('#jd-graphic-player')?.value||'';playerScale=.78;playerX=0;playerY=0;resetStats();resetText();syncPlacement();renderStatRows();syncTextInputs();await useProfilePhoto()}
  function syncPlacement(){const pairs=[['#jd-player-scale',playerScale,'#jd-player-scale-value',v=>`${Math.round(v*100)}%`],['#jd-player-x',playerX,'#jd-player-x-value',v=>`${Math.round(v)}`],['#jd-player-y',playerY,'#jd-player-y-value',v=>`${Math.round(v)}`]];pairs.forEach(([input,value,out,fmt])=>{const n=$(input);if(n)n.value=String(value);const o=$(out);if(o)o.textContent=fmt(value)})}
  function syncTextInputs(){Object.entries(textState).forEach(([k,v])=>{const el=$(`[data-text-field="${k}"]`);if(el)el.value=v})}

  function textEditor(){return `<section><div class="jd-section-title"><div><h3>4. Poster text</h3><p>Edit the wording without breaking the locked design.</p></div><button type="button" id="jd-reset-text">Reset text</button></div><div class="jd-text-grid"><label class="wide">Top team line<input data-text-field="eyebrow" value="${esc(textState.eyebrow)}"></label><label>Main title<input data-text-field="mainTitle" value="${esc(textState.mainTitle)}"></label><label>Second line<input data-text-field="secondTitle" value="${esc(textState.secondTitle)}"></label><label>Player name<input data-text-field="playerName" value="${esc(textState.playerName)}"></label><label>Jersey #<input data-text-field="jerseyNumber" value="${esc(textState.jerseyNumber)}"></label><label class="wide">Week / season line<input data-text-field="weekLabel" value="${esc(textState.weekLabel)}"></label><label class="wide">Tagline<input data-text-field="tagline" value="${esc(textState.tagline)}"></label><label>Website<input data-text-field="website" value="${esc(textState.website)}"></label><label>Social<input data-text-field="social" value="${esc(textState.social)}"></label><label class="wide">Small footer text<input data-text-field="smallText" value="${esc(textState.smallText)}"></label></div></section>`}

  function renderControls(){
    const content=$('#section-content');if(!content)return;const seasonOpts=seasons().map(s=>`<option value="${esc(s.id)}" ${s.id===selectedSeasonId?'selected':''}>${esc(s.name)}</option>`).join('');
    content.innerHTML=`<div class="jd-graphic-shell"><div class="jd-graphic-intro"><div><span class="eyebrow">SOCIAL GRAPHICS</span><h2>Player of the Week Generator</h2><p>Choose the player, photo, 3–5 featured stats and text. The preview stays visible while you work.</p></div><span class="jd-graphic-size">1080 × 1350 · 4:5</span></div><div class="jd-graphic-layout">
      <div class="jd-graphic-controls">
        <section><h3>1. Player & season</h3><div class="jd-graphic-field-grid"><label>Season<select id="jd-graphic-season">${seasonOpts}</select></label><label>Stat set<select id="jd-graphic-phase"><option value="regular" ${phase==='regular'?'selected':''}>Regular season</option><option value="playoffs" ${phase==='playoffs'?'selected':''}>Playoffs</option></select></label></div><label>Player<select id="jd-graphic-player">${playerOptions()}</select></label></section>
        <section><h3>2. Player photo</h3><p>Use the profile photo or upload a different full-body image for this post.</p><div class="jd-graphic-photo-row"><button class="button" id="jd-use-profile-photo" type="button">Use profile photo</button><label class="button" for="jd-graphic-upload-photo">Upload different photo</label><input id="jd-graphic-upload-photo" type="file" accept="image/*"></div><div class="jd-graphic-photo-preview" id="jd-graphic-photo-preview"></div><div class="jd-bg-actions"><label class="jd-bg-toggle"><input id="jd-auto-remove-bg" type="checkbox" checked>Remove background when generating</label><button type="button" id="jd-remove-bg">Remove background now</button></div><label>Player style<select id="jd-player-style"><option value="dramatic" ${playerStyle==='dramatic'?'selected':''}>Dramatic</option><option value="blue" ${playerStyle==='blue'?'selected':''}>Blue glow</option><option value="clean" ${playerStyle==='clean'?'selected':''}>Clean</option></select></label><div id="jd-bg-status" class="jd-bg-status">Background removal runs on this device.</div></section>
        <section><div class="jd-section-title"><div><h3>3. Featured stats</h3><p>Use 3–5 stats. Pick a saved stat, edit its value/label, add or delete rows, and reorder them with the arrows.</p></div></div><div id="jd-graphic-stats"></div></section>
        ${textEditor()}
        <section class="jd-graphic-actions"><button class="button primary" id="jd-generate-graphic" type="button">Generate & Download PNG</button><button type="button" id="jd-download-graphic" disabled>Download Again</button><button type="button" id="jd-reset-graphic">Reset graphic</button></section>
      </div>
      <div class="jd-graphic-stage-wrap"><div class="jd-graphic-stage-head"><strong>LIVE POST PREVIEW</strong><span>1080 × 1350 PNG</span></div><div class="jd-graphic-canvas-shell"><canvas id="jd-potw-canvas" width="1080" height="1350" aria-label="Player of the Week graphic preview"></canvas></div><div class="jd-preview-placement"><strong>Player placement</strong><div class="jd-placement-row"><label>Size</label><input id="jd-player-scale" type="range" min="0.55" max="1.00" step="0.01" value="${playerScale}"><output id="jd-player-scale-value">${Math.round(playerScale*100)}%</output></div><div class="jd-placement-row"><label>Left / right</label><input id="jd-player-x" type="range" min="-150" max="150" step="1" value="${playerX}"><output id="jd-player-x-value">${playerX}</output></div><div class="jd-placement-row"><label>Up / down</label><input id="jd-player-y" type="range" min="-120" max="100" step="1" value="${playerY}"><output id="jd-player-y-value">${playerY}</output></div><button type="button" id="jd-reset-placement">Reset placement</button><small>You can also drag the player directly on the preview. Text and stats always stay above the player.</small></div></div>
    </div></div>`;
    bindControls();renderStatRows();paintPhotoPreview();renderPoster();
  }

  function bindControls(){
    $('#jd-graphic-season')?.addEventListener('change',async e=>{selectedSeasonId=e.target.value;selectedPlayerId=rosterPlayers()[0]?.id||'';resetStats();resetText();renderControls();await useProfilePhoto()});
    $('#jd-graphic-phase')?.addEventListener('change',async e=>{phase=e.target.value==='playoffs'?'playoffs':'regular';selectedPlayerId=rosterPlayers()[0]?.id||'';resetStats();resetText();renderControls();await useProfilePhoto()});
    $('#jd-graphic-player')?.addEventListener('change',onPlayerChanged);
    $('#jd-use-profile-photo')?.addEventListener('click',useProfilePhoto);
    $('#jd-graphic-upload-photo')?.addEventListener('change',e=>useUploadedPhoto(e.target.files?.[0]));
    $('#jd-remove-bg')?.addEventListener('click',async()=>{const b=$('#jd-remove-bg');try{b.disabled=true;await removeBackground()}catch(e){setBgStatus(e.message,'error')}finally{b.disabled=false}});
    $('#jd-player-style')?.addEventListener('change',e=>{playerStyle=e.target.value;renderPoster()});
    $('[data-text-field]')?.closest('.jd-graphic-controls');$$('[data-text-field]').forEach(el=>el.addEventListener('input',()=>{textState[el.dataset.textField]=el.value;renderPoster()}));
    $('#jd-reset-text')?.addEventListener('click',()=>{resetText();syncTextInputs();renderPoster()});
    $('#jd-player-scale')?.addEventListener('input',e=>{playerScale=Number(e.target.value);syncPlacement();renderPoster()});
    $('#jd-player-x')?.addEventListener('input',e=>{playerX=Number(e.target.value);syncPlacement();renderPoster()});
    $('#jd-player-y')?.addEventListener('input',e=>{playerY=Number(e.target.value);syncPlacement();renderPoster()});
    $('#jd-reset-placement')?.addEventListener('click',()=>{playerScale=.78;playerX=0;playerY=0;syncPlacement();renderPoster()});
    $('#jd-generate-graphic')?.addEventListener('click',async()=>{const b=$('#jd-generate-graphic');const safari=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);const downloadWindow=safari?window.open('about:blank','jdGraphicDownload'):null;try{b.disabled=true;b.textContent='Generating…';if($('#jd-auto-remove-bg')?.checked&&photoImage&&cutoutSource!==photoSource)await removeBackground();renderPoster();downloadPoster(downloadWindow);setStatus('Player of the Week graphic generated and downloaded.')}catch(e){try{downloadWindow?.close()}catch{}setBgStatus(e.message,'error');setStatus(e.message,true)}finally{b.disabled=false;b.textContent='Generate & Download PNG'}});
    $('#jd-download-graphic')?.addEventListener('click',()=>{try{downloadPoster()}catch(e){setStatus(e.message,true)}});
    $('#jd-reset-graphic')?.addEventListener('click',async()=>{cutoutCanvas=null;cutoutSource='';playerScale=.78;playerX=0;playerY=0;playerStyle='dramatic';resetStats();resetText();syncPlacement();renderStatRows();syncTextInputs();await useProfilePhoto();setBgStatus('Graphic reset.','')});
    const canvas=$('#jd-potw-canvas');if(canvas){const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*CANVAS_W/r.width,y:(e.clientY-r.top)*CANVAS_H/r.height}};canvas.addEventListener('pointerdown',e=>{drag=point(e);canvas.setPointerCapture?.(e.pointerId);canvas.classList.add('dragging')});canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=point(e);playerX=clamp(playerX+p.x-drag.x,-150,150);playerY=clamp(playerY+p.y-drag.y,-120,100);drag=p;syncPlacement();renderPoster()});const end=()=>{drag=null;canvas.classList.remove('dragging')};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end)}
  }

  function posterFilename(){const p=selectedPlayer();const safe=String(p?.name||'player').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');return `jersey-dodgers-player-of-the-week-${safe||'player'}.png`}
  function downloadPoster(downloadWindow=null){
    const canvas=$('#jd-potw-canvas');if(!canvas)throw Error('Preview is not ready.');
    let url='';try{url=canvas.toDataURL('image/png')}catch{throw Error('Could not create the PNG. Try using an uploaded player photo from this site.')}
    const name=posterFilename(),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();
    if(downloadWindow&&!downloadWindow.closed){
      try{downloadWindow.document.title=name;downloadWindow.document.body.style.cssText='margin:0;background:#07101a;color:white;font-family:system-ui;text-align:center;padding:24px';downloadWindow.document.body.innerHTML='<p>If the download did not start automatically, use the button below.</p><a id="jd-final-download" style="display:inline-block;padding:12px 18px;background:#168bff;color:white;text-decoration:none;border-radius:7px">Download PNG</a>';const link=downloadWindow.document.getElementById('jd-final-download');link.href=url;link.download=name;link.click()}catch{}
    }
    return true;
  }

  async function openGenerator(){
    active=true;document.body.classList.remove('admin-menu-open');$('#admin-nav')?.classList.remove('open');$('#admin-menu-toggle')?.setAttribute('aria-expanded','false');$$('#admin-nav [data-section],#jd-staff-nav,#jd-graphic-nav').forEach(b=>b.classList.remove('active'));$('#jd-graphic-nav')?.classList.add('active');
    const saveState=$('#save-state'),saveButton=$('#save-all');if(saveState)saveState.hidden=true;if(saveButton)saveButton.hidden=true;const heading=$('.admin-heading h1');if(heading)heading.textContent='Graphic Generator';const help=$('.admin-help');if(help)help.textContent='Build a 1080×1350 Player of the Week graphic with a live preview.';
    try{const payload=await api('/api/admin/content');data=payload.data||payload;selectedSeasonId=selectedSeasonId&&data.seasons.some(s=>s.id===selectedSeasonId)?selectedSeasonId:currentSeason();const ps=rosterPlayers();selectedPlayerId=ps.some(p=>String(p.id)===String(selectedPlayerId))?selectedPlayerId:(ps[0]?.id||'');resetStats();resetText();await loadLogos();renderControls();await useProfilePhoto()}catch(e){setStatus(e.message,true)}
  }

  function graphicNavButtons(nav){return $$('button',nav).filter(b=>b.id==='jd-graphic-nav'||String(b.textContent||'').trim()==='Graphic Generator')}
  async function install(){
    const nav=$('#admin-nav');if(!nav||installing)return;installing=true;
    try{
      access=await api('/api/admin/access');
      const old=graphicNavButtons(nav);old.forEach(n=>n.remove());
      if(!access.media)return;
      const b=document.createElement('button');b.id='jd-graphic-nav';b.type='button';b.textContent='Graphic Generator';b.addEventListener('click',openGenerator);
      const staff=$('#jd-staff-nav'),mobile=nav.querySelector('.admin-mobile-site');nav.insertBefore(b,staff||mobile||null);
      if(active)b.classList.add('active');
    }catch{}finally{installing=false}
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-section],#jd-staff-nav')){active=false;$$('#jd-graphic-nav').forEach(n=>n.classList.remove('active'))}});
  const observer=new MutationObserver(()=>{const nav=$('#admin-nav');if(nav&&graphicNavButtons(nav).length!==1)install()});observer.observe(document.documentElement,{childList:true,subtree:true});[250,600,1200,2200,4000].forEach(t=>setTimeout(install,t));
})();
