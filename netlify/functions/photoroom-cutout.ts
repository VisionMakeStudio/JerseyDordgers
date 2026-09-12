import {getUser, admin, verifyRequestOrigin} from '@netlify/identity';

const VERSION = '12.11';
const ENDPOINT = 'https://image-api.photoroom.com/v2/edit';
// Leave room for Netlify's 6 MB payload envelope and base64 expansion.
const MAX_INPUT = 4_000_000;
const MAX_OUTPUT = 4_000_000;
const PNG_SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);
const rolesFor = (user:any) => [
  ...(Array.isArray(user?.roles) ? user.roles : []),
  ...(Array.isArray(user?.appMetadata?.roles) ? user.appMetadata.roles : []),
  ...(user?.role ? [user.role] : []),
];
const hasAccess = (user:any) => {
  if (!user?.id) return false;
  const roles = rolesFor(user);
  const ownerEmail = String(Netlify.env.get('DODGERS_ADMIN_EMAIL') || '').trim().toLowerCase();
  return Boolean(ownerEmail && String(user.email || '').toLowerCase() === ownerEmail)
    || roles.some(role => ['dodgers-owner','dodgers-coach','dodgers-media'].includes(role));
};

class PayloadLimitError extends Error {}
async function readLimited(stream:ReadableStream<Uint8Array> | null, limit:number):Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  const reader = stream.getReader();
  const chunks:Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new PayloadLimitError();
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

function validPng(bytes:Buffer):boolean {
  if (bytes.length < 45 || !bytes.subarray(0,8).equals(PNG_SIGNATURE)) return false;
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii',12,16) !== 'IHDR') return false;
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 6000 || height > 6000 || width * height > 16_000_000) return false;
  let offset = 8, hasData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const end = offset + length + 12;
    if (end > bytes.length) return false;
    if (type === 'IDAT' && length) hasData = true;
    if (type === 'IEND') return hasData && length === 0 && end === bytes.length;
    offset = end;
  }
  return false;
}

export default async (req:Request) => {
  const headers = {
    'Cache-Control':'no-store, private',
    'Content-Type':'application/json; charset=utf-8',
    'X-Content-Type-Options':'nosniff',
    'X-JD-Background-Removal':'photoroom-image-editing-v2',
    'X-JD-Generator-Version':VERSION,
  };
  const error = (message:string,status=400,extra:Record<string,string>={}) =>
    new Response(JSON.stringify({error:message,version:VERSION}),{status,headers:{...headers,...extra}});
  try {
    if (req.method !== 'POST') return error('Method not allowed.',405,{'Allow':'POST'});
    try { await verifyRequestOrigin(req); }
    catch { return error('Request origin not allowed.',403); }

    let user = await getUser();
    if (!user?.id) return error('Administrator sign-in required.',401);
    // Refresh server-controlled roles. Fail closed if access cannot be verified.
    try { user = await admin.getUser(user.id); }
    catch { return error('Could not verify your access. Sign in again and retry.',503); }
    if (!hasAccess(user)) return error('This account does not have Jersey Dodgers access.',403);
    if (req.headers.get('X-JD-Generator-Version') !== VERSION) {
      return error('The generator was updated. Reload the Admin page before removing a background.',409);
    }

    const apiKey = String(Netlify.env.get('PHOTOROOM_API_KEY') || '').trim();
    if (!apiKey) return error('PhotoRoom is not configured. Add PHOTOROOM_API_KEY to Netlify Functions environment variables and redeploy.',503);
    if (apiKey.toLowerCase().startsWith('sandbox_')) {
      return error('PhotoRoom sandbox mode always adds a watermark. Replace PHOTOROOM_API_KEY in Netlify with the Live API key from PhotoRoom, then redeploy.',503);
    }
    const contentType = String(req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg','image/png','image/webp'].includes(contentType)) {
      return error('Use a JPEG, PNG or WebP player photo.',415);
    }
    if (Number(req.headers.get('content-length')) > MAX_INPUT) return error('Player photo is too large. Use a photo under 4 MB.',413);
    let bytes:Buffer;
    try { bytes = await readLimited(req.body, MAX_INPUT); }
    catch (e) { if (e instanceof PayloadLimitError) return error('Player photo is too large. Use a photo under 4 MB.',413); throw e; }
    if (!bytes.length) return error('No player photo was received.',400);

    const form = new FormData();
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    form.append('imageFile',new Blob([new Uint8Array(bytes)],{type:contentType}),`player.${ext}`);
    form.append('removeBackground','true');
    form.append('export.format','png');
    // No background.* field: v2's default background is transparent.
    // Native FormData supplies the multipart boundary; never set Content-Type manually.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),45_000);
    try {
      const upstream = await fetch(ENDPOINT,{
        method:'POST',
        headers:{'x-api-key':apiKey,'Accept':'image/png, application/json'},
        body:form,
        signal:controller.signal,
        redirect:'error',
      });
      // Do not expose raw provider bodies, which may contain request data or credentials.
      const rawId = upstream.headers.get('x-request-id') || upstream.headers.get('request-id') || '';
      const requestId = /^[a-zA-Z0-9._:-]{1,120}$/.test(rawId) && !rawId.includes(apiKey) ? rawId : '';
      const reference = requestId ? ` Reference: ${requestId}.` : '';
      if (!upstream.ok) {
        await upstream.body?.cancel();
        if ([401,403].includes(upstream.status)) return error(`PhotoRoom rejected the configured key or Image Editing API access. Check PHOTOROOM_API_KEY and v2 access in the PhotoRoom API dashboard.${reference}`,502);
        if (upstream.status === 402) return error(`PhotoRoom reports insufficient API credits. Check the Image Editing API dashboard.${reference}`,502);
        if (upstream.status === 429) return error(`PhotoRoom is busy or rate-limiting requests. Wait a moment before retrying.${reference}`,429);
        return error(`PhotoRoom Image Editing API failed (HTTP ${upstream.status}).${reference}`,502);
      }
      let output:Buffer;
      try { output = await readLimited(upstream.body,MAX_OUTPUT); }
      catch (e) {
        if (e instanceof PayloadLimitError) return error(`The processed PNG exceeds the server's 4 MB transfer limit. Upload a smaller photo.${reference}`,502);
        throw e;
      }
      if (!output.length) return error(`PhotoRoom returned HTTP ${upstream.status} with zero image bytes.${reference}`,502);
      if (!validPng(output)) return error(`PhotoRoom returned an invalid or incomplete PNG.${reference}`,502);
      // Explicit text envelope avoids relying on binary response handling at the CDN boundary.
      // The browser verifies byte count and PNG signature before decoding the original RGBA bytes.
      return new Response(JSON.stringify({
        version:VERSION,mimeType:'image/png',byteLength:output.length,
        imageBase64:output.toString('base64'),requestId,
      }),{status:200,headers});
    } finally { clearTimeout(timer); }
  } catch (e:any) {
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return error('PhotoRoom took too long. Try again with a smaller photo.',504);
    return error('Background removal could not finish. Check the connection and try again.',502);
  }
};

// Do not rename this file to *-background.ts: Netlify discards those functions' responses.
export const config = {path:'/api/admin/photoroom-cutout'};
