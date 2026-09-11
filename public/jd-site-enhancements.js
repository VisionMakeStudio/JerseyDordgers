(() => {
  'use strict';

  const FRAME_RE = /\[\[JD_FRAME:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  const OLD_FOCUS_RE = /\[\[JD_FOCUS:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;

  let media = [];
  let mediaById = new Map();

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
