// Jersey Dodgers public site — v2 (single renderer, no patch scripts)
import {pastedTable} from './recaps.mjs';
import {pageInfo} from './seo.mjs';

const $ = s => document.querySelector(s);
let data, season, statsTab = 'bat', statsPhase = 'regular', mediaFilter = 'all', lightboxList = [], lightboxIndex = 0;

/* ---------- helpers ---------- */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines = v => esc(v).replace(/\n/g, '<br>');
const safeUrl = u => /^(https?:\/\/|\/)/i.test(String(u || '')) ? String(u) : '';
const ext = (url, label, cls = '') => safeUrl(url) ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener">${label}</a>` : '';
const team = id => data.teams.find(t => t.id === id);
const player = id => data.players.find(p => p.id === id);
const field = id => data.fields.find(f => f.id === id);
const seasonObj = id => data.seasons.find(s => s.id === id);
const seasonName = (id = season) => seasonObj(id)?.name || '';
const us = () => data.teams.find(t => t.name === data.settings.teamName) || {id: 'jersey-dodgers', name: data.settings.teamName, abbreviation: 'JD', logo: data.settings.logo};
const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : NaN; };
const has = v => v !== undefined && v !== null && v !== '' && v !== '-' && v !== '—';

function todayET() {
  return new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
}
const gDate = g => g.rescheduledDate || g.date;
const gTime = g => g.rescheduledTime || g.time || '00:00';
const fmtDate = (v, opts = {weekday: 'short', month: 'short', day: 'numeric'}) => {
  try { return new Intl.DateTimeFormat('en-US', {...opts, timeZone: 'UTC'}).format(new Date(v + 'T12:00:00Z')); } catch { return v; }
};
const fmtTime = v => { if (!v) return ''; const [h, m] = v.split(':'); return `${Number(h) % 12 || 12}:${m} ${Number(h) < 12 ? 'AM' : 'PM'}`; };

function meta(g) {
  const m = String(g.statusReason || '').match(/^JDMETA:(DH7|S9):([^:]*)?(?::([12]))?$/);
  return m ? {kind: m[1], n: m[3] ? Number(m[3]) : 0} : null;
}
function reason(g) { return meta(g) ? '' : String(g.statusReason || ''); }
function innings(g) { const m = meta(g); if (m?.kind === 'S9') return 9; if (m?.kind === 'DH7') return 7; return isDoubleheader(g) ? 7 : 0; }
function isDoubleheader(g) { return data.games.filter(x => x.season === g.season && gDate(x) === gDate(g) && x.opponent === g.opponent && x.status !== 'cancelled').length > 1 || meta(g)?.kind === 'DH7'; }
function gameNo(g) {
  const m = meta(g); if (m?.n) return m.n;
  const same = data.games.filter(x => x.season === g.season && x.date === g.date && x.opponent === g.opponent).sort((a, b) => a.time.localeCompare(b.time));
  return same.length > 1 ? same.findIndex(x => x.id === g.id) + 1 : 0;
}

/* game state, including past games that were never scored */
function state(g) {
  if (g.status === 'final') return 'final';
  if (g.status === 'live') return 'live';
  if (g.status === 'cancelled') return 'cancelled';
  if (g.status === 'postponed') return 'postponed';
  return gDate(g) < todayET() ? 'pending' : 'scheduled';
}
const result = g => g.ourScore > g.theirScore ? 'W' : g.ourScore < g.theirScore ? 'L' : 'T';
function shortReason(g) {
  const r = reason(g);
  if (/rain/i.test(r)) return 'Rain';
  if (/field/i.test(r)) return 'Field';
  if (/weather/i.test(r)) return 'Weather';
  return '';
}
function statusLabel(g) {
  const s = state(g);
  if (s === 'final') return 'Final';
  if (s === 'live') return 'Live';
  if (s === 'cancelled') return 'Canc' + (shortReason(g) ? ' · ' + shortReason(g) : '');
  if (s === 'postponed') return g.rescheduledDate ? 'PPD · ' + fmtDate(g.rescheduledDate, {month: 'short', day: 'numeric'}) : 'Postponed';
  if (s === 'pending') return 'Result pending';
  return fmtTime(gTime(g));
}

const seasonGames = (sid = season) => data.games.filter(g => g.season === sid).sort((a, b) => (gDate(a) + gTime(a)).localeCompare(gDate(b) + gTime(b)));
const upcomingGames = (sid = season) => seasonGames(sid).filter(g => ['scheduled', 'live'].includes(state(g)));
const pastGames = (sid = season) => seasonGames(sid).filter(g => !['scheduled', 'live'].includes(state(g))).reverse();
const finals = (sid = season) => seasonGames(sid).filter(g => g.status === 'final').reverse();
const recapFor = id => (data.gameRecaps || []).find(r => r.published && r.gameId === id);
const recaps = () => (data.gameRecaps || []).filter(r => published(r)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
function recapGame(r) { return data.games.find(x => x.id === r.gameId); }
function stories() {
  const groups = new Map();
  recaps().forEach(r => {
    const g = recapGame(r);
    const key = g ? `${g.date}|${g.opponent}` : `${r.date}|${String(r.opponent || '').toLowerCase()}|${r.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  return [...groups.values()].map(list => {
    list.sort((a, b) => (recapGame(a)?.time || '').localeCompare(recapGame(b)?.time || ''));
    const games = list.map(recapGame);
    if (list.length < 2) return {id: list[0].id, date: list[0].date, recaps: list, games, title: list[0].title, summary: list[0].summary, image: list[0].image};
    const o = team(games[0]?.opponent)?.name || list[0].opponent || 'Opponent';
    const res = games.map(g => g?.status === 'final' ? result(g) : '');
    const scores = games.map(g => g ? `${Math.max(g.ourScore, g.theirScore)}–${Math.min(g.ourScore, g.theirScore)}` : '').filter(Boolean).join(' and ');
    const title = res.every(x => x === 'W') ? `Dodgers sweep the ${o}` : res.every(x => x === 'L') ? `${o} take both games from the Dodgers` : `Dodgers split a doubleheader with the ${o}`;
    return {id: list[0].id, date: list[0].date, recaps: list, games, title, summary: `Doubleheader · ${scores}`, image: list.find(r => r.image)?.image || '', doubleheader: true};
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
const storyFor = id => stories().find(st => st.recaps.some(r => r.id === id));
function standingRow(sid = season) { return data.standings.find(s => s.season === sid && s.team === us().id); }
function recordText(sid = season) {
  const r = standingRow(sid);
  if (r) return `${r.w}-${r.l}${r.t ? '-' + r.t : ''}`;
  const f = finals(sid); if (!f.length) return '0-0';
  const w = f.filter(g => result(g) === 'W').length, l = f.filter(g => result(g) === 'L').length, t = f.length - w - l;
  return `${w}-${l}${t ? '-' + t : ''}`;
}

function mark(t, cls = 'mk') {
  if (t?.logo) return `<img class="${cls}" src="${esc(t.logo)}" alt="" loading="lazy">`;
  return `<span class="${cls} mono">${esc((t?.abbreviation || t?.name || '?').slice(0, 3))}</span>`;
}
const usMark = (cls = 'mk') => mark({...us(), logo: data.settings.logo}, cls);

function frame(caption, kind = 'JD_FRAME') {
  const re = new RegExp(`\\[\\[${kind}:\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*\\]\\]`, 'i');
  const m = String(caption || '').match(re);
  return m ? `object-position:${m[1]}% ${m[2]}%;` : '';
}
const cleanCaption = c => String(c || '').replace(/\[\[JD_V?FRAME:[^\]]*\]\]/gi, '').trim();
const isTrue = v => v === true || v === 'True' || v === 'true';

/* ---------- icons ---------- */
const ICON = {
  ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  yt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 4.8 12 4.8 12 4.8s-6 0-7.7.5a2.7 2.7 0 0 0-1.9 1.9A28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9c1.7.5 7.7.5 7.7.5s6 0 7.7-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8ZM10 15V9l5.2 3Z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 18h12a4 4 0 0 0 .7-7.9A6.5 6.5 0 0 0 6.4 8.2 5 5 0 0 0 6 18Z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>'
};

/* ---------- shell ---------- */
const NAV = [['', 'Home'], ['schedule', 'Scores & Schedule'], ['roster', 'Roster'], ['stats', 'Stats'], ['standings', 'Standings'], ['recaps', 'Stories'], ['media', 'Media']];

function railCards() {
  const up = upcomingGames(data.settings.currentSeason);
  const live = up.filter(g => g.status === 'live');
  const next = up.filter(g => g.status !== 'live').slice(0, 3);
  const past = pastGames(data.settings.currentSeason).slice(0, 10);
  return [...live, ...next, ...past];
}
function railCard(g) {
  const s = state(g), o = team(g.opponent), scored = s === 'final' || s === 'live';
  const rows = [[o, g.theirScore, scored && g.theirScore < g.ourScore], [null, g.ourScore, scored && g.ourScore < g.theirScore]];
  const ordered = g.home ? rows : [rows[1], rows[0]];
  const recap = s === 'final' ? recapFor(g.id) : null;
  const href = s === 'live' && g.gameLink ? g.gameLink : recap ? `/recaps/${recap.id}/` : `/game/${g.id}/`;
  const n = gameNo(g);
  return `<a class="g g-${s}" href="${esc(href)}" ${s === 'live' && g.gameLink ? 'target="_blank" rel="noopener"' : ''}>
    <div class="g-head"><span>${esc(fmtDate(gDate(g), {month: 'short', day: 'numeric'}))}${n ? ' · G' + n : ''}</span><span class="st">${s === 'live' ? '<i class="live"></i>' : ''}${esc(statusLabel(g))}</span></div>
    ${ordered.map(([t, score, lost]) => `<div class="g-row ${lost ? 'lose' : ''}">${t ? mark(t) : usMark()}<span class="ab">${esc(t ? (t.abbreviation || t.name) : 'JD')}</span>${scored ? `<span class="sc">${score ?? '–'}</span>` : ''}</div>`).join('')}
  </a>`;
}

function shell(route) {
  const s = data.settings;
  const cards = railCards();
  $('#rail').innerHTML = `<div class="wrap rail-in">
    <a class="rail-tag" href="/schedule/"><b>${esc(seasonName(s.currentSeason).replace(/^(\w+)\s20(\d\d)$/, "$1 '$2").toUpperCase())}</b><small>${esc(recordText(s.currentSeason))} · Scores</small></a>
    <button class="rail-nav prev" type="button" aria-label="Earlier games" hidden>${ICON.prev}</button><div class="rail-track" tabindex="0" aria-label="Scores and upcoming games">${cards.map(railCard).join('') || '<p class="rail-empty">The schedule will appear here once it is published.</p>'}</div><button class="rail-nav next" type="button" aria-label="More games" hidden>${ICON.next}</button>
  </div>`;
  $('#header').innerHTML = `<div class="wrap mast-in">
    <a class="brand" href="/"><img src="${esc(s.logo)}" alt=""><b>${esc(s.teamName)}<small>Est. ${esc(s.founded)} · New Jersey</small></b></a>
    <nav class="nav" aria-label="Main">${NAV.map(([r, l]) => `<a href="/${r ? r + '/' : ''}" class="${(route || '') === r || (r === 'schedule' && ['scores', 'game'].includes(route)) || (r === 'roster' && route === 'roster') ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div class="mast-act">
      ${safeUrl(s.instagram) ? `<a class="iconbtn hide-sm" href="${esc(s.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${ICON.ig}</a>` : ''}
      <a class="btn red" href="/tryouts/">Tryouts</a>
      <button class="iconbtn burger" type="button" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="drawer">${ICON.menu}</button>
    </div>
  </div>`;
  $('#drawer').innerHTML = `<button class="scrim" type="button" data-close aria-label="Close menu" tabindex="-1"></button><nav aria-label="Mobile">
    <div class="drawer-h"><b>${esc(s.teamName)}</b><button class="iconbtn" type="button" data-close aria-label="Close menu">${ICON.close}</button></div>
    ${[...NAV, ['videos', 'Videos'], ['players-of-the-week', 'Players of the Week'], ['tryouts', 'Tryouts']].map(([r, l]) => `<a href="/${r ? r + '/' : ''}">${l}</a>`).join('')}
    <div class="drawer-social">${ext(s.instagram, ICON.ig + ' Instagram')}${ext(s.youtube || 'https://youtube.com/@JerseyDodgers', ICON.yt + ' YouTube')}</div>
  </nav>`;
  $('#footer').innerHTML = `<div class="wrap ft-in">
    <a class="brand" href="/"><img src="${esc(s.logo)}" alt=""><b>${esc(s.teamName)}<small>${esc(s.footerText || '')}</small></b></a>
    <nav class="ft-links" aria-label="Footer"><a href="/schedule/">Schedule</a><a href="/roster/">Roster</a><a href="/stats/">Stats</a><a href="/videos/">Videos</a><a href="/tryouts/">Tryouts</a><a href="/admin/">Admin</a></nav>
    <div class="ft-league">${s.leagueLogo ? `<img src="${esc(s.leagueLogo)}" alt="">` : ''}<div><b>${esc(s.leagueName || '')}</b>${ext(s.leagueJoinUrl, 'Join the league')}</div></div>
  </div>
  <div class="wrap ft-base"><span>© ${new Date().getFullYear()} ${esc(s.teamName)} · Established ${esc(s.founded)}</span>${ext(s.creatorUrl, 'Site by ' + esc(s.creatorName || ''))}</div>`;
  const burger = $('#burger'), drawer = $('#drawer');
  burger.onclick = () => { drawer.hidden = false; burger.setAttribute('aria-expanded', 'true'); document.body.classList.add('locked'); drawer.querySelector('nav a')?.focus(); };
  drawer.onclick = e => { if (e.target.closest('[data-close]') || e.target.closest('nav a')) closeDrawer(); };
  // keep the next game in view on narrow screens
  wireRail();
}
function wireRail() {
  const track = $('.rail-track'), prev = $('.rail-nav.prev'), next = $('.rail-nav.next'); if (!track) return;
  track.scrollLeft = 0;
  const tag = $('.rail-tag'), inner = $('.rail-in');
  const sync = () => { if (tag && inner) inner.style.setProperty('--rail-tag-w', (tag.offsetLeft + tag.offsetWidth) + 'px'); const max = track.scrollWidth - track.clientWidth - 2; prev.hidden = track.scrollLeft <= 2; next.hidden = track.scrollLeft >= max; };
  prev.onclick = () => track.scrollBy({left: -track.clientWidth * 0.8, behavior: 'smooth'});
  next.onclick = () => track.scrollBy({left: track.clientWidth * 0.8, behavior: 'smooth'});
  track.addEventListener('scroll', sync, {passive: true});
  track.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && track.scrollWidth > track.clientWidth) { const before = track.scrollLeft; track.scrollLeft += e.deltaY; if (track.scrollLeft !== before) e.preventDefault(); } }, {passive: false});
  let drag = null;
  track.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; drag = {x: e.clientX, left: track.scrollLeft, moved: false}; });
  window.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 5) { drag.moved = true; track.classList.add('dragging'); } track.scrollLeft = drag.left - dx; });
  window.addEventListener('pointerup', () => { if (drag?.moved) { track.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); }, {capture: true, once: true}); } drag = null; track.classList.remove('dragging'); });
  sync(); window.addEventListener('resize', sync);
}
function closeDrawer() { const d = $('#drawer'); if (!d || d.hidden) return; d.hidden = true; $('#burger')?.setAttribute('aria-expanded', 'false'); document.body.classList.remove('locked'); }

/* ---------- shared blocks ---------- */
const secHead = (title, link = '', kicker = '') => `<div class="sec-h"><div>${kicker ? `<span class="lbl">${esc(kicker)}</span>` : ''}<h2>${esc(title)}</h2></div>${link}</div>`;
const more = (href, label) => `<a class="more" href="${href}">${label} →</a>`;
const empty = (title, text) => `<div class="empty"><b>${esc(title)}</b><p>${esc(text)}</p></div>`;
const pageHead = (title, kicker = '', withSeason = false) => `<header class="page-h wrap"><div>${kicker ? `<span class="lbl">${esc(kicker)}</span>` : ''}<h1>${esc(title)}</h1></div>${withSeason ? seasonSelect() : ''}</header>`;
function seasonSelect() {
  const list = [...data.seasons].sort((a, b) => seasonSort(b) - seasonSort(a));
  return `<label class="season-sel"><span class="lbl">Season</span><select id="season-select">${list.map(s => `<option value="${esc(s.id)}" ${s.id === season ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`;
}
function seasonSort(s) { const y = Number((s.id.match(/(\d{4})/) || [])[1] || 0); return y * 10 + (/fall/i.test(s.id) ? 2 : /spring/i.test(s.id) ? 1 : 0); }

function lineScoreFrom(text, g) {
  const rows = String(text || '').trim().split(/\r?\n/).map(r => r.split('\t').map(c => c.trim())).filter(r => r.length > 3);
  if (rows.length < 3) return text ? pastedTable(text) : '';
  const head = rows[0], body = rows.slice(1);
  const teamCell = name => {
    const isUs = name.toLowerCase() === data.settings.teamName.toLowerCase();
    const t = isUs ? null : data.teams.find(x => x.name.toLowerCase() === name.toLowerCase()) || (g ? team(g.opponent) : null);
    return `<span class="tm">${isUs ? usMark() : mark(t)}${esc(name)}</span>`;
  };
  const rIdx = head.indexOf('R'), runs = body.map(r => num(r[rIdx]));
  return `<div class="scroll"><table class="ls"><thead><tr>${head.map((h, i) => `<th class="${['R', 'H', 'E'].includes(h) ? 'rhe' : ''}">${i ? esc(h) : ''}</th>`).join('')}</tr></thead><tbody>${body.map((r, ri) => `<tr class="${runs.length === 2 && runs[ri] < runs[1 - ri] ? 'lose' : ''}">${r.map((c, i) => i ? `<td class="${['R', 'H', 'E'].includes(head[i]) ? 'rhe' : ''}">${esc(c)}</td>` : `<td>${teamCell(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function weatherBox(g) {
  if (g.weather) return `<div class="wx">${ICON.cloud}<span><b>${esc(g.weather)}</b><small>Team weather note</small></span></div>`;
  const f = field(g.field); if (!f || state(g) !== 'scheduled') return '';
  return `<div class="wx" data-weather data-name="${esc(f.name)}" data-address="${esc(f.address)}" data-date="${esc(gDate(g))}" data-time="${esc(gTime(g))}">${ICON.cloud}<span><b>Checking forecast</b><small>Game-time weather</small></span></div>`;
}
async function hydrateWeather() {
  for (const el of document.querySelectorAll('[data-weather]')) {
    try {
      const p = new URLSearchParams({name: el.dataset.name, address: el.dataset.address, date: el.dataset.date, time: el.dataset.time});
      const r = await fetch('/api/weather?' + p); if (!r.ok) throw Error();
      const w = await r.json();
      el.innerHTML = w.available ? `${ICON.cloud}<span><b>${esc(w.temperature)}°F · ${esc(w.label)}</b><small>Rain ${esc(w.precipitation)}% · Wind ${esc(w.wind)} mph</small></span>` : `${ICON.cloud}<span><b>Forecast pending</b><small>${esc(w.message || 'Available closer to game day')}</small></span>`;
    } catch { el.innerHTML = `${ICON.cloud}<span><b>Forecast pending</b><small>Check back closer to game day</small></span>`; }
  }
}

/* ---------- roster / stats data ---------- */
function rosterFor(sid = season) {
  const rows = (data.rosters || []).filter(r => r.season === sid && r.active !== false);
  if (rows.length) return rows.map(r => ({p: player(r.player), number: r.number || player(r.player)?.number || '', position: r.position || player(r.player)?.position || ''})).filter(r => r.p).sort((a, b) => (num(a.number) || 999) - (num(b.number) || 999) || a.p.name.localeCompare(b.p.name));
  const ids = new Set(data.stats.filter(s => s.season === sid).map(s => s.player));
  return data.players.filter(p => p.active && (!ids.size || ids.has(p.id))).map(p => ({p, number: p.number || '', position: p.position || ''})).sort((a, b) => (num(a.number) || 999) - (num(b.number) || 999));
}
const statRows = (sid = season, phase = 'regular') => (phase === 'playoffs' ? (data.playoffStats || []) : data.stats).filter(s => s.season === sid);
function leaderList(sid = season, phase = 'regular') {
  const rows = statRows(sid, phase); if (!rows.length) return [];
  const g = Math.max(1, finals(sid).length || Math.max(...rows.map(r => num(r.bat?.GP) || 0), 1));
  const minPA = Math.max(2, Math.ceil(g * 1.5)), minIP = Math.max(1, g);
  const pick = (group, key, low, qual) => {
    const list = rows.filter(r => has(r[group]?.[key]) && qual(r) && !Number.isNaN(num(r[group][key])));
    if (!list.length) return null;
    const best = (low ? Math.min : Math.max)(...list.map(r => num(r[group][key])));
    if (!low && best <= 0) return null;
    const win = list.filter(r => num(r[group][key]) === best);
    return {key, value: win[0][group][key], players: win.map(r => r.player), row: win[0]};
  };
  const pa = r => num(r.bat?.PA) >= minPA, ip = r => outs(r.pitch?.IP) >= minIP * 3, any = () => true;
  return [
    ['AVG', pick('bat', 'AVG', false, pa), r => `${r.bat.H}-for-${r.bat.AB}`],
    ['HR', pick('bat', 'HR', false, any), r => `${r.bat.PA} PA`],
    ['RBI', pick('bat', 'RBI', false, any), r => `${r.bat.H} H · ${r.bat.PA} PA`],
    ['OBP', pick('bat', 'OBP', false, pa), r => `${r.bat.BB || 0} BB · ${r.bat.PA} PA`],
    ['SB', pick('bat', 'SB', false, any), r => `${r.bat.PA} PA`],
    ['ERA', pick('pitch', 'ERA', true, ip), r => `${r.pitch.IP} IP`],
    ['SO', pick('pitch', 'SO', false, r => outs(r.pitch?.IP) > 0), r => `${r.pitch.IP} IP · pitching`],
    ['WHIP', pick('pitch', 'WHIP', true, ip), r => `${r.pitch.IP} IP`]
  ].filter(([, v]) => v).map(([label, v, sub]) => ({label: label === 'SO' ? 'Strikeouts' : label, ...v, sub: sub(v.row), minPA, minIP}));
}
function outs(ip) { const s = String(ip ?? '0'); const [w, f = '0'] = s.split('.'); return (Number(w) || 0) * 3 + (Number(f[0]) || 0); }
function leaderCards(list, max = 6) {
  return list.slice(0, max).map(l => {
    const names = l.players.map(id => player(id)?.name || 'Player');
    const r = rosterFor().find(x => x.p.id === l.players[0]);
    return `<a class="ld" href="/roster/${esc(l.players[0])}/"><small>${esc(l.label)}${names.length > 1 ? ' · ' + names.length + ' tied' : ''}</small><b>${esc(l.value)}</b><span>${esc(names.length > 2 ? names[0] + ' +' + (names.length - 1) : names.join(' · '))}</span><em>${r?.number ? '#' + esc(r.number) + ' · ' : ''}${esc(l.sub)}</em></a>`;
  }).join('');
}

/* ---------- media ---------- */
const published = m => m.published === undefined || isTrue(m.published);
const mediaAll = () => data.media.filter(published).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
const photos = () => mediaAll().filter(m => m.category !== 'Video' && m.image);
const videos = () => mediaAll().filter(m => m.category === 'Video');
const featured = list => [...list.filter(m => isTrue(m.featured)).sort((a, b) => num(a.featureOrder) - num(b.featureOrder)), ...list.filter(m => !isTrue(m.featured))];
function videoTile(m, big = false) {
  const poster = m.image ? `poster="${esc(m.image)}"` : '';
  if (m.video) return `<figure class="vid ${big ? 'big' : ''}"><video src="${esc(m.video)}${m.image ? '' : '#t=0.5'}" ${poster} preload="metadata" playsinline controls style="${frame(m.caption, 'JD_VFRAME')}"></video><figcaption>${esc(m.title)}${m.photographerName ? ` · ${esc(m.photographerName)}` : ''}</figcaption></figure>`;
  const id = ytId(m.link);
  if (id) return `<a class="vid yt ${big ? 'big' : ''}" href="${esc(m.link)}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="" loading="lazy"><span class="play">${ICON.play}</span><span class="cap">${esc(m.title)}</span></a>`;
  return '';
}
function ytId(url) { try { const u = new URL(url); if (u.hostname === 'youtu.be') return u.pathname.slice(1); if (/youtube\.com$/.test(u.hostname)) return u.searchParams.get('v') || (u.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/) || [])[1] || ''; } catch {} return ''; }
function photoTile(m, list, cls = '') {
  return `<button class="ph-tile ${cls}" type="button" data-photo="${esc(m.id)}" data-list="${esc(list)}" aria-label="Open photo: ${esc(m.title)}"><img src="${esc(m.image)}" alt="" loading="lazy" style="${frame(m.caption)}"></button>`;
}
function credits(list) {
  const names = new Map();
  list.forEach(m => { if (isTrue(m.showPhotographerCredit) && m.photographerName) names.set(m.photographerName, {ig: m.photographerInstagram, kind: m.category === 'Video' ? 'Video' : 'Photos'}); });
  if (!names.size) return '';
  return `<p class="credit">${[...names].map(([n, v]) => `${v.kind} by ${v.ig ? ext(v.ig, esc(n)) : esc(n)}`).join(' · ')}</p>`;
}
function albumName(m) { return String(m.title || '').split(' · ')[0].trim(); }

/* ---------- HOME ---------- */
function home() {
  const s = data.settings, cs = s.currentSeason;
  const next = upcomingGames(cs).find(g => g.status === 'live') || upcomingGames(cs)[0];
  const nextPair = next ? upcomingGames(cs).filter(g => gDate(g) === gDate(next) && g.opponent === next.opponent) : [];
  return lead(next, nextPair) + gameDay(next, nextPair) + boxAndStandings() + leadersSection() + rosterSection() + awardsSection() + mediaSection() + rafters() + joinStrip();
}

function lead(next, pair) {
  const s = data.settings, o = next ? team(next.opponent) : null, f = next ? field(next.field) : null;
  let kicker, title, text, ctas;
  if (next) {
    const dh = pair.length > 1;
    kicker = (next.status === 'live' ? 'Live now' : 'Next up') + ' · ' + fmtDate(gDate(next));
    title = dh ? `${next.home ? 'Dodgers host' : 'Dodgers face'} the ${o?.name || 'opponent'} in a doubleheader` : `${next.home ? 'Dodgers host the' : 'Dodgers visit the'} ${o?.name || 'opponent'}`;
    text = `${f ? (next.home ? 'At ' : 'At ') + f.name + '. ' : ''}First pitch ${fmtTime(gTime(pair[0] || next))}${dh ? `, game two at ${fmtTime(gTime(pair[1]))}` : ''}. The Dodgers are ${recordText(s.currentSeason)} in ${seasonName(s.currentSeason)}.`;
    ctas = `<a class="btn red" href="/game/${esc(next.id)}/">Game preview</a><a class="btn ghost light" href="/schedule/">Full schedule</a>`;
  } else {
    kicker = s.tagline || seasonName(s.currentSeason);
    title = String(s.heroTitle || s.teamName).replace(/\n/g, ' ');
    text = String(s.heroText || '').replace(/\n/g, ' ');
    ctas = `<a class="btn red" href="/schedule/">Scores & schedule</a><a class="btn ghost light" href="/roster/">Meet the team</a>`;
  }
  return `<section class="wrap lead">
    <article class="story">
      <img class="story-img" src="${esc(s.heroImage)}" alt="${esc(s.championshipTitle || s.teamName)}" fetchpriority="high">
      <div class="story-tx">
        <span class="kicker"><i></i>${esc(kicker)}</span>
        <h1>${esc(title)}</h1>
        <p>${esc(text)}</p>
        <div class="cta">${ctas}</div>
      </div>
    </article>
    <aside class="heads"><h2>Top headlines</h2><ol>${headlines().map(h => `<li><a href="${esc(h.href)}"><div><b>${esc(h.title)}</b><small>${esc(h.sub)}</small></div><span class="tag ${h.cls || ''}">${esc(h.tag)}</span></a></li>`).join('')}</ol></aside>
  </section>`;
}

function headlines() {
  const out = [];
  stories().slice(0, 2).forEach(st => {
    const res = st.games.filter(g => g?.status === 'final').map(result);
    const cls = res.length && res.every(x => x === 'W') ? 'w' : res.length && res.every(x => x === 'L') ? 'l' : '';
    out.push({title: st.title, sub: `${st.summary && st.summary !== st.title ? st.summary + ' · ' : ''}${fmtDate(st.date, {month: 'short', day: 'numeric'})}`, href: `/recaps/${st.id}/`, tag: st.doubleheader ? 'Doubleheader' : 'Recap', cls});
  });
  const award = (data.weeklyAwards || []).filter(a => published(a)).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (award) out.push({title: `${award.winners.map(w => player(w.player)?.name).filter(Boolean).join(' & ')} named ${award.title || 'Players of the Week'}`, sub: award.weekLabel || '', href: '/players-of-the-week/', tag: 'Award'});
  const ph = photos(); if (ph.length) {
    const album = albumName(ph[0]), count = ph.filter(m => albumName(m) === album).length;
    out.push({title: `${album}: ${count} photo${count === 1 ? '' : 's'}`, sub: ph[0].photographerName ? 'Photos by ' + ph[0].photographerName : 'Photo gallery', href: '/media/', tag: 'Gallery'});
  }
  const canc = pastGames(data.settings.currentSeason).filter(g => g.status === 'cancelled');
  if (canc.length) {
    const opps = [...new Set(canc.map(g => team(g.opponent)?.name).filter(Boolean))].slice(0, 2);
    const dates = [...new Set(canc.map(g => fmtDate(g.date, {month: 'short', day: 'numeric'})))].slice(0, 3);
    out.push({title: `${canc.some(g => /rain/i.test(reason(g))) ? 'Rain wipes out' : 'Cancelled:'} ${opps.join(', ')} games`, sub: dates.join(', '), href: '/schedule/', tag: 'Schedule'});
  }
  const v = featured(videos())[0]; if (v && out.length < 5) out.push({title: v.title, sub: v.photographerName ? 'Video by ' + v.photographerName : 'Video', href: '/videos/', tag: 'Video'});
  out.push({title: data.settings.tryoutsTitle ? toTitle(data.settings.tryoutsTitle) : 'Tryouts are open', sub: 'Apply to join the roster', href: '/tryouts/', tag: 'Team'});
  return out.slice(0, 5);
}
const toTitle = s => String(s).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()).replace(/\.$/, '');

function countdown(g) {
  return `<div class="count" data-count="${esc(gDate(g))}T${esc(gTime(g))}" aria-label="Countdown to first pitch"></div>`;
}
function tickCountdowns() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const [d, t] = el.dataset.count.split('T'); const [y, m, day] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number);
    // ET offset: use -4 during DST months (Mar–Nov), else -5
    const off = (m > 3 && m < 11) || (m === 3 && day > 8) || (m === 11 && day < 2) ? 4 : 5;
    const ms = Math.max(0, Date.UTC(y, m - 1, day, h + off, mi) - Date.now());
    const parts = [[Math.floor(ms / 864e5), 'Days'], [Math.floor(ms / 36e5) % 24, 'Hrs'], [Math.floor(ms / 6e4) % 60, 'Min']];
    el.innerHTML = parts.map(([v, l]) => `<div><b>${String(v).padStart(2, '0')}</b><small>${l}</small></div>`).join('');
  });
}

function gameDay(next, pair) {
  if (!next) return `<section class="wrap sec">${secHead('Game Day', more('/schedule/', 'Schedule'))}${empty('No games on the calendar', 'The next matchup will appear here as soon as it is scheduled.')}</section>`;
  const o = team(next.opponent), f = field(next.field), cs = data.settings.currentSeason;
  const oRow = data.standings.find(s => s.season === cs && s.team === next.opponent);
  const prev = data.seasons.filter(x => x.id !== cs && data.standings.some(s => s.season === x.id && s.team === us().id)).sort((a, b) => seasonSort(b) - seasonSort(a))[0];
  const live = next.status === 'live';
  return `<section class="wrap sec">${secHead('Game Day', more('/schedule/', 'Schedule'))}
  <div class="card match">
    <div class="mu">
      <div class="mu-top"><span class="lbl">${pair.length > 1 ? 'Doubleheader · ' : ''}${next.home ? 'Home' : 'Away'}</span>${live ? '<span class="pill live-p"><i class="live"></i>Live</span>' : countdown(pair[0] || next)}</div>
      <div class="mu-teams">
        <div class="mu-t">${next.home ? mark(o, 'mu-logo') : usMark('mu-logo')}<b>${esc(next.home ? (o?.name || 'Opponent') : 'Dodgers')}</b><small>${esc(next.home ? (oRow ? `${oRow.w}-${oRow.l}` : '') : recordText(cs))}</small></div>
        <div class="mu-at">${next.home ? 'VS' : '@'}</div>
        <div class="mu-t">${next.home ? usMark('mu-logo') : mark(o, 'mu-logo')}<b>${esc(next.home ? 'Dodgers' : (o?.name || 'Opponent'))}</b><small>${esc(next.home ? recordText(cs) : (oRow ? `${oRow.w}-${oRow.l}` : ''))}</small></div>
      </div>
      <div class="mu-dh">${(pair.length ? pair : [next]).map((g, i) => `<a href="/game/${esc(g.id)}/"><small>${pair.length > 1 ? 'Game ' + (i + 1) : fmtDate(gDate(g))}${innings(g) ? ' · ' + innings(g) + ' inn' : ''}</small><b>${esc(fmtTime(gTime(g)))}</b></a>`).join('')}</div>
    </div>
    <div class="venue">
      <span class="lbl">${esc(fmtDate(gDate(next), {weekday: 'long', month: 'long', day: 'numeric'}))}</span>
      <h3>${esc(f?.name || 'Field to be announced')}</h3>
      ${f?.address ? `<p>${ICON.pin}${esc(f.address)}</p>` : ''}
      <div class="facts">
        <div><small>${esc(seasonName(cs).split(' ')[0] || 'Season')}</small><b>${esc(recordText(cs))}</b></div>
        ${prev ? `<div><small>${esc(prev.name.replace(/^(\w+)\s20(\d\d)$/, "$1 '$2"))}</small><b>${esc(recordText(prev.id))}</b></div>` : ''}
        <div><small>Titles</small><b>${data.achievements.length}</b></div>
      </div>
      ${weatherBox(next)}
      <div class="row-btns">${ext(f?.mapsUrl, 'Directions', 'btn blue')}${live && next.gameLink ? ext(next.gameLink, 'Watch live', 'btn red') : ext(gcLink(next), 'Follow on GameChanger', 'btn ghost')}</div>
    </div>
  </div></section>`;
}
const gcLink = g => g?.gameLink || data.channels.find(c => /gamechanger/i.test(c.id + c.name))?.link || '';

function boxCard(list) {
  if (!list.length) return `<div class="card">${empty('No final scores yet', 'Box scores appear here after each game.')}</div>`;
  return `<div class="card box-card"><div class="tabs" role="tablist" aria-label="Latest results">${list.map((g, i) => `<button role="tab" type="button" aria-selected="${i === 0}" data-box="${i}">${esc(fmtDate(gDate(g), {month: 'short', day: 'numeric'}))}${gameNo(g) ? ' · Game ' + gameNo(g) : ''}</button>`).join('')}</div>${list.map((g, i) => `<div class="box" data-box-panel="${i}" ${i ? 'hidden' : ''}>${boxBody(g)}</div>`).join('')}</div>`;
}
function boxBody(g) {
  const o = team(g.opponent), r = recapFor(g.id), res = result(g), f = field(g.field);
  const winner = g.ourScore >= g.theirScore ? `Dodgers ${g.ourScore}, ${o?.name || 'Opponent'} ${g.theirScore}` : `${o?.name || 'Opponent'} ${g.theirScore}, Dodgers ${g.ourScore}`;
  return `<div class="box-h"><div><h3>${esc(winner)}</h3><p>${esc(fmtDate(gDate(g)))}${f ? ' · ' + esc(f.name) : ''} · ${g.home ? 'Home' : 'Away'}</p></div><span class="pill ${res === 'W' ? 'w' : res === 'L' ? 'l' : ''}">Final · ${res}</span></div>
  ${r?.lineScore ? lineScoreFrom(r.lineScore, g) : simpleLine(g)}
  ${r ? `<p class="recap-sum">${esc(firstPara(r))}</p>` : ''}
  <div class="row-btns">${r ? `<a class="btn ghost sm" href="/recaps/${esc(r.id)}/">Read the recap</a>` : `<a class="btn ghost sm" href="/game/${esc(g.id)}/">Game Center</a>`}${ext(g.gameLink, 'GameChanger box score', 'btn ghost sm')}</div>`;
}
function firstPara(r) {
  const paras = String(r.body || '').split(/\n\s*\n/).map(p => p.trim()).filter(p => p && !/^by gamechanger/i.test(p));
  const p = paras[1] || paras[0] || r.summary || '';
  return p.length > 260 ? p.slice(0, 257).replace(/\s+\S*$/, '') + '…' : p;
}
function simpleLine(g) {
  const o = team(g.opponent), rows = [[o?.name || 'Opponent', g.theirScore, mark(o)], [data.settings.teamName, g.ourScore, usMark()]];
  const ordered = g.home ? rows : [rows[1], rows[0]];
  return `<div class="scroll"><table class="ls"><thead><tr><th></th><th class="rhe">R</th></tr></thead><tbody>${ordered.map(([n, sc, m], i) => `<tr class="${sc < ordered[1 - i][1] ? 'lose' : ''}"><td><span class="tm">${m}${esc(n)}</span></td><td class="rhe">${sc}</td></tr>`).join('')}</tbody></table></div>`;
}

function standingsTable(sid = season, full = false) {
  const rows = data.standings.filter(s => s.season === sid).sort((a, b) => a.order - b.order);
  if (!rows.length) return empty('Standings coming soon', 'League records appear here once they are posted.');
  const cols = full ? ['W', 'L', 'T', 'PCT', 'GB', 'STRK', 'RS', 'RA', 'DIFF', 'HOME', 'AWAY'] : ['W', 'L', 'PCT', 'GB'];
  const val = (s, c) => ({W: s.w, L: s.l, T: s.t, PCT: s.pct, GB: s.gb, STRK: s.streak, RS: s.rs, RA: s.ra, DIFF: has(s.rs) && has(s.ra) ? (s.rs - s.ra > 0 ? '+' : '') + (s.rs - s.ra) : '', HOME: s.home, AWAY: s.away}[c]);
  return `<div class="scroll"><table class="st ${full ? 'full' : ''}"><thead><tr><th>Team</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((s, i) => `<tr class="${s.team === us().id ? 'us' : ''}"><td><span class="tm"><em>${i + 1}</em>${s.team === us().id ? usMark() : mark(team(s.team))}<span>${esc(team(s.team)?.name || s.team)}</span></span></td>${cols.map(c => `<td>${esc(val(s, c) ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function boxAndStandings() {
  const cs = data.settings.currentSeason, list = finals(cs).slice(0, 2);
  return `<section class="wrap sec two">
    <div>${secHead('Latest Results', more('/scores/', 'All scores'))}${boxCard(list)}</div>
    <div>${secHead('Standings', more('/standings/', 'Full table'))}<div class="card">${standingsTable(cs)}<p class="st-note">${esc(data.settings.leagueName || '')} · ${esc(seasonName(cs))}</p></div></div>
  </section>`;
}

function leadersSection() {
  const list = leaderList(data.settings.currentSeason);
  if (!list.length) return '';
  return `<section class="wrap sec">${secHead('Team Leaders', more('/stats/', 'Stats center'), seasonName(data.settings.currentSeason))}<div class="card leaders">${leaderCards(list, 6)}</div><p class="note">Rate stats need ${list[0].minPA}+ plate appearances or ${list[0].minIP}+ innings.</p></section>`;
}

function playerCard(r) {
  return `<a class="pc" href="/roster/${esc(r.p.id)}/"><div class="pic ${r.p.photo ? '' : 'empty'}">${r.p.photo ? `<img src="${esc(r.p.photo)}" alt="" loading="lazy">` : `<img class="ghost" src="${esc(data.settings.logo)}" alt="">`}<span class="no">${esc(r.number || '')}</span></div><div class="meta"><b>${esc(r.p.name)}</b><small>${esc(r.position || 'Player')}</small></div></a>`;
}
function rosterSection() {
  const ro = rosterFor(data.settings.currentSeason); if (!ro.length) return '';
  const sorted = [...ro.filter(r => r.p.photo), ...ro.filter(r => !r.p.photo)];
  return `<section class="wrap sec">${secHead('The Roster', more('/roster/', `All ${ro.length} players`))}<div class="roster-rail">${sorted.map(playerCard).join('')}</div></section>`;
}

function awardCard(a) {
  return a.winners.map(w => {
    const p = player(w.player), vis = w.graphic || w.photo || p?.photo;
    return `<article class="aw">${vis ? `<a class="aw-vis" href="/roster/${esc(w.player)}/"><img src="${esc(vis)}" alt="" loading="lazy"></a>` : ''}<div class="aw-tx"><span class="lbl">${esc(w.awardType === 'Custom' ? (w.customAward || 'Weekly award') : (w.awardType || 'Player of the Week'))}</span><h3><a href="/roster/${esc(w.player)}/">${esc(p?.name || 'Player')}</a></h3>${w.statLine ? `<p class="aw-line">${esc(w.statLine)}</p>` : ''}${(w.stats || []).filter(s => s.label || s.value).length ? `<dl>${w.stats.filter(s => s.label || s.value).map(s => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('')}</dl>` : ''}</div></article>`;
  }).join('');
}
function awardsFor(sid) { return (data.weeklyAwards || []).filter(a => a.season === sid && published(a)).sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.order - b.order); }
function awardsSection() {
  const a = awardsFor(data.settings.currentSeason)[0]; if (!a) return '';
  return `<section class="wrap sec">${secHead(a.title || 'Players of the Week', more('/players-of-the-week/', 'All winners'), a.weekLabel)}<div class="awards">${awardCard(a)}</div></section>`;
}

function mediaSection() {
  const v = featured(videos()).find(x => x.video), ph = featured(photos()).slice(0, v ? 3 : 4);
  if (!v && !ph.length) return '';
  const tile = (m, cls) => `<button class="col-tile ${cls}" type="button" data-photo="${esc(m.id)}" data-list="home" aria-label="Open photo"><img src="${esc(m.image)}" alt="" loading="lazy" style="${frame(m.caption)}"></button>`;
  const vid = v ? `<a class="col-tile col-v" href="/videos/" aria-label="Watch: ${esc(v.title)}"><video src="${esc(v.video)}" ${v.image ? `poster="${esc(v.image)}"` : ''} autoplay muted loop playsinline preload="metadata" disablepictureinpicture style="${frame(v.caption, 'JD_VFRAME')}"></video></a>` : '';
  return `<section class="wrap sec">${secHead('Photos & Video', more('/media/', 'All media'))}
    <div class="collage ${v ? '' : 'no-v'}">${vid}${ph.map((m, i) => tile(m, 'col-' + (i + 1))).join('')}</div>
    ${credits([v, ...ph].filter(Boolean))}
  </section>`;
}

function rafters() {
  const a = [...data.achievements].sort((x, y) => String(y.year).localeCompare(String(x.year)));
  const s = data.settings;
  const champ = s.championshipTitle ? [{year: (s.championshipTitle.match(/\d{4}/) || [''])[0], title: s.championshipTitle.replace(/\d{4}\s*/, '').replace(/champions/i, '').trim() || 'Champions', organization: 'Champions', gold: true}] : [];
  const list = [...champ.filter(c => c.year), ...a];
  if (!list.length) return '';
  return `<section class="wrap sec"><div class="rafters">
    <div class="rafters-h"><div><span class="lbl gold">Established ${esc(s.founded)}</span><h2>Banners in the rafters</h2><p>${esc(s.championshipText || '')}</p></div>${s.championshipImage ? `<button class="btn ghost light" type="button" data-champ>${esc(s.championshipTitle ? 'See the ' + (s.championshipTitle.match(/\d{4}/) || [''])[0] + ' champions' : 'Champions photo')}</button>` : ''}</div>
    <div class="banners">${list.map(b => `<div class="bn ${b.gold ? 'gold' : ''}"><div><small>${esc(b.gold ? toTitle(b.title) : (b.organization || '').replace(/ Baseball$/i, ''))}</small><b>${esc(b.year)}</b><span>${esc(b.gold ? 'Champions' : b.title)}</span></div></div>`).join('')}</div>
  </div></section>`;
}

function joinStrip() {
  const s = data.settings;
  const sp = data.sponsors.filter(x => x.active !== false);
  const ch = [...data.channels].filter(c => c.active !== false).sort((a, b) => a.order - b.order);
  return `<section class="wrap sec join">
    <div class="card jc blue"><span class="lbl">${esc(joinSeasons())}</span><h3>${esc(toTitle(s.tryoutsTitle || 'Join the team'))}</h3><p>${esc(s.tryoutsText || '')}</p><div><a class="btn white" href="/tryouts/">Apply to join</a></div></div>
    <div class="card jc"><span class="lbl">${sp.length > 1 ? 'Team sponsors' : 'Team sponsor'}</span><h3>${esc(toTitle(s.sponsorTitle || 'Back the Dodgers'))}</h3>${sp.map(x => `<a class="spons" ${safeUrl(x.link) ? `href="${esc(x.link)}" target="_blank" rel="noopener"` : ''}>${x.logo ? `<img src="${esc(x.logo)}" alt="" loading="lazy">` : ''}<div><b>${esc(x.name)}</b><small>${esc(x.description || x.buttonLabel || 'Proud sponsor')}</small></div></a>`).join('') || `<p>${esc(s.sponsorText || '')}</p>`}<div><button class="btn ghost" type="button" data-form="sponsor">Become a sponsor</button></div></div>
    <div class="card jc"><span class="lbl">Follow</span><h3>Every inning</h3><div class="follow">${ch.map(c => `<a href="${esc(safeUrl(c.link) || '#')}" target="_blank" rel="noopener" style="--ch:${esc(/^#[0-9a-f]{3,8}$/i.test(c.color) ? c.color : '#0E5CB8')}"><span class="ch-logo">${channelLogo(c)}</span><div><b>${esc(c.name)}</b><small>${esc(c.description || c.eyebrow || '')}</small></div><span class="ch-go" aria-hidden="true">${ICON.next}</span></a>`).join('')}</div></div>
  </section>`;
}
function channelLogo(c) {
  if (c.logo) return `<img src="${esc(c.logo)}" alt="" loading="lazy">`;
  const k = `${c.id} ${c.name}`.toLowerCase();
  if (k.includes('instagram')) return ICON.ig;
  if (k.includes('youtube')) return ICON.yt;
  if (k.includes('gamechanger')) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5A5 5 0 1 0 17 13h-5"/></svg>';
  return `<b>${esc(c.name.slice(0, 2).toUpperCase())}</b>`;
}
function joinSeasons() { const up = data.seasons.filter(x => x.status === 'active' || x.status === 'upcoming').map(x => x.name); return up.length ? up.join(' · ') : 'Tryouts'; }

/* ---------- SCHEDULE ---------- */
function gameRow(g) {
  const o = team(g.opponent), s = state(g), f = field(g.field), scored = s === 'final' || s === 'live', recap = recapFor(g.id), n = gameNo(g);
  return `<a class="gr gr-${s}" href="${recap ? `/recaps/${esc(recap.id)}/` : `/game/${esc(g.id)}/`}">
    <div class="gr-date"><b>${esc(fmtDate(gDate(g), {month: 'short', day: 'numeric'}))}</b><small>${esc(fmtDate(gDate(g), {weekday: 'short'}))}${n ? ' · G' + n : ''}</small></div>
    <div class="gr-opp">${mark(o)}<div><b>${g.home ? 'vs' : '@'} ${esc(o?.name || 'Opponent')}</b><small>${esc(f?.name || '')}</small></div></div>
    <div class="gr-res">${scored ? `<span class="res ${s === 'final' ? result(g).toLowerCase() : ''}">${s === 'final' ? result(g) : ''}</span><b>${g.ourScore ?? '–'}-${g.theirScore ?? '–'}</b>` : `<span class="pill ${s === 'pending' ? 'warn' : s === 'scheduled' ? '' : 'off'}">${esc(statusLabel(g))}</span>`}</div>
  </a>`;
}
function schedulePage(onlyScores) {
  const up = upcomingGames(), past = pastGames();
  const body = onlyScores ? (finals().length ? `<div class="card gl">${finals().map(gameRow).join('')}</div>` : empty('No final scores yet', 'Results appear here after each game.'))
    : `${up.length ? `<h2 class="sub-h">Upcoming</h2><div class="card gl">${up.map(gameRow).join('')}</div>` : ''}${past.length ? `<h2 class="sub-h">Results</h2><div class="card gl">${past.map(gameRow).join('')}</div>` : ''}${!up.length && !past.length ? empty('Schedule coming soon', 'Confirmed dates will appear here.') : ''}`;
  return pageHead(onlyScores ? 'Scores' : 'Scores & Schedule', `${seasonName()} · ${recordText()}`, true) + `<section class="wrap sec">${seasonObj(season)?.note ? `<p class="note top">${esc(seasonObj(season).note)}</p>` : ''}${body}</section>`;
}

function gamePage(id) {
  const g = data.games.find(x => x.id === id); if (!g) return notFound('Game not found', 'Return to the schedule to find a game.');
  const o = team(g.opponent), f = field(g.field), s = state(g), r = recapFor(g.id), scored = s === 'final' || s === 'live';
  const away = g.home ? [o, g.theirScore, false] : [null, g.ourScore, true], homeT = g.home ? [null, g.ourScore, true] : [o, g.theirScore, false];
  const side = ([t, sc, isUs]) => `<div class="gc-t">${isUs ? usMark('mu-logo') : mark(t, 'mu-logo')}<b>${esc(isUs ? 'Dodgers' : (t?.name || 'Opponent'))}</b>${scored ? `<strong>${sc ?? '–'}</strong>` : ''}</div>`;
  return `<section class="gc"><div class="wrap gc-in">
    <a class="back" href="/schedule/">← Scores & Schedule</a>
    <span class="lbl">${esc(fmtDate(gDate(g), {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'}))}${gameNo(g) ? ' · Game ' + gameNo(g) : ''}${innings(g) ? ' · ' + innings(g) + ' innings' : ''}</span>
    <div class="gc-score">${side(away)}<div class="gc-mid"><span class="pill ${s === 'final' ? (result(g) === 'W' ? 'w' : 'l') : s === 'pending' ? 'warn' : ''}">${esc(statusLabel(g))}</span>${s === 'scheduled' ? `<b>${esc(fmtTime(gTime(g)))}</b>` : ''}</div>${side(homeT)}</div>
    ${reason(g) && ['cancelled', 'postponed'].includes(s) ? `<p class="gc-alert">${esc(reason(g))}</p>` : ''}
  </div></section>
  <section class="wrap sec two">
    <div class="card pad">${r?.lineScore ? `<h2 class="sub-h">Line score</h2>${lineScoreFrom(r.lineScore, g)}` : ''}${r ? `<h2 class="sub-h">${esc(r.title)}</h2><p>${esc(firstPara(r))}</p><a class="btn blue sm" href="/recaps/${esc(r.id)}/">Read the full recap</a>` : `<h2 class="sub-h">${s === 'final' ? 'Final' : 'Matchup'}</h2><p>${lines(g.recap || (s === 'pending' ? 'The final score will be posted soon.' : 'Game notes and the recap will appear here.'))}</p>`}
    ${ext(g.gameLink, s === 'live' ? 'Watch live on GameChanger' : 'Open on GameChanger', 'btn ghost sm')}</div>
    <div class="card pad venue"><span class="lbl">Ballpark</span><h3>${esc(f?.name || 'To be announced')}</h3>${f?.address ? `<p>${ICON.pin}${esc(f.address)}</p>` : ''}${f?.notes ? `<p>${lines(f.notes)}</p>` : ''}${weatherBox(g)}<div class="row-btns">${ext(f?.mapsUrl, 'Directions', 'btn blue sm')}</div></div>
  </section>`;
}

/* ---------- STORIES ---------- */
function storyCard(st) {
  const scores = st.games.filter(g => g?.status === 'final').map(g => `<span class="pill ${result(g) === 'W' ? 'w' : result(g) === 'L' ? 'l' : ''}">${result(g)} ${g.ourScore}-${g.theirScore}</span>`).join('');
  return `<a class="rc card" href="/recaps/${esc(st.id)}/">${st.image ? `<img src="${esc(st.image)}" alt="" loading="lazy">` : ''}<div class="rc-tx"><div class="rc-meta"><span class="lbl">${esc(fmtDate(st.date))} · ${st.doubleheader ? 'Doubleheader' : 'Recap'}</span><span class="rc-scores">${scores}</span></div><h3>${esc(st.title)}</h3><p>${esc(st.doubleheader ? st.recaps.map(r => r.title).join(' · ') : firstPara(st.recaps[0]))}</p></div></a>`;
}
function recapBody(r, g) {
  const paras = String(r.body || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return `${r.lineScore ? `<div class="card pad">${lineScoreFrom(r.lineScore, g)}</div>` : ''}
      <div class="art-body">${paras.map(p => /^by /i.test(p) && p.length < 60 ? `<p class="byline">${esc(p)}</p>` : `<p>${lines(p)}</p>`).join('')}</div>
      ${r.boxScore ? `<h2 class="sub-h">Box score</h2><div class="card pad">${pastedTable(r.boxScore)}</div>` : ''}`;
}
function recapsPage(id) {
  const list = stories();
  if (id) {
    const st = storyFor(id); if (!st) return notFound('Story not found', 'This recap is unavailable.');
    const one = st.recaps.length === 1, r0 = st.recaps[0];
    return `<article class="wrap art">
      <a class="back" href="/recaps/">← All stories</a>
      <span class="lbl">${st.doubleheader ? 'Doubleheader recap' : 'Game recap'} · ${esc(fmtDate(st.date, {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'}))}</span>
      <h1>${esc(st.title)}</h1>
      ${one ? (r0.summary && r0.summary !== r0.title ? `<p class="dek">${esc(r0.summary)}</p>` : '') : `<p class="dek">${esc(st.summary)}</p>`}
      ${st.image ? `<img class="art-img" src="${esc(st.image)}" alt="">` : ''}
      ${one ? recapBody(r0, st.games[0]) : st.recaps.map((r, i) => { const g = st.games[i]; return `<section class="dh-game"><div class="dh-head"><span class="lbl">Game ${i + 1}${g ? ' · ' + esc(fmtTime(g.time)) : ''}</span>${g?.status === 'final' ? `<span class="pill ${result(g) === 'W' ? 'w' : 'l'}">${result(g)} ${g.ourScore}-${g.theirScore}</span>` : ''}</div><h2 class="dh-title">${esc(r.title)}</h2>${recapBody(r, g)}</section>`; }).join('')}
      <div class="row-btns">${st.games.filter(Boolean).map((g, i) => `<a class="btn ghost sm" href="/game/${esc(g.id)}/">Game Center${st.games.length > 1 ? ' · G' + (i + 1) : ''}</a>`).join('')}${st.recaps.filter(r => safeUrl(r.source)).slice(0, 1).map(r => ext(r.source, 'View on GameChanger', 'btn ghost sm')).join('')}</div>
    </article>`;
  }
  return pageHead('Stories', 'Recaps and team news') + `<section class="wrap sec">${list.length ? `<div class="rc-grid">${list.map(storyCard).join('')}</div>` : empty('No stories yet', 'Game recaps will appear here.')}</section>`;
}

/* ---------- STANDINGS ---------- */
function standingsPage() {
  const rows = data.standings.filter(s => s.season === season);
  return pageHead('Standings', data.settings.leagueName || '', true) + `<section class="wrap sec"><div class="card">${standingsTable(season, true)}${rows[0]?.source ? `<p class="st-note">Source: ${esc(rows[0].source)}</p>` : ''}</div></section>`;
}

/* ---------- ROSTER ---------- */
function rosterPage(id) {
  if (id) return profilePage(id);
  const ro = rosterFor();
  return pageHead('Roster', `${seasonName()} · ${ro.length} players`, true) + `<section class="wrap sec">${ro.length ? `<div class="roster-grid">${ro.map(playerCard).join('')}</div>` : empty('Roster not published', 'This season’s roster will appear here.')}</section>`;
}
function profilePage(id) {
  const p = player(id); if (!p) return notFound('Player not found', 'Return to the roster to choose a player.');
  const entries = [...data.stats.filter(s => s.player === id).map(s => ({...s, phase: 'Regular'})), ...(data.playoffStats || []).filter(s => s.player === id).map(s => ({...s, phase: 'Playoffs'}))]
    .sort((a, b) => seasonSort(seasonObj(b.season) || {id: b.season}) - seasonSort(seasonObj(a.season) || {id: a.season}));
  const rr = (data.rosters || []).filter(r => r.player === id).sort((a, b) => seasonSort(seasonObj(b.season) || {id: b.season}) - seasonSort(seasonObj(a.season) || {id: a.season}))[0];
  const number = rr?.number || p.number, pos = rr?.position || p.position;
  const bat = entries.filter(e => e.bat && has(e.bat.PA) && num(e.bat.PA) > 0);
  const pit = entries.filter(e => e.pitch && outs(e.pitch.IP) > 0);
  const sum = k => bat.filter(e => e.phase === 'Regular').reduce((t, e) => t + (num(e.bat[k]) || 0), 0);
  const ab = sum('AB'), h = sum('H');
  const bk = ['GP', 'PA', 'AB', 'H', 'AVG', 'OBP', 'OPS', 'HR', 'RBI', 'R', 'BB', 'SO', 'SB'], pk = ['GP', 'IP', 'W', 'L', 'SV', 'H', 'ER', 'BB', 'SO', 'ERA', 'WHIP'];
  const cur = statRows(data.settings.currentSeason).find(s => s.player === id);
  return `<section class="pf"><div class="wrap pf-in">
    <div class="pf-pic">${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}">` : `<img class="ghost" src="${esc(data.settings.logo)}" alt="">`}</div>
    <div class="pf-tx"><a class="back light" href="/roster/">← Roster</a><span class="pf-no">${esc(number || '')}</span><h1>${esc(p.name)}</h1><p>${[pos, p.bats ? 'Bats ' + p.bats : '', p.throws ? 'Throws ' + p.throws : ''].filter(Boolean).map(esc).join(' · ')}</p>
    ${cur && num(cur.bat?.PA) > 0 ? `<div class="pf-stats">${['AVG', 'OBP', 'RBI', 'R'].map(k => `<div><small>${k}</small><b>${esc(cur.bat[k] ?? '–')}</b></div>`).join('')}</div>` : ''}
    ${p.bio ? `<p class="pf-bio">${lines(p.bio)}</p>` : ''}</div>
  </div></section>
  <section class="wrap sec">
    ${bat.length ? `${secHead('Batting')}<div class="card"><div class="scroll"><table class="dt"><thead><tr><th>Season</th>${bk.map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>${bat.map(e => `<tr><td>${esc(seasonName(e.season) || e.season)}${e.phase === 'Playoffs' ? ' <em>PO</em>' : ''}</td>${bk.map(k => `<td>${esc(e.bat[k] ?? '–')}</td>`).join('')}</tr>`).join('')}${bat.filter(e => e.phase === 'Regular').length > 1 ? `<tr class="tot"><td>Career</td><td>${sum('GP')}</td><td>${sum('PA')}</td><td>${ab}</td><td>${h}</td><td>${ab ? (h / ab).toFixed(3).replace(/^0/, '') : '–'}</td><td>–</td><td>–</td><td>${sum('HR')}</td><td>${sum('RBI')}</td><td>${sum('R')}</td><td>${sum('BB')}</td><td>${sum('SO')}</td><td>${sum('SB')}</td></tr>` : ''}</tbody></table></div></div>` : ''}
    ${pit.length ? `${secHead('Pitching')}<div class="card"><div class="scroll"><table class="dt"><thead><tr><th>Season</th>${pk.map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>${pit.map(e => `<tr><td>${esc(seasonName(e.season) || e.season)}${e.phase === 'Playoffs' ? ' <em>PO</em>' : ''}</td>${pk.map(k => `<td>${esc(e.pitch[k] ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>` : ''}
    ${!bat.length && !pit.length ? empty('No stats yet', 'Season totals appear here after the team publishes them.') : ''}
  </section>`;
}

/* ---------- STATS ---------- */
function statsPage() {
  const hasPO = statRows(season, 'playoffs').length > 0; if (!hasPO) statsPhase = 'regular';
  const rows = statRows(season, statsPhase);
  const keys = statsTab === 'bat' ? ['GP', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'RBI', 'R', 'BB', 'SO', 'SB', 'AVG', 'OBP', 'SLG', 'OPS'] : statsTab === 'pitch' ? ['GP', 'IP', 'W', 'L', 'SV', 'H', 'R', 'ER', 'BB', 'SO', 'ERA', 'WHIP', 'BAA'] : ['TC', 'PO', 'A', 'E', 'FPCT', 'DP'];
  const shown = rows.filter(r => statsTab === 'bat' ? num(r.bat?.PA) > 0 : statsTab === 'pitch' ? outs(r.pitch?.IP) > 0 : num(r.fielding?.TC) > 0)
    .sort((a, b) => statsTab === 'pitch' ? outs(b.pitch.IP) - outs(a.pitch.IP) : statsTab === 'bat' ? (num(b.bat.AVG) || 0) - (num(a.bat.AVG) || 0) || num(b.bat.PA) - num(a.bat.PA) : num(b.fielding.TC) - num(a.fielding.TC));
  const lead = leaderList(season, statsPhase);
  const roster = rosterFor();
  return pageHead('Stats', seasonName(), true) + `<section class="wrap sec">
    ${lead.length ? `<div class="card leaders">${leaderCards(lead, 8)}</div><p class="note">Rate stats need ${lead[0].minPA}+ PA or ${lead[0].minIP}+ IP.</p>` : ''}
    <div class="seg-row">${hasPO ? `<div class="seg">${[['regular', 'Regular season'], ['playoffs', 'Playoffs']].map(([v, l]) => `<button type="button" data-phase="${v}" aria-pressed="${statsPhase === v}">${l}</button>`).join('')}</div>` : ''}<div class="seg">${[['bat', 'Batting'], ['pitch', 'Pitching'], ['fielding', 'Fielding']].map(([v, l]) => `<button type="button" data-stat="${v}" aria-pressed="${statsTab === v}">${l}</button>`).join('')}</div></div>
    ${shown.length ? `<div class="card"><div class="scroll"><table class="dt sticky"><thead><tr><th>Player</th>${keys.map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>${shown.map(r => { const ro = roster.find(x => x.p.id === r.player); return `<tr><td><a href="/roster/${esc(r.player)}/">${ro?.number ? `<em>#${esc(ro.number)}</em> ` : ''}${esc(player(r.player)?.name || 'Player')}</a></td>${keys.map(k => `<td>${esc(r[statsTab]?.[k] ?? '–')}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div></div>` : empty('No stats here yet', 'Totals appear after the team publishes them.')}
  </section>`;
}

/* ---------- AWARDS ---------- */
function awardsPage() {
  const list = awardsFor(season);
  return pageHead('Players of the Week', seasonName(), true) + `<section class="wrap sec">${list.length ? list.map(a => `<div class="aw-week"><div class="sec-h"><div><span class="lbl">${esc(a.weekLabel || '')}</span><h2>${esc(a.title || 'Players of the Week')}</h2></div>${a.date ? `<span class="note">${esc(fmtDate(a.date))}</span>` : ''}</div>${a.summary ? `<p class="note top">${lines(a.summary)}</p>` : ''}<div class="awards">${awardCard(a)}</div></div>`).join('') : empty('No winners yet this season', 'Weekly award winners will be featured here.')}</section>`;
}

/* ---------- MEDIA ---------- */
function mediaPage() {
  const ph = photos(), all = mediaFilter === 'all';
  const albums = [...new Set(ph.map(albumName))];
  const list = mediaFilter === 'all' ? ph : ph.filter(m => albumName(m) === mediaFilter);
  const vids = featured(videos());
  return pageHead('Photos & Video', 'Media') + `<section class="wrap sec">
    ${vids.length && all ? `${secHead('Video', more('/videos/', 'All videos'))}<div class="vid-grid">${vids.slice(0, 3).map(v => videoTile(v)).join('')}</div>` : ''}
    ${secHead('Photos')}
    ${albums.length > 1 ? `<div class="chips">${['all', ...albums].map(a => `<button type="button" class="chip" data-album="${esc(a)}" aria-pressed="${mediaFilter === a}">${esc(a === 'all' ? 'All photos' : a)}</button>`).join('')}</div>` : ''}
    ${list.length ? `<div class="ph-grid">${list.map(m => photoTile(m, 'page')).join('')}</div>${credits(list)}` : empty('No photos yet', 'Team photos will appear here.')}
    ${mediaAll().filter(m => m.category !== 'Video' && !m.image && safeUrl(m.link)).map(m => `<a class="card news" href="${esc(m.link)}" target="_blank" rel="noopener"><span class="lbl">${esc(m.category)}</span><b>${esc(m.title)}</b></a>`).join('')}
  </section>`;
}
function videosPage() {
  const v = featured(videos());
  return pageHead('Videos', 'Watch the Dodgers') + `<section class="wrap sec">${v.length ? `<div class="vid-grid">${v.map(x => videoTile(x)).join('')}</div>${credits(v)}` : empty('No videos yet', 'Highlights and team videos will appear here.')}${ext(data.settings.youtube || 'https://youtube.com/@JerseyDodgers', ICON.yt + ' Open our YouTube channel', 'btn ghost')}</section>`;
}

/* ---------- FORMS ---------- */
function form(type) {
  const sponsor = type === 'sponsor', name = sponsor ? 'sponsor-interest' : 'player-interest';
  const seasons = data.seasons.filter(s => s.status === 'active' || s.status === 'upcoming').map(s => s.name);
  const opts = seasons.length ? seasons : [seasonName(data.settings.currentSeason)];
  const contact = sponsor ? data.settings.contactEmail : (data.settings.applicationEmail || data.settings.contactEmail);
  return `<form class="pform" name="${name}" method="POST" data-netlify="true" netlify-honeypot="bot-field">
    <input type="hidden" name="form-name" value="${name}"><p class="honey"><label>Leave empty<input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
    <label><span>${sponsor ? 'Business or organization' : 'Player name'}</span><input id="${type}-name" name="name" required autocomplete="${sponsor ? 'organization' : 'name'}"></label>
    <label><span>Email</span><input id="${type}-email" type="email" name="email" required autocomplete="email"></label>
    <label><span>Phone</span><input id="${type}-phone" type="tel" name="phone" autocomplete="tel"></label>
    ${sponsor ? `<label><span>Website or Instagram (optional)</span><input id="${type}-website" name="website"></label><label class="wide"><span>How would you like to support the team?</span><textarea id="${type}-message" name="message" rows="4" required></textarea></label>`
      : `<label><span>Season</span><select id="${type}-season" name="season">${opts.map(o => `<option>${esc(o)}</option>`).join('')}</select></label><label><span>Primary position</span><input id="${type}-position" name="position" placeholder="SS, OF, P…"></label><label class="wide"><span>Instagram (optional)</span><input id="${type}-social" name="social" placeholder="@username"></label>`}
    <div class="wide form-foot"><button class="btn red" type="submit">${sponsor ? 'Send sponsor request' : 'Send application'}</button><p class="form-result" role="status"></p></div>
    ${contact ? `<p class="wide note">Prefer email? <span class="sel-text">${esc(contact)}</span></p>` : ''}
  </form>`;
}
function tryoutsPage() {
  const s = data.settings;
  return `<section class="try"><div class="wrap try-in"><div class="try-tx"><span class="lbl">${esc(joinSeasons())}</span><h1>${esc(toTitle(s.tryoutsTitle || 'Join the team'))}</h1><p>${lines(s.tryoutsText || '')}</p></div><div class="card pad">${form('join')}</div></div></section>`;
}
function openForm(type) {
  const s = data.settings, sponsor = type === 'sponsor';
  $('#dialog-content').innerHTML = `<span class="lbl">${sponsor ? 'Community partners' : 'Join the team'}</span><h2>${sponsor ? 'Become a sponsor' : 'Player interest'}</h2><p class="note">${lines(sponsor ? s.sponsorText : s.tryoutsText)}</p>${form(type)}`;
  $('#dialog').showModal();
}

function notFound(t, x) { return `<section class="wrap sec nf"><h1>${esc(t)}</h1><p>${esc(x)}</p><a class="btn blue" href="/">Back to home</a></section>`; }

/* ---------- lightbox ---------- */
function openPhoto(id, listName) {
  lightboxList = listName === 'champ' ? [{id: 'champ', image: data.settings.championshipImage, title: data.settings.championshipTitle}] : (listName === 'home' ? featured(photos()) : (mediaFilter === 'all' ? photos() : photos().filter(m => albumName(m) === mediaFilter)));
  lightboxIndex = Math.max(0, lightboxList.findIndex(m => m.id === id));
  showPhoto(); $('#lightbox').showModal();
}
function showPhoto() {
  const m = lightboxList[lightboxIndex]; if (!m) return;
  $('#lb-img').src = m.image; $('#lb-img').alt = m.title || '';
  $('#lb-cap').innerHTML = `<b>${esc(m.title || '')}</b>${m.photographerName && isTrue(m.showPhotographerCredit) ? `<span>Photo: ${m.photographerInstagram ? ext(m.photographerInstagram, esc(m.photographerName)) : esc(m.photographerName)}</span>` : ''}${lightboxList.length > 1 ? `<span>${lightboxIndex + 1} / ${lightboxList.length}</span>` : ''}`;
  $('#lb-prev').hidden = $('#lb-next').hidden = lightboxList.length < 2;
}

/* ---------- router ---------- */
function render() {
  const [route, id] = location.pathname.split('/').filter(Boolean);
  shell(route);
  let html;
  switch (route || '') {
    case '': html = home(); break;
    case 'schedule': html = schedulePage(false); break;
    case 'scores': html = schedulePage(true); break;
    case 'game': html = gamePage(id); break;
    case 'recaps': html = recapsPage(id); break;
    case 'standings': html = standingsPage(); break;
    case 'roster': html = rosterPage(id); break;
    case 'stats': html = statsPage(); break;
    case 'players-of-the-week': html = awardsPage(); break;
    case 'media': html = mediaPage(); break;
    case 'videos': html = videosPage(); break;
    case 'tryouts': html = tryoutsPage(); break;
    default: html = notFound('Page not found', 'Use the menu to get back to the clubhouse.');
  }
  $('#main').innerHTML = html;
  $('#main').classList.toggle('is-home', !route);
  const sel = $('#season-select');
  if (sel) sel.onchange = e => { season = e.target.value; const u = new URL(location.href); u.searchParams.set('season', season); history.replaceState({}, '', u); render(); };
  hydrateWeather(); tickCountdowns();
  try { document.title = pageInfo(location.href, data).title; } catch {}
}

document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="/"]');
  if (a && !a.target && !e.metaKey && !e.ctrlKey && !e.shiftKey && !a.closest('.ft-links a[href="/admin/"]') && !a.getAttribute('href').startsWith('/admin') && !a.getAttribute('href').startsWith('/api/')) {
    e.preventDefault(); closeDrawer();
    const url = new URL(a.href);
    if (url.pathname !== location.pathname || url.search !== location.search) {
      const keepSeason = ['schedule', 'scores', 'roster', 'stats', 'standings', 'players-of-the-week'].includes(url.pathname.split('/')[1]) && season !== data.settings.currentSeason;
      if (keepSeason && !url.searchParams.has('season')) url.searchParams.set('season', season);
      if (!keepSeason && !url.searchParams.has('season')) season = data.settings.currentSeason;
      history.pushState({}, '', url); mediaFilter = 'all'; render(); window.scrollTo(0, 0); $('#main').focus({preventScroll: true});
    }
    return;
  }
  const tab = e.target.closest('[data-box]');
  if (tab) { const card = tab.closest('.box-card'); card.querySelectorAll('[data-box]').forEach(t => t.setAttribute('aria-selected', t === tab)); card.querySelectorAll('[data-box-panel]').forEach(p => p.hidden = p.dataset.boxPanel !== tab.dataset.box); return; }
  const st = e.target.closest('[data-stat]'); if (st) { statsTab = st.dataset.stat; render(); return; }
  const ph = e.target.closest('[data-phase]'); if (ph) { statsPhase = ph.dataset.phase; render(); return; }
  const al = e.target.closest('[data-album]'); if (al) { mediaFilter = al.dataset.album; render(); return; }
  const p = e.target.closest('[data-photo]'); if (p) { openPhoto(p.dataset.photo, p.dataset.list); return; }
  if (e.target.closest('[data-champ]')) { openPhoto('champ', 'champ'); return; }
  const f = e.target.closest('[data-form]'); if (f) { openForm(f.dataset.form); return; }
});
window.addEventListener('popstate', () => { const sp = new URLSearchParams(location.search).get('season'); season = data.seasons.some(s => s.id === sp) ? sp : data.settings.currentSeason; render(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDrawer();
  if ($('#lightbox')?.open && lightboxList.length > 1) { if (e.key === 'ArrowRight') $('#lb-next').click(); if (e.key === 'ArrowLeft') $('#lb-prev').click(); }
});
document.addEventListener('submit', async e => {
  const fm = e.target.closest('.pform'); if (!fm) return;
  e.preventDefault();
  const btn = fm.querySelector('[type=submit]'), out = fm.querySelector('.form-result');
  btn.disabled = true; out.textContent = 'Sending…';
  try {
    const r = await fetch('/__forms.html', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(new FormData(fm)).toString()});
    if (!r.ok) throw Error();
    fm.reset(); out.textContent = 'Sent. The Jersey Dodgers will be in touch.';
  } catch { out.textContent = 'That didn’t go through. Check your connection and try again.'; }
  finally { btn.disabled = false; }
});
$('#lb-close').onclick = () => $('#lightbox').close();
$('#lb-prev').onclick = () => { lightboxIndex = (lightboxIndex - 1 + lightboxList.length) % lightboxList.length; showPhoto(); };
$('#lb-next').onclick = () => { lightboxIndex = (lightboxIndex + 1) % lightboxList.length; showPhoto(); };
$('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') $('#lightbox').close(); });
$('#dialog-close').onclick = () => $('#dialog').close();
setInterval(tickCountdowns, 30000);

if (/^#(invite_token|recovery_token|confirmation_token|access_token)=/.test(location.hash)) location.replace('/admin/' + location.hash);
else fetch('/api/content').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(d => {
  data = d;
  data.rosters ||= []; data.playoffStats ||= []; data.weeklyAwards ||= []; data.gameRecaps ||= [];
  const sp = new URLSearchParams(location.search).get('season');
  season = data.seasons.some(s => s.id === sp) ? sp : data.settings.currentSeason;
  render();
  document.documentElement.classList.add('ready');
}).catch(() => {
  $('#main').innerHTML = '<section class="wrap sec nf"><h1>The clubhouse is offline for a moment.</h1><p>Reload the page to try again.</p><button class="btn blue" type="button" onclick="location.reload()">Reload</button></section>';
});
