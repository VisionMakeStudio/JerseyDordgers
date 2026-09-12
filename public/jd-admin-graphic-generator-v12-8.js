(() => {
  'use strict';
  if (window.__jdGraphicGeneratorV1211Loaded) return;
  window.__jdGraphicGeneratorV1211Loaded = true;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const CANVAS_W=1080,CANVAS_H=1350;
  const GENERATOR_VERSION='14.0',MAX_TRANSFER_BYTES=4_000_000;
  const EDITORIAL_BACKGROUND='/assets/jd-editorial-city-v12-9.png';
  const SCRIPT_LOGO='/assets/jd-script-logo-official.png';
  const D_MARK='/assets/jd-d-mark-official.png';
  // Phase 3: unlimited on-device portrait matting. MODNet is Apache-2.0 licensed.
  const PHASE3_VERSION='P3.1';
  const ORT_SCRIPT='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.min.js';
  const ORT_WASM_BASE='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  const MODNET_MODEL='https://huggingface.co/DavG25/modnet-pretrained-models/resolve/main/models/modnet_photographic_portrait_matting.onnx';
  const MODNET_MODEL_FALLBACK='https://github.com/yakhyo/modnet/releases/download/weights/modnet_photographic.onnx';
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
  const TITLE_FONT="'Bebas Neue', Impact, Haettenschweiler, sans-serif";
  const CONDENSED_FONT="'Oswald', 'Arial Narrow', Arial, sans-serif";
  const ELECTRIC_FONT="'Teko', 'Arial Narrow', Arial, sans-serif";
  const CLASSIC_FONT="'Graduate', Georgia, serif";
  const SIGNATURE_FONT="'Mrs Saint Delafield', 'Alex Brush', 'Brush Script MT', cursive";

  const STYLE_DEFAULTS={
    editorial:{scale:1.04,x:-10,y:4,edge:'shadow',intensity:34,grade:'dramatic'},
    electric:{scale:1.08,x:-45,y:-4,edge:'electric',intensity:80,grade:'dramatic'},
    classic:{scale:1.03,x:52,y:0,edge:'shadow',intensity:30,grade:'clean'}
  };

  let data=null,access=null,active=false,openPromise=null;
  let selectedPlayerId='',selectedSeasonId='',phase='regular';
  let photoSource='',photoImage=null,photoLabel='';
  let cutoutCanvas=null,cutoutSource='';
  let logoScript=null,logoMark=null,editorialBackground=null;
  let generated=false,drag=null,previewResizeObserver=null;
  let statRows=[];
  let textState={};
  let graphicStyle='editorial';
  let playerScale=STYLE_DEFAULTS.editorial.scale,playerX=STYLE_DEFAULTS.editorial.x,playerY=STYLE_DEFAULTS.editorial.y;
  let edgeTreatment=STYLE_DEFAULTS.editorial.edge,edgeIntensity=STYLE_DEFAULTS.editorial.intensity,playerGrade=STYLE_DEFAULTS.editorial.grade;
  let styleStates={
    editorial:{...STYLE_DEFAULTS.editorial},
    electric:{...STYLE_DEFAULTS.electric},
    classic:{...STYLE_DEFAULTS.classic}
  };
  let signatureMode='stylized',signatureImage=null,signatureSource='';
  let signatureScale=1,signatureGap=2,signatureLastX=38,signatureRotation=-4,signatureNumberX=18,signatureNumberY=126;
  let topLogoMode='script',topLogoCustom=null,topLogoSource='',topLogoScale=1,topLogoX=0,topLogoY=0,topLogoOpacity=.96;
  const tintCache=new WeakMap();
  const cutoutCache=new Map();
  const pendingCutouts=new Map();
  const localMatteCache=new Map();
  let ortLoaderPromise=null,modnetSessionPromise=null,cutoutMethod='',autoRemovalMethod='local',cleanupTimer=null;
  let localCleanup={contract:1,feather:1,spill:35,bias:0};

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
  function saveStyleState(){styleStates[graphicStyle]={scale:playerScale,x:playerX,y:playerY,edge:edgeTreatment,intensity:edgeIntensity,grade:playerGrade}}
  function restoreStyleState(style){
    const s=styleStates[style]||STYLE_DEFAULTS[style]||STYLE_DEFAULTS.editorial;
    playerScale=s.scale;playerX=s.x;playerY=s.y;edgeTreatment=s.edge;edgeIntensity=s.intensity??45;playerGrade=s.grade;
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
  async function loadLogos(){await Promise.all([
    !logoScript&&loadImage(SCRIPT_LOGO).then(img=>logoScript=img).catch(()=>null),
    !logoMark&&loadImage(D_MARK).then(img=>logoMark=img).catch(()=>null),
    !editorialBackground&&loadImage(EDITORIAL_BACKGROUND).then(img=>editorialBackground=img).catch(()=>null)
  ])}
  function currentTopLogo(){
    if(topLogoMode==='none')return null;
    if(topLogoMode==='mark')return logoMark;
    if(topLogoMode==='custom')return topLogoCustom;
    return logoScript;
  }
  function drawTopLogo(ctx){
    const img=currentTopLogo();if(!img)return;
    const isMark=topLogoMode==='mark';
    const baseW=isMark?132:340,baseH=isMark?132:176;
    const scale=clamp(topLogoScale,.45,2);
    drawImageContain(ctx,img,34+clamp(topLogoX,-150,520),38+clamp(topLogoY,-120,340),baseW*scale,baseH*scale,clamp(topLogoOpacity,.15,1));
  }
  async function useTopLogoUpload(file){
    if(!file)return;if(!/^image\//i.test(file.type||''))throw Error('Choose a PNG, WebP, or JPG logo image.');
    const url=URL.createObjectURL(file);
    try{topLogoCustom=await loadImage(url);topLogoSource=file.name||'Custom logo';topLogoMode='custom';syncBrandingControls();renderPoster()}
    finally{setTimeout(()=>URL.revokeObjectURL(url),0)}
  }
  function resetTopLogo(){topLogoMode='script';topLogoCustom=null;topLogoSource='';topLogoScale=1;topLogoX=0;topLogoY=0;topLogoOpacity=.96;syncBrandingControls();renderPoster()}
  function cutoutKey(method='photoroom'){return `${method}::${selectedPlayerId||'player'}::${photoSource||''}`}
  function restoreCachedCutout(method='photoroom'){
    const cached=cutoutCache.get(cutoutKey(method));
    if(cached){cutoutCanvas=cached;cutoutSource=photoSource;cutoutMethod=method;return true}
    return false;
  }
  async function useProfilePhoto(){
    const p=selectedPlayer();
    if(!p?.photo){photoSource='';photoImage=null;photoLabel='No profile photo';cutoutCanvas=null;cutoutSource='';cutoutMethod='';paintPhotoPreview();renderPoster();return}
    photoSource=p.photo;photoImage=null;photoLabel='Profile photo';cutoutCanvas=null;cutoutSource='';cutoutMethod='';
    const source=photoSource;paintPhotoPreview();renderPoster();
    try{const img=await loadImage(source);if(source!==photoSource)return;photoImage=img;restoreCachedCutout(autoRemovalMethod);paintPhotoPreview();renderPoster()}catch(e){if(source===photoSource)setBgStatus(e.message,'error')}
  }
  async function useUploadedPhoto(file){
    if(!file)return;if(photoSource?.startsWith('blob:'))URL.revokeObjectURL(photoSource);
    photoSource=URL.createObjectURL(file);photoImage=null;photoLabel=file.name||'Uploaded photo';cutoutCanvas=null;cutoutSource='';cutoutMethod='';
    const source=photoSource;paintPhotoPreview();renderPoster();
    try{const img=await loadImage(source);if(source!==photoSource)return;photoImage=img;restoreCachedCutout(autoRemovalMethod);paintPhotoPreview();renderPoster()}catch(e){if(source===photoSource)setBgStatus(e.message,'error')}
  }
  async function useSignatureUpload(file){
    if(!file)return;if(signatureSource?.startsWith('blob:'))URL.revokeObjectURL(signatureSource);
    signatureSource=URL.createObjectURL(file);
    try{signatureImage=await loadImage(signatureSource);signatureMode='upload';const sel=$('#jd-signature-mode');if(sel)sel.value='upload';renderPoster()}catch(e){setStatus(e.message,true)}
  }
  function paintPhotoPreview(){
    const wrap=$('#jd-graphic-photo-preview');if(!wrap)return;const p=selectedPlayer();
    const state=cutoutCanvas?(cutoutMethod==='local'?'Free Local AI cutout':cutoutMethod==='photoroom'?'PhotoRoom HQ cutout':'Background removed'):'Original image';
    wrap.innerHTML=photoSource?`<img src="${esc(photoSource)}" alt=""><span><strong>${esc(photoLabel||'Player photo')}</strong><small>${state} · ${esc(p?.name||'')}</small></span>`:`<span><strong>No photo selected</strong><small>Use the profile photo or upload a full-body image.</small></span>`;
  }
  function setBgStatus(text,kind=''){const n=$('#jd-bg-status');if(n){n.textContent=text;n.className=`jd-bg-status ${kind}`}}

  async function preparedPhotoBlob(img){
    if(!img)throw Error('Choose a player photo first.');
    const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
    if(!iw||!ih)throw Error('This player photo has no usable dimensions.');
    // Keep the upload below Netlify's binary limit, with enough detail for a 1080×1350 poster.
    let maxSide=2000;
    for(let attempt=0;attempt<3;attempt++){
      const ratio=Math.min(1,maxSide/Math.max(iw,ih));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(iw*ratio));canvas.height=Math.max(1,Math.round(ih*ratio));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise((resolve,reject)=>{try{canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare the player photo.')),'image/jpeg',.92)}catch(e){reject(e)}});
      if(blob.size<=MAX_TRANSFER_BYTES)return blob;
      maxSide=Math.round(maxSide*.75);
    }
    throw Error('Player photo is too large. Upload a smaller image.');
  }
  async function readCutoutResponse(response){
    if(response.status===202)throw Error('The server started an asynchronous job instead of returning the cutout. Deploy the photoroom-cutout.ts function and reload Admin.');
    const type=String(response.headers.get('content-type')||'').toLowerCase();
    let body=null;
    if(type.includes('application/json')){try{body=await response.json()}catch{throw Error('The server returned incomplete image data. Reload Admin and try again.')}}
    if(!response.ok)throw Error(body?.error||`Background removal failed (HTTP ${response.status}). Sign in again or retry with a smaller photo.`);
    if(response.headers.get('X-JD-Generator-Version')!==GENERATOR_VERSION||body?.version!==GENERATOR_VERSION){
      throw Error('The Admin page and background-removal function are different versions. Deploy all V12.11 patch files together, then reload Admin.');
    }
    if(body.mimeType!=='image/png'||!Number.isInteger(body.byteLength)||body.byteLength<45||body.byteLength>MAX_TRANSFER_BYTES||typeof body.imageBase64!=='string'||body.imageBase64.length!==4*Math.ceil(body.byteLength/3)){
      throw Error('The server did not return a complete PNG. Reload Admin and try again.');
    }
    let binary;try{binary=atob(body.imageBase64)}catch{throw Error('The returned PNG data is damaged. Please try again.')}
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    if(bytes.length!==body.byteLength||![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))throw Error('The returned PNG is incomplete or invalid. Please try again.');
    return new Blob([bytes],{type:'image/png'});
  }
  async function requestCutout(source,img){
    let input;
    try{input=await preparedPhotoBlob(img)}catch{
      try{const r=await fetch(source,{credentials:'same-origin'});if(!r.ok)throw Error();input=await r.blob()}catch{throw Error('This photo could not be prepared. Upload the original JPEG, PNG or WebP and try again.')}
    }
    if(!input.size||input.size>MAX_TRANSFER_BYTES)throw Error('Use a player photo under 4 MB.');
    if(!['image/jpeg','image/png','image/webp'].includes(input.type))throw Error('Upload a JPEG, PNG or WebP player photo.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55_000);
    try{
      const response=await fetch('/api/admin/photoroom-cutout',{
        method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':input.type,'Accept':'application/json','X-JD-Generator-Version':GENERATOR_VERSION},body:input
      });
      const result=await decodeImageBlob(await readCutoutResponse(response));
      try{
        const iw=result.naturalWidth||result.width,ih=result.naturalHeight||result.height;
        if(!iw||!ih)throw Error('PhotoRoom returned an image with no usable dimensions.');
        const canvas=document.createElement('canvas');canvas.width=iw;canvas.height=ih;
        canvas.getContext('2d').drawImage(result,0,0,iw,ih);
        return trimTransparent(canvas);
      }finally{result.close?.()}
    }catch(e){if(e.name==='AbortError')throw Error('Background removal took too long. Try again with a smaller photo.');throw e}
    finally{clearTimeout(timer)}
  }
  async function removeBackground(){
    if(!photoImage||!photoSource)throw Error('Choose a player photo first.');
    if(cutoutCanvas&&cutoutSource===photoSource)return cutoutCanvas;
    if(restoreCachedCutout('photoroom')){setBgStatus('PhotoRoom cutout restored from this session.','good');paintPhotoPreview();renderPoster();return cutoutCanvas}
    const source=photoSource,key=cutoutKey('photoroom');
    setBgStatus('PhotoRoom is creating a high-quality transparent cutout…','busy');
    // Remove and Generate share one paid request, even when clicked together.
    if(!pendingCutouts.has(key)){
      const job=requestCutout(source,photoImage).then(canvas=>{
        cutoutCache.set(key,canvas);
        while(cutoutCache.size>6)cutoutCache.delete(cutoutCache.keys().next().value);
        return canvas;
      }).finally(()=>pendingCutouts.delete(key));
      pendingCutouts.set(key,job);
    }
    const canvas=await pendingCutouts.get(key);
    if(key!==cutoutKey())throw Error('The player photo changed during processing. Its cutout was saved for this session; generate again for the selected photo.');
    cutoutCanvas=canvas;cutoutSource=source;cutoutMethod='photoroom';
    setBgStatus('PhotoRoom background removal complete. Transparent PNG ready.','good');paintPhotoPreview();renderPoster();return canvas;
  }
  function ensureOrt(){
    if(window.ort)return Promise.resolve(window.ort);
    if(ortLoaderPromise)return ortLoaderPromise;
    ortLoaderPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-jd-ort]');
      const ready=()=>{
        if(!window.ort){reject(Error('Free Local AI could not load its browser engine. Check your connection, then retry or use PhotoRoom HQ.'));return;}
        try{
          window.ort.env.wasm.wasmPaths=ORT_WASM_BASE;
          window.ort.env.wasm.numThreads=(self.crossOriginIsolated&&typeof SharedArrayBuffer!=='undefined')?Math.max(1,Math.min(2,navigator.hardwareConcurrency||1)):1;
          window.ort.env.wasm.proxy=false;
        }catch{}
        resolve(window.ort);
      };
      if(existing){existing.addEventListener('load',ready,{once:true});existing.addEventListener('error',()=>reject(Error('Free Local AI engine failed to load. Use PhotoRoom HQ as a fallback.')),{once:true});return;}
      const script=document.createElement('script');script.src=ORT_SCRIPT;script.async=true;script.crossOrigin='anonymous';script.dataset.jdOrt='1';
      script.onload=ready;script.onerror=()=>reject(Error('Free Local AI engine failed to load. Check your connection or use PhotoRoom HQ.'));document.head.append(script);
    }).catch(e=>{ortLoaderPromise=null;throw e});
    return ortLoaderPromise;
  }
  async function loadModnetModel(){
    const urls=[MODNET_MODEL,MODNET_MODEL_FALLBACK];let cache=null;
    if('caches' in window){try{cache=await caches.open('jd-local-ai-v1')}catch{}}
    for(const url of urls){
      try{
        let response=cache?await cache.match(url):null;
        if(!response){response=await fetch(url,{mode:'cors',cache:'force-cache'});if(!response.ok)throw Error(`HTTP ${response.status}`);if(cache){try{await cache.put(url,response.clone())}catch{}}}
        const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength<1_000_000)throw Error('model download was incomplete');return bytes;
      }catch{}
    }
    return MODNET_MODEL;
  }
  async function ensureModnet(){
    if(modnetSessionPromise)return modnetSessionPromise;
    modnetSessionPromise=(async()=>{
      const ort=await ensureOrt();
      setBgStatus('Free Local AI: loading the portrait model (about 25 MB on first use; then it is cached in this browser)…','busy');
      try{const model=await loadModnetModel();return await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all',executionMode:'sequential'});}
      catch(e){throw Error(`Free Local AI model could not start in this browser. ${e?.message||'Try PhotoRoom HQ instead.'}`)}
    })().catch(e=>{modnetSessionPromise=null;throw e});
    return modnetSessionPromise;
  }
  function modnetSize(iw,ih){
    const target=512;let w=iw,h=ih;
    if(Math.max(iw,ih)<target||Math.min(iw,ih)>target){const r=target/Math.min(iw,ih);w=Math.round(iw*r);h=Math.round(ih*r)}
    w=Math.max(32,Math.floor(w/32)*32);h=Math.max(32,Math.floor(h/32)*32);
    const cap=1024;if(Math.max(w,h)>cap){const r=cap/Math.max(w,h);w=Math.max(32,Math.floor(w*r/32)*32);h=Math.max(32,Math.floor(h*r/32)*32)}
    return {w,h};
  }
  function erodeMatte(src,w,h,passes){
    let a=src,b=new Float32Array(src.length);passes=Math.max(0,Math.min(4,Math.round(passes)));
    for(let pass=0;pass<passes;pass++){
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=y*w+x;let v=a[i];
        if(x>0)v=Math.min(v,a[i-1]);if(x<w-1)v=Math.min(v,a[i+1]);if(y>0)v=Math.min(v,a[i-w]);if(y<h-1)v=Math.min(v,a[i+w]);
        b[i]=v;
      }
      const t=a;a=b;b=t;
    }
    return a===src?new Float32Array(src):a;
  }
  function blurMatte(src,w,h,radius){
    radius=Math.max(0,Math.min(4,Math.round(radius)));if(!radius)return src;
    const temp=new Float32Array(src.length),out=new Float32Array(src.length),diam=radius*2+1;
    for(let y=0;y<h;y++){
      let sum=0;for(let x=-radius;x<=radius;x++)sum+=src[y*w+Math.max(0,Math.min(w-1,x))];
      for(let x=0;x<w;x++){temp[y*w+x]=sum/diam;sum-=src[y*w+Math.max(0,x-radius)];sum+=src[y*w+Math.min(w-1,x+radius+1)]}
    }
    for(let x=0;x<w;x++){
      let sum=0;for(let y=-radius;y<=radius;y++)sum+=temp[Math.max(0,Math.min(h-1,y))*w+x];
      for(let y=0;y<h;y++){out[y*w+x]=sum/diam;sum-=temp[Math.max(0,y-radius)*w+x];sum+=temp[Math.min(h-1,y+radius+1)*w+x]}
    }
    return out;
  }
  async function inferLocalMatte(img){
    const key=cutoutKey('local-matte');if(localMatteCache.has(key))return localMatteCache.get(key);
    const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;if(!iw||!ih)throw Error('This photo has no usable dimensions.');
    const {w,h}=modnetSize(iw,ih),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
    let px;try{px=ctx.getImageData(0,0,w,h).data}catch{throw Error('Free Local AI cannot read this remote profile photo. Upload the original JPEG/PNG with “Upload different photo” and try again.')}
    const input=new Float32Array(3*w*h),plane=w*h;
    for(let i=0,j=0;i<plane;i++,j+=4){input[i]=(px[j]/127.5)-1;input[plane+i]=(px[j+1]/127.5)-1;input[plane*2+i]=(px[j+2]/127.5)-1}
    const session=await ensureModnet(),ort=window.ort,inputName=session.inputNames[0],outputName=session.outputNames[0];
    setBgStatus('Free Local AI: separating the player on this device…','busy');
    const result=await session.run({[inputName]:new ort.Tensor('float32',input,[1,3,h,w])}),tensor=result[outputName];
    if(!tensor?.data?.length)throw Error('Free Local AI returned no portrait mask. Try another photo or use PhotoRoom HQ.');
    const matte={data:new Float32Array(tensor.data),w,h};localMatteCache.set(key,matte);while(localMatteCache.size>4)localMatteCache.delete(localMatteCache.keys().next().value);return matte;
  }
  function buildLocalCutout(img,matte){
    const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,maxSide=1800,scale=Math.min(1,maxSide/Math.max(iw,ih)),ow=Math.max(1,Math.round(iw*scale)),oh=Math.max(1,Math.round(ih*scale));
    let mask=erodeMatte(matte.data,matte.w,matte.h,localCleanup.contract);mask=blurMatte(mask,matte.w,matte.h,localCleanup.feather);
    const maskCanvas=document.createElement('canvas');maskCanvas.width=matte.w;maskCanvas.height=matte.h;const mctx=maskCanvas.getContext('2d'),mi=mctx.createImageData(matte.w,matte.h),bias=localCleanup.bias/100;
    for(let i=0;i<mask.length;i++){let a=Math.max(0,Math.min(1,(mask[i]-bias)));a=a*a*(3-2*a);const j=i*4;mi.data[j]=mi.data[j+1]=mi.data[j+2]=255;mi.data[j+3]=Math.round(a*255)}mctx.putImageData(mi,0,0);
    const alphaCanvas=document.createElement('canvas');alphaCanvas.width=ow;alphaCanvas.height=oh;const actx=alphaCanvas.getContext('2d',{willReadFrequently:true});actx.imageSmoothingEnabled=true;actx.imageSmoothingQuality='high';actx.drawImage(maskCanvas,0,0,ow,oh);const alpha=actx.getImageData(0,0,ow,oh).data;
    const out=document.createElement('canvas');out.width=ow;out.height=oh;const octx=out.getContext('2d',{willReadFrequently:true});octx.drawImage(img,0,0,ow,oh);const image=octx.getImageData(0,0,ow,oh),d=image.data,spill=Math.max(0,Math.min(1,localCleanup.spill/100));
    for(let j=0;j<d.length;j+=4){const a=alpha[j+3]/255;d[j+3]=alpha[j+3];if(spill>0&&a>0&&a<.98){const edge=(1-a)*spill,r=d[j],g=d[j+1],b=d[j+2],lum=.299*r+.587*g+.114*b;if(b>r*1.12&&b>g*1.06)d[j+2]=Math.round(b+(Math.max(r,g)-b)*edge);if(g>r*1.12&&g>b*1.04)d[j+1]=Math.round(g+(Math.max(r,b)-g)*edge);const neutral=edge*.18;d[j]=Math.round(d[j]+(lum-d[j])*neutral);d[j+1]=Math.round(d[j+1]+(lum-d[j+1])*neutral);d[j+2]=Math.round(d[j+2]+(lum-d[j+2])*neutral)}}
    octx.putImageData(image,0,0);return trimTransparent(out,'Free Local AI');
  }
  async function removeBackgroundLocal(force=false){
    if(!photoImage||!photoSource)throw Error('Choose a player photo first.');
    const key=cutoutKey('local');
    if(!force&&cutoutCanvas&&cutoutSource===photoSource&&cutoutMethod==='local')return cutoutCanvas;
    const matte=await inferLocalMatte(photoImage);const canvas=buildLocalCutout(photoImage,matte);cutoutCanvas=canvas;cutoutSource=photoSource;cutoutMethod='local';cutoutCache.set(key,canvas);while(cutoutCache.size>8)cutoutCache.delete(cutoutCache.keys().next().value);
    setBgStatus('Free Local AI complete — unlimited, processed in your browser, no PhotoRoom credit used.','good');paintPhotoPreview();renderPoster();return canvas;
  }
  function refreshLocalCleanup(){
    clearTimeout(cleanupTimer);cleanupTimer=setTimeout(()=>{if(cutoutMethod!=='local'||!photoImage||!photoSource)return;removeBackgroundLocal(true).catch(e=>setBgStatus(e.message,'error'))},90);
  }
  function syncCleanupControls(){
    const pairs=[['#jd-clean-contract',localCleanup.contract,'#jd-clean-contract-value'],['#jd-clean-feather',localCleanup.feather,'#jd-clean-feather-value'],['#jd-clean-spill',localCleanup.spill,'#jd-clean-spill-value'],['#jd-clean-bias',localCleanup.bias,'#jd-clean-bias-value']];
    for(const [sel,val,out] of pairs){const el=$(sel);if(el)el.value=String(val);const o=$(out);if(o)o.textContent=sel.includes('spill')?`${val}%`:String(val)}
  }
  function resetLocalCleanup(){localCleanup={contract:1,feather:1,spill:35,bias:0};syncCleanupControls();refreshLocalCleanup()}

  function trimTransparent(canvas,method='PhotoRoom'){
    const ctx=canvas.getContext('2d'),im=ctx.getImageData(0,0,canvas.width,canvas.height),d=im.data;let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for(let y=0;y<canvas.height;y+=2)for(let x=0;x<canvas.width;x+=2)if(d[(y*canvas.width+x)*4+3]>16){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
    if(maxX<0)throw Error(`${method} returned a transparent image with no visible player. Try another photo.`);const pad=14;minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(canvas.width-1,maxX+pad);maxY=Math.min(canvas.height-1,maxY+pad);
    const out=document.createElement('canvas');out.width=maxX-minX+1;out.height=maxY-minY+1;out.getContext('2d').drawImage(canvas,minX,minY,out.width,out.height,0,0,out.width,out.height);return out;
  }

  function roundedRect(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath()}
  function fitText(ctx,text,maxWidth,startSize,minSize=16,font=TITLE_FONT,weight=900){let size=startSize;while(size>minSize){ctx.font=`${weight} ${size}px ${font}`;if(ctx.measureText(text).width<=maxWidth)break;size-=2}return size}
  function drawImageContain(ctx,img,x,y,w,h,alpha=1){if(!img)return;const iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight,r=Math.min(w/iw,h/ih),dw=iw*r,dh=ih*r;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);ctx.restore()}
  function posterStats(){return statRows.slice(0,5).map(s=>({value:String(s.value||'—'),label:String(s.label||'STAT').toUpperCase()}))}
  function drawNoise(ctx,amount=1150,alpha=.022){let seed=10801350;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};ctx.save();for(let i=0;i<amount;i++){ctx.fillStyle=`rgba(255,255,255,${.006+rand()*alpha})`;const s=rand()<.96?1:2;ctx.fillRect(rand()*CANVAS_W,rand()*CANVAS_H,s,s)}ctx.restore()}
  function drawSkyline(ctx,base=1195,alpha=.48){ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#050b12';let x=540,seed=29;const rand=()=>{seed=(seed*9301+49297)%233280;return seed/233280};while(x<CANVAS_W){const w=18+rand()*34,h=35+rand()*115;ctx.fillRect(x,base-h,w,h);if(rand()>.72)ctx.fillRect(x+w*.42,base-h-22,w*.16,22);x+=w+4+rand()*8}ctx.strokeStyle='rgba(55,143,230,.32)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(560,base-18);ctx.quadraticCurveTo(790,base-145,1060,base-14);ctx.stroke();ctx.restore()}
  function drawEditorialField(ctx){
    ctx.save();
    // Smoky gray ballpark plane, kept subtle so stats remain readable.
    const haze=ctx.createLinearGradient(0,790,0,1190);haze.addColorStop(0,'rgba(110,124,140,0)');haze.addColorStop(.58,'rgba(86,98,112,.08)');haze.addColorStop(1,'rgba(155,163,171,.12)');ctx.fillStyle=haze;ctx.fillRect(0,760,CANVAS_W,430);
    ctx.translate(820,1135);ctx.strokeStyle='rgba(171,184,197,.17)';ctx.lineWidth=3;
    // Foul lines / outfield perspective.
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-510,-350);ctx.moveTo(0,0);ctx.lineTo(300,-330);ctx.stroke();
    ctx.strokeStyle='rgba(124,151,181,.14)';ctx.lineWidth=2;
    for(const r of [90,170,255,340]){ctx.beginPath();ctx.ellipse(0,0,r*1.35,r*.56,0,Math.PI,Math.PI*2);ctx.stroke()}
    // Infield diamond.
    ctx.strokeStyle='rgba(195,203,211,.16)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(-78,-92);ctx.lineTo(0,-166);ctx.lineTo(78,-92);ctx.closePath();ctx.stroke();
    ctx.fillStyle='rgba(180,188,196,.09)';ctx.beginPath();ctx.moveTo(0,-2);ctx.lineTo(-12,-16);ctx.lineTo(0,-27);ctx.lineTo(12,-16);ctx.closePath();ctx.fill();
    ctx.restore();
  }
  function drawEditorialCity(ctx){
    ctx.save();
    // Gray NJ/NY-style skyline and bridge silhouette like the approved sample direction.
    const base=1184;ctx.fillStyle='rgba(112,122,132,.19)';
    const buildings=[
      [520,1090,30,94],[556,1054,39,130],[603,1114,30,70],[640,1076,45,108],[693,1016,33,168],[733,1086,28,98],[768,1038,44,146],[820,1098,31,86],[858,1047,42,137],[906,1087,27,97],[942,1024,48,160],[1000,1070,33,114],[1040,1102,40,82]
    ];
    buildings.forEach(([x,y,w,h],i)=>{ctx.fillRect(x,y,w,h);if([1,4,8].includes(i))ctx.fillRect(x+w*.43,y-18,w*.14,18)});
    // Empire/WTC-inspired spires without copying an exact building.
    ctx.fillRect(711,988,5,29);ctx.fillRect(960,987,6,37);
    // Bridge deck + towers/cables.
    ctx.strokeStyle='rgba(163,173,184,.24)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(555,1150);ctx.lineTo(1078,1142);ctx.stroke();
    ctx.fillStyle='rgba(111,122,134,.22)';ctx.fillRect(690,1045,16,103);ctx.fillRect(942,1035,17,110);
    ctx.strokeStyle='rgba(155,169,184,.22)';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(698,1050);ctx.quadraticCurveTo(822,1110,950,1040);ctx.stroke();
    ctx.beginPath();ctx.moveTo(698,1050);ctx.quadraticCurveTo(626,1084,555,1150);ctx.stroke();
    ctx.beginPath();ctx.moveTo(950,1040);ctx.quadraticCurveTo(1018,1075,1078,1142);ctx.stroke();
    for(let x=715;x<940;x+=30){ctx.beginPath();ctx.moveTo(x,1080);ctx.lineTo(x,1146);ctx.stroke()}
    // Mist gradient ties city into the poster instead of a hard overlay box.
    const mist=ctx.createLinearGradient(0,980,0,1195);mist.addColorStop(0,'rgba(190,198,205,0)');mist.addColorStop(1,'rgba(128,138,148,.11)');ctx.fillStyle=mist;ctx.fillRect(470,930,610,265);
    ctx.restore();
  }
  function drawVignette(ctx,strength=.7){const g=ctx.createRadialGradient(CANVAS_W*.52,CANVAS_H*.45,220,CANVAS_W*.52,CANVAS_H*.45,900);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${strength})`);ctx.fillStyle=g;ctx.fillRect(0,0,CANVAS_W,CANVAS_H)}

  function tintedSilhouette(img,color){
    if(!img)return null;let map=tintCache.get(img);if(!map){map=new Map();tintCache.set(img,map)}if(map.has(color))return map.get(color);
    const iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight,c=document.createElement('canvas');c.width=iw;c.height=ih;const x=c.getContext('2d');x.drawImage(img,0,0,iw,ih);x.globalCompositeOperation='source-in';x.fillStyle=color;x.fillRect(0,0,iw,ih);x.globalCompositeOperation='source-over';map.set(color,c);return c;
  }
  function playerAnchor(){return graphicStyle==='classic'?{cx:792,base:1210,h:1010}:graphicStyle==='electric'?{cx:370,base:1215,h:1040}:{cx:332,base:1200,h:1005}}
  function playerRect(img){
    const iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight,a=playerAnchor(),targetH=a.h*clamp(playerScale,.6,1.75),targetW=targetH*(iw/ih),cx=a.cx+clamp(playerX,-280,280),base=a.base+clamp(playerY,-220,180);
    return {x:cx-targetW/2,y:base-targetH,w:targetW,h:targetH};
  }
  function drawElectricArcs(ctx,r,t){
    let seed=77341;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=`rgba(77,188,255,${.45+t*.5})`;ctx.lineWidth=1.5+t*2.8;ctx.shadowColor='#1d9fff';ctx.shadowBlur=8+t*22;
    const sides=[{x:r.x-10,y:r.y+r.h*.15,dir:-1},{x:r.x+r.w+8,y:r.y+r.h*.20,dir:1},{x:r.x-4,y:r.y+r.h*.55,dir:-1},{x:r.x+r.w+6,y:r.y+r.h*.58,dir:1}];
    sides.forEach((p,idx)=>{ctx.beginPath();ctx.moveTo(p.x,p.y);let x=p.x,y=p.y;for(let i=0;i<5;i++){x+=p.dir*(16+rand()*28);y+=36+rand()*48;ctx.lineTo(x+(rand()-.5)*22,y)}ctx.stroke();if(idx<2){ctx.beginPath();ctx.moveTo(p.x,p.y+80);ctx.lineTo(p.x+p.dir*30,p.y+112);ctx.lineTo(p.x+p.dir*12,p.y+145);ctx.stroke()}});
    ctx.fillStyle=`rgba(111,205,255,${.35+t*.55})`;for(let i=0;i<24;i++){const side=rand()>.5?1:-1,x=side>0?r.x+r.w+rand()*45:r.x-rand()*45,y=r.y+r.h*(.12+rand()*.72),rad=1+rand()*2.4;ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);ctx.fill()}
    ctx.restore();
  }
  function drawFlameWisps(ctx,r,t){
    let seed=419;const rand=()=>{seed=(seed*1103515245+12345)>>>0;return seed/4294967296};
    ctx.save();ctx.globalCompositeOperation='screen';ctx.lineCap='round';
    for(let i=0;i<18;i++){
      const side=rand()>.45?1:-1,baseX=side>0?r.x+r.w-r.w*(.02+rand()*.14):r.x+r.w*(.02+rand()*.14),baseY=r.y+r.h*(.50+rand()*.45),height=55+rand()*155*t,width=(22+rand()*50)*side;
      const g=ctx.createLinearGradient(baseX,baseY,baseX,baseY-height);g.addColorStop(0,`rgba(0,87,255,${.18+t*.28})`);g.addColorStop(.45,`rgba(24,164,255,${.30+t*.42})`);g.addColorStop(1,'rgba(155,230,255,0)');ctx.strokeStyle=g;ctx.lineWidth=6+rand()*8*t;ctx.shadowColor='#0b8cff';ctx.shadowBlur=12+24*t;ctx.beginPath();ctx.moveTo(baseX,baseY);ctx.bezierCurveTo(baseX+width*.25,baseY-height*.25,baseX-width*.55,baseY-height*.58,baseX+width,baseY-height);ctx.stroke();
    }
    ctx.fillStyle=`rgba(58,180,255,${.25+t*.35})`;for(let i=0;i<20;i++){const x=r.x+r.w*(.06+rand()*.88),y=r.y+r.h*(.45+rand()*.5),rr=1+rand()*3;ctx.beginPath();ctx.arc(x,y,rr,0,Math.PI*2);ctx.fill()}
    ctx.restore();
  }
  function drawEdge(ctx,img,r){
    if(!img)return;let mode=edgeTreatment;if(mode==='none')mode='clean';if(mode==='stroke')mode='neon';if(mode==='energy')mode='electric';if(mode==='clean')return;
    const t=clamp(edgeIntensity,0,100)/100;
    if(mode==='shadow'){
      const dark=tintedSilhouette(img,'#000814');if(!dark)return;ctx.save();ctx.globalAlpha=.28+t*.42;ctx.filter=`blur(${10+18*t}px)`;ctx.drawImage(dark,r.x+10+t*12,r.y+14+t*18,r.w,r.h);ctx.restore();return;
    }
    const tint=tintedSilhouette(img,mode==='flame'?'#087cff':'#27a9ff');if(!tint)return;
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.12+t*.30;ctx.filter=`blur(${9+16*t}px)`;ctx.drawImage(tint,r.x-6-t*5,r.y-4,r.w,r.h);ctx.drawImage(tint,r.x+8+t*7,r.y+3,r.w,r.h);ctx.restore();
    if(mode==='neon'){
      ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.28+t*.5;ctx.filter=`blur(${1.5+t*3}px)`;ctx.drawImage(tint,r.x-3-t*3,r.y-2,r.w,r.h);ctx.drawImage(tint,r.x+4+t*4,r.y+1,r.w,r.h);ctx.restore();
    }else if(mode==='electric')drawElectricArcs(ctx,r,t);else if(mode==='flame')drawFlameWisps(ctx,r,t);
  }
  function drawGhostPlayer(ctx,img,mode='left'){
    if(!img)return;const iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight,targetH=mode==='left'?720:760,targetW=targetH*(iw/ih),x=mode==='left'?-65:435,y=210;
    ctx.save();ctx.globalAlpha=mode==='left'?.30:.11;ctx.filter='grayscale(1) brightness(.62) contrast(1.3)';ctx.drawImage(img,x,y,targetW,targetH);ctx.restore();
  }
  function drawMainPlayer(ctx,img){
    if(!img)return;const r=playerRect(img);drawEdge(ctx,img,r);
    ctx.save();ctx.shadowColor='rgba(0,0,0,.82)';ctx.shadowBlur=playerGrade==='clean'?16:30;ctx.shadowOffsetX=8;ctx.shadowOffsetY=18;
    if(playerGrade==='clean')ctx.filter='contrast(1.04) saturate(1.04) brightness(.99)';else if(playerGrade==='high')ctx.filter='contrast(1.24) saturate(1.16) brightness(.94)';else ctx.filter='contrast(1.15) saturate(1.12) brightness(.96)';
    ctx.drawImage(img,r.x,r.y,r.w,r.h);ctx.restore();
    if(graphicStyle==='editorial'){
      const fade=ctx.createLinearGradient(0,1020,0,CANVAS_H);fade.addColorStop(0,'rgba(0,0,0,0)');fade.addColorStop(1,'rgba(0,0,0,.66)');ctx.fillStyle=fade;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    }else{
      const fade=ctx.createLinearGradient(0,930,0,1210);fade.addColorStop(0,'rgba(3,8,14,0)');fade.addColorStop(1,graphicStyle==='classic'?'rgba(7,16,28,.48)':'rgba(3,8,14,.66)');ctx.fillStyle=fade;ctx.fillRect(Math.max(0,r.x-30),900,Math.min(CANVAS_W,r.w+60),325);
    }
  }
  function drawSignature(ctx){
    if(signatureMode==='off')return;
    const jersey=String(textState.jerseyNumber||'').replace(/^#/,'');
    let x=graphicStyle==='classic'?575:42,y=graphicStyle==='electric'?1008:1018,w=graphicStyle==='classic'?335:330,h=190;
    if(graphicStyle==='editorial'){x=42;y=970;w=330;h=205}
    if(signatureMode==='upload'&&signatureImage){drawImageContain(ctx,signatureImage,x,y,w,h-35,.95);ctx.fillStyle=graphicStyle==='classic'?'#f0e6cf':'#b9d8ff';ctx.font=`700 24px ${CONDENSED_FONT}`;ctx.fillText(jersey?`#${jersey}`:'',x+signatureNumberX,y+signatureNumberY);return}
    const first=String(textState.signatureFirst||'').trim(),last=String(textState.signatureLast||'').trim();
    ctx.save();ctx.translate(x,y);ctx.rotate(signatureRotation*Math.PI/180);ctx.fillStyle=graphicStyle==='electric'?'#bce9ff':graphicStyle==='classic'?'#f2e7cf':'#dce9f7';
    const base=(graphicStyle==='editorial'?78:graphicStyle==='electric'?76:72)*signatureScale;
    ctx.font=`400 ${base}px ${SIGNATURE_FONT}`;ctx.shadowColor='rgba(0,0,0,.50)';ctx.shadowBlur=5;ctx.shadowOffsetY=2;
    if(first)ctx.fillText(first,0,base*.70);if(last)ctx.fillText(last,signatureLastX,base*.70+base*.54+signatureGap);
    ctx.shadowBlur=0;ctx.font=`700 ${Math.max(18,23*signatureScale)}px ${CONDENSED_FONT}`;ctx.fillStyle=graphicStyle==='classic'?'#e83b44':'#9dc8ff';ctx.fillText(jersey?`#${jersey}`:'',signatureNumberX,signatureNumberY);ctx.restore();
  }

  function drawEditorialBackground(ctx,playerArt){
    ctx.fillStyle='#090a0c';ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    if(editorialBackground){
      ctx.drawImage(editorialBackground,0,0,CANVAS_W,CANVAS_H);const shade=ctx.createLinearGradient(0,0,CANVAS_W,0);shade.addColorStop(0,'rgba(0,0,0,.28)');shade.addColorStop(.48,'rgba(0,0,0,.12)');shade.addColorStop(1,'rgba(0,0,0,.04)');ctx.fillStyle=shade;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    }else{
      const smoke=ctx.createRadialGradient(790,1040,15,790,1040,550);smoke.addColorStop(0,'rgba(169,173,180,.24)');smoke.addColorStop(.6,'rgba(80,83,88,.09)');smoke.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=smoke;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);drawEditorialCity(ctx);drawEditorialField(ctx);drawNoise(ctx,9000,.07);
    }
    if(playerArt)drawGhostPlayer(ctx,playerArt,'left');const jersey=String(textState.jerseyNumber||'10').replace(/^#/,'');ctx.save();ctx.globalAlpha=.32;ctx.strokeStyle='#35659a';ctx.lineWidth=2;ctx.font=`900 360px ${TITLE_FONT}`;ctx.strokeText(jersey||'10',4,920);ctx.restore();drawVignette(ctx,.32);
  }
  function drawElectricBackground(ctx){
    const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);bg.addColorStop(0,'#020914');bg.addColorStop(.52,'#04111f');bg.addColorStop(1,'#010306');ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    // Stadium bowl and field glow.
    const field=ctx.createRadialGradient(470,1110,30,470,1110,650);field.addColorStop(0,'rgba(14,111,182,.28)');field.addColorStop(.43,'rgba(4,45,82,.12)');field.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=field;ctx.fillRect(0,500,CANVAS_W,700);
    ctx.save();ctx.strokeStyle='rgba(105,185,244,.11)';ctx.lineWidth=3;for(const r of [330,430,530]){ctx.beginPath();ctx.ellipse(500,1120,r,150,0,Math.PI,Math.PI*2);ctx.stroke()}ctx.restore();
    // Scoreboard pixel grid on the right.
    ctx.save();ctx.globalAlpha=.18;for(let y=150;y<650;y+=26)for(let x=600;x<1040;x+=26){ctx.fillStyle=((x+y)/26)%3===0?'#2c9cff':'#0e426f';ctx.fillRect(x,y,5,5)}ctx.restore();
    // Stadium light towers / bokeh.
    ctx.save();ctx.globalCompositeOperation='screen';for(const [x,y,flip] of [[80,115,0],[1000,105,1]]){ctx.strokeStyle='rgba(123,180,222,.18)';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(x,y+230);ctx.lineTo(x+(flip?-42:42),y);ctx.stroke();for(let row=0;row<3;row++)for(let col=0;col<5;col++){const lx=x+(flip?-75:10)+col*18,ly=y+row*20;ctx.shadowColor='#cfeeff';ctx.shadowBlur=18;ctx.fillStyle='rgba(210,242,255,.72)';ctx.beginPath();ctx.arc(lx,ly,4,0,Math.PI*2);ctx.fill()}}ctx.restore();
    if(logoMark)drawImageContain(ctx,logoMark,120,175,700,700,.055);
    // Energy ribbon lives in the background, not as a sticker outline.
    ctx.save();ctx.globalCompositeOperation='screen';ctx.strokeStyle='rgba(24,145,255,.32)';ctx.lineWidth=8;ctx.shadowColor='#0d7cff';ctx.shadowBlur=30;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-50,360+i*145);ctx.bezierCurveTo(250,180+i*120,470,610-i*20,780,530+i*150);ctx.stroke()}ctx.restore();
    ctx.fillStyle='#e83b44';for(const [x,y,r] of [[102,410,4],[149,475,2],[90,555,3],[890,660,2],[965,725,3]]){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
    drawNoise(ctx,2600,.034);drawVignette(ctx,.68);
  }
  function drawClassicBackground(ctx){
    // Heritage print: deep Dodger blue with warm paper, scorecard and diamond geometry.
    ctx.fillStyle='#07182b';ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    const paper=ctx.createLinearGradient(0,0,540,0);paper.addColorStop(0,'#f4ecda');paper.addColorStop(.78,'#e8dcc3');paper.addColorStop(1,'rgba(225,211,184,.15)');ctx.fillStyle=paper;ctx.fillRect(0,0,525,CANVAS_H);
    ctx.save();ctx.globalAlpha=.13;ctx.strokeStyle='#153c68';ctx.lineWidth=1;for(let x=42;x<510;x+=42){ctx.beginPath();ctx.moveTo(x,530);ctx.lineTo(x,1010);ctx.stroke()}for(let y=530;y<1010;y+=42){ctx.beginPath();ctx.moveTo(35,y);ctx.lineTo(505,y);ctx.stroke()}ctx.restore();
    // Baseball diamond / baseline print.
    ctx.save();ctx.translate(250,930);ctx.rotate(Math.PI/4);ctx.strokeStyle='rgba(18,63,105,.22)';ctx.lineWidth=5;ctx.strokeRect(-150,-150,300,300);ctx.strokeStyle='rgba(229,55,67,.35)';ctx.lineWidth=2;ctx.strokeRect(-118,-118,236,236);ctx.restore();
    // Oversized baseball seams entering from right edge.
    ctx.save();ctx.strokeStyle='rgba(244,236,218,.22)';ctx.lineWidth=5;ctx.beginPath();ctx.arc(1110,455,310,1.72,4.52);ctx.stroke();ctx.strokeStyle='rgba(232,59,68,.38)';ctx.lineWidth=3;for(let i=0;i<13;i++){const a=1.88+i*.19,x=1110+310*Math.cos(a),y=455+310*Math.sin(a);ctx.beginPath();ctx.moveTo(x-11*Math.sin(a),y+11*Math.cos(a));ctx.lineTo(x+11*Math.sin(a),y-11*Math.cos(a));ctx.stroke()}ctx.restore();
    // Ticket stripe and print marks.
    ctx.fillStyle='#e83b44';ctx.fillRect(0,0,16,CANVAS_H);ctx.fillStyle='#0b4f91';ctx.fillRect(16,0,9,CANVAS_H);ctx.fillStyle='rgba(7,24,43,.84)';ctx.fillRect(42,86,445,2);ctx.fillRect(42,1120,445,2);
    if(logoMark)drawImageContain(ctx,logoMark,560,150,520,520,.055);drawNoise(ctx,4200,.045);drawVignette(ctx,.30);
  }

  function statRectsEditorial(count){const x=682,y=585,W=365,g=12;if(count===3){const w=(W-g)/2;return[{x,y,w,h:142},{x:x+w+g,y,w,h:142},{x,y:y+154,w:W,h:142}]}if(count===5){const w3=(W-g*2)/3,w2=(W-g)/2;return[{x,y,w:w3,h:137},{x:x+w3+g,y,w:w3,h:137},{x:x+(w3+g)*2,y,w:w3,h:137},{x,y:y+149,w:w2,h:137},{x:x+w2+g,y:y+149,w:w2,h:137}]}const w=(W-g)/2;return[{x,y,w,h:142},{x:x+w+g,y,w,h:142},{x,y:y+154,w,h:142},{x:x+w+g,y:y+154,w,h:142}]}
  function statRectsElectric(count){const x=520,y=690,W=525,g=13;if(count===3){const w=(W-g*2)/3;return[0,1,2].map(i=>({x:x+i*(w+g),y,w,h:150}))}if(count===5){const w3=(W-g*2)/3,w2=(W-g)/2;return[{x,y,w:w3,h:142},{x:x+w3+g,y,w:w3,h:142},{x:x+(w3+g)*2,y,w:w3,h:142},{x:x+42,y:y+154,w:w2-21,h:142},{x:x+42+(w2-21)+g,y:y+154,w:w2-21,h:142}]}const w=(W-g)/2;return[{x,y,w,h:150},{x:x+w+g,y,w,h:150},{x,y:y+163,w,h:150},{x:x+w+g,y:y+163,w,h:150}]}
  function statRectsClassic(count){const x=52,y=645,W=438,g=12;if(count===3){const w=(W-g)/2;return[{x,y,w,h:142},{x:x+w+g,y,w,h:142},{x,y:y+154,w:W,h:142}]}if(count===5){const w3=(W-g*2)/3,w2=(W-g)/2;return[{x,y,w:w3,h:134},{x:x+w3+g,y,w:w3,h:134},{x:x+(w3+g)*2,y,w:w3,h:134},{x,y:y+146,w:w2,h:134},{x:x+w2+g,y:y+146,w:w2,h:134}]}const w=(W-g)/2;return[{x,y,w,h:142},{x:x+w+g,y,w,h:142},{x,y:y+154,w,h:142},{x:x+w+g,y:y+154,w,h:142}]}
  function drawStatsAt(ctx,rects,mode){
    const stats=posterStats();stats.forEach((s,i)=>{const r=rects[i];if(!r)return;ctx.save();roundedRect(ctx,r.x,r.y,r.w,r.h,mode==='classic'?3:mode==='electric'?10:4);
      if(mode==='classic'){ctx.fillStyle='rgba(247,239,222,.94)';ctx.strokeStyle=i===0?'rgba(219,48,62,.80)':'rgba(20,67,112,.46)';ctx.lineWidth=i===0?4:2}
      else if(mode==='electric'){const g=ctx.createLinearGradient(r.x,r.y,r.x,r.y+r.h);g.addColorStop(0,'rgba(10,35,59,.90)');g.addColorStop(1,'rgba(1,9,18,.94)');ctx.fillStyle=g;ctx.strokeStyle='rgba(43,169,255,.88)';ctx.lineWidth=2.5;ctx.shadowColor='rgba(22,139,255,.48)';ctx.shadowBlur=16}
      else{ctx.fillStyle='rgba(1,6,12,.90)';ctx.strokeStyle='rgba(27,125,225,.82)';ctx.lineWidth=2}
      ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.textAlign='center';const valueFont=mode==='electric'?ELECTRIC_FONT:mode==='classic'?CLASSIC_FONT:TITLE_FONT;const valueWeight=mode==='classic'?700:900;ctx.fillStyle=mode==='classic'?'#0c3155':'#fff';const start=mode==='electric'?67:mode==='classic'?52:54;const min=mode==='electric'?34:mode==='classic'?26:29;const vs=fitText(ctx,s.value,r.w-18,start,min,valueFont,valueWeight);ctx.font=`${valueWeight} ${vs}px ${valueFont}`;ctx.fillText(s.value,r.x+r.w/2,r.y+(mode==='electric'?70:66));ctx.fillStyle=mode==='classic'?'#40566c':'#d9e6f3';const ls=fitText(ctx,s.label,r.w-16,mode==='electric'?19:18,11,CONDENSED_FONT,700);ctx.font=`700 ${ls}px ${CONDENSED_FONT}`;const parts=s.label.split(' '),ly=r.y+(mode==='electric'?116:111);if(parts.length>1&&ctx.measureText(s.label).width>r.w-16){const mid=Math.ceil(parts.length/2);ctx.fillText(parts.slice(0,mid).join(' '),r.x+r.w/2,ly-10);ctx.fillText(parts.slice(mid).join(' '),r.x+r.w/2,ly+13)}else ctx.fillText(s.label,r.x+r.w/2,ly);ctx.restore()})
  }
  function drawFooter(ctx,mode){
    const grad=ctx.createLinearGradient(0,1188,0,1350);if(mode==='classic'){grad.addColorStop(0,'rgba(6,28,52,.94)');grad.addColorStop(1,'rgba(3,14,27,1)')}else{grad.addColorStop(0,'rgba(2,6,10,.90)');grad.addColorStop(1,'rgba(1,3,6,.99)')}ctx.fillStyle=grad;ctx.fillRect(0,1188,CANVAS_W,162);
    ctx.fillStyle=mode==='classic'?'#efe5cf':'#168bff';ctx.fillRect(0,1188,CANVAS_W,7);if(mode==='classic'){ctx.fillStyle='#e83b44';ctx.fillRect(0,1195,220,4)}else{ctx.strokeStyle='rgba(239,62,69,.85)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(650,1186);ctx.lineTo(1080,1152);ctx.stroke()}
    if(logoMark)drawImageContain(ctx,logoMark,48,1224,78,78,1);ctx.fillStyle=mode==='classic'?'#b9c8d7':'#97abc0';ctx.font=`700 12px ${CONDENSED_FONT}`;ctx.fillText('VISIT OUR WEBSITE',154,1249);ctx.fillStyle='#fff';const website=String(textState.website||'JERSEYDODGERS.COM').toUpperCase();ctx.font=`700 ${fitText(ctx,website,500,29,18,CONDENSED_FONT,700)}px ${CONDENSED_FONT}`;ctx.fillText(website,154,1291);ctx.textAlign='right';ctx.fillStyle='#d4dfeb';const small=String(textState.smallText||'').toUpperCase();ctx.font=`600 ${fitText(ctx,small,320,12,9,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(small,1030,1250);ctx.fillStyle='#93a9c0';const social=String(textState.social||'@JERSEYDODGERS').toUpperCase();ctx.font=`600 ${fitText(ctx,social,320,14,10,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(social,1030,1292);ctx.textAlign='left';
  }
  function drawEditorialInfo(ctx){
    ctx.fillStyle='#d7e2ed';ctx.font=`600 21px ${CONDENSED_FONT}`;ctx.fillText(String(textState.eyebrow||'JERSEY DODGERS').toUpperCase(),676,118);ctx.fillStyle='#ef3e45';ctx.fillRect(604,151,62,7);ctx.fillRect(1000,151,40,7);
    const title=String(textState.mainTitle||'PLAYER').toUpperCase();ctx.fillStyle='#fff';const ts=fitText(ctx,title,440,158,88,TITLE_FONT);ctx.font=`900 ${ts}px ${TITLE_FONT}`;ctx.fillText(title,604,320);const second=String(textState.secondTitle||'OF THE WEEK').toUpperCase();ctx.fillStyle='#127fff';const ss=fitText(ctx,second,440,78,40,TITLE_FONT);ctx.font=`900 ${ss}px ${TITLE_FONT}`;ctx.fillText(second,606,398);
    const jersey=String(textState.jerseyNumber||'').replace(/^#/,'');ctx.fillStyle='#ef3e45';ctx.font=`900 52px ${TITLE_FONT}`;ctx.fillText(jersey?`#${jersey}`:'#—',682,486);ctx.fillStyle='#fff';const name=String(textState.playerName||'PLAYER NAME').toUpperCase();const ns=fitText(ctx,name,292,42,24,CONDENSED_FONT,700);ctx.font=`700 ${ns}px ${CONDENSED_FONT}`;ctx.fillText(name,786,482);
    drawStatsAt(ctx,statRectsEditorial(posterStats().length),'editorial');ctx.fillStyle='#b8c8d9';const week=String(textState.weekLabel||'').toUpperCase();ctx.font=`600 ${fitText(ctx,week,365,15,10,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(week,682,904);ctx.fillStyle='#168bff';ctx.fillRect(682,922,68,5);ctx.fillStyle='#d5e0eb';const tag=String(textState.tagline||'').toUpperCase();ctx.font=`600 ${fitText(ctx,tag,365,14,9,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(tag,682,960);
  }
  function drawElectricInfo(ctx){
    ctx.textAlign='left';ctx.fillStyle='#a8d8fb';ctx.font=`600 26px ${ELECTRIC_FONT}`;ctx.fillText(String(textState.eyebrow||'JERSEY DODGERS').toUpperCase(),580,105);
    ctx.fillStyle='#fff';const title=String(textState.mainTitle||'PLAYER').toUpperCase();const ts=fitText(ctx,title,475,178,105,ELECTRIC_FONT,700);ctx.font=`700 ${ts}px ${ELECTRIC_FONT}`;ctx.shadowColor='rgba(32,154,255,.24)';ctx.shadowBlur=18;ctx.fillText(title,560,267);ctx.shadowBlur=0;
    ctx.fillStyle='#36a9ff';const second=String(textState.secondTitle||'OF THE WEEK').toUpperCase();const ss=fitText(ctx,second,475,92,48,ELECTRIC_FONT,600);ctx.font=`600 ${ss}px ${ELECTRIC_FONT}`;ctx.fillText(second,563,344);
    const jersey=String(textState.jerseyNumber||'').replace(/^#/,'');ctx.fillStyle='#e83b44';roundedRect(ctx,563,374,92,58,8);ctx.fill();ctx.fillStyle='#fff';ctx.font=`700 37px ${ELECTRIC_FONT}`;ctx.textAlign='center';ctx.fillText(jersey?`#${jersey}`:'#—',609,417);ctx.textAlign='left';ctx.fillStyle='#fff';const name=String(textState.playerName||'PLAYER NAME').toUpperCase();const ns=fitText(ctx,name,365,58,31,ELECTRIC_FONT,600);ctx.font=`600 ${ns}px ${ELECTRIC_FONT}`;ctx.fillText(name,676,421);
    ctx.fillStyle='#86cfff';ctx.font=`600 18px ${ELECTRIC_FONT}`;ctx.fillText(String(textState.weekLabel||'').toUpperCase(),565,470);ctx.fillStyle='#bed8eb';ctx.font=`600 ${fitText(ctx,String(textState.tagline||'').toUpperCase(),475,15,10,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(String(textState.tagline||'').toUpperCase(),565,500);drawStatsAt(ctx,statRectsElectric(posterStats().length),'electric');
  }
  function drawClassicInfo(ctx){
    const navy='#0d355d',red='#d93745',muted='#526578';ctx.fillStyle=navy;ctx.font=`700 18px ${CONDENSED_FONT}`;ctx.fillText(String(textState.eyebrow||'JERSEY DODGERS').toUpperCase(),54,170);ctx.fillStyle=red;ctx.fillRect(54,193,118,7);
    const title=String(textState.mainTitle||'PLAYER').toUpperCase();ctx.fillStyle=navy;const ts=fitText(ctx,title,435,82,48,CLASSIC_FONT,700);ctx.font=`700 ${ts}px ${CLASSIC_FONT}`;ctx.fillText(title,54,314);const second=String(textState.secondTitle||'OF THE WEEK').toUpperCase();ctx.fillStyle=red;const ss=fitText(ctx,second,435,45,27,CLASSIC_FONT,700);ctx.font=`700 ${ss}px ${CLASSIC_FONT}`;ctx.fillText(second,54,374);
    const jersey=String(textState.jerseyNumber||'').replace(/^#/,'');ctx.fillStyle=navy;ctx.font=`700 38px ${CLASSIC_FONT}`;ctx.fillText(jersey?`#${jersey}`:'#—',54,454);ctx.fillStyle=navy;const name=String(textState.playerName||'PLAYER NAME').toUpperCase();const ns=fitText(ctx,name,320,31,18,CLASSIC_FONT,700);ctx.font=`700 ${ns}px ${CLASSIC_FONT}`;ctx.fillText(name,160,451);ctx.fillStyle=muted;ctx.font=`700 ${fitText(ctx,String(textState.weekLabel||'').toUpperCase(),430,14,10,CONDENSED_FONT,700)}px ${CONDENSED_FONT}`;ctx.fillText(String(textState.weekLabel||'').toUpperCase(),54,505);ctx.fillStyle=navy;ctx.font=`600 ${fitText(ctx,String(textState.tagline||'').toUpperCase(),430,13,9,CONDENSED_FONT,600)}px ${CONDENSED_FONT}`;ctx.fillText(String(textState.tagline||'').toUpperCase(),54,535);drawStatsAt(ctx,statRectsClassic(posterStats().length),'classic');
  }

  function renderPoster(){
    const canvas=$('#jd-potw-canvas');if(!canvas)return;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,CANVAS_W,CANVAS_H);const playerArt=cutoutCanvas||photoImage;
    if(graphicStyle==='electric')drawElectricBackground(ctx);else if(graphicStyle==='classic')drawClassicBackground(ctx);else drawEditorialBackground(ctx,playerArt);
    // Customizable top-left branding is intentionally below the player layer.
    drawTopLogo(ctx);
    if(playerArt)drawMainPlayer(ctx,playerArt);else{ctx.save();ctx.fillStyle='rgba(22,139,255,.09)';roundedRect(ctx,65,260,480,900,8);ctx.fill();ctx.fillStyle='#8aa0b5';ctx.font=`700 24px ${CONDENSED_FONT}`;ctx.fillText('SELECT A PLAYER PHOTO',115,760);ctx.restore()}
    drawSignature(ctx);if(graphicStyle==='electric')drawElectricInfo(ctx);else if(graphicStyle==='classic')drawClassicInfo(ctx);else drawEditorialInfo(ctx);drawFooter(ctx,graphicStyle);generated=true;const dl=$('#jd-download-graphic');if(dl)dl.disabled=false;
  }

  function renderStatRows(){
    const wrap=$('#jd-graphic-stats');if(!wrap)return;if(statRows.length<3)resetStats();
    wrap.innerHTML=statRows.map((s,i)=>`<div class="jd-stat-row" data-stat-row="${i}"><select class="jd-stat-key">${metricOptions(s.key)}</select><input class="jd-stat-value" value="${esc(s.value)}" placeholder="Value"><input class="jd-stat-label" value="${esc(s.label)}" placeholder="Label"><div class="jd-stat-actions"><button type="button" data-stat-move="up" aria-label="Move stat up" ${i===0?'disabled':''}>↑</button><button type="button" data-stat-move="down" aria-label="Move stat down" ${i===statRows.length-1?'disabled':''}>↓</button><button type="button" class="danger" data-stat-delete aria-label="Delete stat" ${statRows.length<=3?'disabled':''}>×</button></div></div>`).join('')+`<button type="button" id="jd-add-stat" class="jd-add-stat" ${statRows.length>=5?'disabled':''}>+ Add stat ${statRows.length>=5?'(max 5)':''}</button>`;
    $$('.jd-stat-row',wrap).forEach((row,i)=>{const sel=$('.jd-stat-key',row),val=$('.jd-stat-value',row),label=$('.jd-stat-label',row);sel.addEventListener('change',()=>{const m=metricEntries().find(x=>x.id===sel.value);statRows[i].key=sel.value;if(m){statRows[i].value=m.value;statRows[i].label=m.label;val.value=m.value;label.value=m.label}else{statRows[i].value=val.value;statRows[i].label=label.value}renderPoster()});val.addEventListener('input',()=>{statRows[i].value=val.value;renderPoster()});label.addEventListener('input',()=>{statRows[i].label=label.value;renderPoster()});row.querySelector('[data-stat-delete]')?.addEventListener('click',()=>{if(statRows.length<=3)return;statRows.splice(i,1);renderStatRows();renderPoster()});row.querySelector('[data-stat-move="up"]')?.addEventListener('click',()=>{if(i<1)return;[statRows[i-1],statRows[i]]=[statRows[i],statRows[i-1]];renderStatRows();renderPoster()});row.querySelector('[data-stat-move="down"]')?.addEventListener('click',()=>{if(i>=statRows.length-1)return;[statRows[i+1],statRows[i]]=[statRows[i],statRows[i+1]];renderStatRows();renderPoster()})});
    $('#jd-add-stat')?.addEventListener('click',()=>{if(statRows.length>=5)return;statRows.push({key:'custom',value:'',label:'STAT'});renderStatRows();renderPoster()});
  }
  function playerOptions(){return rosterPlayers().map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(selectedPlayerId)?'selected':''}>#${esc(p.number||'—')} · ${esc(p.name)}</option>`).join('')}
  async function onPlayerChanged(){selectedPlayerId=$('#jd-graphic-player')?.value||'';cutoutCanvas=null;cutoutSource='';cutoutMethod='';resetStyleStates();resetStats();resetText();signatureScale=1;signatureGap=2;signatureLastX=38;signatureRotation=-4;signatureNumberX=18;signatureNumberY=126;syncPlacement();renderStatRows();syncTextInputs();syncSignatureControls();await useProfilePhoto()}
  function syncPlacement(){const pairs=[['#jd-player-scale',playerScale,'#jd-player-scale-value',v=>`${Math.round(v*100)}%`],['#jd-player-x',playerX,'#jd-player-x-value',v=>`${Math.round(v)}`],['#jd-player-y',playerY,'#jd-player-y-value',v=>`${Math.round(v)}`],['#jd-edge-intensity',edgeIntensity,'#jd-edge-intensity-value',v=>`${Math.round(v)}%`]];pairs.forEach(([input,value,out,fmt])=>{const n=$(input);if(n)n.value=String(value);const o=$(out);if(o)o.textContent=fmt(value)});const e=$('#jd-edge-treatment');if(e)e.value=edgeTreatment==='none'?'clean':edgeTreatment==='stroke'?'neon':edgeTreatment==='energy'?'electric':edgeTreatment;const g=$('#jd-player-grade');if(g)g.value=playerGrade}
  function syncBrandingControls(){
    const mode=$('#jd-top-logo-mode');if(mode)mode.value=topLogoMode;
    const pairs=[['#jd-top-logo-scale',topLogoScale,'#jd-top-logo-scale-value',v=>`${Math.round(v*100)}%`],['#jd-top-logo-x',topLogoX,'#jd-top-logo-x-value',v=>`${Math.round(v)}`],['#jd-top-logo-y',topLogoY,'#jd-top-logo-y-value',v=>`${Math.round(v)}`],['#jd-top-logo-opacity',topLogoOpacity,'#jd-top-logo-opacity-value',v=>`${Math.round(v*100)}%`]];
    pairs.forEach(([input,value,out,fmt])=>{const n=$(input);if(n)n.value=String(value);const o=$(out);if(o)o.textContent=fmt(value)});
    const status=$('#jd-logo-status');if(status)status.textContent=topLogoMode==='custom'?(topLogoSource||'Custom logo loaded'):topLogoMode==='mark'?'Using D / baseball mark':topLogoMode==='none'?'Top-left logo hidden':'Using Jersey Dodgers script';
  }
  function syncTextInputs(){Object.entries(textState).forEach(([k,v])=>{const el=$(`[data-text-field="${k}"]`);if(el)el.value=v})}
  function resetSignatureLayout(){signatureScale=1;signatureGap=2;signatureLastX=38;signatureRotation=-4;signatureNumberX=18;signatureNumberY=126;syncSignatureControls();renderPoster()}
  function syncSignatureControls(){
    const pairs=[['#jd-signature-scale',signatureScale,'#jd-signature-scale-value',v=>`${Math.round(v*100)}%`],['#jd-signature-gap',signatureGap,'#jd-signature-gap-value',v=>`${Math.round(v)}`],['#jd-signature-last-x',signatureLastX,'#jd-signature-last-x-value',v=>`${Math.round(v)}`],['#jd-signature-rotation',signatureRotation,'#jd-signature-rotation-value',v=>`${Math.round(v)}°`],['#jd-signature-number-x',signatureNumberX,'#jd-signature-number-x-value',v=>`${Math.round(v)}`],['#jd-signature-number-y',signatureNumberY,'#jd-signature-number-y-value',v=>`${Math.round(v)}`]];
    pairs.forEach(([input,value,out,fmt])=>{const n=$(input);if(n)n.value=String(value);const o=$(out);if(o)o.textContent=fmt(value)});
  }

  function textEditor(){return `<details class="jd-graphic-details"><summary>Poster text & signature</summary><div class="jd-details-body"><div class="jd-section-title"><div><h3>Poster text</h3><p>Edit any wording while the layout stays locked.</p></div><button type="button" id="jd-reset-text">Reset text</button></div><div class="jd-text-grid"><label class="wide">Top team line<input data-text-field="eyebrow" value="${esc(textState.eyebrow)}"></label><label>Main title<input data-text-field="mainTitle" value="${esc(textState.mainTitle)}"></label><label>Second line<input data-text-field="secondTitle" value="${esc(textState.secondTitle)}"></label><label>Player name<input data-text-field="playerName" value="${esc(textState.playerName)}"></label><label>Jersey #<input data-text-field="jerseyNumber" value="${esc(textState.jerseyNumber)}"></label><label class="wide">Week / season line<input data-text-field="weekLabel" value="${esc(textState.weekLabel)}"></label><label class="wide">Tagline<input data-text-field="tagline" value="${esc(textState.tagline)}"></label><label>Website<input data-text-field="website" value="${esc(textState.website)}"></label><label>Social<input data-text-field="social" value="${esc(textState.social)}"></label><label class="wide">Small footer text<input data-text-field="smallText" value="${esc(textState.smallText)}"></label><label>Signature<select id="jd-signature-mode"><option value="off" ${signatureMode==='off'?'selected':''}>Off</option><option value="stylized" ${signatureMode==='stylized'?'selected':''}>Stylized player signature</option><option value="upload" ${signatureMode==='upload'?'selected':''}>Uploaded real signature</option></select></label><span></span><label>Signature first name<input data-text-field="signatureFirst" value="${esc(textState.signatureFirst||'')}"></label><label>Signature last name<input data-text-field="signatureLast" value="${esc(textState.signatureLast||'')}"></label><label class="wide jd-signature-upload">Upload real signature PNG<input id="jd-signature-upload" type="file" accept="image/png,image/webp"></label></div><div class="jd-signature-adjust"><div class="jd-section-title"><div><h3>Signature placement</h3><p>Stack the first name above the last name and adjust how tightly they connect.</p></div><button type="button" id="jd-reset-signature">Reset signature</button></div><div class="jd-signature-slider-grid"><div class="jd-placement-row"><label>Size</label><input id="jd-signature-scale" type="range" min="0.65" max="1.55" step="0.01" value="${signatureScale}"><output id="jd-signature-scale-value">${Math.round(signatureScale*100)}%</output></div><div class="jd-placement-row"><label>Name gap</label><input id="jd-signature-gap" type="range" min="-45" max="70" step="1" value="${signatureGap}"><output id="jd-signature-gap-value">${signatureGap}</output></div><div class="jd-placement-row"><label>Last X</label><input id="jd-signature-last-x" type="range" min="-90" max="150" step="1" value="${signatureLastX}"><output id="jd-signature-last-x-value">${signatureLastX}</output></div><div class="jd-placement-row"><label>Rotate</label><input id="jd-signature-rotation" type="range" min="-16" max="16" step="1" value="${signatureRotation}"><output id="jd-signature-rotation-value">${signatureRotation}°</output></div><div class="jd-placement-row"><label># left/right</label><input id="jd-signature-number-x" type="range" min="-60" max="180" step="1" value="${signatureNumberX}"><output id="jd-signature-number-x-value">${signatureNumberX}</output></div><div class="jd-placement-row"><label># up/down</label><input id="jd-signature-number-y" type="range" min="70" max="200" step="1" value="${signatureNumberY}"><output id="jd-signature-number-y-value">${signatureNumberY}</output></div></div></div></div></details>`}


  function fitDesktopPreview(){
    const stage=$('.jd-graphic-stage-wrap'),shell=$('.jd-graphic-canvas-shell');
    if(!stage||!shell||window.innerWidth<=900)return;
    const overhead=stage.getBoundingClientRect().height-shell.getBoundingClientRect().height;
    const top=parseFloat(getComputedStyle(stage).top)||78;
    stage.style.setProperty('--jd-preview-canvas-height',`${Math.max(80,Math.floor(window.innerHeight-top-overhead-16))}px`);
  }
  window.addEventListener('resize',fitDesktopPreview);
  function watchPreviewSize(){
    previewResizeObserver?.disconnect();fitDesktopPreview();
    if('ResizeObserver' in window){
      previewResizeObserver=new ResizeObserver(fitDesktopPreview);
      for(const el of $$('.jd-preview-placement,.jd-graphic-stage-head'))previewResizeObserver.observe(el);
    }
  }

  function renderControls(){
    const content=$('#section-content');if(!content)return;const seasonOpts=seasons().map(s=>`<option value="${esc(s.id)}" ${s.id===selectedSeasonId?'selected':''}>${esc(s.name)}</option>`).join('');
    const styleCaption=graphicStyle==='editorial'?'Dark editorial poster with gray skyline, bridge, baseball-field geometry, ghost portrait, signature and giant jersey number.':graphicStyle==='electric'?'Night-game stadium atmosphere with scoreboard pixels, light towers, energy ribbons and electric effects behind the player.':'Baseball heritage print with warm scorecard paper, diamond geometry, seams, ticket details and vintage athletic typography.';
    const styleName=graphicStyle==='editorial'?'EDITORIAL / CITY':graphicStyle==='electric'?'ELECTRIC / NIGHT GAME':'CLASSIC / BASEBALL HERITAGE';
    content.innerHTML=`<div class="jd-graphic-shell"><div class="jd-graphic-intro"><div><span class="eyebrow">SOCIAL GRAPHICS</span><h2>Player of the Week Generator</h2><p>Three fully different Jersey Dodgers poster systems with bigger type, custom branding, unlimited local cutouts and live effects.</p></div><span class="jd-graphic-size">1080 × 1350 · 4:5 · PHASE 4</span></div><div class="jd-graphic-layout">
      <div class="jd-graphic-controls">
        <section><h3>1. Style, player & season</h3><label>Graphic style<select id="jd-graphic-style"><option value="editorial" ${graphicStyle==='editorial'?'selected':''}>Editorial / City</option><option value="electric" ${graphicStyle==='electric'?'selected':''}>Electric / Night Game</option><option value="classic" ${graphicStyle==='classic'?'selected':''}>Classic / Baseball Heritage</option></select></label><div class="jd-style-caption" id="jd-style-caption">${styleCaption}</div><div class="jd-graphic-field-grid"><label>Season<select id="jd-graphic-season">${seasonOpts}</select></label><label>Stat set<select id="jd-graphic-phase"><option value="regular" ${phase==='regular'?'selected':''}>Regular season</option><option value="playoffs" ${phase==='playoffs'?'selected':''}>Playoffs</option></select></label></div><label>Player<select id="jd-graphic-player">${playerOptions()}</select></label></section>
        <section><div class="jd-section-title"><div><h3>2. Player photo & treatment</h3><p>Free Local AI stays unlimited. Effects now render behind the cutout instead of looking like a sticker outline.</p></div><span class="jd-free-badge">UNLIMITED</span></div><div class="jd-graphic-photo-row"><button class="button" id="jd-use-profile-photo" type="button">Use profile photo</button><label class="button" for="jd-graphic-upload-photo">Upload different photo</label><input id="jd-graphic-upload-photo" type="file" accept="image/*"></div><div class="jd-graphic-photo-preview" id="jd-graphic-photo-preview"></div><div class="jd-remover-grid"><button class="jd-remover-card free" type="button" id="jd-remove-bg-free"><strong>Free Local AI</strong><small>Unlimited · stays in browser</small></button><button class="jd-remover-card hq" type="button" id="jd-remove-bg"><strong>PhotoRoom HQ</strong><small>Best fallback · uses credits</small></button></div><div class="jd-auto-remover"><label class="jd-bg-toggle"><input id="jd-auto-remove-bg" type="checkbox" checked>Remove background when generating</label><label>Auto remover<select id="jd-auto-bg-method"><option value="local" ${autoRemovalMethod==='local'?'selected':''}>Free Local AI</option><option value="photoroom" ${autoRemovalMethod==='photoroom'?'selected':''}>PhotoRoom HQ</option></select></label></div><details class="jd-local-cleanup" open><summary>Free Local edge cleanup</summary><div class="jd-cleanup-body"><p>Fine-tune hair, uniform edges and blue/green backdrop spill without rerunning the AI model.</p><div class="jd-placement-row"><label>Contract</label><input id="jd-clean-contract" type="range" min="0" max="4" step="1" value="${localCleanup.contract}"><output id="jd-clean-contract-value">${localCleanup.contract}</output></div><div class="jd-placement-row"><label>Feather</label><input id="jd-clean-feather" type="range" min="0" max="4" step="1" value="${localCleanup.feather}"><output id="jd-clean-feather-value">${localCleanup.feather}</output></div><div class="jd-placement-row"><label>Color spill</label><input id="jd-clean-spill" type="range" min="0" max="100" step="5" value="${localCleanup.spill}"><output id="jd-clean-spill-value">${localCleanup.spill}%</output></div><div class="jd-placement-row"><label>Mask tune</label><input id="jd-clean-bias" type="range" min="-20" max="20" step="1" value="${localCleanup.bias}"><output id="jd-clean-bias-value">${localCleanup.bias}</output></div><button type="button" id="jd-clean-reset">Reset edge cleanup</button></div></details><div class="jd-graphic-field-grid"><label>Edge treatment<select id="jd-edge-treatment"><option value="clean" ${['clean','none'].includes(edgeTreatment)?'selected':''}>Clean</option><option value="electric" ${['electric','energy'].includes(edgeTreatment)?'selected':''}>Electric arcs</option><option value="flame" ${edgeTreatment==='flame'?'selected':''}>Blue flame</option><option value="neon" ${['neon','stroke'].includes(edgeTreatment)?'selected':''}>Neon rim</option><option value="shadow" ${edgeTreatment==='shadow'?'selected':''}>Sports shadow</option></select></label><label>Photo grade<select id="jd-player-grade"><option value="dramatic" ${playerGrade==='dramatic'?'selected':''}>Dramatic</option><option value="high" ${playerGrade==='high'?'selected':''}>High contrast</option><option value="clean" ${playerGrade==='clean'?'selected':''}>Clean / natural</option></select></label></div><div class="jd-edge-intensity"><div class="jd-placement-row"><label>Effect intensity</label><input id="jd-edge-intensity" type="range" min="0" max="100" step="1" value="${edgeIntensity}"><output id="jd-edge-intensity-value">${Math.round(edgeIntensity)}%</output></div></div><div id="jd-bg-status" class="jd-bg-status">Free Local AI runs on your device and uses no PhotoRoom credits. PhotoRoom HQ remains available for difficult photos.</div></section>
        <section><div class="jd-section-title"><div><h3>3. Poster branding</h3><p>Choose the top-left mark or upload your own. Branding stays below the player so the cutout can overlap it naturally.</p></div><button type="button" id="jd-reset-top-logo">Reset logo</button></div><div class="jd-branding-grid"><label>Top-left logo<select id="jd-top-logo-mode"><option value="script" ${topLogoMode==='script'?'selected':''}>Jersey Dodgers script</option><option value="mark" ${topLogoMode==='mark'?'selected':''}>D / baseball mark</option><option value="custom" ${topLogoMode==='custom'?'selected':''}>Uploaded custom logo</option><option value="none" ${topLogoMode==='none'?'selected':''}>None</option></select></label><label class="jd-logo-upload">Upload custom logo<input id="jd-top-logo-upload" type="file" accept="image/png,image/webp,image/jpeg"></label></div><div class="jd-logo-status" id="jd-logo-status">${topLogoSource?esc(topLogoSource):'Using official Jersey Dodgers branding'}</div><div class="jd-logo-adjust"><div class="jd-placement-row"><label>Logo size</label><input id="jd-top-logo-scale" type="range" min="0.45" max="2" step="0.01" value="${topLogoScale}"><output id="jd-top-logo-scale-value">${Math.round(topLogoScale*100)}%</output></div><div class="jd-placement-row"><label>Left / right</label><input id="jd-top-logo-x" type="range" min="-150" max="520" step="1" value="${topLogoX}"><output id="jd-top-logo-x-value">${Math.round(topLogoX)}</output></div><div class="jd-placement-row"><label>Up / down</label><input id="jd-top-logo-y" type="range" min="-120" max="340" step="1" value="${topLogoY}"><output id="jd-top-logo-y-value">${Math.round(topLogoY)}</output></div><div class="jd-placement-row"><label>Opacity</label><input id="jd-top-logo-opacity" type="range" min="0.15" max="1" step="0.01" value="${topLogoOpacity}"><output id="jd-top-logo-opacity-value">${Math.round(topLogoOpacity*100)}%</output></div></div></section>
        <section><div class="jd-section-title"><div><h3>4. Featured stats</h3><p>Use 3–5 stats. Pick a saved stat, edit its value/label, add or delete rows, and reorder them.</p></div></div><div id="jd-graphic-stats"></div></section>
        ${textEditor()}
        <section class="jd-graphic-actions"><button class="button primary" id="jd-generate-graphic" type="button">Generate & Download PNG</button><button type="button" id="jd-download-graphic" disabled>Download Again</button><button type="button" id="jd-reset-graphic">Reset graphic</button></section>
      </div>
      <div class="jd-graphic-stage-wrap"><div class="jd-graphic-stage-head"><strong>LIVE POST PREVIEW</strong><span id="jd-preview-style-name">${styleName} · 1080 × 1350</span></div><div class="jd-graphic-canvas-shell"><canvas id="jd-potw-canvas" width="1080" height="1350" aria-label="Player of the Week graphic preview"></canvas></div><div class="jd-preview-placement"><strong>Player placement</strong><div class="jd-placement-row"><label>Size</label><input id="jd-player-scale" type="range" min="0.60" max="1.75" step="0.01" value="${playerScale}"><output id="jd-player-scale-value">${Math.round(playerScale*100)}%</output></div><div class="jd-placement-row"><label>Left / right</label><input id="jd-player-x" type="range" min="-280" max="280" step="1" value="${playerX}"><output id="jd-player-x-value">${playerX}</output></div><div class="jd-placement-row"><label>Up / down</label><input id="jd-player-y" type="range" min="-220" max="180" step="1" value="${playerY}"><output id="jd-player-y-value">${playerY}</output></div><button type="button" id="jd-reset-placement">Reset this style placement</button><small>You can also drag the player directly on the preview. Branding and visual effects stay behind the player; stats, title and footer stay above him.</small></div></div>
    </div></div>`;
    bindControls();renderStatRows();paintPhotoPreview();syncBrandingControls();renderPoster();watchPreviewSize();
  }

  function bindControls(){
    $('#jd-graphic-style')?.addEventListener('change',e=>{saveStyleState();graphicStyle=['editorial','electric','classic'].includes(e.target.value)?e.target.value:'editorial';restoreStyleState(graphicStyle);syncPlacement();const name=$('#jd-preview-style-name');if(name)name.textContent=`${graphicStyle==='editorial'?'EDITORIAL / CITY':graphicStyle==='electric'?'ELECTRIC / NIGHT GAME':'CLASSIC / BASEBALL HERITAGE'} · 1080 × 1350`;const cap=$('#jd-style-caption');if(cap)cap.textContent=graphicStyle==='editorial'?'Dark editorial poster with gray skyline, bridge, baseball-field geometry, ghost portrait, signature and giant jersey number.':graphicStyle==='electric'?'Night-game stadium atmosphere with scoreboard pixels, light towers, energy ribbons and electric effects behind the player.':'Baseball heritage print with warm scorecard paper, diamond geometry, seams, ticket details and vintage athletic typography.';renderPoster()});
    $('#jd-graphic-season')?.addEventListener('change',async e=>{selectedSeasonId=e.target.value;selectedPlayerId=rosterPlayers()[0]?.id||'';cutoutCanvas=null;cutoutSource='';cutoutMethod='';resetStyleStates();resetStats();resetText();renderControls();await useProfilePhoto()});
    $('#jd-graphic-phase')?.addEventListener('change',async e=>{phase=e.target.value==='playoffs'?'playoffs':'regular';selectedPlayerId=rosterPlayers()[0]?.id||'';cutoutCanvas=null;cutoutSource='';cutoutMethod='';resetStyleStates();resetStats();resetText();renderControls();await useProfilePhoto()});
    $('#jd-graphic-player')?.addEventListener('change',onPlayerChanged);$('#jd-use-profile-photo')?.addEventListener('click',useProfilePhoto);$('#jd-graphic-upload-photo')?.addEventListener('change',e=>useUploadedPhoto(e.target.files?.[0]));
    $('#jd-remove-bg-free')?.addEventListener('click',async()=>{const b=$('#jd-remove-bg-free');try{b.disabled=true;await removeBackgroundLocal()}catch(e){setBgStatus(e.message,'error')}finally{b.disabled=false}});
    $('#jd-remove-bg')?.addEventListener('click',async()=>{const b=$('#jd-remove-bg');try{b.disabled=true;await removeBackground()}catch(e){setBgStatus(e.message,'error')}finally{b.disabled=false}});
    $('#jd-auto-bg-method')?.addEventListener('change',e=>{autoRemovalMethod=e.target.value==='photoroom'?'photoroom':'local'});
    $('#jd-clean-contract')?.addEventListener('input',e=>{localCleanup.contract=Number(e.target.value);syncCleanupControls();refreshLocalCleanup()});
    $('#jd-clean-feather')?.addEventListener('input',e=>{localCleanup.feather=Number(e.target.value);syncCleanupControls();refreshLocalCleanup()});
    $('#jd-clean-spill')?.addEventListener('input',e=>{localCleanup.spill=Number(e.target.value);syncCleanupControls();refreshLocalCleanup()});
    $('#jd-clean-bias')?.addEventListener('input',e=>{localCleanup.bias=Number(e.target.value);syncCleanupControls();refreshLocalCleanup()});
    $('#jd-clean-reset')?.addEventListener('click',resetLocalCleanup);
    $('#jd-edge-treatment')?.addEventListener('change',e=>{edgeTreatment=e.target.value;saveStyleState();renderPoster()});$('#jd-edge-intensity')?.addEventListener('input',e=>{edgeIntensity=Number(e.target.value);saveStyleState();syncPlacement();renderPoster()});$('#jd-player-grade')?.addEventListener('change',e=>{playerGrade=e.target.value;saveStyleState();renderPoster()});
    $('#jd-top-logo-mode')?.addEventListener('change',e=>{topLogoMode=e.target.value;syncBrandingControls();renderPoster()});$('#jd-top-logo-upload')?.addEventListener('change',async e=>{try{await useTopLogoUpload(e.target.files?.[0])}catch(err){setStatus(err.message,true)}});$('#jd-reset-top-logo')?.addEventListener('click',resetTopLogo);
    $('#jd-top-logo-scale')?.addEventListener('input',e=>{topLogoScale=Number(e.target.value);syncBrandingControls();renderPoster()});$('#jd-top-logo-x')?.addEventListener('input',e=>{topLogoX=Number(e.target.value);syncBrandingControls();renderPoster()});$('#jd-top-logo-y')?.addEventListener('input',e=>{topLogoY=Number(e.target.value);syncBrandingControls();renderPoster()});$('#jd-top-logo-opacity')?.addEventListener('input',e=>{topLogoOpacity=Number(e.target.value);syncBrandingControls();renderPoster()});
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
    $('#jd-generate-graphic')?.addEventListener('click',async()=>{const b=$('#jd-generate-graphic'),safari=/^((?!chrome|android).)*safari/i.test(navigator.userAgent),downloadWindow=safari?window.open('about:blank','jdGraphicDownload'):null;try{b.disabled=true;b.textContent='Generating…';if($('#jd-auto-remove-bg')?.checked&&photoImage&&cutoutSource!==photoSource){if(autoRemovalMethod==='photoroom')await removeBackground();else await removeBackgroundLocal();}renderPoster();downloadPoster(downloadWindow);setStatus('Player of the Week graphic generated and downloaded.')}catch(e){try{downloadWindow?.close()}catch{}setBgStatus(e.message,'error');setStatus(e.message,true)}finally{b.disabled=false;b.textContent='Generate & Download PNG'}});
    $('#jd-download-graphic')?.addEventListener('click',()=>{try{downloadPoster()}catch(e){setStatus(e.message,true)}});$('#jd-reset-graphic')?.addEventListener('click',async()=>{cutoutCanvas=null;cutoutSource='';graphicStyle='editorial';signatureMode='stylized';signatureImage=null;signatureSource='';signatureScale=1;signatureGap=2;signatureLastX=38;signatureRotation=-4;signatureNumberX=18;signatureNumberY=126;topLogoMode='script';topLogoCustom=null;topLogoSource='';topLogoScale=1;topLogoX=0;topLogoY=0;topLogoOpacity=.96;resetStyleStates();resetStats();resetText();renderControls();await useProfilePhoto();setBgStatus('Graphic reset. Free Local AI is the default; PhotoRoom HQ only runs when you choose it.','')});
    const canvas=$('#jd-potw-canvas');if(canvas){const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*CANVAS_W/r.width,y:(e.clientY-r.top)*CANVAS_H/r.height}};canvas.addEventListener('pointerdown',e=>{drag=point(e);canvas.setPointerCapture?.(e.pointerId);canvas.classList.add('dragging')});canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=point(e);playerX=clamp(playerX+p.x-drag.x,-280,280);playerY=clamp(playerY+p.y-drag.y,-220,180);drag=p;saveStyleState();syncPlacement();renderPoster()});const end=()=>{drag=null;canvas.classList.remove('dragging')};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end)}
  }

  function posterFilename(){const p=selectedPlayer(),safe=String(p?.name||'player').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');return `jersey-dodgers-player-of-the-week-${safe||'player'}-${graphicStyle}.png`}
  function downloadPoster(downloadWindow=null){
    const canvas=$('#jd-potw-canvas');if(!canvas)throw Error('Preview is not ready.');let url='';try{url=canvas.toDataURL('image/png')}catch{throw Error('Could not create the PNG. Try using an uploaded player photo from this site.')}
    const name=posterFilename(),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();if(downloadWindow&&!downloadWindow.closed){try{downloadWindow.document.title=name;downloadWindow.document.body.style.cssText='margin:0;background:#07101a;color:white;font-family:system-ui;text-align:center;padding:24px';downloadWindow.document.body.innerHTML='<p>If the download did not start automatically, use the button below.</p><a id="jd-final-download" style="display:inline-block;padding:12px 18px;background:#168bff;color:white;text-decoration:none;border-radius:7px">Download PNG</a>';const link=downloadWindow.document.getElementById('jd-final-download');link.href=url;link.download=name;link.click()}catch{}}return true;
  }

  async function openGenerator(){
    if(openPromise)return openPromise;
    openPromise=(async()=>{
    active=true;
    document.body.classList.add('jd-graphic-active');
    document.body.classList.remove('admin-menu-open');
    $('#admin-nav')?.classList.remove('open');
    $('#admin-menu-toggle')?.setAttribute('aria-expanded','false');
    document.body.dataset.adminGroup='graphic';
    document.body.dataset.adminSection='graphic-generator';
    $$('[data-admin-group]').forEach(b=>b.classList.toggle('active',b.dataset.adminGroup==='graphic'));
    const saveState=$('#save-state'),saveButton=$('#save-all');if(saveState)saveState.hidden=true;if(saveButton)saveButton.hidden=true;
    const heading=$('.admin-heading h1');if(heading)heading.textContent='Graphic Generator';
    const eyebrow=$('.admin-heading .eyebrow');if(eyebrow)eyebrow.textContent='SOCIAL GRAPHICS';
    const help=$('.admin-help');if(help)help.textContent='Build a 1080×1350 Player of the Week graphic. Generator controls stay isolated from Admin navigation.';
    try{
      const payload=await api('/api/admin/content');data=payload.data||payload;
      selectedSeasonId=selectedSeasonId&&data.seasons.some(s=>s.id===selectedSeasonId)?selectedSeasonId:currentSeason();
      const ps=rosterPlayers();selectedPlayerId=ps.some(p=>String(p.id)===String(selectedPlayerId))?selectedPlayerId:(ps[0]?.id||'');
      resetStyleStates();resetStats();resetText();await loadLogos();
      try{await document.fonts?.load?.(`72px ${SIGNATURE_FONT}`);await document.fonts?.ready}catch{}
      renderControls();await useProfilePhoto();
    }catch(e){setStatus(e.message,true);throw e}
    })();
    try{return await openPromise}finally{openPromise=null}
  }

  window.JDGraphicGenerator={open:openGenerator};

})();
