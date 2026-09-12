import {getUser,admin,verifyRequestOrigin} from '@netlify/identity';
import {request as httpsRequest} from 'node:https';

const rolesFor=(user:any)=>[...(Array.isArray(user?.roles)?user.roles:[]),...(Array.isArray(user?.appMetadata?.roles)?user.appMetadata.roles:[]),...(user?.role?[user.role]:[])];
const hasAccess=(user:any)=>{
  const roles=rolesFor(user);
  const ownerEmail=String(Netlify.env.get('DODGERS_ADMIN_EMAIL')||'').toLowerCase();
  const owner=Boolean(user?.id&&((user.email||'').toLowerCase()===ownerEmail||roles.includes('dodgers-owner')));
  return owner||roles.includes('dodgers-coach')||roles.includes('dodgers-media');
};

type RawResponse={status:number;headers:Record<string,string|string[]|undefined>;body:Buffer};

function requestBinary(opts:{hostname:string;path:string;method:'GET'|'POST';headers:Record<string,string|number>;body?:Buffer;timeoutMs?:number}):Promise<RawResponse>{
  return new Promise((resolve,reject)=>{
    const req=httpsRequest({hostname:opts.hostname,path:opts.path,method:opts.method,headers:opts.headers},res=>{
      const chunks:Buffer[]=[];
      res.on('data',(chunk:Buffer|string)=>chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)));
      res.on('end',()=>resolve({status:res.statusCode||0,headers:res.headers as any,body:Buffer.concat(chunks)}));
    });
    req.setTimeout(opts.timeoutMs||60000,()=>req.destroy(Object.assign(new Error('PhotoRoom request timed out.'),{name:'AbortError'})));
    req.on('error',reject);
    if(opts.body?.length)req.write(opts.body);
    req.end();
  });
}

async function accountDiagnostic(apiKey:string){
  try{
    const r=await requestBinary({hostname:'image-api.photoroom.com',path:'/v2/account',method:'GET',headers:{'x-api-key':apiKey,'Accept':'application/json'},timeoutMs:12000});
    if(r.status<200||r.status>=300||!r.body.length)return '';
    const parsed=JSON.parse(r.body.toString('utf8'));
    const plan=parsed?.plan?String(parsed.plan):'';
    const available=parsed?.images?.available;
    const subscription=parsed?.images?.subscription;
    const bits=[];
    if(plan)bits.push(`plan ${plan}`);
    if(Number.isFinite(Number(available)))bits.push(`${available} images available`);
    if(Number.isFinite(Number(subscription)))bits.push(`${subscription} images in subscription`);
    return bits.length?` Account: ${bits.join(', ')}.`:'';
  }catch{return ''}
}

function part(boundary:string,name:string,value:string){
  return Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,'utf8');
}

export default async(req:Request)=>{
  const jsonHeaders={'Cache-Control':'no-store','Content-Type':'application/json'};
  const error=(message:string,status=400)=>new Response(JSON.stringify({error:message}),{status,headers:jsonHeaders});
  try{
    if(req.method!=='POST')return error('Method not allowed.',405);
    verifyRequestOrigin(req);

    let user=await getUser();
    try{if(user?.id)user=await admin.getUser(user.id)}catch{}
    if(!hasAccess(user))return error(user?.id?'This account does not have Jersey Dodgers access.':'Administrator sign-in required.',403);

    const apiKey=String(Netlify.env.get('PHOTOROOM_API_KEY')||'').trim();
    if(!apiKey)return error('PhotoRoom is not configured yet. Add PHOTOROOM_API_KEY in Netlify environment variables.',503);

    const contentType=String(req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    const allowed=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
    if(!allowed.has(contentType))return error('Use a JPEG, PNG, WebP or HEIC player photo.',415);

    const bytes=Buffer.from(await req.arrayBuffer());
    if(!bytes.length)return error('No player photo was received.',400);
    if(bytes.length>20_000_000)return error('Player photo is too large. Use an image under 20 MB.',413);

    const ext=contentType.includes('png')?'png':contentType.includes('webp')?'webp':contentType.includes('hei')?'heic':'jpg';
    const boundary=`----JerseyDodgersPhotoRoomV2${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const fileHead=Buffer.from(
      `--${boundary}\r\n`+
      `Content-Disposition: form-data; name="imageFile"; filename="jersey-dodgers-player.${ext}"\r\n`+
      `Content-Type: ${contentType}\r\n\r\n`,
      'utf8'
    );
    const fileTail=Buffer.from('\r\n','utf8');
    const end=Buffer.from(`--${boundary}--\r\n`,'utf8');
    // Image Editing API v2: transparent background is the default when no background is supplied.
    const multipart=Buffer.concat([
      fileHead,bytes,fileTail,
      part(boundary,'removeBackground','true'),
      part(boundary,'export.format','png'),
      end
    ]);

    const upstream=await requestBinary({
      hostname:'image-api.photoroom.com',
      path:'/v2/edit',
      method:'POST',
      headers:{
        'x-api-key':apiKey,
        'Content-Type':`multipart/form-data; boundary=${boundary}`,
        'Content-Length':multipart.length,
        'Accept':'image/png',
        'User-Agent':'JerseyDodgers-GraphicGenerator/1.0'
      },
      body:multipart,
      timeoutMs:60000
    });

    const requestId=String(upstream.headers['x-request-id']||upstream.headers['request-id']||'').trim();
    const upstreamType=String(upstream.headers['content-type']||'').toLowerCase();

    if(upstream.status<200||upstream.status>=300){
      let detail='';
      try{detail=upstream.body.length?upstream.body.toString('utf8').slice(0,500):''}catch{}
      const account=await accountDiagnostic(apiKey);
      if(upstream.status===401||upstream.status===403)return error(`PhotoRoom rejected this API key.${account} Check PHOTOROOM_API_KEY in Netlify.`,502);
      if(upstream.status===402)return error(`PhotoRoom says this account cannot process more images.${account}`,502);
      if(upstream.status===429)return error('PhotoRoom is temporarily rate-limiting requests. Try again in a moment.',429);
      return error(`PhotoRoom Image Editing API failed (HTTP ${upstream.status})${detail?`: ${detail}`:''}${account}${requestId?` · request ${requestId}`:''}`,502);
    }

    if(!upstream.body.length){
      const account=await accountDiagnostic(apiKey);
      return error(`PhotoRoom Image Editing API returned HTTP ${upstream.status} but zero image bytes.${account}${requestId?` Request ID: ${requestId}.`:''}`,502);
    }

    if(upstreamType&&!upstreamType.startsWith('image/')){
      const detail=upstream.body.toString('utf8').slice(0,400);
      return error(`PhotoRoom returned ${upstreamType||'an unexpected response'} instead of an image${detail?`: ${detail}`:''}${requestId?` · request ${requestId}`:''}`,502);
    }

    const output=new Uint8Array(upstream.body);
    return new Response(output,{status:200,headers:{
      'Content-Type':upstreamType.startsWith('image/')?upstreamType:'image/png',
      'Cache-Control':'no-store, private',
      'X-JD-Background-Removal':'photoroom-image-editing-v2',
      ...(requestId?{'X-PhotoRoom-Request-Id':requestId}:{})
    }});
  }catch(e:any){
    if(e?.name==='AbortError')return error('PhotoRoom took too long to process this photo. Try again with a smaller image.',504);
    if(Number(e?.status)===403)return error('Request origin not allowed.',403);
    return error(e?.message||'Unable to remove the background.',500);
  }
};

export const config={path:'/api/admin/remove-background'};
