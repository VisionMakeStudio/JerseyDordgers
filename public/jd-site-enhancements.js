(() => {
  'use strict';

  const FRAME_RE = /\[\[JD_FRAME:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  const OLD_FOCUS_RE = /\[\[JD_FOCUS:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;

  let media = [];
  let mediaById = new Map();
  let rosterPlayers = [];

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

  function stripMarkers(value = '') {
    FRAME_RE.lastIndex = 0;
    OLD_FOCUS_RE.lastIndex = 0;
    const clean = String(value || '')
      .replace(FRAME_RE, '')
      .replace(OLD_FOCUS_RE, '')
      .trim();
    FRAME_RE.lastIndex = 0;
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

    if (video) buildDirectVideoStage(video);
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

  function latestVideoItems(limit = 3) {
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

  function installHomepageVideoSection() {
    const watch = document.querySelector('.watch-section');
    if (!watch) return;

    let section = document.querySelector('.jd-home-videos');

    const videos = latestVideoItems(3);

    if (!videos.length) {
      section?.remove();
      return;
    }

    if (!section) {
      section = document.createElement('section');
      section.className = 'jd-home-videos';
      watch.insertAdjacentElement('afterend', section);
    }

    const signature = videos.map(v => v.id).join('|');
    if (section.dataset.jdSignature === signature) return;
    section.dataset.jdSignature = signature;

    section.innerHTML = `
      <div class="section-head jd-video-section-head">
        <div>
          <span class="eyebrow">DODGERS MEDIA</span>
          <h2>LATEST VIDEOS</h2>
        </div>
        <a href="/videos/">All videos</a>
      </div>
      <div class="jd-home-video-grid"></div>
    `;

    const grid = section.querySelector('.jd-home-video-grid');
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
      photoButton.style.setProperty('--jd-media-bg', backgroundValue(item.image));

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

  function redesignRosterCards() {
    const route = location.pathname.split('/').filter(Boolean)[0] || '';
    if (route !== 'roster') return;

    document.querySelectorAll('.roster-grid .player-card').forEach(card => {
      if (card.dataset.jdRosterReady === '1') return;

      const href = card.getAttribute('href') || '';
      const playerId = href.match(/\/roster\/([^/]+)\//)?.[1];
      if (!playerId) return;

      const playerItem = window.__jdRosterPlayerMap?.get?.(playerId);
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

  function enhanceNow() {
    enhanceVideos();
    enhanceFeaturedPhotos();
    installHomepageVideoSection();
    cleanMediaPhotoCards();
    redesignRosterCards();
    fixLightbox();
  }

  function scheduleEnhance() {
    [0, 80, 180, 350, 650, 1100, 1800, 2800].forEach(delay => setTimeout(enhanceNow, delay));
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-photo]')) {
      setTimeout(fixLightbox, 0);
      setTimeout(fixLightbox, 80);
    }

    if (event.target.closest('[data-page]')) scheduleEnhance();
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
