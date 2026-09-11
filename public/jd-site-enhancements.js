(() => {
  const FOCUS_RE = /\[\[JD_FOCUS:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  let mediaById = new Map();
  let contentLoaded = false;

  const clamp = value => Math.max(0, Math.min(100, Number(value) || 50));

  function readFocus(caption = '') {
    FOCUS_RE.lastIndex = 0;
    const match = FOCUS_RE.exec(String(caption || ''));
    FOCUS_RE.lastIndex = 0;
    return match ? { x: clamp(match[1]), y: clamp(match[2]) } : { x: 50, y: 50 };
  }

  function cleanCaption(value = '') {
    FOCUS_RE.lastIndex = 0;
    const cleaned = String(value || '').replace(FOCUS_RE, '').replace(/\n{3,}/g, '\n\n').trim();
    FOCUS_RE.lastIndex = 0;
    return cleaned;
  }

  async function loadContent() {
    try {
      const response = await fetch('/api/content', { credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      mediaById = new Map((data.media || []).map(item => [String(item.id), item]));
      contentLoaded = true;
      enhancePage(document);
    } catch {}
  }

  function prepDirectVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.controls = true;
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    const tryPlay = () => {
      video.muted = true;
      video.play().catch(() => {});
    };
    if (video.readyState >= 2) tryPlay();
    else video.addEventListener('canplay', tryPlay, { once: true });
  }

  function prepYouTube(frame) {
    if (!(frame instanceof HTMLIFrameElement) || frame.dataset.jdEnhanced === '1') return;
    try {
      const url = new URL(frame.src, location.href);
      if (!/(^|\.)youtube-nocookie\.com$|(^|\.)youtube\.com$/i.test(url.hostname)) return;
      const id = url.pathname.match(/\/embed\/([^/?]+)/)?.[1];
      if (!id) return;
      url.searchParams.set('autoplay', '1');
      url.searchParams.set('mute', '1');
      url.searchParams.set('loop', '1');
      url.searchParams.set('playlist', id);
      url.searchParams.set('playsinline', '1');
      url.searchParams.set('rel', '0');
      frame.dataset.jdEnhanced = '1';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.src = url.toString();
    } catch {}
  }

  function enhanceFeaturedPhoto(button) {
    const id = String(button.dataset.photo || '');
    const image = button.querySelector('img');
    if (!image || !id) return;
    const item = mediaById.get(id);
    const focus = readFocus(item?.caption || '');
    image.style.objectPosition = `${focus.x}% ${focus.y}%`;
  }

  function stripVisibleFocusTokens(root) {
    root.querySelectorAll?.('.media-copy p').forEach(p => {
      const cleaned = cleanCaption(p.textContent || '');
      if (p.textContent !== cleaned) p.textContent = cleaned;
    });
  }

  function enhanceLightbox(root) {
    const image = root.querySelector?.('#lightbox-content > img');
    if (!image) return;
    image.style.objectPosition = 'center center';
  }

  function enhancePage(root) {
    root.querySelectorAll?.('video.media-video').forEach(prepDirectVideo);
    root.querySelectorAll?.('.video-frame iframe').forEach(prepYouTube);
    if (contentLoaded) root.querySelectorAll?.('.clubhouse-photo[data-photo]').forEach(enhanceFeaturedPhoto);
    stripVisibleFocusTokens(root);
    enhanceLightbox(root);
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('video.media-video')) prepDirectVideo(node);
        if (node.matches?.('.video-frame iframe')) prepYouTube(node);
        enhancePage(node);
      }
    }
  });

  const start = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    enhancePage(document);
    loadContent();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    document.querySelectorAll('video.media-video').forEach(video => {
      video.muted = true;
      video.play().catch(() => {});
    });
  });
})();
