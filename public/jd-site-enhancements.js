(() => {
  'use strict';

  const FOCUS_RE = /\[\[JD_FOCUS:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  let media = [];
  let mediaById = new Map();

  const clamp = n => Math.max(0, Math.min(100, Number(n) || 50));

  function parseFocus(caption = '') {
    FOCUS_RE.lastIndex = 0;
    const match = FOCUS_RE.exec(String(caption || ''));
    FOCUS_RE.lastIndex = 0;
    return match ? { x: clamp(match[1]), y: clamp(match[2]) } : { x: 50, y: 50 };
  }

  function stripFocusMarker(html = '') {
    FOCUS_RE.lastIndex = 0;
    const clean = String(html || '').replace(FOCUS_RE, '').trim();
    FOCUS_RE.lastIndex = 0;
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

  function isYouTubeShort(url = '') {
    try {
      const u = new URL(url, location.href);
      return /(^|\.)youtube\.com$/i.test(u.hostname) && /^\/shorts\//.test(u.pathname);
    } catch {
      return false;
    }
  }

  async function loadContent() {
    try {
      const response = await fetch('/api/content');
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

  function setupDirectVideo(video, item) {
    if (!(video instanceof HTMLVideoElement)) return;

    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.controls = true;
    video.preload = 'metadata';

    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');

    const card = video.closest('.media-card');
    card?.classList.add('jd-video-card');

    const classify = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      card?.classList.remove('jd-video-portrait', 'jd-video-landscape', 'jd-video-square');
      const ratio = video.videoWidth / video.videoHeight;
      if (ratio < 0.8) card?.classList.add('jd-video-portrait');
      else if (ratio > 1.2) card?.classList.add('jd-video-landscape');
      else card?.classList.add('jd-video-square');
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

  function setupYouTube(frame, item) {
    if (!(frame instanceof HTMLIFrameElement)) return;
    if (frame.dataset.jdPrepared === '1') return;

    const card = frame.closest('.media-card');
    const wrapper = frame.closest('.video-frame');
    card?.classList.add('jd-video-card');

    const id = youtubeId(item?.link || '') || (() => {
      try {
        return new URL(frame.src).pathname.match(/\/embed\/([^/?]+)/)?.[1] || '';
      } catch {
        return '';
      }
    })();

    if (isYouTubeShort(item?.link || '')) {
      card?.classList.add('jd-video-portrait');
      wrapper?.classList.add('jd-video-frame-portrait');
    } else {
      card?.classList.add('jd-video-landscape');
      wrapper?.classList.add('jd-video-frame-landscape');
    }

    if (!id) return;

    try {
      const url = new URL(frame.src, location.href);
      url.searchParams.set('autoplay', '1');
      url.searchParams.set('mute', '1');
      url.searchParams.set('loop', '1');
      url.searchParams.set('playlist', id);
      url.searchParams.set('playsinline', '1');
      url.searchParams.set('rel', '0');
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.dataset.jdPrepared = '1';
      frame.src = url.toString();
    } catch {}
  }

  function enhanceVideos() {
    document.querySelectorAll('.media-card').forEach(card => {
      const item = itemForCard(card);
      const video = card.querySelector('video.media-video');
      const frame = card.querySelector('.video-frame iframe');

      if (video) setupDirectVideo(video, item);
      if (frame) setupYouTube(frame, item);

      // Keep the framing marker invisible if it was stored in the caption.
      const caption = card.querySelector('.media-copy p');
      if (caption) caption.innerHTML = stripFocusMarker(caption.innerHTML);
    });
  }

  function enhanceFeaturedPhotos() {
    document.querySelectorAll('.clubhouse-photo[data-photo]').forEach(button => {
      const item = mediaById.get(String(button.dataset.photo || ''));
      const image = button.querySelector('img');
      if (!image || !item) return;
      const focus = parseFocus(item.caption || '');
      image.style.objectPosition = `${focus.x}% ${focus.y}%`;
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
  }

  function enhanceNow() {
    enhanceVideos();
    enhanceFeaturedPhotos();
    fixLightbox();
  }

  // The site's main module renders asynchronously. Use a short, bounded retry
  // window rather than an endless DOM observer.
  function scheduleEnhance() {
    [0, 100, 250, 500, 900, 1500, 2500].forEach(delay => setTimeout(enhanceNow, delay));
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
