(() => {
  'use strict';
  if (window.__jdGraphicGeneratorV125Loaded) return;
  window.__jdGraphicGeneratorV125Loaded = true;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const CANVAS_W=1080,CANVAS_H=1350;
  const SCRIPT_LOGO='/assets/jd-script-logo-official.png';
  const D_MARK='/assets/jd-d-mark-official.png';
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
  const TITLE_FONT="'Bebas Neue', Impact, Haettenschweiler, sans-serif";
  const CONDENSED_FONT="'Oswald', 'Arial Narrow', Arial, sans-serif";
  const SIGNATURE_FONT="'Mrs Saint Delafield', 'Alex Brush', 'Brush Script MT', cursive";

  const STYLE_DEFAULTS={
    editorial:{scale:1.02,x:-12,y:8,edge:'stroke',grade:'dramatic'},
    electric:{scale:.96,x:-35,y:0,edge:'energy',grade:'dramatic'},
    classic:{scale:.92,x:35,y:0,edge:'none',grade:'clean'}
  };

  let data=null,access=null,active=false,installing=false;
  let selectedPlayerId='',selectedSeasonId='',phase='regular';
  let photoSource='',photoImage=null,photoLabel='';
  let cutoutCanvas=null,cutoutSource='';
  let logoScript=null,logoMark=null;
  let generated=false,drag=null;
  let statRows=[];
  let textState={};
  let graphicStyle='editorial';
  let playerScale=STYLE_DEFAULTS.editorial.scale,playerX=STYLE_DEFAULTS.editorial.x,playerY=STYLE_DEFAULTS.editorial.y;
  let edgeTreatment=STYLE_DEFAULTS.editorial.edge,playerGrade=STYLE_DEFAULTS.editorial.grade;
  let styleStates={
    editorial:{...STYLE_DEFAULTS.editorial},
    electric:{...STYLE_DEFAULTS.electric},
    classic:{...STYLE_DEFAULTS.classic}
  };
  let signatureMode='stylized',signatureImage=null,signatureSource='';
  let signatureScale=1,signatureGap=2,signatureLastX=38,signatureRotation=-4,signatureNumberX=18,signatureNumberY=126;
  const tintCache=new WeakMap();
  const cutoutCache=new Map();

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
    const p=rosterPlayer(),parts=String(p.name||'PLAYER').trim().split(/\s+/).filter(Boolean),first=parts.shift()||'PLAYER',last=parts.join(' ');
    return {
      eyebrow:'JERSEY DODGERS',mainTitle:'PLAYER',secondTitle:'OF THE WEEK',playerName:String(p.name||'PLAYER NAME').toUpperCase(),
      jerseyNumber:String(p.number||''),weekLabel:`${seasonName()} · ${phase==='playoffs'?'PLAYOFFS':'REGULAR SEASON'}`.toUpperCase(),
      tagline:'FAMILY | COMPETE | DEVELOP | REPRESENT',website:'JERSEYDODGERS.COM',social:'@JERSEYDODGERS',smallText:'MORE THAN A TEAM · A FAMILY',
      signatureFirst:first,signatureLast:last
    };
  }
  function resetText(){textState=defaultText()}

  function resetStyleStates(){
    styleStates={editorial:{...STYLE_DEFAULTS.editorial},electric:{...STYLE_DEFAULTS.electric},classic:{...STYLE_DEFAULTS.classic}};
    restoreStyleState(graphicStyle);
  }
  function saveStyleState(){styleStates[graphicStyle]={scale:playerScale,x:playerX,y:playerY,edge:edgeTreatment,grade:playerGrade}}
  function restoreStyleState(style){
    const s=styleStates[style]||STYLE_DEFAULTS[style]||STYLE_DEFAULTS.editorial;
    playerScale=s.scale;playerX=s.x;playerY=s.y;edgeTreatment=s.edge;playerGrade=s.grade;
  }

  function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This image could not be loaded.'));img.src=src})}
  async function decodeImageBlob(blob){
    if(!blob||!blob.size)throw Error('PhotoRoom returned an empty image.');
    if(blob.type&&!/^image\//i.test(blob.type))throw Error(`PhotoRoom returned ${blob.type} instead of an image.`);
    if('createImageBitmap' in window){
      try{return await createImageBitmap(blob,{premultiplyAlpha:'default',colorSpaceConversion:'default'})}catch{}
    }
    const url=URL.createObjectURL(blob);
    try{return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('PhotoRoom returned an image, but this browser could not decode it.'));img.src=url})}
    finally{setTimeout(()=>URL.revokeObjectURL(url),0)}
  }
  async function loadLogos(){if(!logoScript)logoScript=await loadImage(SCRIPT_LOGO).catch(()=>null);if(!logoMark)logoMark=await loadImage(D_MARK).catch(()=>null)}
  function cutoutKey(){return `${selectedPlayerId||'player'}::${photoSource||''}`}
  function restoreCachedCutout(){const cached=cutoutCache.get(cutoutKey());if(cached){cutoutCanvas=cached;cutoutSource=photoSource;return true}return false}
  async function useProfilePhoto(){
    const p=selectedPlayer();
    if(!p?.photo){photoSource='';photoImage=null;photoLabel='No profile photo';cutoutCanvas=null;cutoutSource='';paintPhotoPreview();renderPoster();return}
    photoSource=p.photo;photoLabel='Profile photo';cutoutCanvas=null;cutoutSource='';
    try{photoImage=await loadImage(photoSource);restoreCachedCutout();paintPhotoPreview();renderPoster()}catch(e){setBgStatus(e.message,'error')}
  }
  async function useUploadedPhoto(file){
    if(!file)return;if(photoSource?.startsWith('blob:'))URL.revokeObjectURL(photoSource);
    photoSource=URL.createObjectURL(file);photoLabel=file.name||'Uploaded photo';cutoutCanvas=null;cutoutSource='';
    try{photoImage=await loadImage(photoSource);restoreCachedCutout();paintPhotoPreview();renderPoster()}catch(e){setBgStatus(e.message,'error')}
  }
  async function useSignatureUpload(file){
    if(!file)return;if(signatureSource?.startsWith('blob:'))URL.revokeObjectURL(signatureSource);
    signatureSource=URL.createObjectURL(file);
    try{signatureImage=await loadImage(signatureSource);signatureMode='upload';const sel=$('#jd-signature-mode');if(sel)sel.value='upload';renderPoster()}catch(e){setStatus(e.message,true)}
  }
  function paintPhotoPreview(){
    const wrap=$('#jd-graphic-photo-preview');if(!wrap)return;const p=selectedPlayer();
    wrap.innerHTML=photoSource?`<img src="${esc(photoSource)}" alt=""><span><strong>${esc(photoLabel||'Player photo')}</strong><small>${cutoutCanvas?'Background removed':'Original image'} · ${esc(p?.name||'')}</small></span>`:`<span><strong>No photo selected</strong><small>Use the profile photo or upload a full-body image.</small></span>`;
  }
  function setBgStatus(text,kind=''){const n=$('#jd-bg-status');if(n){n.textContent=text;n.className=`jd-bg-status ${kind}`}}

  async function preparedPhotoBlob(){
    if(!photoImage)throw Error('Choose a player photo first.');
    const iw=photoImage.naturalWidth||photoImage.width,ih=photoImage.naturalHeight||photoImage.height,maxSide=3000,ratio=Math.min(1,maxSide/Math.max(iw,ih));
    const w=Math.max(1,Math.round(iw*ratio)),h=Math.max(1,Math.round(ih*ratio)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');ctx.drawImage(photoImage,0,0,w,h);
    return await new Promise((resolve,reject)=>{try{canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not prepare the player photo.')),'image/jpeg',.94)}catch(e){reject(e)}});
  }
  async function removeBackground(){
    if(!photoImage||!photoSource)throw Error('Choose a player photo first.');
    if(cutoutCanvas&&cutoutSource===photoSource)return cutoutCanvas;
    if(restoreCachedCutout()){setBgStatus('PhotoRoom cutout restored from this session.','good');paintPhotoPreview();renderPoster();return cutoutCanvas}
    setBgStatus('PhotoRoom is creating a high-quality transparent cutout…','busy');
    let input;
    try{input=await preparedPhotoBlob()}catch{
      try{const r=await fetch(photoSource,{credentials:'same-origin'});if(!r.ok)throw Error();input=await r.blob()}catch{throw Error('This player photo could not be prepared for PhotoRoom. Upload the original photo and try again.')}
    }
    const response=await fetch('/api/admin/remove-background',{method:'POST',credentials:'same-origin',headers:{'Content-Type':input.type||'image/jpeg'},body:input});
    if(!response.ok){let body={};try{body=await response.json()}catch{}throw Error(body.error||'PhotoRoom could not remove the background.')}
    const responseType=String(response.headers.get('content-type')||'').toLowerCase();
    if(responseType&&!responseType.startsWith('image/')){let detail='';try{detail=(await response.text()).slice(0,180)}catch{}throw Error(`PhotoRoom returned an unexpected response${detail?`: ${detail}`:'.'}`)}
    const blob=await response.blob();
    const img=await decodeImageBlob(blob);
    try{
      const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;if(!iw||!ih)throw Error('PhotoRoom returned an image with no usable dimensions.');
      const canvas=document.createElement('canvas');canvas.width=iw;canvas.height=ih;const cctx=canvas.getContext('2d');cctx.clearRect(0,0,iw,ih);cctx.drawImage(img,0,0,iw,ih);
      cutoutCanvas=trimTransparent(canvas);cutoutSource=photoSource;cutoutCache.set(cutoutKey(),cutoutCanvas);
    }finally{try{img.close?.()}catch{}}
    setBgStatus('PhotoRoom background removal complete. Transparent cutout decoded and ready.','good');paintPhotoPreview();renderPoster();return cutoutCanvas;
  }
  function trimTransparent(canvas){
    const ctx=canvas.getContext('2d'),im=ctx.getImageData(0,0,canvas.width,canvas.height),d=im.data;let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for(let y=0;y<canvas.height;y+=2)for(let x=0;x<canvas.width;x+=2)if(d[(y*canvas.width+x)*4+3]>16){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
    if(maxX<0)return canvas;const pad=14;minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(canvas.width-1,maxX+pad);maxY=Math.min(canvas.height-1,maxY+pad);
    const out=document.createElement('canvas');out.width=maxX-minX+1;out.height=maxY-minY+1;out.getContext('2d').drawImage(canvas,minX,minY,out.width,out.height,0,0,out.width,out.height);return out;
  }

  function roundedRect(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath()}
  function fitText(ctx,text,maxWidth,startSize,minSize=16,font=TITLE_FONT,weight=900){let size=startSize;while(size>minSize){ctx.font=`${weight} ${size}px ${font}`;if(ctx.measureText(text).width<=maxWidth)break;size-=2}return size}
  function drawImageContain(ctx,img,x,y,w,h,alpha=1){if(!img)return;const iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight,r=Math.min(w/iw,h/ih),dw=iw*r,dh=ih*r;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);ctx.restore()}
  function posterStats(){return statRows.slice(0,5).map(s=>({value:String(s.value||'—'),label:String(s.label||'STAT').toUpperCase()}))}
  function drawNoise(ctx,amount=1150,alpha=.022){let seed=10801350;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};ctx.save();for(let i=0;i<amount;i++){ctx.fillStyle=`rgba(255,255,255,${.006+rand()*alpha})`;const s=rand()<.96?1:2;ctx.fillRect(rand()*CANVAS_W,rand()*CANVAS_H,s,s)}ctx.restore()}
  function drawSkyline(ctx,base=1195,alpha=.48){ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#050b12';let x=540,seed=29;const rand=()=>{seed=(seed*9301+49297)%233280;return seed/233280};while(x<CANVAS_W){const w=18+rand()*34,h=35+rand()*115;ctx.fillRect(x,base-h,w,h);if(rand()>.72)ctx.fillRect(x+w*.42,base-h-22,w*.16,22);x+=w+4+rand()*8}ctx.strokeStyle='rgba(55,143,230,.32)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(560,base-18);ctx.quadraticCurveTo(790,base-145,1060,base-14);ctx.stroke();ctx.restore()}
  function drawVignette(ctx,strength=.7){const g=ctx.createRadialGradient(CANVAS_W*.52,CANVAS_H*.45,220,CANVAS_W*.52,CANVAS_H*.45,900);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${strength})`);ctx.fillStyle=g;ctx.fillRect(0,0,CANVAS_W,CANVAS_H)}

  function tintedSilhouette(img,color){
    if(!img)return null;let map=tintCache.get(img);if(!map){map=new Map();tintCache.set(img,map)}if(map.has(color))return map.get(color);
    const iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight,c=document.createElement('canvas');c.width=iw;c.height=ih;const x=c.getContext('2d');x.drawImage(img,0,0,iw,ih);x.globalCompositeOperation='source-in';x.fillStyle=color;x.fillRect(0,0,iw,ih);x.globalCompositeOperation='source-over';map.set(color,c);return c;
  }
  function playerAnchor(){return graphicStyle==='classic'?{cx:785,base:1196,h:990}:graphicStyle==='electric'?{cx:355,base:1202,h:1015}:{cx:332,base:1200,h:1000}}
  function playerRect(img){
    const iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight,a=playerAnchor(),targetH=a.h*clamp(playerScale,.6,1.75),targetW=targetH*(iw/ih),cx=a.cx+clamp(playerX,-280,280),base=a.base+clamp(playerY,-220,180);
    return {x:cx-targetW/2,y:base-targetH,w:targetW,h:targetH};
  }
  function drawEdge(ctx,img,r){
    if(!img||edgeTreatment==='none')return;const tint=tintedSilhouette(img,edgeTreatment==='energy'?'#16a3ff':'#1b8dff');if(!tint)return;
    if(edgeTreatment==='stroke'){
      ctx.save();ctx.globalAlpha=.86;const rad=7;for(let i=0;i<16;i++){const a=(Math.PI*2*i)/16;ctx.drawImage(tint,r.x+Math.cos(a)*rad,r.y+Math.sin(a)*rad,r.w,r.h)}ctx.restore();
      return;
    }
    ctx.save();ctx.globalAlpha=.45;ctx.filter='blur(10px)';const rad=12;for(let i=0;i<12;i++){const a=(Math.PI*2*i)/12;ctx.drawImage(tint,r.x+Math.cos(a)*rad,r.y+Math.sin(a)*rad,r.w,r.h)}ctx.restore();
    ctx.save();ctx.strokeStyle='rgba(33,157,255,.7)';ctx.lineWidth=3;ctx.shadowColor='#168bff';ctx.shadowBlur=11;const paths=[[-10,.20,-45,.33,-20,.46],[1.01,.18,1.08,.30,1.03,.43],[-.02,.58,-.10,.70,-.04,.82],[.98,.56,1.08,.69,1.02,.82]];for(const p of paths){ctx.beginPath();ctx.moveTo(r.x+r.w*p[0],r.y+r.h*p[1]);ctx.quadraticCurveTo(r.x+r.w*p[2],r.y+r.h*p[3],r.x+r.w*p[4],r.y+r.h*p[5]);ctx.stroke()}ctx.restore();
  }
  function drawGhostPlayer(ctx,img,mode='left'){
    if(!img)return;const iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight,targetH=mode==='left'?720:760,targetW=targetH*(iw/ih),x=mode==='left'?-65:435,y=210;
    ctx.save();ctx.globalAlpha=mode==='left'?.18:.11;ctx.filter='grayscale(1) brightness(.26) contrast(1.3)';ctx.drawImage(img,x,y,targetW,targetH);ctx.restore();
  }
  function drawMainPlayer(ctx,img){
    if(!img)return;const r=playerRect(img);drawEdge(ctx,img,r);
    ctx.save();ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=playerGrade==='clean'?18:28;ctx.shadowOffsetX=8;ctx.shadowOffsetY=18;
    if(playerGrade==='clean')ctx.filter='contrast(1.04) saturate(1.04) brightness(.99)';else if(playerGrade==='high')ctx.filter='contrast(1.22) saturate(1.14) brightness(.94)';else ctx.filter='contrast(1.13) saturate(1.10) brightness(.96)';
    ctx.drawImage(img,r.x,r.y,r.w,r.h);ctx.restore();
    const fade=ctx.createLinearGradient(0,930,0,1205);fade.addColorStop(0,'rgba(3,8,14,0)');fade.addColorStop(1,'rgba(3,8,14,.65)');ctx.fillStyle=fade;ctx.fillRect(Math.max(0,r.x-25),900,Math.min(CANVAS_W,r.w+50),320);
  }
  function drawSignature(ctx){
    if(signatureMode==='off')return;
    const jersey=String(textState.jerseyNumber||'').replace(/^#/,'');
    let x=graphicStyle==='classic'?585:42,y=graphicStyle==='electric'?1010:1018,w=graphicStyle==='classic'?320:320,h=180;
    if(graphicStyle==='editorial'){x=42;y=970;w=330;h=205}
    if(signatureMode==='upload'&&signatureImage){drawImageContain(ctx,signatureImage,x,y,w,h-35,.95);ctx.fillStyle='#b9d8ff';ctx.font=`700 24px ${CONDENSED_FONT}`;ctx.fillText(jersey?`#${jersey}`:'',x+signatureNumberX,y+signatureNumberY);return}
    const first=String(textState.signatureFirst||'').trim(),last=String(textState.signatureLast||'').trim();
    ctx.save();ctx.translate(x,y);ctx.rotate(signatureRotation*Math.PI/180);ctx.fillStyle=graphicStyle==='electric'?'#a8ddff':'#dce9f7';
    const base=(graphicStyle==='editorial'?78:70)*signatureScale;
    ctx.font=`400 ${base}px ${SIGNATURE_FONT}`;
    ctx.shadowColor='rgba(0,0,0,.48)';ctx.shadowBlur=5;ctx.shadowOffsetY=2;
    if(first)ctx.fillText(first,0,base*.70);
    if(last)ctx.fillText(last,signatureLastX,base*.70+base*.54+signatureGap);
    ctx.shadowBlur=0;ctx.font=`700 ${Math.max(18,23*signatureScale)}px ${CONDENSED_FONT}`;ctx.fillStyle='#9dc8ff';ctx.fillText(jersey?`#${jersey}`:'',signatureNumberX,signatureNumberY);ctx.restore();
  }


  function drawEditorialBackground(ctx,playerArt){
    const bg=ctx.createLinearGradient(0,0,CANVAS_W,CANVAS_H);bg.addColorStop(0,'#121820');bg.addColorStop(.38,'#07101c');bg.addColorStop(1,'#020406');ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    ctx.save();ctx.fillStyle='rgba(15,77,145,.25)';ctx.beginPath();ctx.moveTo(475,0);ctx.lineTo(710,0);ctx.lineTo(470,1198);ctx.lineTo(255,1198);ctx.closePath();ctx.fill();ctx.restore();
    if(playerArt)drawGhostPlayer(ctx,playerArt,'left');
    const jersey=String(textState.jerseyNumber||'10').replace(/^#/,'');ctx.save();ctx.globalAlpha=.18;ctx.strokeStyle='#0e4d97';ctx.lineWidth=3;ctx.font=`900 360px ${TITLE_FONT}`;ctx.strokeText(jersey||'10',4,920);ctx.restore();
    drawSkyline(ctx,1195,.64);drawNoise(ctx,1700,.03);drawVignette(ctx,.78);
    if(logoScript)drawImageContain(ctx,logoScript,25,55,360,190,1);
    ctx.fillStyle='#ef3e45';ctx.fillRect(42,119,5,0);
  }
  function drawElectricBackground(ctx){
    const bg=ctx.createLinearGradient(0,0,CANVAS_W,CANVAS_H);bg.addColorStop(0,'#071626');bg.addColorStop(.52,'#020a13');bg.addColorStop(1,'#010409');ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    const glow=ctx.createRadialGradient(280,520,20,330,600,680);glow.addColorStop(0,'rgba(0,119,255,.42)');glow.addColorStop(.55,'rgba(0,61,141,.17)');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    if(logoMark)drawImageContain(ctx,logoMark,165,130,650,650,.07);
    ctx.save();ctx.strokeStyle='rgba(28,152,255,.28)';ctx.lineWidth=4;ctx.shadowColor='#168bff';ctx.shadowBlur=16;for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(30+i*26,240+i*120);ctx.bezierCurveTo(260+i*18,150+i*80,390+i*9,690-i*35,650+i*30,790+i*40);ctx.stroke()}ctx.restore();
    ctx.save();ctx.strokeStyle='#ef3e45';ctx.lineWidth=8;ctx.lineCap='round';[[55,265,145,155],[88,405,171,300],[52,545,128,455]].forEach(v=>{ctx.beginPath();ctx.moveTo(v[0],v[1]);ctx.lineTo(v[2],v[3]);ctx.stroke()});ctx.restore();
    drawNoise(ctx,1250,.025);drawVignette(ctx,.72);if(logoScript)drawImageContain(ctx,logoScript,38,44,300,160,.96);
  }
  function drawClassicBackground(ctx){
    const bg=ctx.createLinearGradient(0,0,CANVAS_W,CANVAS_H);bg.addColorStop(0,'#0a4f96');bg.addColorStop(.34,'#062b54');bg.addColorStop(.72,'#06111f');bg.addColorStop(1,'#02070d');ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    ctx.save();ctx.globalAlpha=.10;ctx.strokeStyle='#dcecff';ctx.lineWidth=2;for(let x=-CANVAS_H;x<CANVAS_W;x+=70){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+CANVAS_H,CANVAS_H);ctx.stroke()}ctx.restore();
    ctx.save();ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=4;ctx.setLineDash([13,14]);ctx.beginPath();ctx.arc(110,620,430,-1.2,1.2);ctx.stroke();ctx.beginPath();ctx.arc(1050,610,430,1.95,4.35);ctx.stroke();ctx.restore();
    if(logoMark)drawImageContain(ctx,logoMark,430,180,590,590,.06);drawNoise(ctx,900,.018);drawVignette(ctx,.58);if(logoScript)drawImageContain(ctx,logoScript,40,42,330,175,1);
  }

  function statRectsEditorial(count){const x=690,y=595,W=350,g=12;if(count===3){const w=(W-g)/2;return[{x,y,w,h:135},{x:x+w+g,y,w,h:135},{x,y:y+147,w:W,h:135}]}if(count===5){const w3=(W-g*2)/3,w2=(W-g)/2;return[{x,y,w:w3,h:130},{x:x+w3+g,y,w:w3,h:130},{x:x+(w3+g)*2,y,w:w3,h:130},{x,y:y+142,w:w2,h:130},{x:x+w2+g,y:y+142,w:w2,h:130}]}const w=(W-g)/2;return[{x,y,w,h:135},{x:x+w+g,y,w,h:135},{x,y:y+147,w,h:135},{x:x+w+g,y:y+147,w,h:135}]}
  function statRectsElectric(count){const x=485,y=735,W=555,g=13;if(count===3){const w=(W-g*2)/3;return[0,1,2].map(i=>({x:x+i*(w+g),y,w,h:132}))}if(count===5){const w3=(W-g*2)/3,w2=(W-g)/2;return[{x,y,w:w3,h:126},{x:x+w3+g,y,w:w3,h:126},{x:x+(w3+g)*2,y,w:w3,h:126},{x:x+55,y:y+140,w:w2-28,h:126},{x:x+55+(w2-28)+g,y:y+140,w:w2-28,h:126}]}const w=(W-g)/2;return[{x,y,w,h:132},{x:x+w+g,y,w,h:132},{x,y:y+145,w,h:132},{x:x+w+g,y:y+145,w,h:132}]}
  function statRectsClassic(count){const x=55,y=610,W=420,g=12;if(count===3){const w=(W-g)/2;return[{x,y,w,h:132},{x:x+w+g,y,w,h:132},{x,y:y+144,w:W,h:132}]}if(count===5){const w3=(W-g*2)/3,w2=(W-g)/2;return[{x,y,w:w3,h:124},{x:x+w3+g,y,w:w3,h:124},{x:x+(w3+g)*2,y,w:w3,h:124},{x,y:y+136,w:w2,h:124},{x:x+w2+g,y:y+136,w:w2,h:124}]}const w=(W-g)/2;return[{x,y,w,h:132},{x:x+w+g,y,w,h:132},{x,y:y+144,w,h:132},{x:x+w+g,y:y+144,w,h:132}]}
  function drawStatsAt(ctx,rects,mode){
    const stats=posterStats();stats.forEach((s,i)=>{const r=rects[i];if(!r)return;ctx.save();roundedRect(ctx,r.x,r.y,r.w,r.h,mode==='classic'?8:4);ctx.fillStyle=mode==='classic'?'rgba(3,15,28,.78)':'rgba(1,6,12,.90)';ctx.fill();ctx.strokeStyle=mode==='electric'?'rgba(32,154,255,.95)':mode==='classic'?'rgba(158,203,255,.52)':'rgba(27,125,225,.82)';ctx.lineWidth=mode==='electric'?3:2;ctx.shadowColor=mode==='electric'?'rgba(22,139,255,.55)':'transparent';ctx.shadowBlur=mode==='electric'?12:0;ctx.stroke();ctx.shadowBlur=0;ctx.textAlign='center';ctx.fillStyle='#fff';const vs=fitText(ctx,s.value,r.w-18,50,27,TITLE_FONT);ctx.font=`900 ${vs}px ${TITLE_FONT}`;ctx.fillText(s.value,r.x+r.w/2,r.y+62);ctx.fillStyle='#d9e6f3';const ls=fitText(ctx,s.label,r.w-16,17,11,CONDENSED_FONT,700);ctx.font=`700 ${ls}px ${CONDENSED_FONT}`;const parts=s.label.split(' ');if(parts.length>1&&ctx.measureText(s.label).width>r.w-16){const mid=Math.ceil(parts.length/2);ctx.fillText(parts.slice(0,mid).join(' '),r.x+r.w/2,r.y+97);ctx.fillText(parts.slice(mid).join(' '),r.x+r.w/2,r.y+119)}else ctx.fillText(s.label,r.x+r.w/2,r.y+108);ctx.restore()})
  }
  function drawFooter(ctx,mode){
    const grad=ctx.createLinearGradient(0,1190,0,1350);grad.addColorStop(0,mode==='classic'?'rgba(4,24,45,.85)':'rgba(2,6,10,.90)');grad.addColorStop(1,'rgba(1,3,6,.99)');ctx.fillStyle=grad;ctx.fillRect(0,1188,CANVAS_W,162);
    ctx.fillStyle=mode==='classic'?'#f5f7fb':'#168bff';ctx.fillRect(0,1188,CANVAS_W,7);if(mode!=='classic'){ctx.strokeStyle='rgba(239,62,69,.85)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(650,1186);ctx.lineTo(1080,1152);ctx.stroke()}
    if(logoMark)drawImageContain(ctx,logoMark,48,1224,78,78,1);ctx.fillStyle='#97abc0';ctx.font=`700 12px ${CONDENSED_FONT}`;ctx.fillText('VISIT OUR WEBSITE',154,1249);ctx.fillStyle='#fff';const website=String(textState.website||'JERSEYDODGERS.COM').toUpperCase();ctx.font=`700 ${fitText(ctx,website,500,28,18,CONDENSED_FONT,700)}px ${CONDENSED_FONT}`;ctx.fillText(website,154,1291);ctx.textAlign='right';ctx.fillStyle='#d4dfeb';const small=String(textState.smallText||'').toUpperCase();ctx.font=`600 ${fitText(ctx,small,320,12,9,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(small,1030,1250);ctx.fillStyle='#93a9c0';const social=String(textState.social||'@JERSEYDODGERS').toUpperCase();ctx.font=`600 ${fitText(ctx,social,320,14,10,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(social,1030,1292);ctx.textAlign='left';
  }
  function drawEditorialInfo(ctx){
    ctx.fillStyle='#d7e2ed';ctx.font=`600 20px ${CONDENSED_FONT}`;ctx.fillText(String(textState.eyebrow||'JERSEY DODGERS').toUpperCase(),686,122);ctx.fillStyle='#ef3e45';ctx.fillRect(610,155,58,7);ctx.fillRect(1000,155,38,7);
    const title=String(textState.mainTitle||'PLAYER').toUpperCase();ctx.fillStyle='#fff';const ts=fitText(ctx,title,430,150,84,TITLE_FONT);ctx.font=`900 ${ts}px ${TITLE_FONT}`;ctx.fillText(title,610,318);const second=String(textState.secondTitle||'OF THE WEEK').toUpperCase();ctx.fillStyle='#127fff';const ss=fitText(ctx,second,430,72,38,TITLE_FONT);ctx.font=`900 ${ss}px ${TITLE_FONT}`;ctx.fillText(second,612,390);
    const jersey=String(textState.jerseyNumber||'').replace(/^#/,'');ctx.fillStyle='#ef3e45';ctx.font=`900 48px ${TITLE_FONT}`;ctx.fillText(jersey?`#${jersey}`:'#—',692,470);ctx.fillStyle='#fff';const name=String(textState.playerName||'PLAYER NAME').toUpperCase();const ns=fitText(ctx,name,280,39,23,CONDENSED_FONT,700);ctx.font=`700 ${ns}px ${CONDENSED_FONT}`;ctx.fillText(name,790,467);
    drawStatsAt(ctx,statRectsEditorial(posterStats().length),'editorial');ctx.fillStyle='#b8c8d9';const week=String(textState.weekLabel||'').toUpperCase();ctx.font=`600 ${fitText(ctx,week,350,14,10,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(week,690,894);ctx.fillStyle='#168bff';ctx.fillRect(690,910,62,5);ctx.fillStyle='#d5e0eb';const tag=String(textState.tagline||'').toUpperCase();ctx.font=`600 ${fitText(ctx,tag,350,13,9,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(tag,690,946);
  }
  function drawElectricInfo(ctx){
    ctx.textAlign='left';ctx.fillStyle='#cfe4f9';ctx.font=`600 18px ${CONDENSED_FONT}`;ctx.fillText(String(textState.eyebrow||'JERSEY DODGERS').toUpperCase(),590,94);ctx.fillStyle='#fff';const title=String(textState.mainTitle||'PLAYER').toUpperCase();const ts=fitText(ctx,title,450,132,75,TITLE_FONT);ctx.font=`900 ${ts}px ${TITLE_FONT}`;ctx.fillText(title,565,235);ctx.fillStyle='#168bff';const second=String(textState.secondTitle||'OF THE WEEK').toUpperCase();const ss=fitText(ctx,second,460,65,34,TITLE_FONT);ctx.font=`900 ${ss}px ${TITLE_FONT}`;ctx.fillText(second,566,304);
    const jersey=String(textState.jerseyNumber||'').replace(/^#/,'');ctx.fillStyle='#ef3e45';ctx.font=`900 45px ${TITLE_FONT}`;ctx.fillText(jersey?`#${jersey}`:'#—',592,382);ctx.fillStyle='#fff';const name=String(textState.playerName||'PLAYER NAME').toUpperCase();const ns=fitText(ctx,name,315,38,22,CONDENSED_FONT,700);ctx.font=`700 ${ns}px ${CONDENSED_FONT}`;ctx.fillText(name,690,378);ctx.fillStyle='#9dc8ff';ctx.font=`600 14px ${CONDENSED_FONT}`;ctx.fillText(String(textState.weekLabel||'').toUpperCase(),590,435);ctx.fillStyle='#c6d7e8';ctx.font=`600 ${fitText(ctx,String(textState.tagline||'').toUpperCase(),440,13,9,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(String(textState.tagline||'').toUpperCase(),590,467);drawStatsAt(ctx,statRectsElectric(posterStats().length),'electric');
  }
  function drawClassicInfo(ctx){
    ctx.fillStyle='#eff7ff';ctx.font=`600 18px ${CONDENSED_FONT}`;ctx.fillText(String(textState.eyebrow||'JERSEY DODGERS').toUpperCase(),55,260);ctx.fillStyle='#fff';const title=String(textState.mainTitle||'PLAYER').toUpperCase();const ts=fitText(ctx,title,420,116,70,TITLE_FONT);ctx.font=`900 ${ts}px ${TITLE_FONT}`;ctx.fillText(title,55,382);ctx.fillStyle='#d9ecff';const second=String(textState.secondTitle||'OF THE WEEK').toUpperCase();const ss=fitText(ctx,second,420,56,32,TITLE_FONT);ctx.font=`900 ${ss}px ${TITLE_FONT}`;ctx.fillText(second,55,443);const jersey=String(textState.jerseyNumber||'').replace(/^#/,'');ctx.fillStyle='#ef3e45';ctx.font=`900 42px ${TITLE_FONT}`;ctx.fillText(jersey?`#${jersey}`:'#—',55,522);ctx.fillStyle='#fff';const name=String(textState.playerName||'PLAYER NAME').toUpperCase();const ns=fitText(ctx,name,300,36,21,CONDENSED_FONT,700);ctx.font=`700 ${ns}px ${CONDENSED_FONT}`;ctx.fillText(name,150,520);drawStatsAt(ctx,statRectsClassic(posterStats().length),'classic');ctx.fillStyle='#d5e6f5';ctx.font=`600 ${fitText(ctx,String(textState.weekLabel||'').toUpperCase(),420,14,10,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(String(textState.weekLabel||'').toUpperCase(),55,914);ctx.fillStyle='#fff';ctx.font=`600 ${fitText(ctx,String(textState.tagline||'').toUpperCase(),420,13,9,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(String(textState.tagline||'').toUpperCase(),55,945);
  }

  function renderPoster(){
    const canvas=$('#jd-potw-canvas');if(!canvas)return;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,CANVAS_W,CANVAS_H);const playerArt=cutoutCanvas||photoImage;
    if(graphicStyle==='electric')drawElectricBackground(ctx);else if(graphicStyle==='classic')drawClassicBackground(ctx);else drawEditorialBackground(ctx,playerArt);
    // Top-left branding is already drawn in the background, so the main player can naturally cover it.
    if(playerArt)drawMainPlayer(ctx,playerArt);else{ctx.save();ctx.fillStyle='rgba(22,139,255,.09)';roundedRect(ctx,65,260,480,900,8);ctx.fill();ctx.fillStyle='#8aa0b5';ctx.font=`700 24px ${CONDENSED_FONT}`;ctx.fillText('SELECT A PLAYER PHOTO',115,760);ctx.restore()}
    drawSignature(ctx);
    if(graphicStyle==='electric')drawElectricInfo(ctx);else if(graphicStyle==='classic')drawClassicInfo(ctx);else drawEditorialInfo(ctx);
    drawFooter(ctx,graphicStyle);generated=true;const dl=$('#jd-download-graphic');if(dl)dl.disabled=false;
  }

  function renderStatRows(){
    const wrap=$('#jd-graphic-stats');if(!wrap)return;if(statRows.length<3)resetStats();
    wrap.innerHTML=statRows.map((s,i)=>`<div class="jd-stat-row" data-stat-row="${i}"><select class="jd-stat-key">${metricOptions(s.key)}</select><input class="jd-stat-value" value="${esc(s.value)}" placeholder="Value"><input class="jd-stat-label" value="${esc(s.label)}" placeholder="Label"><div class="jd-stat-actions"><button type="button" data-stat-move="up" aria-label="Move stat up" ${i===0?'disabled':''}>↑</button><button type="button" data-stat-move="down" aria-label="Move stat down" ${i===statRows.length-1?'disabled':''}>↓</button><button type="button" class="danger" data-stat-delete aria-label="Delete stat" ${statRows.length<=3?'disabled':''}>×</button></div></div>`).join('')+`<button type="button" id="jd-add-stat" class="jd-add-stat" ${statRows.length>=5?'disabled':''}>+ Add stat ${statRows.length>=5?'(max 5)':''}</button>`;
    $$('.jd-stat-row',wrap).forEach((row,i)=>{const sel=$('.jd-stat-key',row),val=$('.jd-stat-value',row),label=$('.jd-stat-label',row);sel.addEventListener('change',()=>{const m=metricEntries().find(x=>x.id===sel.value);statRows[i].key=sel.value;if(m){statRows[i].value=m.value;statRows[i].label=m.label;val.value=m.value;label.value=m.label}else{statRows[i].value=val.value;statRows[i].label=label.value}renderPoster()});val.addEventListener('input',()=>{statRows[i].value=val.value;renderPoster()});label.addEventListener('input',()=>{statRows[i].label=label.value;renderPoster()});row.querySelector('[data-stat-delete]')?.addEventListener('click',()=>{if(statRows.length<=3)return;statRows.splice(i,1);renderStatRows();renderPoster()});row.querySelector('[data-stat-move="up"]')?.addEventListener('click',()=>{if(i<1)return;[statRows[i-1],statRows[i]]=[statRows[i],statRows[i-1]];renderStatRows();renderPoster()});row.querySelector('[data-stat-move="down"]')?.addEventListener('click',()=>{if(i>=statRows.length-1)return;[statRows[i+1],statRows[i]]=[statRows[i],statRows[i+1]];renderStatRows();renderPoster()})});
    $('#jd-add-stat')?.addEventListener('click',()=>{if(statRows.length>=5)return;statRows.push({key:'custom',value:'',label:'STAT'});renderStatRows();renderPoster()});
  }
  function playerOptions(){return rosterPlayers().map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(selectedPlayerId)?'selected':''}>#${esc(p.number||'—')} · ${esc(p.name)}</option>`).join('')}
  async function onPlayerChanged(){selectedPlayerId=$('#jd-graphic-player')?.value||'';cutoutCanvas=null;cutoutSource='';resetStyleStates();resetStats();resetText();signatureScale=1;signatureGap=2;signatureLastX=38;signatureRotation=-4;signatureNumberX=18;signatureNumberY=126;syncPlacement();renderStatRows();syncTextInputs();syncSignatureControls();await useProfilePhoto()}
  function syncPlacement(){const pairs=[['#jd-player-scale',playerScale,'#jd-player-scale-value',v=>`${Math.round(v*100)}%`],['#jd-player-x',playerX,'#jd-player-x-value',v=>`${Math.round(v)}`],['#jd-player-y',playerY,'#jd-player-y-value',v=>`${Math.round(v)}`]];pairs.forEach(([input,value,out,fmt])=>{const n=$(input);if(n)n.value=String(value);const o=$(out);if(o)o.textContent=fmt(value)});const e=$('#jd-edge-treatment');if(e)e.value=edgeTreatment;const g=$('#jd-player-grade');if(g)g.value=playerGrade}
  function syncTextInputs(){Object.entries(textState).forEach(([k,v])=>{const el=$(`[data-text-field="${k}"]`);if(el)el.value=v})}
  function resetSignatureLayout(){signatureScale=1;signatureGap=2;signatureLastX=38;signatureRotation=-4;signatureNumberX=18;signatureNumberY=126;syncSignatureControls();renderPoster()}
  function syncSignatureControls(){
    const pairs=[['#jd-signature-scale',signatureScale,'#jd-signature-scale-value',v=>`${Math.round(v*100)}%`],['#jd-signature-gap',signatureGap,'#jd-signature-gap-value',v=>`${Math.round(v)}`],['#jd-signature-last-x',signatureLastX,'#jd-signature-last-x-value',v=>`${Math.round(v)}`],['#jd-signature-rotation',signatureRotation,'#jd-signature-rotation-value',v=>`${Math.round(v)}°`],['#jd-signature-number-x',signatureNumberX,'#jd-signature-number-x-value',v=>`${Math.round(v)}`],['#jd-signature-number-y',signatureNumberY,'#jd-signature-number-y-value',v=>`${Math.round(v)}`]];
    pairs.forEach(([input,value,out,fmt])=>{const n=$(input);if(n)n.value=String(value);const o=$(out);if(o)o.textContent=fmt(value)});
  }

  function textEditor(){return `<details class="jd-graphic-details"><summary>Poster text & signature</summary><div class="jd-details-body"><div class="jd-section-title"><div><h3>Poster text</h3><p>Edit any wording while the layout stays locked.</p></div><button type="button" id="jd-reset-text">Reset text</button></div><div class="jd-text-grid"><label class="wide">Top team line<input data-text-field="eyebrow" value="${esc(textState.eyebrow)}"></label><label>Main title<input data-text-field="mainTitle" value="${esc(textState.mainTitle)}"></label><label>Second line<input data-text-field="secondTitle" value="${esc(textState.secondTitle)}"></label><label>Player name<input data-text-field="playerName" value="${esc(textState.playerName)}"></label><label>Jersey #<input data-text-field="jerseyNumber" value="${esc(textState.jerseyNumber)}"></label><label class="wide">Week / season line<input data-text-field="weekLabel" value="${esc(textState.weekLabel)}"></label><label class="wide">Tagline<input data-text-field="tagline" value="${esc(textState.tagline)}"></label><label>Website<input data-text-field="website" value="${esc(textState.website)}"></label><label>Social<input data-text-field="social" value="${esc(textState.social)}"></label><label class="wide">Small footer text<input data-text-field="smallText" value="${esc(textState.smallText)}"></label><label>Signature<select id="jd-signature-mode"><option value="off" ${signatureMode==='off'?'selected':''}>Off</option><option value="stylized" ${signatureMode==='stylized'?'selected':''}>Stylized player signature</option><option value="upload" ${signatureMode==='upload'?'selected':''}>Uploaded real signature</option></select></label><span></span><label>Signature first name<input data-text-field="signatureFirst" value="${esc(textState.signatureFirst||'')}"></label><label>Signature last name<input data-text-field="signatureLast" value="${esc(textState.signatureLast||'')}"></label><label class="wide jd-signature-upload">Upload real signature PNG<input id="jd-signature-upload" type="file" accept="image/png,image/webp"></label></div><div class="jd-signature-adjust"><div class="jd-section-title"><div><h3>Signature placement</h3><p>Stack the first name above the last name and adjust how tightly they connect.</p></div><button type="button" id="jd-reset-signature">Reset signature</button></div><div class="jd-signature-slider-grid"><div class="jd-placement-row"><label>Size</label><input id="jd-signature-scale" type="range" min="0.65" max="1.55" step="0.01" value="${signatureScale}"><output id="jd-signature-scale-value">${Math.round(signatureScale*100)}%</output></div><div class="jd-placement-row"><label>Name gap</label><input id="jd-signature-gap" type="range" min="-45" max="70" step="1" value="${signatureGap}"><output id="jd-signature-gap-value">${signatureGap}</output></div><div class="jd-placement-row"><label>Last X</label><input id="jd-signature-last-x" type="range" min="-90" max="150" step="1" value="${signatureLastX}"><output id="jd-signature-last-x-value">${signatureLastX}</output></div><div class="jd-placement-row"><label>Rotate</label><input id="jd-signature-rotation" type="range" min="-16" max="16" step="1" value="${signatureRotation}"><output id="jd-signature-rotation-value">${signatureRotation}°</output></div><div class="jd-placement-row"><label># left/right</label><input id="jd-signature-number-x" type="range" min="-60" max="180" step="1" value="${signatureNumberX}"><output id="jd-signature-number-x-value">${signatureNumberX}</output></div><div class="jd-placement-row"><label># up/down</label><input id="jd-signature-number-y" type="range" min="70" max="200" step="1" value="${signatureNumberY}"><output id="jd-signature-number-y-value">${signatureNumberY}</output></div></div></div></div></details>`}


  function renderControls(){
    const content=$('#section-content');if(!content)return;const seasonOpts=seasons().map(s=>`<option value="${esc(s.id)}" ${s.id===selectedSeasonId?'selected':''}>${esc(s.name)}</option>`).join('');
    content.innerHTML=`<div class="jd-graphic-shell"><div class="jd-graphic-intro"><div><span class="eyebrow">SOCIAL GRAPHICS</span><h2>Player of the Week Generator</h2><p>Choose one of three Jersey Dodgers poster styles, then customize the player, 3–5 stats and text while the live preview stays visible.</p></div><span class="jd-graphic-size">1080 × 1350 · 4:5</span></div><div class="jd-graphic-layout">
      <div class="jd-graphic-controls">
        <section><h3>1. Style, player & season</h3><label>Graphic style<select id="jd-graphic-style"><option value="editorial" ${graphicStyle==='editorial'?'selected':''}>Editorial / City</option><option value="electric" ${graphicStyle==='electric'?'selected':''}>Electric Blue</option><option value="classic" ${graphicStyle==='classic'?'selected':''}>Classic Dodgers</option></select></label><div class="jd-style-caption" id="jd-style-caption">${graphicStyle==='editorial'?'Dark editorial poster, skyline, ghost portrait, signature and giant jersey number.':graphicStyle==='electric'?'High-energy blue lighting, electric edge effects and glowing stat cards.':'Cleaner Dodger-blue baseball look with player on the right and information on the left.'}</div><div class="jd-graphic-field-grid"><label>Season<select id="jd-graphic-season">${seasonOpts}</select></label><label>Stat set<select id="jd-graphic-phase"><option value="regular" ${phase==='regular'?'selected':''}>Regular season</option><option value="playoffs" ${phase==='playoffs'?'selected':''}>Playoffs</option></select></label></div><label>Player<select id="jd-graphic-player">${playerOptions()}</select></label></section>
        <section><h3>2. Player photo & treatment</h3><div class="jd-graphic-photo-row"><button class="button" id="jd-use-profile-photo" type="button">Use profile photo</button><label class="button" for="jd-graphic-upload-photo">Upload different photo</label><input id="jd-graphic-upload-photo" type="file" accept="image/*"></div><div class="jd-graphic-photo-preview" id="jd-graphic-photo-preview"></div><div class="jd-bg-actions"><label class="jd-bg-toggle"><input id="jd-auto-remove-bg" type="checkbox" checked>Remove background when generating</label><button type="button" id="jd-remove-bg">Remove with PhotoRoom</button></div><div class="jd-graphic-field-grid"><label>Edge treatment<select id="jd-edge-treatment"><option value="none" ${edgeTreatment==='none'?'selected':''}>None</option><option value="stroke" ${edgeTreatment==='stroke'?'selected':''}>Electric blue stroke</option><option value="energy" ${edgeTreatment==='energy'?'selected':''}>Blue energy</option></select></label><label>Photo grade<select id="jd-player-grade"><option value="dramatic" ${playerGrade==='dramatic'?'selected':''}>Dramatic</option><option value="high" ${playerGrade==='high'?'selected':''}>High contrast</option><option value="clean" ${playerGrade==='clean'?'selected':''}>Clean / natural</option></select></label></div><div id="jd-bg-status" class="jd-bg-status">High-quality removal uses PhotoRoom securely through the Jersey Dodgers server. Your API key never appears in the browser. The photo itself is sent to PhotoRoom for processing.</div></section>
        <section><div class="jd-section-title"><div><h3>3. Featured stats</h3><p>Use 3–5 stats. Pick a saved stat, edit its value/label, add or delete rows, and reorder them.</p></div></div><div id="jd-graphic-stats"></div></section>
        ${textEditor()}
        <section class="jd-graphic-actions"><button class="button primary" id="jd-generate-graphic" type="button">Generate & Download PNG</button><button type="button" id="jd-download-graphic" disabled>Download Again</button><button type="button" id="jd-reset-graphic">Reset graphic</button></section>
      </div>
      <div class="jd-graphic-stage-wrap"><div class="jd-graphic-stage-head"><strong>LIVE POST PREVIEW</strong><span id="jd-preview-style-name">${graphicStyle==='editorial'?'EDITORIAL / CITY':graphicStyle==='electric'?'ELECTRIC BLUE':'CLASSIC DODGERS'} · 1080 × 1350</span></div><div class="jd-graphic-canvas-shell"><canvas id="jd-potw-canvas" width="1080" height="1350" aria-label="Player of the Week graphic preview"></canvas></div><div class="jd-preview-placement"><strong>Player placement</strong><div class="jd-placement-row"><label>Size</label><input id="jd-player-scale" type="range" min="0.60" max="1.75" step="0.01" value="${playerScale}"><output id="jd-player-scale-value">${Math.round(playerScale*100)}%</output></div><div class="jd-placement-row"><label>Left / right</label><input id="jd-player-x" type="range" min="-280" max="280" step="1" value="${playerX}"><output id="jd-player-x-value">${playerX}</output></div><div class="jd-placement-row"><label>Up / down</label><input id="jd-player-y" type="range" min="-220" max="180" step="1" value="${playerY}"><output id="jd-player-y-value">${playerY}</output></div><button type="button" id="jd-reset-placement">Reset this style placement</button><small>You can also drag the player directly on the preview. The logo is below the player; stats, title and footer stay above him.</small></div></div>
    </div></div>`;
    bindControls();renderStatRows();paintPhotoPreview();renderPoster();
  }

  function bindControls(){
    $('#jd-graphic-style')?.addEventListener('change',e=>{saveStyleState();graphicStyle=['editorial','electric','classic'].includes(e.target.value)?e.target.value:'editorial';restoreStyleState(graphicStyle);syncPlacement();const name=$('#jd-preview-style-name');if(name)name.textContent=`${graphicStyle==='editorial'?'EDITORIAL / CITY':graphicStyle==='electric'?'ELECTRIC BLUE':'CLASSIC DODGERS'} · 1080 × 1350`;const cap=$('#jd-style-caption');if(cap)cap.textContent=graphicStyle==='editorial'?'Dark editorial poster, skyline, ghost portrait, signature and giant jersey number.':graphicStyle==='electric'?'High-energy blue lighting, electric edge effects and glowing stat cards.':'Cleaner Dodger-blue baseball look with player on the right and information on the left.';renderPoster()});
    $('#jd-graphic-season')?.addEventListener('change',async e=>{selectedSeasonId=e.target.value;selectedPlayerId=rosterPlayers()[0]?.id||'';cutoutCanvas=null;cutoutSource='';resetStyleStates();resetStats();resetText();renderControls();await useProfilePhoto()});
    $('#jd-graphic-phase')?.addEventListener('change',async e=>{phase=e.target.value==='playoffs'?'playoffs':'regular';selectedPlayerId=rosterPlayers()[0]?.id||'';cutoutCanvas=null;cutoutSource='';resetStyleStates();resetStats();resetText();renderControls();await useProfilePhoto()});
    $('#jd-graphic-player')?.addEventListener('change',onPlayerChanged);$('#jd-use-profile-photo')?.addEventListener('click',useProfilePhoto);$('#jd-graphic-upload-photo')?.addEventListener('change',e=>useUploadedPhoto(e.target.files?.[0]));
    $('#jd-remove-bg')?.addEventListener('click',async()=>{const b=$('#jd-remove-bg');try{b.disabled=true;await removeBackground()}catch(e){setBgStatus(e.message,'error')}finally{b.disabled=false}});
    $('#jd-edge-treatment')?.addEventListener('change',e=>{edgeTreatment=e.target.value;saveStyleState();renderPoster()});$('#jd-player-grade')?.addEventListener('change',e=>{playerGrade=e.target.value;saveStyleState();renderPoster()});
    $$('[data-text-field]').forEach(el=>el.addEventListener('input',()=>{textState[el.dataset.textField]=el.value;renderPoster()}));$('#jd-reset-text')?.addEventListener('click',()=>{resetText();syncTextInputs();renderPoster()});
    $('#jd-signature-mode')?.addEventListener('change',e=>{signatureMode=e.target.value;renderPoster()});$('#jd-signature-upload')?.addEventListener('change',e=>useSignatureUpload(e.target.files?.[0]));
    $('#jd-reset-signature')?.addEventListener('click',resetSignatureLayout);
    $('#jd-signature-scale')?.addEventListener('input',e=>{signatureScale=Number(e.target.value);syncSignatureControls();renderPoster()});
    $('#jd-signature-gap')?.addEventListener('input',e=>{signatureGap=Number(e.target.value);syncSignatureControls();renderPoster()});
    $('#jd-signature-last-x')?.addEventListener('input',e=>{signatureLastX=Number(e.target.value);syncSignatureControls();renderPoster()});
    $('#jd-signature-rotation')?.addEventListener('input',e=>{signatureRotation=Number(e.target.value);syncSignatureControls();renderPoster()});
    $('#jd-signature-number-x')?.addEventListener('input',e=>{signatureNumberX=Number(e.target.value);syncSignatureControls();renderPoster()});
    $('#jd-signature-number-y')?.addEventListener('input',e=>{signatureNumberY=Number(e.target.value);syncSignatureControls();renderPoster()});
    $('#jd-player-scale')?.addEventListener('input',e=>{playerScale=Number(e.target.value);saveStyleState();syncPlacement();renderPoster()});$('#jd-player-x')?.addEventListener('input',e=>{playerX=Number(e.target.value);saveStyleState();syncPlacement();renderPoster()});$('#jd-player-y')?.addEventListener('input',e=>{playerY=Number(e.target.value);saveStyleState();syncPlacement();renderPoster()});
    $('#jd-reset-placement')?.addEventListener('click',()=>{styleStates[graphicStyle]={...STYLE_DEFAULTS[graphicStyle]};restoreStyleState(graphicStyle);syncPlacement();renderPoster()});
    $('#jd-generate-graphic')?.addEventListener('click',async()=>{const b=$('#jd-generate-graphic'),safari=/^((?!chrome|android).)*safari/i.test(navigator.userAgent),downloadWindow=safari?window.open('about:blank','jdGraphicDownload'):null;try{b.disabled=true;b.textContent='Generating…';if($('#jd-auto-remove-bg')?.checked&&photoImage&&cutoutSource!==photoSource)await removeBackground();renderPoster();downloadPoster(downloadWindow);setStatus('Player of the Week graphic generated and downloaded.')}catch(e){try{downloadWindow?.close()}catch{}setBgStatus(e.message,'error');setStatus(e.message,true)}finally{b.disabled=false;b.textContent='Generate & Download PNG'}});
    $('#jd-download-graphic')?.addEventListener('click',()=>{try{downloadPoster()}catch(e){setStatus(e.message,true)}});$('#jd-reset-graphic')?.addEventListener('click',async()=>{cutoutCanvas=null;cutoutSource='';graphicStyle='editorial';signatureMode='stylized';signatureImage=null;signatureSource='';signatureScale=1;signatureGap=2;signatureLastX=38;signatureRotation=-4;signatureNumberX=18;signatureNumberY=126;resetStyleStates();resetStats();resetText();renderControls();await useProfilePhoto();setBgStatus('Graphic reset. PhotoRoom will only run again when a new photo needs a cutout.','')});
    const canvas=$('#jd-potw-canvas');if(canvas){const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*CANVAS_W/r.width,y:(e.clientY-r.top)*CANVAS_H/r.height}};canvas.addEventListener('pointerdown',e=>{drag=point(e);canvas.setPointerCapture?.(e.pointerId);canvas.classList.add('dragging')});canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=point(e);playerX=clamp(playerX+p.x-drag.x,-280,280);playerY=clamp(playerY+p.y-drag.y,-220,180);drag=p;saveStyleState();syncPlacement();renderPoster()});const end=()=>{drag=null;canvas.classList.remove('dragging')};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end)}
  }

  function posterFilename(){const p=selectedPlayer(),safe=String(p?.name||'player').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');return `jersey-dodgers-player-of-the-week-${safe||'player'}-${graphicStyle}.png`}
  function downloadPoster(downloadWindow=null){
    const canvas=$('#jd-potw-canvas');if(!canvas)throw Error('Preview is not ready.');let url='';try{url=canvas.toDataURL('image/png')}catch{throw Error('Could not create the PNG. Try using an uploaded player photo from this site.')}
    const name=posterFilename(),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();if(downloadWindow&&!downloadWindow.closed){try{downloadWindow.document.title=name;downloadWindow.document.body.style.cssText='margin:0;background:#07101a;color:white;font-family:system-ui;text-align:center;padding:24px';downloadWindow.document.body.innerHTML='<p>If the download did not start automatically, use the button below.</p><a id="jd-final-download" style="display:inline-block;padding:12px 18px;background:#168bff;color:white;text-decoration:none;border-radius:7px">Download PNG</a>';const link=downloadWindow.document.getElementById('jd-final-download');link.href=url;link.download=name;link.click()}catch{}}return true;
  }

  async function openGenerator(){
    active=true;document.body.classList.remove('admin-menu-open');$('#admin-nav')?.classList.remove('open');$('#admin-menu-toggle')?.setAttribute('aria-expanded','false');$$('#admin-nav [data-section],#jd-staff-nav,#jd-graphic-nav').forEach(b=>b.classList.remove('active'));$('#jd-graphic-nav')?.classList.add('active');
    const saveState=$('#save-state'),saveButton=$('#save-all');if(saveState)saveState.hidden=true;if(saveButton)saveButton.hidden=true;const heading=$('.admin-heading h1');if(heading)heading.textContent='Graphic Generator';const help=$('.admin-help');if(help)help.textContent='Build a 1080×1350 Player of the Week graphic with three Jersey Dodgers poster styles and a live preview.';
    try{const payload=await api('/api/admin/content');data=payload.data||payload;selectedSeasonId=selectedSeasonId&&data.seasons.some(s=>s.id===selectedSeasonId)?selectedSeasonId:currentSeason();const ps=rosterPlayers();selectedPlayerId=ps.some(p=>String(p.id)===String(selectedPlayerId))?selectedPlayerId:(ps[0]?.id||'');resetStyleStates();resetStats();resetText();await loadLogos();try{await document.fonts?.load?.(`72px ${SIGNATURE_FONT}`);await document.fonts?.ready}catch{}renderControls();await useProfilePhoto()}catch(e){setStatus(e.message,true)}
  }

  function graphicNavButtons(nav){return $$('button',nav).filter(b=>b.id==='jd-graphic-nav'||String(b.textContent||'').trim()==='Graphic Generator')}
  async function install(){
    const nav=$('#admin-nav');if(!nav||installing)return;installing=true;try{access=await api('/api/admin/access');graphicNavButtons(nav).forEach(n=>n.remove());if(!access.media)return;const b=document.createElement('button');b.id='jd-graphic-nav';b.type='button';b.textContent='Graphic Generator';b.addEventListener('click',openGenerator);const staff=$('#jd-staff-nav'),mobile=nav.querySelector('.admin-mobile-site');nav.insertBefore(b,staff||mobile||null);if(active)b.classList.add('active')}catch{}finally{installing=false}
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-section],#jd-staff-nav')){active=false;$$('#jd-graphic-nav').forEach(n=>n.classList.remove('active'))}});
  const observer=new MutationObserver(()=>{const nav=$('#admin-nav');if(nav&&graphicNavButtons(nav).length!==1)install()});observer.observe(document.documentElement,{childList:true,subtree:true});[250,600,1200,2200,4000].forEach(t=>setTimeout(install,t));
})();
