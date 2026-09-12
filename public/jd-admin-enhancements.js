(() => {
  'use strict';

  const FRAME_RE = /\[\[JD_FRAME:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  const VIDEO_FRAME_RE = /\[\[JD_VFRAME:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  const OLD_FOCUS_RE = /\[\[JD_FOCUS:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
  const CHUNK_BYTES = 3.5 * 1024 * 1024;

  let mediaCache = new Map();
  let adminDataCache = null;
  let adminRevision = '';
  let currentMediaId = '';
  let actionMenuOpen = null;

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

  function cleanCaption(caption = '') {
    FRAME_RE.lastIndex = 0;
    VIDEO_FRAME_RE.lastIndex = 0;
    OLD_FOCUS_RE.lastIndex = 0;
    const clean = String(caption || '')
      .replace(FRAME_RE, '')
      .replace(VIDEO_FRAME_RE, '')
      .replace(OLD_FOCUS_RE, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    FRAME_RE.lastIndex = 0;
    VIDEO_FRAME_RE.lastIndex = 0;
    OLD_FOCUS_RE.lastIndex = 0;
    return clean;
  }

  async function refreshMediaCache() {
    try {
      const response = await fetch('/api/admin/content', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) return false;
      const body = await response.json();
      adminDataCache = body.data || null;
      adminRevision = body.revision || '';
      mediaCache = new Map((body.data?.media || []).map(item => [String(item.id), item]));
      decorateMediaList();
      decorateStatsImporter();
      return true;
    } catch {
      return false;
    }
  }

  function mediaKind(item) {
    return item?.category === 'Video' ? 'video' : item?.category === 'Photos' ? 'photo' : 'other';
  }

  function featuredFor(data, kind) {
    return (data?.media || [])
      .filter(item => item.featured && mediaKind(item) === kind)
      .sort((a, b) => Number(a.featureOrder || 99) - Number(b.featureOrder || 99));
  }

  function normalizeFeaturedOrders(data, kind) {
    featuredFor(data, kind).slice(0, 3).forEach((item, index) => {
      item.featured = true;
      item.featureOrder = index + 1;
    });

    featuredFor(data, kind).slice(3).forEach(item => {
      item.featured = false;
      item.featureOrder = 0;
    });
  }

  async function publishAdminMutation(mutator, successMessage = 'Published.') {
    const response = await fetch('/api/admin/content', {
      credentials: 'same-origin',
      cache: 'no-store'
    });

    let state;
    try { state = await response.json(); } catch { state = {}; }
    if (!response.ok) throw new Error(state.error || 'Could not load the latest Admin data.');

    const next = structuredClone(state.data);
    await mutator(next);

    const save = await fetch('/api/admin/content', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: state.revision, data: next })
    });

    let body;
    try { body = await save.json(); } catch { body = {}; }
    if (!save.ok) throw new Error(body.error || 'Could not publish the change.');

    const status = document.querySelector('#status');
    if (status) {
      status.textContent = successMessage;
      status.className = 'success';
    }

    // The core Admin keeps its own in-memory draft. Reloading prevents a later
    // Save & publish from accidentally overwriting this direct action.
    setTimeout(() => location.reload(), 260);
  }

  function closeActionMenus() {
    document.querySelectorAll('.jd-actions-menu[open]').forEach(menu => {
      menu.open = false;
    });
    actionMenuOpen = null;
  }

  function actionsForItem(item) {
    const kind = mediaKind(item);
    const canFeature = kind === 'photo' || kind === 'video';
    const label = item.featured
      ? `<span class="jd-action-feature ${kind}">FEATURED #${Number(item.featureOrder || 0) || ''}</span>`
      : '';

    return `
      ${label}
      <details class="jd-actions-menu">
        <summary>Actions</summary>
        <div class="jd-actions-popover">
          <button type="button" data-jd-action="edit" data-id="${item.id}">Edit</button>
          ${canFeature && !item.featured ? `<button type="button" data-jd-action="feature" data-id="${item.id}">Feature on homepage</button>` : ''}
          ${canFeature && item.featured ? `
            <button type="button" data-jd-action="move-up" data-id="${item.id}">Move up</button>
            <button type="button" data-jd-action="move-down" data-id="${item.id}">Move down</button>
            <button type="button" data-jd-action="unfeature" data-id="${item.id}">Remove feature</button>
          ` : ''}
          <button type="button" data-jd-action="${item.published ? 'hide' : 'publish'}" data-id="${item.id}">
            ${item.published ? 'Hide from website' : 'Show on website'}
          </button>
        </div>
      </details>
    `;
  }

  function decorateMediaList() {
    const list = document.querySelector('#item-list');
    if (!list || !document.querySelector('[data-section="media"].active')) return;

    list.querySelectorAll('.jd-feature-group-label').forEach(node => node.remove());

    const rows = [...list.querySelectorAll(':scope > .admin-row')];
    if (!rows.length) return;

    rows.forEach(row => {
      const edit = row.querySelector('button[data-edit]');
      const thumb = row.querySelector('.admin-media-thumb');
      if (!edit || !thumb) return;

      const item = mediaCache.get(String(edit.dataset.edit || ''));
      if (!item) return;

      row.dataset.jdMediaId = item.id;
      row.classList.toggle('jd-featured-row', Boolean(item.featured));
      row.classList.toggle('jd-featured-photo-row', Boolean(item.featured && mediaKind(item) === 'photo'));
      row.classList.toggle('jd-featured-video-row', Boolean(item.featured && mediaKind(item) === 'video'));

      thumb.querySelector('.jd-featured-dot')?.remove();
      row.querySelector('.jd-row-actions')?.remove();

      if (item.featured) {
        const dot = document.createElement('span');
        dot.className = `jd-featured-dot ${mediaKind(item)}`;
        dot.title = `${mediaKind(item) === 'video' ? 'Featured video' : 'Featured photo'} · Position ${item.featureOrder}`;
        thumb.append(dot);
      }

      edit.hidden = true;

      const controls = document.createElement('div');
      controls.className = 'jd-row-actions';
      controls.innerHTML = actionsForItem(item);
      row.append(controls);
    });

    const originalIndex = new Map(rows.map((row, index) => [row, index]));
    rows.sort((a, b) => {
      const ai = mediaCache.get(a.dataset.jdMediaId);
      const bi = mediaCache.get(b.dataset.jdMediaId);
      const ak = mediaKind(ai), bk = mediaKind(bi);
      const rank = item => {
        const kind = mediaKind(item);
        if (item?.featured && kind === 'photo') return 0;
        if (item?.featured && kind === 'video') return 1;
        return 2;
      };
      const ar = rank(ai), br = rank(bi);
      if (ar !== br) return ar - br;
      if (ar < 2) {
        const ao = Number(ai?.featureOrder || 99);
        const bo = Number(bi?.featureOrder || 99);
        if (ao !== bo) return ao - bo;
      }
      return (originalIndex.get(a) || 0) - (originalIndex.get(b) || 0);
    });

    rows.forEach(row => list.append(row));

    const insertLabelBefore = (row, text, kind) => {
      if (!row) return;
      const label = document.createElement('div');
      label.className = `jd-feature-group-label ${kind}`;
      label.innerHTML = `<span>${text}</span>`;
      list.insertBefore(label, row);
    };

    const firstPhoto = rows.find(row => {
      const item = mediaCache.get(row.dataset.jdMediaId);
      return item?.featured && mediaKind(item) === 'photo';
    });
    const firstVideo = rows.find(row => {
      const item = mediaCache.get(row.dataset.jdMediaId);
      return item?.featured && mediaKind(item) === 'video';
    });
    const firstOther = rows.find(row => !mediaCache.get(row.dataset.jdMediaId)?.featured);

    insertLabelBefore(firstPhoto, 'FEATURED PHOTOS', 'photo');
    insertLabelBefore(firstVideo, 'FEATURED VIDEOS', 'video');
    insertLabelBefore(firstOther, 'ALL MEDIA', 'all');
  }

  function formIsMedia(form) {
    return Boolean(
      form &&
      form.querySelector('[name="featured"]') &&
      form.querySelector('[name="image"]') &&
      form.querySelector('[name="video"]')
    );
  }

  function makeBlurBackground(stage, url) {
    stage.style.setProperty('--jd-preview-image', url ? `url("${String(url).replace(/"/g, '\\"')}")` : 'none');
  }

  function installFraming(form, mediaId = '') {
    if (!formIsMedia(form) || form.dataset.jdFramingReady === '1') return;
    form.dataset.jdFramingReady = '1';

    const imageInput = form.querySelector('[name="image"]');
    const captionInput = form.querySelector('[name="caption"]');
    if (!imageInput || !captionInput) return;

    const cached = mediaCache.get(String(mediaId || ''));
    const initial = parseFrame(cached?.caption ?? captionInput.value ?? '');
    captionInput.value = cleanCaption(captionInput.value);

    const panel = document.createElement('section');
    panel.className = 'jd-framing-panel wide';
    panel.innerHTML = `
      <div class="jd-framing-heading">
        <div>
          <span class="eyebrow">PHOTO FRAMING</span>
          <h3>Frame the photo</h3>
        </div>
        <button type="button" class="jd-reset-frame">Reset</button>
      </div>
      <p>
        This 4:5 preview is how the photo is framed in the media cards and homepage feature.
        At 1.00× the full picture fits inside the tile. Zoom in and drag to choose the crop you want.
      </p>
      <div class="jd-framing-workspace">
        <div class="jd-framing-stage" tabindex="0" aria-label="Photo framing preview">
          <img alt="Featured framing preview">
          <span class="jd-framing-crosshair" aria-hidden="true"></span>
          <span class="jd-drag-tip">DRAG TO REPOSITION</span>
        </div>
        <div class="jd-framing-details">
          <label>
            Zoom
            <input class="jd-zoom" type="range" min="0.85" max="2.5" step="0.01">
          </label>
          <label>
            Left / right focus
            <input class="jd-focus-x" type="range" min="0" max="100" step="1">
          </label>
          <label>
            Up / down focus
            <input class="jd-focus-y" type="range" min="0" max="100" step="1">
          </label>
          <span class="jd-focus-readout"></span>
          <small>
            Tip: Zoom 1.00× = show the complete photo. Zoom in only when you want to crop tighter.
          </small>
        </div>
      </div>
      <input type="hidden" name="jd-frame-x">
      <input type="hidden" name="jd-frame-y">
      <input type="hidden" name="jd-frame-zoom">
    `;

    (form.querySelector('.form-grid') || form).append(panel);

    const stage = panel.querySelector('.jd-framing-stage');
    const image = stage.querySelector('img');
    const zoomRange = panel.querySelector('.jd-zoom');
    const xRange = panel.querySelector('.jd-focus-x');
    const yRange = panel.querySelector('.jd-focus-y');
    const xHidden = panel.querySelector('[name="jd-frame-x"]');
    const yHidden = panel.querySelector('[name="jd-frame-y"]');
    const zHidden = panel.querySelector('[name="jd-frame-zoom"]');
    const readout = panel.querySelector('.jd-focus-readout');
    const reset = panel.querySelector('.jd-reset-frame');

    let frame = { ...initial };
    let drag = null;

    function imageUrl() {
      return String(imageInput.value || '').trim();
    }

    function paint() {
      const url = imageUrl();
      panel.classList.toggle('jd-no-feature-image', !url);

      if (url) {
        const absolute = new URL(url, location.href).href;
        if (image.src !== absolute) image.src = url;
        makeBlurBackground(stage, url);
      } else {
        image.removeAttribute('src');
        makeBlurBackground(stage, '');
      }

      image.style.setProperty('--jd-frame-zoom', frame.zoom);
      image.style.setProperty('--jd-frame-x', `${frame.x}%`);
      image.style.setProperty('--jd-frame-y', `${frame.y}%`);

      zoomRange.value = String(frame.zoom);
      xRange.value = String(Math.round(frame.x));
      yRange.value = String(Math.round(frame.y));

      xHidden.value = String(Math.round(frame.x));
      yHidden.value = String(Math.round(frame.y));
      zHidden.value = String(Number(frame.zoom.toFixed(2)));

      readout.textContent =
        `${frame.zoom.toFixed(2)}× zoom · ${Math.round(frame.x)}% horizontal · ${Math.round(frame.y)}% vertical`;
    }

    function setFrame(x = frame.x, y = frame.y, zoom = frame.zoom) {
      frame.x = clamp(x, 0, 100);
      frame.y = clamp(y, 0, 100);
      frame.zoom = clamp(zoom, .85, 2.5);
      paint();
    }

    zoomRange.addEventListener('input', () => setFrame(frame.x, frame.y, zoomRange.value));
    xRange.addEventListener('input', () => setFrame(xRange.value, frame.y, frame.zoom));
    yRange.addEventListener('input', () => setFrame(frame.x, yRange.value, frame.zoom));
    reset.addEventListener('click', () => setFrame(50, 50, 1));

    stage.addEventListener('pointerdown', event => {
      if (!imageUrl()) return;
      const rect = stage.getBoundingClientRect();
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: frame.x,
        startY: frame.y,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height)
      };
      stage.setPointerCapture?.(event.pointerId);
      stage.classList.add('is-dragging');
      event.preventDefault();
    });

    stage.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;

      setFrame(
        drag.startX - (dx / drag.width) * 100,
        drag.startY - (dy / drag.height) * 100,
        frame.zoom
      );
      event.preventDefault();
    });

    const stopDrag = event => {
      if (!drag) return;
      if (event?.pointerId !== undefined && event.pointerId !== drag.id) return;
      drag = null;
      stage.classList.remove('is-dragging');
    };

    stage.addEventListener('pointerup', stopDrag);
    stage.addEventListener('pointercancel', stopDrag);

    const upload = form.querySelector('[data-upload="image"]');
    upload?.addEventListener('change', () => {
      [250, 700, 1400].forEach(delay => setTimeout(paint, delay));
    });

    paint();
  }


  function installVideoFraming(form, mediaId = '') {
    if (!formIsMedia(form) || form.dataset.jdVideoFramingReady === '1') return;
    form.dataset.jdVideoFramingReady = '1';

    const videoInput = form.querySelector('[name="video"]');
    const captionInput = form.querySelector('[name="caption"]');
    if (!videoInput || !captionInput) return;

    const cached = mediaCache.get(String(mediaId || ''));
    const initial = parseVideoFrame(cached?.caption ?? captionInput.value ?? '');

    const panel = document.createElement('section');
    panel.className = 'jd-video-framing-panel wide';
    panel.innerHTML = `
      <div class="jd-framing-heading">
        <div>
          <span class="eyebrow">VIDEO FRAMING</span>
          <h3>Frame the 4:5 video</h3>
        </div>
        <div class="jd-video-frame-quick">
          <button type="button" class="jd-video-fit">Fit</button>
          <button type="button" class="jd-video-fill">Fill</button>
          <button type="button" class="jd-video-reset">Reset</button>
        </div>
      </div>
      <p>
        Reframe an uploaded video at any time without uploading it again.
        Fit shows the complete video. Fill enlarges it to cover the 4:5 card.
        You can zoom farther and drag to choose exactly what stays visible.
      </p>
      <div class="jd-framing-workspace">
        <div class="jd-video-framing-stage" tabindex="0" aria-label="Video framing preview">
          <video class="jd-video-framing-backdrop" muted loop playsinline preload="metadata" aria-hidden="true"></video>
          <video class="jd-video-framing-preview" muted loop playsinline preload="metadata"></video>
          <span class="jd-framing-crosshair" aria-hidden="true"></span>
          <span class="jd-drag-tip">DRAG TO REPOSITION</span>
        </div>
        <div class="jd-framing-details">
          <label>
            Zoom
            <input class="jd-video-zoom" type="range" min="1" max="4" step="0.01">
          </label>
          <label>
            Left / right focus
            <input class="jd-video-focus-x" type="range" min="0" max="100" step="1">
          </label>
          <label>
            Up / down focus
            <input class="jd-video-focus-y" type="range" min="0" max="100" step="1">
          </label>
          <span class="jd-video-focus-readout"></span>
          <small>
            Tip: use Fill for landscape clips, then drag until the player/action is centered.
          </small>
        </div>
      </div>
      <input type="hidden" name="jd-video-frame-x">
      <input type="hidden" name="jd-video-frame-y">
      <input type="hidden" name="jd-video-frame-zoom">
    `;

    (form.querySelector('.form-grid') || form).append(panel);

    const stage = panel.querySelector('.jd-video-framing-stage');
    const preview = panel.querySelector('.jd-video-framing-preview');
    const backdrop = panel.querySelector('.jd-video-framing-backdrop');
    const zoomRange = panel.querySelector('.jd-video-zoom');
    const xRange = panel.querySelector('.jd-video-focus-x');
    const yRange = panel.querySelector('.jd-video-focus-y');
    const xHidden = panel.querySelector('[name="jd-video-frame-x"]');
    const yHidden = panel.querySelector('[name="jd-video-frame-y"]');
    const zHidden = panel.querySelector('[name="jd-video-frame-zoom"]');
    const readout = panel.querySelector('.jd-video-focus-readout');
    const fit = panel.querySelector('.jd-video-fit');
    const fill = panel.querySelector('.jd-video-fill');
    const reset = panel.querySelector('.jd-video-reset');

    let frame = { ...initial };
    let drag = null;
    let loadedUrl = '';

    function videoUrl() {
      return String(videoInput.value || '').trim();
    }

    function coverZoom() {
      if (!preview.videoWidth || !preview.videoHeight) return 1;
      const sourceRatio = preview.videoWidth / preview.videoHeight;
      const cardRatio = 4 / 5;
      return clamp(
        sourceRatio >= cardRatio ? sourceRatio / cardRatio : cardRatio / sourceRatio,
        1,
        4
      );
    }

    function playPreview() {
      preview.muted = true;
      backdrop.muted = true;
      preview.play().catch(() => {});
      backdrop.play().catch(() => {});
    }

    function syncSource() {
      const url = videoUrl();
      panel.classList.toggle('jd-no-video-source', !url);

      if (!url) {
        preview.removeAttribute('src');
        backdrop.removeAttribute('src');
        preview.load();
        backdrop.load();
        loadedUrl = '';
        return;
      }

      const absolute = new URL(url, location.href).href;
      if (loadedUrl !== absolute) {
        loadedUrl = absolute;
        preview.src = url;
        backdrop.src = url;
        preview.load();
        backdrop.load();
        preview.addEventListener('canplay', playPreview, { once: true });
        backdrop.addEventListener('canplay', playPreview, { once: true });
      }
    }

    function paint() {
      syncSource();

      preview.style.setProperty('--jd-video-frame-zoom', frame.zoom);
      preview.style.setProperty('--jd-video-frame-x', `${frame.x}%`);
      preview.style.setProperty('--jd-video-frame-y', `${frame.y}%`);

      zoomRange.value = String(frame.zoom);
      xRange.value = String(Math.round(frame.x));
      yRange.value = String(Math.round(frame.y));

      xHidden.value = String(Math.round(frame.x));
      yHidden.value = String(Math.round(frame.y));
      zHidden.value = String(Number(frame.zoom.toFixed(2)));

      readout.textContent =
        `${frame.zoom.toFixed(2)}× zoom · ${Math.round(frame.x)}% horizontal · ${Math.round(frame.y)}% vertical`;
    }

    function setFrame(x = frame.x, y = frame.y, zoom = frame.zoom) {
      frame.x = clamp(x, 0, 100);
      frame.y = clamp(y, 0, 100);
      frame.zoom = clamp(zoom, 1, 4);
      paint();
    }

    zoomRange.addEventListener('input', () => setFrame(frame.x, frame.y, zoomRange.value));
    xRange.addEventListener('input', () => setFrame(xRange.value, frame.y, frame.zoom));
    yRange.addEventListener('input', () => setFrame(frame.x, yRange.value, frame.zoom));

    fit.addEventListener('click', () => setFrame(frame.x, frame.y, 1));
    fill.addEventListener('click', () => setFrame(50, 50, coverZoom()));
    reset.addEventListener('click', () => setFrame(50, 50, 1));

    stage.addEventListener('pointerdown', event => {
      if (!videoUrl()) return;
      const rect = stage.getBoundingClientRect();
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: frame.x,
        startY: frame.y,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height)
      };
      stage.setPointerCapture?.(event.pointerId);
      stage.classList.add('is-dragging');
      event.preventDefault();
    });

    stage.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      setFrame(
        drag.startX - (dx / drag.width) * 100,
        drag.startY - (dy / drag.height) * 100,
        frame.zoom
      );
      event.preventDefault();
    });

    const stopDrag = event => {
      if (!drag) return;
      if (event?.pointerId !== undefined && event.pointerId !== drag.id) return;
      drag = null;
      stage.classList.remove('is-dragging');
    };
    stage.addEventListener('pointerup', stopDrag);
    stage.addEventListener('pointercancel', stopDrag);

    preview.addEventListener('loadedmetadata', () => {
      playPreview();
      readout.textContent =
        `${frame.zoom.toFixed(2)}× zoom · ${preview.videoWidth}×${preview.videoHeight} source · ${Math.round(frame.x)}% / ${Math.round(frame.y)}%`;
    });

    form.addEventListener('jd-video-uploaded', () => {
      loadedUrl = '';
      [0, 150, 500].forEach(delay => setTimeout(paint, delay));
    });

    paint();
  }

  async function uploadVideoInChunks(file, form, input) {
    const message = form.querySelector('.form-message');
    const submit = form.querySelector('[type="submit"]');
    const videoField = form.querySelector('[name="video"]');

    if (!message || !submit || !videoField) return;

    if (!/^video\/(mp4|webm)$/i.test(file.type) && !/\.(mp4|webm)$/i.test(file.name)) {
      message.textContent = 'Use an MP4 or WebM video.';
      return;
    }

    if (file.size > MAX_VIDEO_BYTES) {
      message.textContent = 'This video is over 250 MB. Compress it or use a YouTube link.';
      return;
    }

    const ext = /webm/i.test(file.type) || /\.webm$/i.test(file.name) ? 'webm' : 'mp4';
    const uploadId = crypto.randomUUID();
    const total = Math.max(1, Math.ceil(file.size / CHUNK_BYTES));

    submit.disabled = true;
    input.disabled = true;

    try {
      let result = null;

      for (let i = 0; i < total; i++) {
        const start = i * CHUNK_BYTES;
        const end = Math.min(file.size, start + CHUNK_BYTES);
        const chunk = file.slice(start, end);

        const percent = Math.round(((i + 1) / total) * 100);
        message.textContent = `Uploading video… ${percent}%`;

        const response = await fetch(
          `/api/videos?uploadId=${encodeURIComponent(uploadId)}&chunk=${i}&total=${total}&ext=${ext}&fileSize=${file.size}`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: chunk
          }
        );

        let body;
        try { body = await response.json(); } catch { body = {}; }

        if (!response.ok) throw new Error(body.error || 'Video upload failed.');
        result = body;
      }

      if (!result?.url) throw new Error('The video upload did not finish.');

      videoField.value = result.url;
      form.dispatchEvent(new CustomEvent('jd-video-uploaded'));

      let preview = input.parentElement.querySelector('video.video-preview');
      if (!preview) {
        preview = document.createElement('video');
        preview.className = 'video-preview';
        preview.controls = true;
        preview.muted = true;
        preview.playsInline = true;
        input.parentElement.append(preview);
      }

      preview.src = result.url;
      preview.load();

      message.textContent =
        `Video uploaded (${(file.size / 1024 / 1024).toFixed(1)} MB). Apply changes, then Save & publish.`;
    } catch (error) {
      message.textContent = error.message || 'Video upload failed. Please try again.';
    } finally {
      submit.disabled = false;
      input.disabled = false;
    }
  }

  function installLargeVideoUpload(form) {
    if (!formIsMedia(form) || form.dataset.jdVideoUploader === '1') return;
    form.dataset.jdVideoUploader = '1';

    const input = form.querySelector('[data-video-upload="video"]');
    if (!input) return;

    const note = input.parentElement.querySelector('small');
    if (note) {
      note.textContent =
        'MP4 or WebM up to 250 MB. Portrait/Reel/Story and landscape videos are both supported.';
    }

    // Replace the original 5 MB onchange handler.
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await uploadVideoInChunks(file, form, input);
    };
  }

  function prepareFrameForSubmit(form) {
    if (!formIsMedia(form)) return;

    const caption = form.querySelector('[name="caption"]');
    const image = form.querySelector('[name="image"]');
    const video = form.querySelector('[name="video"]');
    const category = form.querySelector('[name="category"]')?.value || '';
    if (!caption) return;

    const clean = cleanCaption(caption.value);

    if (category === 'Video' && String(video?.value || '').trim()) {
      const x = clamp(form.querySelector('[name="jd-video-frame-x"]')?.value ?? 50, 0, 100);
      const y = clamp(form.querySelector('[name="jd-video-frame-y"]')?.value ?? 50, 0, 100);
      const zoom = clamp(form.querySelector('[name="jd-video-frame-zoom"]')?.value ?? 1, 1, 4);
      const marker = `[[JD_VFRAME:${Math.round(x)},${Math.round(y)},${zoom.toFixed(2)}]]`;
      caption.value = clean ? `${clean}\n${marker}` : marker;
      return;
    }

    if (category === 'Photos' && String(image?.value || '').trim()) {
      const x = clamp(form.querySelector('[name="jd-frame-x"]')?.value ?? 50, 0, 100);
      const y = clamp(form.querySelector('[name="jd-frame-y"]')?.value ?? 50, 0, 100);
      const zoom = clamp(form.querySelector('[name="jd-frame-zoom"]')?.value ?? 1, .85, 2.5);
      const marker = `[[JD_FRAME:${Math.round(x)},${Math.round(y)},${zoom.toFixed(2)}]]`;
      caption.value = clean ? `${clean}\n${marker}` : marker;
      return;
    }

    caption.value = clean;
  }


  function fieldLabelFor(form, name) {
    return form.querySelector(`[name="${name}"]`)?.closest('label') || null;
  }

  function cleanupMediaEditor(form) {
    if (!formIsMedia(form) || form.dataset.jdCleanEditor === '1') return;
    form.dataset.jdCleanEditor = '1';

    // Keep these values in the form/schema, but remove the clutter from the UI.
    ['caption', 'date', 'featured', 'featureOrder'].forEach(name => {
      const label = fieldLabelFor(form, name);
      if (label) label.classList.add('jd-hidden-admin-field');
    });

    const dateInput = form.querySelector('[name="date"]');
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);

    const published = form.querySelector('[name="published"]')?.closest('label');
    if (published) {
      const input = published.querySelector('input');
      published.replaceChildren(input, document.createTextNode('Visible on website'));
    }

    const category = form.querySelector('[name="category"]');
    const link = form.querySelector('[name="link"]');
    if (link?.closest('label')) {
      const label = link.closest('label');
      const textNode = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = 'YouTube / Instagram / article link';
    }

    const imageUpload = form.querySelector('[data-upload="image"]');
    const videoUpload = form.querySelector('[data-video-upload="video"]');

    if (imageUpload) imageUpload.closest('label')?.classList.add('jd-original-media-upload');
    if (videoUpload) videoUpload.closest('label')?.classList.add('jd-original-media-upload');

    if (!form.querySelector('.jd-unified-upload')) {
      const unified = document.createElement('label');
      unified.className = 'wide jd-unified-upload';
      unified.innerHTML = `
        <span>Upload media</span>
        <small>Choose a photo, MP4 or WebM. Videos can be up to 250 MB.</small>
        <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm">
        <span class="jd-unified-file-name">No file selected</span>
      `;

      const titleLabel = fieldLabelFor(form, 'title');
      if (titleLabel) titleLabel.insertAdjacentElement('afterend', unified);
      else (form.querySelector('.form-grid') || form).prepend(unified);

      const unifiedInput = unified.querySelector('input[type="file"]');
      unifiedInput.addEventListener('change', async () => {
        const file = unifiedInput.files?.[0];
        if (!file) return;

        unified.querySelector('.jd-unified-file-name').textContent = file.name;

        const title = form.querySelector('[name="title"]');
        if (title && !title.value.trim()) {
          title.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
        }

        if (file.type.startsWith('video/') || /\.(mp4|webm)$/i.test(file.name)) {
          if (category) category.value = 'Video';
          await uploadVideoInChunks(file, form, unifiedInput);
        } else {
          if (category) category.value = 'Photos';
          if (!imageUpload) return;

          try {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            imageUpload.files = transfer.files;
            imageUpload.dispatchEvent(new Event('change', { bubbles: true }));
          } catch {
            const message = form.querySelector('.form-message');
            if (message) message.textContent = 'Use the photo upload control below for this browser.';
            imageUpload.closest('label')?.classList.remove('jd-original-media-upload');
          }
        }

        updateMediaEditorFields(form);
      });
    }

    category?.addEventListener('change', () => updateMediaEditorFields(form));
    updateMediaEditorFields(form);
  }

  function updateMediaEditorFields(form) {
    const category = form.querySelector('[name="category"]')?.value || 'Photos';
    const isPhoto = category === 'Photos';

    ['photographerName', 'photographerInstagram', 'showPhotographerCredit'].forEach(name => {
      fieldLabelFor(form, name)?.classList.toggle('jd-conditional-hidden', !isPhoto);
    });

    form.querySelector('.jd-framing-panel')?.classList.toggle('jd-conditional-hidden', !isPhoto);
    form.querySelector('.jd-video-framing-panel')?.classList.toggle('jd-conditional-hidden', category !== 'Video');
  }

  function showFeatureReplaceDialog(item, kind) {
    let dialog = document.querySelector('#jd-feature-replace-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'jd-feature-replace-dialog';
      dialog.className = 'jd-feature-dialog';
      document.body.append(dialog);
    }

    const label = kind === 'video' ? 'video' : 'photo';
    dialog.innerHTML = `
      <button type="button" class="close" data-close>×</button>
      <span class="eyebrow">${kind === 'video' ? 'FEATURED VIDEOS' : 'FEATURED PHOTOS'}</span>
      <h2>Choose a slot to replace</h2>
      <p>All three featured ${label} slots are full. Which position should this ${label} replace?</p>
      <div class="jd-slot-choices">
        <button type="button" data-slot="1">Replace #1</button>
        <button type="button" data-slot="2">Replace #2</button>
        <button type="button" data-slot="3">Replace #3</button>
      </div>
    `;

    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.querySelectorAll('[data-slot]').forEach(button => {
      button.onclick = async () => {
        const slot = Number(button.dataset.slot);
        dialog.close();
        try {
          await publishAdminMutation(data => {
            const target = data.media.find(x => String(x.id) === String(item.id));
            const replaced = data.media.find(x =>
              x.featured &&
              mediaKind(x) === kind &&
              Number(x.featureOrder) === slot
            );

            if (replaced) {
              replaced.featured = false;
              replaced.featureOrder = 0;
            }

            if (target) {
              target.featured = true;
              target.featureOrder = slot;
              target.published = true;
            }

            normalizeFeaturedOrders(data, kind);
          }, `${kind === 'video' ? 'Video' : 'Photo'} is now featured #${slot}.`);
        } catch (error) {
          alert(error.message);
        }
      };
    });

    dialog.showModal();
  }

  async function handleMediaAction(button) {
    const id = String(button.dataset.id || '');
    const action = button.dataset.jdAction;
    const item = mediaCache.get(id);
    if (!item) return;

    if (action === 'edit') {
      const original = document.querySelector(`button[data-edit="${CSS.escape(id)}"]`);
      original?.click();
      return;
    }

    const kind = mediaKind(item);

    if (action === 'feature') {
      const featured = featuredFor(adminDataCache, kind);
      if (featured.length >= 3) {
        showFeatureReplaceDialog(item, kind);
        return;
      }

      try {
        await publishAdminMutation(data => {
          const target = data.media.find(x => String(x.id) === id);
          const existing = featuredFor(data, kind);
          const used = new Set(existing.map(x => Number(x.featureOrder || 0)));
          const openSlot = [1, 2, 3].find(slot => !used.has(slot)) || Math.min(3, existing.length + 1);
          if (target) {
            target.featured = true;
            target.featureOrder = openSlot;
            target.published = true;
          }
          normalizeFeaturedOrders(data, kind);
        }, `${kind === 'video' ? 'Video' : 'Photo'} added to the homepage.`);
      } catch (error) {
        alert(error.message);
      }
      return;
    }

    if (action === 'unfeature') {
      try {
        await publishAdminMutation(data => {
          const target = data.media.find(x => String(x.id) === id);
          if (target) {
            target.featured = false;
            target.featureOrder = 0;
          }
          normalizeFeaturedOrders(data, kind);
        }, 'Removed from homepage features.');
      } catch (error) {
        alert(error.message);
      }
      return;
    }

    if (action === 'move-up' || action === 'move-down') {
      try {
        await publishAdminMutation(data => {
          const items = featuredFor(data, kind);
          const index = items.findIndex(x => String(x.id) === id);
          if (index < 0) return;
          const nextIndex = action === 'move-up' ? index - 1 : index + 1;
          if (nextIndex < 0 || nextIndex >= items.length) return;
          [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
          items.forEach((entry, i) => entry.featureOrder = i + 1);
        }, 'Featured order updated.');
      } catch (error) {
        alert(error.message);
      }
      return;
    }

    if (action === 'hide' || action === 'publish') {
      try {
        await publishAdminMutation(data => {
          const target = data.media.find(x => String(x.id) === id);
          if (!target) return;
          target.published = action === 'publish';
          if (!target.published && target.featured) {
            target.featured = false;
            target.featureOrder = 0;
            normalizeFeaturedOrders(data, kind);
          }
        }, action === 'publish' ? 'Media is visible on the website.' : 'Media hidden from the website.');
      } catch (error) {
        alert(error.message);
      }
    }
  }

  function parseCSVText(text) {
    const rows = [];
    let row = [], value = '', quoted = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '"') {
        if (quoted && text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (char === ',' && !quoted) {
        row.push(value);
        value = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(value);
        if (row.some(cell => String(cell).trim())) rows.push(row);
        row = [];
        value = '';
      } else {
        value += char;
      }
    }

    if (value || row.length) {
      row.push(value);
      rows.push(row);
    }

    return rows;
  }

  function normalizedPlayerName(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function seasonInfoFromFilename(filename = '') {
    const match = String(filename).match(/\b(Spring|Fall)\s+(20\d{2})\b/i);
    if (!match) return null;
    const term = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
    const year = match[2];
    return {
      name: `${term} ${year}`,
      id: `${term.toLowerCase()}-${year}`,
      term,
      year
    };
  }

  function cleanMetric(value) {
    const v = String(value ?? '').trim();
    if (!v) return '';
    if (v === '-') return '-';
    const numeric = v.replace(/%$/, '');
    return /^-?\d*(?:\.\d+)?$/.test(numeric) ? numeric : '';
  }

  function valueMap(headers, row, start, end) {
    return Object.fromEntries(
      headers.slice(start, end).map((key, offset) => [
        String(key || '').trim(),
        cleanMetric(row[start + offset])
      ]).filter(([key]) => key)
    );
  }

  function inferPosition(fielding = {}) {
    const positions = ['P','C','1B','2B','3B','SS','LF','CF','RF'];
    let best = '', bestValue = 0;

    positions.forEach(position => {
      const value = Number(fielding[position] || 0);
      if (Number.isFinite(value) && value > bestValue) {
        best = position;
        bestValue = value;
      }
    });

    if (['LF','CF','RF'].includes(best)) return 'OF';
    if (['1B','2B','3B','SS'].includes(best)) return 'IF';
    return best;
  }

  function parseGameChangerFile(text) {
    const rows = parseCSVText(text);
    const headerIndex = rows.findIndex(row =>
      row[0] === 'Number' && row[1] === 'Last' && row[2] === 'First'
    );

    if (headerIndex < 1) {
      throw new Error('This does not look like the GameChanger stats export. Number, Last and First were not found.');
    }

    const groups = rows[headerIndex - 1];
    const headers = rows[headerIndex];
    const pitchIndex = groups.indexOf('Pitching');
    const fieldIndex = groups.indexOf('Fielding');

    if (pitchIndex < 0 || fieldIndex < 0) {
      throw new Error('The Batting, Pitching and Fielding sections were not found.');
    }

    const players = [];

    for (const row of rows.slice(headerIndex + 1)) {
      const marker = String(row[0] || '').trim();
      if (!row.length || marker === 'Totals' || marker === 'Glossary') continue;

      const first = String(row[2] || '').trim();
      const last = String(row[1] || '').trim();
      const name = `${first} ${last}`.replace(/\s+/g, ' ').trim();
      if (!name) continue;

      const batting = valueMap(headers, row, 3, pitchIndex);
      const pitching = valueMap(headers, row, pitchIndex, fieldIndex);
      const fielding = valueMap(headers, row, fieldIndex, headers.length);

      players.push({
        number: marker,
        name,
        key: normalizedPlayerName(name),
        batting,
        pitching,
        fielding,
        position: inferPosition(fielding)
      });
    }

    if (!players.length) throw new Error('No player rows were found in this export.');
    return players;
  }

  function metricNumber(value) {
    const n = Number(String(value ?? '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  function inningsToOuts(value) {
    const raw = String(value ?? '0');
    if (!raw || raw === '-') return 0;
    const [whole, fraction = '0'] = raw.split('.');
    return (Number(whole) || 0) * 3 + Math.max(0, Math.min(2, Number(fraction[0]) || 0));
  }

  function outsToInnings(outs) {
    const safe = Math.max(0, Math.round(outs || 0));
    return `${Math.floor(safe / 3)}.${safe % 3}`;
  }

  function formatRate(value) {
    if (!Number.isFinite(value)) return '-';
    const fixed = Math.max(0, value).toFixed(3);
    return fixed.startsWith('0.') ? fixed.slice(1) : fixed;
  }

  function mergeImportedStats(rows) {
    if (rows.length === 1) {
      return {
        bat: rows[0].batting,
        pitch: rows[0].pitching,
        fielding: rows[0].fielding
      };
    }

    const sumGroup = (group, rateKeys = new Set()) => {
      const keys = new Set(rows.flatMap(row => Object.keys(row[group] || {})));
      const result = {};

      keys.forEach(key => {
        if (rateKeys.has(key)) return;
        const values = rows.map(row => row[group]?.[key]).filter(v => v !== undefined && v !== '');
        if (!values.length) return;
        if (values.every(v => v === '-' || /^-?\d*(?:\.\d+)?$/.test(String(v)))) {
          result[key] = String(values.reduce((sum, value) => sum + metricNumber(value), 0));
        } else {
          result[key] = values[0];
        }
      });

      return result;
    };

    const batRates = new Set(['AVG','OBP','OPS','SLG','SB%','QAB%','PA/BB','BB/K','C%','LD%','FB%','GB%','BABIP','BA/RISP','PS/PA','2S+3%','6+%','AB/HR']);
    const pitchRates = new Set(['SV%','SB%','ERA','WHIP','BAA','P/IP','P/BF','<3%','FIP','S%','FPS%','FPSO%','FPSW%','FPSH%','BB/INN','SM%','K/BF','K/BB','WEAK%','HHB%','GO/AO','LD%','FB%','GB%','BABIP','BA/RISP']);
    const fieldRates = new Set(['FPCT','CS%']);

    const bat = sumGroup('batting', batRates);
    const pitch = sumGroup('pitching', pitchRates);
    const fielding = sumGroup('fielding', fieldRates);

    const ab = metricNumber(bat.AB), h = metricNumber(bat.H), bb = metricNumber(bat.BB);
    const hbp = metricNumber(bat.HBP), sf = metricNumber(bat.SF);
    const tb = metricNumber(bat.TB) ||
      metricNumber(bat['1B']) + 2 * metricNumber(bat['2B']) + 3 * metricNumber(bat['3B']) + 4 * metricNumber(bat.HR);

    bat.TB = String(tb);
    bat.AVG = ab ? formatRate(h / ab) : '-';
    const obpDen = ab + bb + hbp + sf;
    bat.OBP = obpDen ? formatRate((h + bb + hbp) / obpDen) : '-';
    bat.SLG = ab ? formatRate(tb / ab) : '-';
    bat.OPS = bat.OBP !== '-' && bat.SLG !== '-' ? formatRate(metricNumber(bat.OBP) + metricNumber(bat.SLG)) : '-';

    const pitchOuts = rows.reduce((sum, row) => sum + inningsToOuts(row.pitching.IP), 0);
    const innings = pitchOuts / 3;
    pitch.IP = outsToInnings(pitchOuts);
    pitch.ERA = innings ? formatRate((metricNumber(pitch.ER) * 7) / innings) : '-';
    pitch.WHIP = innings ? formatRate((metricNumber(pitch.H) + metricNumber(pitch.BB)) / innings) : '-';

    const fieldOuts = rows.reduce((sum, row) => sum + inningsToOuts(row.fielding.INN), 0);
    fielding.INN = outsToInnings(fieldOuts);
    const tc = metricNumber(fielding.TC);
    fielding.FPCT = tc ? formatRate((metricNumber(fielding.A) + metricNumber(fielding.PO)) / tc) : '-';

    return { bat, pitch, fielding };
  }

  function sortSeasons(seasons, currentSeason) {
    const termRank = name => /^fall/i.test(name) ? 2 : /^spring/i.test(name) ? 1 : 0;
    return [...seasons].sort((a, b) => {
      if (a.id === currentSeason) return -1;
      if (b.id === currentSeason) return 1;
      const ay = Number(a.name?.match(/20\d{2}/)?.[0] || 0);
      const by = Number(b.name?.match(/20\d{2}/)?.[0] || 0);
      return by - ay || termRank(b.name) - termRank(a.name) || String(b.name).localeCompare(String(a.name));
    });
  }

  function decorateStatsImporter() {
    const button = document.querySelector('#import-csv');
    if (!button || button.dataset.jdImporter === '1') return;
    button.dataset.jdImporter = '1';
    button.textContent = 'GameChanger Import';
  }

  async function openGameChangerImporter() {
    const editor = document.querySelector('#editor');
    const content = document.querySelector('#editor-content');
    if (!editor || !content) return;

    const response = await fetch('/api/admin/content', {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const state = await response.json();
    if (!response.ok) {
      alert(state.error || 'Could not load Admin data.');
      return;
    }

    let parsedRows = null;
    let detectedSeason = null;
    let reviews = [];

    content.innerHTML = `
      <div class="jd-import-heading">
        <span class="eyebrow">GAMECHANGER</span>
        <h2>Import roster & stats</h2>
        <p>Upload the normal GameChanger team stats CSV. The importer rebuilds that season’s roster, reuses matching player profiles and keeps every other season intact.</p>
      </div>
      <div class="jd-import-form">
        <label class="jd-import-file">
          GameChanger CSV
          <input type="file" id="jd-gc-file" accept=".csv,text/csv">
        </label>
        <label>
          Season
          <select id="jd-gc-season"></select>
        </label>
        <p class="jd-import-note">Spring/Fall and the year are detected from filenames such as “Jersey Dodgers Spring 2025 Stats.csv”.</p>
        <div id="jd-import-preview"></div>
        <p id="jd-import-message" role="status"></p>
        <div class="jd-import-actions">
          <button type="button" class="button" id="jd-review-import">Review import</button>
          <button type="button" class="button" id="jd-apply-import" hidden>Import & publish</button>
        </div>
      </div>
    `;

    const fileInput = content.querySelector('#jd-gc-file');
    const seasonSelect = content.querySelector('#jd-gc-season');
    const preview = content.querySelector('#jd-import-preview');
    const message = content.querySelector('#jd-import-message');
    const apply = content.querySelector('#jd-apply-import');

    const renderSeasonOptions = info => {
      const seasons = state.data.seasons || [];
      const detectedExisting = info && seasons.find(s => s.name.toLowerCase() === info.name.toLowerCase());
      seasonSelect.innerHTML = seasons.map(s =>
        `<option value="${s.id}" ${detectedExisting?.id === s.id ? 'selected' : ''}>${s.name}</option>`
      ).join('');

      if (info && !detectedExisting) {
        seasonSelect.insertAdjacentHTML(
          'afterbegin',
          `<option value="__create__" selected>Create ${info.name}</option>`
        );
      }
    };

    renderSeasonOptions(null);

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      detectedSeason = seasonInfoFromFilename(file.name);
      renderSeasonOptions(detectedSeason);
      parsedRows = null;
      reviews = [];
      preview.innerHTML = '';
      apply.hidden = true;
      message.textContent = detectedSeason
        ? `Detected ${detectedSeason.name}. Choose Review import.`
        : 'Season was not detected from the filename. Choose the correct season, then Review import.';
    });

    content.querySelector('#jd-review-import').onclick = async () => {
      try {
        const file = fileInput.files?.[0];
        if (!file || file.size > 4_000_000) throw new Error('Choose a GameChanger CSV under 4 MB.');

        parsedRows = parseGameChangerFile(await file.text());

        const existingPlayers = state.data.players || [];
        reviews = [];

        let exact = 0, fresh = 0;

        parsedRows.forEach((row, index) => {
          const sameName = existingPlayers.filter(p => normalizedPlayerName(p.name) === row.key);
          const exactMatch = sameName.find(p => String(p.number || '').trim() === String(row.number || '').trim() && String(row.number || '').trim());

          row.importIndex = index;
          row.exactPlayerId = exactMatch?.id || '';
          row.sameNameCandidates = sameName;

          if (exactMatch) {
            exact++;
          } else if (sameName.length) {
            reviews.push(row);
          } else {
            fresh++;
          }
        });

        // Duplicate names inside the same export (for example one row with a jersey
        // number and another blank-number row) also need review instead of silently splitting.
        const byName = new Map();
        parsedRows.forEach(row => {
          if (!byName.has(row.key)) byName.set(row.key, []);
          byName.get(row.key).push(row);
        });
        byName.forEach(group => {
          if (group.length < 2) return;
          group.forEach(row => {
            if (!row.exactPlayerId && !reviews.includes(row)) reviews.push(row);
          });
        });

        const seasonLabel = seasonSelect.value === '__create__'
          ? detectedSeason?.name || 'New season'
          : state.data.seasons.find(s => s.id === seasonSelect.value)?.name || seasonSelect.value;

        preview.innerHTML = `
          <div class="jd-import-summary">
            <div><strong>${parsedRows.length}</strong><span>player rows</span></div>
            <div><strong>${exact}</strong><span>exact profile matches</span></div>
            <div><strong>${fresh}</strong><span>new profiles</span></div>
            <div class="${reviews.length ? 'needs-review' : ''}"><strong>${reviews.length}</strong><span>need review</span></div>
          </div>
          <div class="jd-import-season-confirm"><strong>${seasonLabel}</strong><span>The existing stats/roster for this season will be refreshed from this file.</span></div>
          ${reviews.length ? `
            <div class="jd-review-list">
              <h3>Needs review</h3>
              <p>These names already exist or appear more than once. Tell the importer whether they are the same player.</p>
              ${reviews.map(row => {
                const sameFile = (byName.get(row.key) || [])
                  .filter(other => other !== row && other.number)
                  .map(other => `<option value="file:${other.importIndex}">Same player as ${other.name} #${other.number}</option>`)
                  .join('');

                const existing = row.sameNameCandidates
                  .map(p => `<option value="existing:${p.id}">${p.name} #${p.number || '—'} · use saved profile/photo</option>`)
                  .join('');

                return `
                  <label class="jd-review-row">
                    <span><strong>${row.name}</strong><small>#${row.number || '—'} · ${row.position || 'Position not detected'}</small></span>
                    <select data-review-index="${row.importIndex}">
                      <option value="">Choose…</option>
                      ${existing}
                      ${sameFile}
                      <option value="new">Create a separate player</option>
                    </select>
                  </label>
                `;
              }).join('')}
            </div>
          ` : ''}
        `;

        message.textContent = reviews.length
          ? 'Resolve the highlighted player matches, then Import & publish.'
          : 'Everything is matched. Ready to import.';
        apply.hidden = false;
      } catch (error) {
        parsedRows = null;
        apply.hidden = true;
        preview.innerHTML = '';
        message.textContent = error.message;
      }
    };

    apply.onclick = async () => {
      if (!parsedRows) return;

      try {
        const reviewChoices = new Map();
        for (const select of preview.querySelectorAll('[data-review-index]')) {
          if (!select.value) throw new Error('Choose an option for every player under Needs review.');
          reviewChoices.set(Number(select.dataset.reviewIndex), select.value);
        }

        apply.disabled = true;
        message.textContent = 'Importing roster and stats…';

        // Refresh again so the publish is based on the newest revision.
        const latestResponse = await fetch('/api/admin/content', {
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const latest = await latestResponse.json();
        if (!latestResponse.ok) throw new Error(latest.error || 'Could not refresh Admin data.');

        const data = structuredClone(latest.data);

        let seasonId = seasonSelect.value;
        let seasonLabel;

        if (seasonId === '__create__') {
          if (!detectedSeason) throw new Error('Choose an existing season because a new season could not be detected from this filename.');
          seasonId = detectedSeason.id;
          seasonLabel = detectedSeason.name;

          if (!data.seasons.some(s => s.id === seasonId || s.name.toLowerCase() === seasonLabel.toLowerCase())) {
            data.seasons.push({
              id: seasonId,
              name: seasonLabel,
              status: seasonId === data.settings.currentSeason ? 'active' : 'archived',
              note: 'Imported from GameChanger'
            });
            data.seasons = sortSeasons(data.seasons, data.settings.currentSeason);
          }
        } else {
          seasonLabel = data.seasons.find(s => s.id === seasonId)?.name || seasonId;
        }

        const playerById = new Map(data.players.map(p => [String(p.id), p]));
        const exactLookup = new Map(
          data.players.map(p => [
            `${normalizedPlayerName(p.name)}|${String(p.number || '').trim()}`,
            p
          ])
        );

        const assigned = new Map();
        const createdForRow = new Map();

        const createPlayer = row => {
          const p = {
            id: crypto.randomUUID(),
            name: row.name,
            number: row.number || '',
            position: row.position || '',
            bats: '',
            throws: '',
            bio: '',
            photo: '',
            active: seasonId === data.settings.currentSeason
          };
          data.players.push(p);
          playerById.set(p.id, p);
          return p;
        };

        const resolveRowPlayer = row => {
          if (assigned.has(row.importIndex)) return assigned.get(row.importIndex);

          const exact = exactLookup.get(`${row.key}|${String(row.number || '').trim()}`);
          if (exact && row.number) {
            assigned.set(row.importIndex, exact);
            return exact;
          }

          const choice = reviewChoices.get(row.importIndex);

          if (choice?.startsWith('existing:')) {
            const p = playerById.get(choice.slice('existing:'.length));
            if (p) {
              assigned.set(row.importIndex, p);
              return p;
            }
          }

          if (choice?.startsWith('file:')) {
            const sourceIndex = Number(choice.slice('file:'.length));
            const sourceRow = parsedRows.find(r => r.importIndex === sourceIndex);
            if (sourceRow) {
              const p = resolveRowPlayer(sourceRow);
              assigned.set(row.importIndex, p);
              return p;
            }
          }

          const p = createPlayer(row);
          assigned.set(row.importIndex, p);
          createdForRow.set(row.importIndex, p);
          return p;
        };

        parsedRows.forEach(row => {
          const player = resolveRowPlayer(row);
          if (!player.position && row.position) player.position = row.position;
          if (!player.number && row.number) player.number = row.number;
          if (seasonId === data.settings.currentSeason) player.active = true;
        });

        // A full GameChanger export becomes the authoritative roster/stat set for
        // the selected season. Other seasons remain untouched.
        data.stats = data.stats.filter(stat => stat.season !== seasonId);

        const rowsByPlayer = new Map();
        parsedRows.forEach(row => {
          const player = assigned.get(row.importIndex);
          if (!player) return;
          if (!rowsByPlayer.has(player.id)) rowsByPlayer.set(player.id, []);
          rowsByPlayer.get(player.id).push(row);
        });

        rowsByPlayer.forEach((rows, playerId) => {
          const merged = mergeImportedStats(rows);
          data.stats.push({
            id: crypto.randomUUID(),
            season: seasonId,
            player: playerId,
            bat: merged.bat,
            pitch: merged.pitch,
            fielding: merged.fielding,
            source: `GameChanger · ${seasonLabel}`
          });
        });

        const save = await fetch('/api/admin/content', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision: latest.revision, data })
        });

        const result = await save.json();
        if (!save.ok) throw new Error(result.error || 'The import could not be published.');

        message.textContent =
          `${seasonLabel} imported: ${rowsByPlayer.size} players. Roster, batting, pitching and fielding are now published.`;
        setTimeout(() => location.reload(), 700);
      } catch (error) {
        apply.disabled = false;
        message.textContent = error.message;
      }
    };

    editor.showModal();
  }

  function setupOpenEditor(mediaId = '') {
    const form = document.querySelector('#editor-content #record-form');
    if (!formIsMedia(form)) return;
    installFraming(form, mediaId);
    installVideoFraming(form, mediaId);
    installLargeVideoUpload(form);
    cleanupMediaEditor(form);

    if (form.dataset.jdVideoLinkHelp !== '1') {
      form.dataset.jdVideoLinkHelp = '1';
      const link = form.querySelector('[name="link"]');
      if (link) {
        const note = document.createElement('small');
        note.className = 'jd-video-link-help';
        note.textContent =
          'For an Instagram Reel/post or YouTube video: choose Category = Video and paste the full link here. It will embed on the website.';
        link.parentElement?.append(note);
      }
    }
  }

  // No endless observer and no endless interval.
  document.addEventListener('click', event => {
    const importer = event.target.closest('#import-csv');
    if (importer) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openGameChangerImporter().catch(error => alert(error.message));
      return;
    }

    const action = event.target.closest('[data-jd-action]');
    if (action) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeActionMenus();
      handleMediaAction(action);
      return;
    }

    if (!event.target.closest('.jd-actions-menu')) closeActionMenus();

    const edit = event.target.closest('button[data-edit]');
    if (edit) {
      currentMediaId = String(edit.dataset.edit || '');
      [0, 50, 140].forEach(delay => setTimeout(() => setupOpenEditor(currentMediaId), delay));
    }

    if (event.target.closest('#add-item')) {
      currentMediaId = '';
      [0, 50, 140].forEach(delay => setTimeout(() => setupOpenEditor(''), delay));
    }

    if (event.target.closest('[data-section="media"]')) {
      setTimeout(refreshMediaCache, 120);
    }

    if (event.target.closest('[data-section="stats"]')) {
      [80, 180].forEach(delay => setTimeout(decorateStatsImporter, delay));
    }

    if (event.target.closest('#save-all')) {
      setTimeout(refreshMediaCache, 900);
    }
  }, true);

  document.addEventListener('jd-admin-render', event => {
    const next=event.detail?.section||document.body.dataset.adminSection||'';
    if(next==='media')setTimeout(refreshMediaCache,80);
    if(next==='stats')[80,180].forEach(delay=>setTimeout(decorateStatsImporter,delay));
  });

  document.addEventListener('input', event => {
    if (event.target.matches('#filter')) setTimeout(decorateMediaList, 0);
  });

  // Runs before the original Admin onsubmit handler.
  document.addEventListener('submit', event => {
    const form = event.target.closest('#editor-content #record-form');
    if (!formIsMedia(form)) return;

    prepareFrameForSubmit(form);


    setTimeout(decorateMediaList, 120);
  }, true);

})();
