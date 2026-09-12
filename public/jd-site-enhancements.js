(() => {
  'use strict';

  // Netlify Identity email links normally land on the project root.
  // Send admin invite/recovery tokens to the Admin page, whose core auth
  // flow already handles invite/recovery password creation.
  if (/(?:invite_token|recovery_token)=/i.test(location.hash || '')) {
    location.replace(`/admin.html${location.hash}`);
    return;
  }

  const FRAME_RE = /\[\[JD_FRAME:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  const VIDEO_FRAME_RE = /\[\[JD_VFRAME:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  const OLD_FOCUS_RE = /\[\[JD_FOCUS:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;

  let media = [];
  let mediaById = new Map();
  let rosterPlayers = [];
  let siteData = null;
  let statsPhase = sessionStorage.getItem('jd-stats-phase') || 'regular';
  let rosterPhase = sessionStorage.getItem('jd-roster-phase-public') === 'playoffs' ? 'playoffs' : 'regular';

  const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || min));

  function parseFrame(caption = '') {
    FRAME_RE.lastIndex = 0;
    let match = FRAME_RE.exec(String(caption || ''));
    FRAME_RE.lastIndex = 0;

    if (match) return {
      x: clamp(match[1], 0, 100),
      y: clamp(match[2], 0, 100),
      zoom: clamp(match[3], .85, 2.5)
    };

    OLD_FOCUS_RE.lastIndex = 0;
    match = OLD_FOCUS_RE.exec(String(caption || ''));
    OLD_FOCUS_RE.lastIndex = 0;

    if (match) return {
      x: clamp(match[1], 0, 100),
      y: clamp(match[2], 0, 100),
      zoom: 1
    };

    return { x: 50, y: 50, zoom: 1 };
  }

  function parseVideoFrame(caption = '') {
    VIDEO_FRAME_RE.lastIndex = 0;
    const match = VIDEO_FRAME_RE.exec(String(caption || ''));
    VIDEO_FRAME_RE.lastIndex = 0;

    if (match) return {
      x: clamp(match[1], 0, 100),
      y: clamp(match[2], 0, 100),
      zoom: clamp(match[3], 1, 4)
    };

    return { x: 50, y: 50, zoom: 1 };
  }

  function stripMarkers(value = '') {
    FRAME_RE.lastIndex = 0;
    VIDEO_FRAME_RE.lastIndex = 0;
    OLD_FOCUS_RE.lastIndex = 0;
    const clean = String(value || '')
      .replace(FRAME_RE, '')
      .replace(VIDEO_FRAME_RE, '')
      .replace(OLD_FOCUS_RE, '')
      .trim();
    FRAME_RE.lastIndex = 0;
    VIDEO_FRAME_RE.lastIndex = 0;
    OLD_FOCUS_RE.lastIndex = 0;
    return clean;
  }

  function youtubeId(url = '') {
    try {
      const u = new URL(url, location.href);
      if (u.hostname === 'youtu.be') return u.pathname.split('/')[1] || '';
      if (/(^|\.)youtube\.com$/i.test(u.hostname)) {
        if (u.pathname === '/watch') return u.searchParams.get('v') || '';
        return u.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/)?.[1] || '';
      }
    } catch {}
    return '';
  }

  function isShort(url = '') {
    try {
      return /^\/shorts\//.test(new URL(url, location.href).pathname);
    } catch {
      return false;
    }
  }


  function instagramInfo(url = '') {
    try {
      const u = new URL(url, location.href);
      if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
      const match = u.pathname.match(/^\/(reel|p|tv)\/([^/?#]+)/i);
      if (!match) return null;
      const type = match[1].toLowerCase();
      const code = match[2];
      return {
        type,
        code,
        portrait: type === 'reel' || type === 'tv',
        embed: `https://www.instagram.com/${type}/${encodeURIComponent(code)}/embed/`
      };
    } catch {
      return null;
    }
  }

  function makeInstagram(item) {
    const info = instagramInfo(item?.link || '');
    if (!info) return null;

    const wrap = document.createElement('div');
    wrap.className =
      `video-frame jd-instagram-frame ${info.portrait ? 'jd-video-frame-portrait' : 'jd-video-frame-instagram-post'}`;

    const frame = document.createElement('iframe');
    frame.src = info.embed;
    frame.title = item.title || 'Jersey Dodgers Instagram video';
    frame.loading = 'lazy';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.setAttribute('scrolling', 'no');
    frame.setAttribute('frameborder', '0');

    wrap.append(frame);
    return wrap;
  }

  function updateVideoGrid(grid) {
    if (!grid) return;
    grid.classList.add('jd-video-grid');
    grid.classList.remove('jd-video-grid-1', 'jd-video-grid-2', 'jd-video-grid-3plus');

    const cards = [...grid.children].filter(el => el.classList?.contains('media-card'));
    const count = cards.length;

    if (count <= 1) grid.classList.add('jd-video-grid-1');
    else if (count === 2) grid.classList.add('jd-video-grid-2');
    else grid.classList.add('jd-video-grid-3plus');
  }

  async function loadContent() {
    try {
      const response = await fetch('/api/content', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      siteData = data;
      media = data.media || [];
      mediaById = new Map(media.map(item => [String(item.id), item]));
      rosterPlayers = data.players || [];
      installRosterPlayerMap();
      window.__jdRosterPlayerMap = new Map(rosterPlayers.map(item => [String(item.id), item]));
      scheduleEnhance();
    } catch {}
  }

  function itemForCard(card) {
    const title = card.querySelector('.media-copy h3')?.textContent?.trim();
    if (!title) return null;
    return media.find(item => item.title === title) || null;
  }

  function makeVideo(src, poster = '') {
    const video = document.createElement('video');
    video.className = 'media-video';
    video.src = src;
    if (poster) video.poster = poster;
    video.controls = true;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    return video;
  }

  function makeYouTube(item) {
    const id = youtubeId(item?.link || '');
    if (!id) return null;

    const wrap = document.createElement('div');
    wrap.className = `video-frame ${isShort(item.link) ? 'jd-video-frame-portrait' : 'jd-video-frame-landscape'}`;

    const frame = document.createElement('iframe');
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      loop: '1',
      playlist: id,
      playsinline: '1',
      rel: '0'
    });

    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params}`;
    frame.title = item.title || 'Jersey Dodgers video';
    frame.loading = 'lazy';
    frame.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen = true;

    wrap.append(frame);
    return wrap;
  }


  function buildDirectVideoStage(video) {
    if (!(video instanceof HTMLVideoElement)) return null;

    const existing = video.closest('.jd-video-stage');
    if (existing) return existing;

    const stage = document.createElement('div');
    stage.className = 'jd-video-stage jd-direct-video-stage';

    const parent = video.parentNode;
    parent.insertBefore(stage, video);
    stage.append(video);

    video.classList.add('jd-video-main');

    const backdrop = video.cloneNode(false);
    backdrop.className = 'jd-video-backdrop';
    backdrop.removeAttribute('controls');
    backdrop.controls = false;
    backdrop.muted = true;
    backdrop.defaultMuted = true;
    backdrop.autoplay = true;
    backdrop.loop = true;
    backdrop.playsInline = true;
    backdrop.preload = 'metadata';
    backdrop.tabIndex = -1;
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('muted', '');
    backdrop.setAttribute('autoplay', '');
    backdrop.setAttribute('loop', '');
    backdrop.setAttribute('playsinline', '');

    stage.insertBefore(backdrop, video);

    const playBoth = () => {
      video.muted = true;
      backdrop.muted = true;
      video.play().catch(() => {});
      backdrop.play().catch(() => {});
    };

    video.addEventListener('play', () => {
      if (Math.abs((backdrop.currentTime || 0) - (video.currentTime || 0)) > .35) {
        try { backdrop.currentTime = video.currentTime; } catch {}
      }
      backdrop.play().catch(() => {});
    });

    video.addEventListener('pause', () => backdrop.pause());
    video.addEventListener('seeking', () => {
      try { backdrop.currentTime = video.currentTime; } catch {}
    });

    if (video.readyState >= 2) playBoth();
    else video.addEventListener('canplay', playBoth, { once: true });

    return stage;
  }


  function applyVideoFrame(stage, item) {
    if (!stage || !item) return;
    const frame = parseVideoFrame(item.caption || '');
    stage.classList.add('jd-video-framed');
    stage.style.setProperty('--jd-video-frame-zoom', frame.zoom);
    stage.style.setProperty('--jd-video-frame-x', `${frame.x}%`);
    stage.style.setProperty('--jd-video-frame-y', `${frame.y}%`);
  }

  function buildExternalVideoStage(frame) {
    if (!(frame instanceof HTMLElement)) return null;

    const existing = frame.closest('.jd-video-stage');
    if (existing) return existing;

    const stage = document.createElement('div');
    stage.className = 'jd-video-stage jd-external-video-stage';

    const parent = frame.parentNode;
    parent.insertBefore(stage, frame);
    stage.append(frame);

    return stage;
  }

  function ensurePlayer(card, item) {
    if (!item || item.category !== 'Video') return;

    const copy = card.querySelector('.media-copy');
    if (!copy) return;

    let video = card.querySelector('video.media-video');
    let frame = card.querySelector('.video-frame');

    // This fixes the exact empty Video card shown in the screenshot:
    // if the core renderer did not create a player, create it from the saved media item.
    if (!video && !frame) {
      if (item.video) {
        video = makeVideo(item.video, item.image || '');
        card.insertBefore(video, copy);
      } else {
        const direct = /\.(mp4|webm)(?:$|\?)/i.test(item.link || '');
        if (direct) {
          video = makeVideo(item.link, item.image || '');
          card.insertBefore(video, copy);
        } else {
          frame = makeYouTube(item) || makeInstagram(item);
          if (frame) card.insertBefore(frame, copy);
        }
      }
    }

    card.classList.add('jd-video-card');
    card.classList.add('jd-video-only');
    updateVideoGrid(card.closest('.media-grid'));

    if (video) {
      const stage = buildDirectVideoStage(video);
      applyVideoFrame(stage, item);
    }
    if (frame) buildExternalVideoStage(frame);

    if (frame?.classList.contains('jd-video-frame-portrait')) {
      card.classList.add('jd-video-portrait');
    } else if (frame?.classList.contains('jd-video-frame-landscape')) {
      card.classList.add('jd-video-landscape');
    } else if (frame?.classList.contains('jd-video-frame-instagram-post')) {
      card.classList.add('jd-video-instagram-post');
    }

    if (video) {
      video.muted = true;
      video.defaultMuted = true;
      video.autoplay = true;
      video.loop = true;
      video.playsInline = true;
      video.controls = true;

      const classify = () => {
        card.classList.remove('jd-video-portrait', 'jd-video-landscape', 'jd-video-square');
        if (!video.videoWidth || !video.videoHeight) return;
        const ratio = video.videoWidth / video.videoHeight;
        if (ratio < .8) card.classList.add('jd-video-portrait');
        else if (ratio > 1.2) card.classList.add('jd-video-landscape');
        else card.classList.add('jd-video-square');
        updateVideoGrid(card.closest('.media-grid'));
      };

      if (video.readyState >= 1) classify();
      else video.addEventListener('loadedmetadata', classify, { once: true });

      const play = () => {
        video.muted = true;
        video.play().catch(() => {});
      };

      if (video.readyState >= 2) play();
      else video.addEventListener('canplay', play, { once: true });
    }

    if (!video && !frame) {
      // Do not leave a mystery blank rectangle. This tells the admin exactly
      // why it is blank if a Video post was saved without an uploaded file/link.
      if (!card.querySelector('.jd-video-missing')) {
        const missing = document.createElement('div');
        missing.className = 'jd-video-missing';
        missing.innerHTML =
          '<strong>VIDEO NOT ATTACHED</strong><span>Edit this post in Admin and upload the MP4/WebM again, or add a YouTube / Instagram Reel link.</span>';
        card.insertBefore(missing, copy);
      }
    }
  }


  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[char]));
  }

  function photographerCreditMarkup(item) {
    if (!item?.showPhotographerCredit || (!item.photographerName && !item.photographerInstagram)) return '';

    const name = escapeHtml(item.photographerName || 'Photographer');
    const instagram = String(item.photographerInstagram || '').trim();

    const inside = `
      <span class="jd-photo-credit-icon" aria-hidden="true">◎</span>
      <span><small>PHOTOGRAPHY BY</small><strong>${name}</strong></span>
    `;

    return instagram
      ? `<a class="jd-photo-credit-compact" href="${escapeHtml(instagram)}" target="_blank" rel="noopener">${inside}</a>`
      : `<div class="jd-photo-credit-compact">${inside}</div>`;
  }

  function featuredVideoItems(limit = 3) {
    const featured = [...media]
      .filter(item => item?.category === 'Video' && item?.featured)
      .sort((a, b) => Number(a.featureOrder || 99) - Number(b.featureOrder || 99))
      .slice(0, limit);

    if (featured.length) return featured;

    return [...media]
      .filter(item => item?.category === 'Video')
      .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
      .slice(0, limit);
  }

  function makeHomepageVideoCard(item) {
    const card = document.createElement('article');
    card.className = 'media-card jd-video-card jd-video-only jd-home-video-card';

    const copy = document.createElement('div');
    copy.className = 'media-copy jd-video-copy-hidden';
    copy.innerHTML = `<h3>${escapeHtml(item.title || 'Jersey Dodgers video')}</h3>`;
    card.append(copy);

    ensurePlayer(card, item);
    return card;
  }

  function syncWatchFeaturedVideos() {
    // V6 temporarily created a second "Dodgers Media / Latest Videos" section.
    // Remove it permanently; the user wants only the clean row under Watch & Follow.
    document.querySelector('.jd-home-videos')?.remove();

    const watch = document.querySelector('.watch-section');
    if (!watch) return;

    const videos = featuredVideoItems(3);
    let grid = watch.querySelector('.latest-video-grid');

    if (!videos.length) {
      grid?.remove();
      return;
    }

    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'latest-video-grid';
      watch.append(grid);
    }

    const signature = videos.map(v => v.id).join('|');
    if (grid.dataset.jdSignature === signature && grid.dataset.jdFeaturedReady === '1') {
      updateVideoGrid(grid);
      return;
    }

    grid.dataset.jdSignature = signature;
    grid.dataset.jdFeaturedReady = '1';
    grid.replaceChildren();

    videos.forEach(item => grid.append(makeHomepageVideoCard(item)));
    updateVideoGrid(grid);
  }

  function cleanMediaPhotoCards() {
    const route = location.pathname.split('/').filter(Boolean)[0] || '';
    if (route !== 'media') return;

    document.querySelectorAll('.media-grid .media-card').forEach(card => {
      const title = card.querySelector('.media-copy h3')?.textContent?.trim();
      if (!title) return;

      const item = media.find(entry => entry.title === title);
      if (!item || item.category === 'Video') return;

      const photoButton = card.querySelector('.photo-button');
      if (!photoButton || !item.image) return;

      card.classList.add('jd-clean-photo-card');
      photoButton.classList.add('jd-framed-media-photo');
      photoButton.style.setProperty('--jd-media-bg', backgroundValue(item.image));

      const frame = parseFrame(item.caption || '');
      const mediaImage = photoButton.querySelector('img');
      if (mediaImage) {
        mediaImage.style.setProperty('--jd-frame-zoom', frame.zoom);
        mediaImage.style.setProperty('--jd-frame-x', `${frame.x}%`);
        mediaImage.style.setProperty('--jd-frame-y', `${frame.y}%`);
      }

      let credit = card.querySelector('.jd-photo-credit-compact');
      if (!credit) {
        const markup = photographerCreditMarkup(item);
        if (markup) {
          card.insertAdjacentHTML('beforeend', markup);
        }
      }

      card.querySelector('.media-copy')?.remove();
    });
  }


  function selectedSeasonId() {
    const requested = new URLSearchParams(location.search).get('season');
    if (requested && (siteData?.seasons || []).some(s => String(s.id) === String(requested))) return requested;
    return document.querySelector('#season-select')?.value || siteData?.settings?.currentSeason || '';
  }

  function selectedRosterPhase() {
    const requested = new URLSearchParams(location.search).get('phase');
    if (requested === 'playoffs' || requested === 'regular') return requested;
    return rosterPhase === 'playoffs' ? 'playoffs' : 'regular';
  }

  function seasonRosterPlayers(phase = selectedRosterPhase()) {
    if (!siteData) return [];

    const sid = selectedSeasonId();
    const playerMap = new Map((siteData.players || []).map(p => [String(p.id), p]));
    const sourceRows = phase === 'playoffs' ? (siteData.playoffRosters || []) : (siteData.rosters || []);
    const sourceStats = phase === 'playoffs' ? (siteData.playoffStats || []) : (siteData.stats || []);
    const allRosterRows = sourceRows.filter(r => r.season === sid);
    const explicit = allRosterRows.filter(r => r.active !== false);
    const represented = new Set(allRosterRows.map(r => String(r.player)));
    const roster = [];

    explicit.forEach(entry => {
      const playerItem = playerMap.get(String(entry.player));
      if (!playerItem) return;
      roster.push({
        ...playerItem,
        number: entry.number || playerItem.number || '',
        position: entry.position || playerItem.position || '',
        _seasonRoster: entry,
        _rosterPhase: phase
      });
    });

    // Player-by-player authority: an explicit roster row wins for that player.
    // Active rows show; inactive rows stay hidden. Players that have never been
    // explicitly managed for this season can still appear from legacy stats.
    const seen = new Set();
    sourceStats.filter(st => st.season === sid && !represented.has(String(st.player))).forEach(stat => {
      if (seen.has(String(stat.player))) return;
      seen.add(String(stat.player));
      const playerItem = playerMap.get(String(stat.player));
      if (playerItem) roster.push({...playerItem, _rosterPhase: phase});
    });

    const numberValue = value => {
      const match = String(value || '').match(/\d+/);
      return match ? Number(match[0]) : 9999;
    };

    const sorted = roster.sort((a, b) =>
      numberValue(a.number) - numberValue(b.number) ||
      String(a.name || '').localeCompare(String(b.name || ''))
    );

    window.__jdSeasonRosterMap = new Map(sorted.map(playerItem => [String(playerItem.id), playerItem]));
    return sorted;
  }

  function rebuildSeasonRoster() {
    const [route, id] = location.pathname.split('/').filter(Boolean);
    if (route !== 'roster' || id || !siteData) return;

    const wrap = document.querySelector('#main .wrap');
    if (!wrap) return;

    const headingNode = [...wrap.querySelectorAll('.section-head')]
      .find(node => /meet the dodgers/i.test(node.textContent || ''));
    if (!headingNode) return;

    const sid = selectedSeasonId();
    const hasPlayoffs = (siteData.playoffRosters || []).some(r => r.season === sid) ||
      (siteData.playoffStats || []).some(st => st.season === sid);

    let phaseTabs = wrap.querySelector('.jd-v11-roster-phase-tabs');
    if (hasPlayoffs) {
      if (!phaseTabs) {
        phaseTabs = document.createElement('div');
        phaseTabs.className = 'jd-v11-phase-tabs jd-v11-roster-phase-tabs';
        phaseTabs.innerHTML = '<button type="button" data-jd-roster-phase="regular">Regular season</button><button type="button" data-jd-roster-phase="playoffs">Playoffs</button>';
        headingNode.insertAdjacentElement('afterend', phaseTabs);
      }
    } else {
      phaseTabs?.remove();
      phaseTabs = null;
      rosterPhase = 'regular';
      sessionStorage.setItem('jd-roster-phase-public', 'regular');
    }

    const phase = hasPlayoffs ? selectedRosterPhase() : 'regular';
    rosterPhase = phase;
    phaseTabs?.querySelectorAll('[data-jd-roster-phase]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.jdRosterPhase === phase))
    );

    const roster = seasonRosterPlayers(phase);
    const signature = `${sid}|${phase}|${roster.map(p => p.id).join(',')}`;
    let grid = wrap.querySelector('.roster-grid');
    if (grid?.dataset.jdRosterSignature === signature) return;

    // Remove the core renderer's roster/empty/pagination after the heading.
    let next = headingNode.nextElementSibling;
    while (next) {
      const remove = next;
      next = next.nextElementSibling;
      if (
        remove.classList.contains('roster-grid') ||
        remove.classList.contains('pagination') ||
        remove.classList.contains('empty')
      ) remove.remove();
    }

    const anchor = phaseTabs || headingNode;
    if (!roster.length) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty';
      emptyState.innerHTML = `<h3>${phase === 'playoffs' ? 'Playoff roster not published' : 'Roster not published'}</h3><p>${phase === 'playoffs' ? 'Playoff players will appear here when the team publishes them.' : 'The team will announce this season’s roster here.'}</p>`;
      anchor.insertAdjacentElement('afterend', emptyState);
      return;
    }

    grid = document.createElement('div');
    grid.className = 'roster-grid';
    grid.dataset.jdRosterSignature = signature;

    roster.forEach(playerItem => {
      const card = document.createElement('a');
      card.className = 'player-card';
      card.href = `/roster/${encodeURIComponent(playerItem.id)}/?season=${encodeURIComponent(sid)}&phase=${encodeURIComponent(phase)}`;

      if (playerItem.photo) {
        const image = document.createElement('img');
        image.src = playerItem.photo;
        image.alt = playerItem.name || 'Jersey Dodgers player';
        image.loading = 'lazy';
        card.append(image);
      } else {
        const number = document.createElement('div');
        number.className = 'player-number';
        number.textContent = playerItem.number || '—';
        card.append(number);
      }

      const copy = document.createElement('div');
      copy.innerHTML = `
        <small>#${escapeHtml(playerItem.number || '')} ${escapeHtml(playerItem.position || '')}</small>
        <h3>${escapeHtml(playerItem.name || '')}</h3>
        <span>${phase === 'playoffs' ? 'Playoff profile' : 'Player profile'}</span>
      `;
      card.append(copy);
      grid.append(card);
    });

    anchor.insertAdjacentElement('afterend', grid);
  }

  function statNumber(value) {
    const n = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  function ipToOuts(value) {
    const raw = String(value ?? '0').trim();
    if (!raw || raw === '-') return 0;
    const [wholePart, fracPart = '0'] = raw.split('.');
    const whole = Number(wholePart) || 0;
    const frac = Math.max(0, Math.min(2, Number(fracPart[0]) || 0));
    return whole * 3 + frac;
  }

  function outsToIp(outs) {
    const safe = Math.max(0, Math.round(outs || 0));
    return `${Math.floor(safe / 3)}.${safe % 3}`;
  }

  function rate3(value) {
    if (!Number.isFinite(value)) return '-';
    const fixed = Math.max(0, value).toFixed(3);
    return fixed.startsWith('0.') ? fixed.slice(1) : fixed;
  }

  function totalKey(stats, group, key) {
    return stats.reduce((sum, item) => sum + statNumber(item?.[group]?.[key]), 0);
  }

  function aggregateStats(stats) {
    const bat = {};
    const pitch = {};
    const fielding = {};

    const batCountKeys = [
      'GP','PA','AB','H','1B','2B','3B','HR','RBI','R','BB','SO','HBP','SAC','SF',
      'ROE','FC','SB','CS','QAB','HHB','LOB','2OUTRBI','XBH','TB','PS','2S+3','6+',
      'GIDP','GITP','CI'
    ];
    batCountKeys.forEach(k => bat[k] = String(totalKey(stats, 'bat', k)));

    const ab = statNumber(bat.AB);
    const h = statNumber(bat.H);
    const bb = statNumber(bat.BB);
    const hbp = statNumber(bat.HBP);
    const sf = statNumber(bat.SF);
    const tb = statNumber(bat.TB) ||
      statNumber(bat['1B']) + 2 * statNumber(bat['2B']) + 3 * statNumber(bat['3B']) + 4 * statNumber(bat.HR);

    bat.TB = String(tb);
    bat.AVG = ab ? rate3(h / ab) : '-';
    const obpDen = ab + bb + hbp + sf;
    bat.OBP = obpDen ? rate3((h + bb + hbp) / obpDen) : '-';
    bat.SLG = ab ? rate3(tb / ab) : '-';
    bat.OPS = (bat.OBP !== '-' && bat.SLG !== '-')
      ? rate3(statNumber(bat.OBP) + statNumber(bat.SLG))
      : '-';

    const pitchCountKeys = ['GP','GS','BF','#P','W','L','SV','SVO','BS','H','R','ER','BB','SO','HBP','LOB','BK','PIK','CS','SB','WP','HR'];
    pitchCountKeys.forEach(k => pitch[k] = String(totalKey(stats, 'pitch', k)));

    const outs = stats.reduce((sum, item) => sum + ipToOuts(item?.pitch?.IP), 0);
    const innings = outs / 3;
    pitch.IP = outsToIp(outs);
    pitch.ERA = innings ? rate3((statNumber(pitch.ER) * 7) / innings) : '-';
    pitch.WHIP = innings ? rate3((statNumber(pitch.H) + statNumber(pitch.BB)) / innings) : '-';

    const fieldCountKeys = ['TC','A','PO','E','DP','TP','PB','SB','SBATT','CS','PIK','CI'];
    fieldCountKeys.forEach(k => fielding[k] = String(totalKey(stats, 'fielding', k)));
    fielding.INN = outsToIp(stats.reduce((sum, item) => sum + ipToOuts(item?.fielding?.INN), 0));
    const tc = statNumber(fielding.TC);
    fielding.FPCT = tc ? rate3((statNumber(fielding.A) + statNumber(fielding.PO)) / tc) : '-';

    return { bat, pitch, fielding };
  }

  function careerTable(playerItem, summary, group) {
    const keys = group === 'bat'
      ? ['GP','PA','AB','H','AVG','OBP','OPS','HR','RBI','R','SB']
      : group === 'pitch'
        ? ['IP','W','L','SV','H','ER','BB','SO','ERA','WHIP']
        : ['TC','PO','A','E','FPCT','DP'];

    return `
      <div class="table-scroll jd-career-table">
        <table>
          <thead><tr><th>PLAYER</th>${keys.map(k => `<th>${k}</th>`).join('')}</tr></thead>
          <tbody>
            <tr>
              <th>${escapeHtml(playerItem.name || '')}</th>
              ${keys.map(k => `<td>${escapeHtml(summary?.[group]?.[k] ?? '—')}</td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function enhanceCareerStats() {
    const [route, id] = location.pathname.split('/').filter(Boolean);
    if (route !== 'roster' || !id || !siteData) return;

    const profile = document.querySelector('.player-profile');
    if (!profile || document.querySelector('.jd-career-summary')) return;

    const playerItem = (siteData.players || []).find(p => String(p.id) === String(id));
    const regularStats = (siteData.stats || []).filter(s => String(s.player) === String(id));
    const playoffStats = (siteData.playoffStats || []).filter(s => String(s.player) === String(id));
    if (!playerItem || (!regularStats.length && !playoffStats.length)) return;

    const seasonById = new Map((siteData.seasons || []).map(s => [s.id, s]));
    const yearsFor = list => [...new Set(list.map(s => seasonById.get(s.season)?.name?.match(/\b(20\d{2})\b/)?.[1]).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));
    const regularYears = yearsFor(regularStats), playoffYears = yearsFor(playoffStats);

    const section = document.createElement('section');
    section.className = 'jd-career-summary';
    section.innerHTML = `
      <div class="section-head jd-career-head">
        <div><span class="eyebrow">PLAYER HISTORY</span><h2>Career stats</h2></div>
        <label class="jd-career-view">View<select>
          ${regularStats.length?'<option value="regular-career">Regular season · Career</option>':''}
          ${regularYears.map(year=>`<option value="regular-${year}">Regular season · ${year}</option>`).join('')}
          ${playoffStats.length?'<option value="playoffs-career">Playoffs · Career</option>':''}
          ${playoffYears.map(year=>`<option value="playoffs-${year}">Playoffs · ${year}</option>`).join('')}
        </select></label>
      </div><div class="jd-career-content"></div>`;

    profile.insertAdjacentElement('afterend', section);
    const select=section.querySelector('select'),content=section.querySelector('.jd-career-content');
    const paint=()=>{
      const [phase,year]=String(select.value).split('-'),base=phase==='playoffs'?playoffStats:regularStats;
      const chosen=year==='career'?base:base.filter(s=>seasonById.get(s.season)?.name?.includes(year));
      const total=aggregateStats(chosen),hasPitch=chosen.some(s=>ipToOuts(s?.pitch?.IP)>0),hasField=chosen.some(s=>Object.values(s?.fielding||{}).some(v=>statNumber(v)>0));
      content.innerHTML=`<div class="jd-career-label"><strong>${phase==='playoffs'?'PLAYOFFS':'REGULAR SEASON'} · ${year==='career'?'CAREER TOTAL':escapeHtml(year)+' TOTAL'}</strong><span>${chosen.length} season${chosen.length===1?'':'s'}</span></div>${careerTable(playerItem,total,'bat')}${hasPitch?careerTable(playerItem,total,'pitch'):''}${hasField?careerTable(playerItem,total,'fielding'):''}`;
    };
    select.addEventListener('change',paint);paint();
  }

  function seasonRosterNumber(playerId, phase='regular'){
    const sid=selectedSeasonId(),rows=phase==='playoffs'?(siteData?.playoffRosters||[]):(siteData?.rosters||[]),row=rows.find(r=>r.season===sid&&String(r.player)===String(playerId)&&r.active!==false),p=(siteData?.players||[]).find(p=>String(p.id)===String(playerId));
    return row?.number||p?.number||'—';
  }
  function visibleStatsForPhase(phase='regular'){
    const sid=selectedSeasonId(),rosterRows=(phase==='playoffs'?(siteData?.playoffRosters||[]):(siteData?.rosters||[])).filter(r=>r.season===sid),statsRows=(phase==='playoffs'?(siteData?.playoffStats||[]):(siteData?.stats||[])).filter(st=>st.season===sid);
    if(!rosterRows.length)return statsRows;
    const represented=new Set(rosterRows.map(r=>String(r.player))),activeIds=new Set(rosterRows.filter(r=>r.active!==false).map(r=>String(r.player)));
    return statsRows.filter(st=>activeIds.has(String(st.player))||!represented.has(String(st.player)));
  }
  function statsGames(items,phase){
    const gp=Math.max(0,...items.map(s=>statNumber(s?.bat?.GP||s?.pitch?.GP||0)));
    if(phase==='playoffs')return gp;
    const finals=(siteData?.games||[]).filter(g=>g.season===selectedSeasonId()&&g.status==='final').length;
    return Math.max(finals,gp);
  }
  function qualification(items,phase){
    const games=statsGames(items,phase);
    return {games,minPA:Math.max(phase==='playoffs'?4:8,Math.ceil(games*2)),minIP:Math.max(3,Math.ceil(games*.75))};
  }
  function leaderPhotoMarkup(playerItem,phase='regular'){
    if(playerItem?.photo)return `<span class="jd-leader-visual"><img src="${escapeHtml(playerItem.photo)}" alt="${escapeHtml(playerItem.name||'Player')}" loading="lazy"></span>`;
    return `<span class="jd-leader-visual"><span class="jd-leader-number">#${escapeHtml(seasonRosterNumber(playerItem?.id,phase))}</span></span>`;
  }
  function leaderGridMarkup(items,group='bat',phase='regular'){
    const configs=group==='pitch'?[['ERA','EARNED RUN AVG',true,'rate'],['SO','STRIKEOUTS',false,'count'],['W','WINS',false,'count'],['WHIP','WHIP',true,'rate']]:[['AVG','BATTING AVERAGE',false,'rate'],['HR','HOME RUNS',false,'count'],['RBI','RUNS BATTED IN',false,'count'],['SB','STOLEN BASES',false,'count']],q=qualification(items,phase);
    if(!items.length)return '<div class="empty"><h3>Season leaders coming soon</h3><p>No statistics have been published for this stats set yet.</p></div>';
    const cards=configs.map(([key,label,low,type])=>{
      let list=items.filter(s=>s?.[group]?.[key]!==undefined&&s[group][key]!==''&&s[group][key]!=='-');
      if(group==='pitch')list=list.filter(s=>ipToOuts(s?.pitch?.IP)>0);
      if(type==='rate'&&group==='bat')list=list.filter(s=>statNumber(s?.bat?.PA||s?.bat?.AB)>=q.minPA);
      if(type==='rate'&&group==='pitch')list=list.filter(s=>ipToOuts(s?.pitch?.IP)/3>=q.minIP);
      if(!list.length){const rule=group==='bat'?`${q.minPA} PA minimum`:`${q.minIP} IP minimum`;return `<article class="jd-v11-leader-card is-empty"><div class="jd-leader-copy"><span>${label}</span><b>No qualified leader yet</b><small>${type==='rate'?rule:'No data yet'}</small></div></article>`}
      const values=list.map(s=>Number(s[group][key])).filter(Number.isFinite);if(!values.length)return'';const best=(low?Math.min:Math.max)(...values),wins=list.filter(s=>Number(s[group][key])===best),first=wins[0],p=(siteData.players||[]).find(x=>String(x.id)===String(first.player));
      return `<article class="jd-v11-leader-card">${leaderPhotoMarkup(p,phase)}<div class="jd-leader-copy"><span>${label}${wins.length>1?' · TIED':''}</span><b>${escapeHtml(first[group][key])}</b><a href="/roster/${encodeURIComponent(first.player)}/?season=${encodeURIComponent(selectedSeasonId())}&phase=${encodeURIComponent(phase)}">${escapeHtml(p?.name||'Player')}</a><small>${group==='pitch'?escapeHtml(first.pitch.IP||'0')+' IP':escapeHtml(first.bat.PA||first.bat.AB||'0')+' PA'}${wins.length>1?` · +${wins.length-1} tied`:''}</small></div></article>`;
    }).join('');
    return `<div class="jd-v11-leader-grid">${cards}</div><p class="jd-v11-leader-note">Rate-stat qualification: ${group==='bat'?`${q.minPA} plate appearances`:`${q.minIP} innings`} for this ${phase==='playoffs'?'playoff':'regular-season'} sample. Counting-stat leaders do not require a minimum.</p>`;
  }
  function statsTableMarkup(items,group,phase='regular'){
    const keys=group==='bat'?['GP','PA','AB','H','AVG','OBP','OPS','HR','RBI','R','SB']:group==='pitch'?['IP','W','L','SV','H','ER','BB','SO','ERA','WHIP']:['TC','PO','A','E','FPCT','DP'];
    return `<div class="table-scroll"><table><thead><tr><th>PLAYER</th>${keys.map(k=>`<th>${k}</th>`).join('')}</tr></thead><tbody>${items.map(st=>{const p=(siteData.players||[]).find(x=>String(x.id)===String(st.player));return`<tr><th><a href="/roster/${encodeURIComponent(st.player)}/?season=${encodeURIComponent(selectedSeasonId())}&phase=${encodeURIComponent(phase)}">${escapeHtml(p?.name||'Player')}</a></th>${keys.map(k=>`<td>${escapeHtml(st?.[group]?.[k]??'—')}</td>`).join('')}</tr>`}).join('')}</tbody></table></div>`;
  }
  function currentStatsGroup(){return document.querySelector('[data-stats][aria-pressed="true"]')?.dataset?.stats||'bat'}
  function enhanceStatsCenter(){
    const route=location.pathname.split('/').filter(Boolean)[0]||'';if(route!=='stats'||!siteData)return;const wrap=document.querySelector('#main .wrap'),tabs=wrap?.querySelector('.tabs');if(!wrap||!tabs)return;
    let phaseTabs=wrap.querySelector('.jd-v11-phase-tabs');if(!phaseTabs){phaseTabs=document.createElement('div');phaseTabs.className='jd-v11-phase-tabs';phaseTabs.innerHTML='<button type="button" data-jd-phase="regular">Regular season</button><button type="button" data-jd-phase="playoffs">Playoffs</button>';tabs.insertAdjacentElement('beforebegin',phaseTabs)}
    phaseTabs.querySelectorAll('[data-jd-phase]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.jdPhase===statsPhase)));
    wrap.querySelectorAll(':scope > .leader-grid,:scope > .note,:scope > .table-scroll,:scope > .empty,:scope > .jd-v11-stats-content').forEach(n=>n.remove());
    const group=currentStatsGroup(),items=visibleStatsForPhase(statsPhase),content=document.createElement('div');content.className='jd-v11-stats-content';content.innerHTML=`<div class="jd-v11-phase-label"><strong>${statsPhase==='playoffs'?'PLAYOFFS':'REGULAR SEASON'}</strong><span>${items.length} player stat line${items.length===1?'':'s'}</span></div>${items.length?(group!=='fielding'?leaderGridMarkup(items,group,statsPhase):'')+statsTableMarkup(items,group,statsPhase):'<div class="empty"><h3>Stats coming soon</h3><p>No '+(statsPhase==='playoffs'?'playoff':'regular-season')+' totals are saved for this season yet.</p></div>'}`;tabs.insertAdjacentElement('afterend',content);
  }
  function enhanceHomeLeaders(){
    const route=location.pathname.split('/').filter(Boolean)[0]||'';if(route||!siteData)return;const head=[...document.querySelectorAll('#main .section-head')].find(h=>/team leaders/i.test(h.querySelector('h2')?.textContent||''));const section=head?.parentElement;if(!section)return;section.querySelectorAll(':scope > .leader-grid,:scope > .note,:scope > .jd-v11-leader-grid,:scope > .jd-v11-leader-note,:scope > .empty').forEach(n=>n.remove());const items=visibleStatsForPhase('regular');section.insertAdjacentHTML('beforeend',leaderGridMarkup(items,'bat','regular'));
  }

  function redesignRosterCards() {
    const route = location.pathname.split('/').filter(Boolean)[0] || '';
    if (route !== 'roster') return;

    document.querySelectorAll('.roster-grid .player-card').forEach(card => {
      if (card.dataset.jdRosterReady === '1') return;

      const href = card.getAttribute('href') || '';
      const playerId = href.match(/\/roster\/([^/]+)\//)?.[1];
      if (!playerId) return;

      const playerItem = window.__jdSeasonRosterMap?.get?.(playerId) || window.__jdRosterPlayerMap?.get?.(playerId);
      if (!playerItem) return;

      card.dataset.jdRosterReady = '1';
      card.classList.add('jd-player-card');

      const existingImage = card.querySelector(':scope > img');
      const existingNumber = card.querySelector(':scope > .player-number');

      const imageWrap = document.createElement('div');
      imageWrap.className = 'jd-player-image';

      if (existingImage) {
        existingImage.remove();
        imageWrap.append(existingImage);
        existingImage.classList.add('jd-player-photo');
      } else if (existingNumber) {
        existingNumber.remove();
        existingNumber.classList.add('jd-player-placeholder');
        imageWrap.append(existingNumber);
      }

      const existingInfo = card.querySelector(':scope > div:last-child');
      existingInfo?.remove();

      const info = document.createElement('div');
      info.className = 'jd-player-info';

      const giant = document.createElement('span');
      giant.className = 'jd-player-number-bg';
      giant.textContent = playerItem.number || '';

      const text = document.createElement('div');
      text.className = 'jd-player-text';

      const top = document.createElement('div');
      top.className = 'jd-player-name-line';

      const name = document.createElement('strong');
      name.className = 'jd-player-name';
      name.textContent = playerItem.name || '';

      const meta = document.createElement('span');
      meta.className = 'jd-player-meta';
      meta.textContent =
        `${playerItem.number ? '#' + playerItem.number : ''}${playerItem.position ? ' · ' + playerItem.position : ''}`;

      top.append(name, meta);

      const profile = document.createElement('span');
      profile.className = 'jd-player-profile-link';
      profile.textContent = 'View profile →';

      text.append(top, profile);
      info.append(giant, text);

      card.append(imageWrap, info);
    });
  }

  function installRosterPlayerMap() {
    if (!window.__jdRosterPlayerMap) {
      window.__jdRosterPlayerMap = new Map();
    }
  }

  function enhanceVideos() {
    document.querySelectorAll('.media-card').forEach(card => {
      const item = itemForCard(card);
      if (item?.category === 'Video') {
        ensurePlayer(card, item);
        card.querySelector('.media-copy')?.classList.add('jd-video-copy-hidden');
      }

      const caption = card.querySelector('.media-copy p');
      if (caption) caption.innerHTML = stripMarkers(caption.innerHTML);
    });
  }

  function backgroundValue(url) {
    return `url("${String(url || '').replace(/"/g, '\\"')}")`;
  }

  function enhanceFeaturedPhotos() {
    document.querySelectorAll('.clubhouse-photo[data-photo]').forEach(button => {
      const item = mediaById.get(String(button.dataset.photo || ''));
      const image = button.querySelector('img');
      if (!image || !item) return;

      const frame = parseFrame(item.caption || '');

      button.classList.add('jd-framed-photo');
      button.style.setProperty('--jd-photo-bg', backgroundValue(item.image));
      image.style.setProperty('--jd-frame-zoom', frame.zoom);
      image.style.setProperty('--jd-frame-x', `${frame.x}%`);
      image.style.setProperty('--jd-frame-y', `${frame.y}%`);
    });
  }

  function fixLightbox() {
    const image = document.querySelector('#lightbox-content > img');
    if (!image) return;

    image.style.width = 'auto';
    image.style.height = 'auto';
    image.style.maxWidth = '100%';
    image.style.maxHeight = '78vh';
    image.style.objectFit = 'contain';
    image.style.objectPosition = 'center center';
    image.style.transform = 'none';
  }


  function seasonYearFromName(name = '') {
    return Number(String(name).match(/\b(20\d{2})\b/)?.[1] || 0);
  }

  function seasonTermOrder(name = '') {
    if (/fall/i.test(name)) return 3;
    if (/summer/i.test(name)) return 2;
    if (/spring/i.test(name)) return 1;
    return 0;
  }

  function organizedPublicSeasons() {
    if (!siteData) return [];
    const seasons = [...(siteData.seasons || [])];
    const specificYears = new Set(
      seasons
        .filter(s => /(spring|fall|summer|winter)/i.test(s.name || ''))
        .map(s => seasonYearFromName(s.name))
        .filter(Boolean)
    );

    return seasons
      .filter(s => !(/history/i.test(s.name || '') && specificYears.has(seasonYearFromName(s.name))))
      .sort((a, b) =>
        seasonYearFromName(b.name) - seasonYearFromName(a.name) ||
        seasonTermOrder(b.name) - seasonTermOrder(a.name) ||
        String(b.name).localeCompare(String(a.name))
      );
  }

  function organizeSeasonSelector() {
    const select = document.querySelector('#season-select');
    if (!select || !siteData) return;

    const selected = selectedSeasonId();
    const signature = `${selected}|${(siteData.seasons || []).map(s => s.id + ':' + s.name).join('|')}`;
    if (select.dataset.jdGrouped === signature) return;

    const groups = new Map();
    organizedPublicSeasons().forEach(season => {
      const year = seasonYearFromName(season.name) || 'Other';
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year).push(season);
    });

    select.innerHTML = '';
    for (const [year, items] of groups) {
      const group = document.createElement('optgroup');
      group.label = String(year);
      items.forEach(season => {
        const option = document.createElement('option');
        option.value = season.id;
        option.textContent = season.name;
        option.selected = season.id === selected;
        group.append(option);
      });
      select.append(group);
    }

    select.dataset.jdGrouped = signature;
  }

  function applySeasonProfileIdentity() {
    const [route, id] = location.pathname.split('/').filter(Boolean);
    if (route !== 'roster' || !id || !siteData) return;

    const sid = selectedSeasonId();
    const requestedPhase = new URLSearchParams(location.search).get('phase');
    const phase = requestedPhase === 'playoffs' ? 'playoffs' : 'regular';
    const player = (siteData.players || []).find(p => String(p.id) === String(id));
    if (!player) return;

    const rows = phase === 'playoffs' ? (siteData.playoffRosters || []) : (siteData.rosters || []);
    const roster = rows.find(r =>
      r.season === sid &&
      String(r.player) === String(id) &&
      r.active !== false
    );

    if (!roster) return;

    const profile = document.querySelector('.player-profile');
    const copy = profile?.querySelector(':scope > div:last-child');
    const eyebrow = copy?.querySelector('.eyebrow');
    const paragraph = copy?.querySelector('p');
    const seasonName = siteData.seasons?.find(s => s.id === sid)?.name || '';

    if (eyebrow) eyebrow.textContent = `JERSEY DODGERS · #${roster.number || player.number || ''} · ${seasonName}${phase === 'playoffs' ? ' · PLAYOFFS' : ''}`;
    if (paragraph) {
      const extras = `${player.bats ? ' · Bats ' + player.bats : ''}${player.throws ? ' · Throws ' + player.throws : ''}`;
      paragraph.textContent = `${roster.position || player.position || ''}${extras}`;
    }

    const numberPlaceholder = profile?.querySelector('.player-number');
    if (numberPlaceholder) numberPlaceholder.textContent = roster.number || player.number || '';
  }

  function enhanceNow() {
    enhanceVideos();
    enhanceFeaturedPhotos();
    syncWatchFeaturedVideos();
    cleanMediaPhotoCards();
    organizeSeasonSelector();
    rebuildSeasonRoster();
    redesignRosterCards();
    applySeasonProfileIdentity();
    enhanceCareerStats();
    enhanceStatsCenter();
    enhanceHomeLeaders();
    fixLightbox();
  }

  let enhanceQueued = false;
  function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => {
      enhanceQueued = false;
      enhanceNow();
    });
  }

  document.addEventListener('jd-site-render', scheduleEnhance);

  document.addEventListener('click', event => {
    if (event.target.closest('[data-photo]')) {
      setTimeout(fixLightbox, 0);
      setTimeout(fixLightbox, 80);
    }

    if (event.target.closest('[data-page]')) scheduleEnhance();
    if (event.target.closest('[data-stats]')) scheduleEnhance();
    const phaseButton = event.target.closest('[data-jd-phase]');
    if (phaseButton) {
      statsPhase = phaseButton.dataset.jdPhase === 'playoffs' ? 'playoffs' : 'regular';
      sessionStorage.setItem('jd-stats-phase', statsPhase);
      enhanceStatsCenter();
    }
    const rosterPhaseButton = event.target.closest('[data-jd-roster-phase]');
    if (rosterPhaseButton) {
      rosterPhase = rosterPhaseButton.dataset.jdRosterPhase === 'playoffs' ? 'playoffs' : 'regular';
      sessionStorage.setItem('jd-roster-phase-public', rosterPhase);
      const url = new URL(location.href);
      url.searchParams.set('phase', rosterPhase);
      history.replaceState({}, '', url.pathname + '?' + url.searchParams.toString());
      rebuildSeasonRoster();
      redesignRosterCards();
    }
  });

  document.addEventListener('change', event => {
    if (event.target.matches('#season-select')) scheduleEnhance();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    document.querySelectorAll('video.media-video').forEach(video => {
      video.muted = true;
      video.play().catch(() => {});
    });
  });

  loadContent();
  scheduleEnhance();
})();
