// Subscriber update emails (shared by the subscribers and game-reminder functions)
export const SITE = 'https://jerseydodgers.com';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const abs = u => !u ? '' : /^https?:\/\//i.test(u) ? u : SITE + (u.startsWith('/') ? u : '/' + u);

export function normalizeEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/.test(e) && e.length <= 254 ? e : '';
}
export async function emailKey(email) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
export function token() {
  return [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const unsubscribeUrl = (key, tok) => `${SITE}/api/unsubscribe?k=${encodeURIComponent(key)}&t=${encodeURIComponent(tok)}`;

/* {kicker, title, text, url, cta, image, unsubscribe} */
export function updateHtml(m) {
  const img = abs(m.image), url = abs(m.url || '/');
  const paras = String(m.text || '').split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean);
  return `<!doctype html><html><body style="margin:0;background:#EEF2F7;font-family:Arial,Helvetica,sans-serif;color:#0A1A33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#06122A;padding:18px 24px"><table role="presentation" width="100%"><tr>
<td><img src="${SITE}/assets/d-mark.png" width="36" height="36" alt="" style="display:inline-block;vertical-align:middle"> <span style="display:inline-block;vertical-align:middle;color:#ffffff;font-weight:900;font-size:18px;letter-spacing:1px;text-transform:uppercase;margin-left:8px">Jersey Dodgers</span></td>
</tr></table></td></tr>
${img ? `<tr><td><a href="${esc(url)}"><img src="${esc(img)}" width="560" alt="" style="display:block;width:100%;height:auto;max-height:340px;object-fit:cover"></a></td></tr>` : ''}
<tr><td style="padding:26px 24px 8px">
${m.kicker ? `<div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#D3263A;margin-bottom:8px">${esc(m.kicker)}</div>` : ''}
<h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;text-transform:uppercase;color:#0A1A33">${esc(m.title)}</h1>
${paras.map(p => `<p style="margin:0 0 12px;font-size:16px;line-height:1.55;color:#33435A">${esc(p)}</p>`).join('')}
</td></tr>
<tr><td style="padding:6px 24px 28px"><a href="${esc(url)}" style="display:inline-block;background:#0E5CB8;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:1px;text-transform:uppercase;padding:13px 22px;border-radius:6px">${esc(m.cta || 'See it on the website')}</a></td></tr>
<tr><td style="background:#F4F6FA;padding:16px 24px;font-size:12px;line-height:1.5;color:#6A7A90">You get these emails because you signed up for Jersey Dodgers updates at jerseydodgers.com.<br><a href="${esc(m.unsubscribe)}" style="color:#0E5CB8">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;
}
export function updateText(m) {
  return `${m.kicker ? m.kicker.toUpperCase() + '\n' : ''}${m.title}\n\n${m.text || ''}\n\n${abs(m.url || '/')}\n\nUnsubscribe: ${m.unsubscribe}`;
}

/* send one message to many subscribers via Resend batch (100 per call) */
export async function sendToAll(subs, m, {apiKey, from, replyTo}) {
  let sent = 0, failed = 0;
  for (let i = 0; i < subs.length; i += 100) {
    const chunk = subs.slice(i, i + 100).map(s => {
      const unsubscribe = unsubscribeUrl(s.key, s.token);
      const msg = {...m, unsubscribe};
      return {from, to: [s.email], subject: m.subject || m.title, html: updateHtml(msg), text: updateText(msg), reply_to: replyTo || undefined,
        headers: {'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'},
        tags: [{name: 'site', value: 'jersey-dodgers'}, {name: 'kind', value: String(m.kind || 'update').replace(/[^a-z0-9_-]/gi, '')}]};
    });
    const r = await fetch('https://api.resend.com/emails/batch', {method: 'POST', headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'}, body: JSON.stringify(chunk)});
    if (r.ok) sent += chunk.length; else { failed += chunk.length; console.error('Resend batch failed', r.status, await r.text()); }
  }
  return {sent, failed};
}
