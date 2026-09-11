(() => {
  'use strict';

  const FRAME_RE = /\[\[JD_FRAME:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  const OLD_FOCUS_RE = /\[\[JD_FOCUS:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
  const CHUNK_BYTES = 3.5 * 1024 * 1024;

  let mediaCache = new Map();
  let currentMediaId = '';

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

  function cleanCaption(caption = '') {
    FRAME_RE.lastIndex = 0;
    OLD_FOCUS_RE.lastIndex = 0;
    const clean = String(caption || '')
      .replace(FRAME_RE, '')
      .replace(OLD_FOCUS_RE, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    FRAME_RE.lastIndex = 0;
    OLD_FOCUS_RE.lastIndex = 0;
    return clean;
  }

  async function refreshMediaCache() {
    try {
      const response = await fetch('/api/admin/content', { credentials: 'same-origin' });
      if (!response.ok) return false;
      const body = await response.json();
      mediaCache = new Map((body.data?.media || []).map(item => [String(item.id), item]));
      decorateMediaList();
      return true;
    } catch {
      return false;
    }
  }

  function decorateMediaList() {
    document.querySelectorAll('#item-list .admin-row').forEach(row => {
      const edit = row.querySelector('button[data-edit]');
      const thumb = row.querySelector('.admin-media-thumb');
      if (!edit || !thumb) return;

      const item = mediaCache.get(String(edit.dataset.edit || ''));

      row.querySelector('.jd-featured-badge')?.remove();
      thumb.querySelector('.jd-featured-dot')?.remove();
      row.classList.remove('jd-featured-row');

      if (!item?.featured) return;

      row.classList.add('jd-featured-row');

      const dot = document.createElement('span');
      dot.className = 'jd-featured-dot';
      dot.title = `Featured on homepage${item.featureOrder ? ` · Position ${item.featureOrder}` : ''}`;
      thumb.append(dot);

      const text = row.querySelector('.admin-row-info > span:last-child');
      if (text) {
        const badge = document.createElement('span');
        badge.className = 'jd-featured-badge';
        badge.textContent = item.featureOrder ? `FEATURED #${item.featureOrder}` : 'FEATURED';
        text.append(badge);
      }
    });

    // Keep the three homepage-featured photos pinned at the top of the
    // current Admin media list, ordered by #1, #2, #3.
    const list = document.querySelector('#item-list');
    if (list) {
      const rows = [...list.querySelectorAll(':scope > .admin-row')];
      const originalIndex = new Map(rows.map((row, index) => [row, index]));

      rows.sort((a, b) => {
        const aId = a.querySelector('button[data-edit]')?.dataset.edit || '';
        const bId = b.querySelector('button[data-edit]')?.dataset.edit || '';
        const aItem = mediaCache.get(String(aId));
        const bItem = mediaCache.get(String(bId));
        const aFeatured = Boolean(aItem?.featured);
        const bFeatured = Boolean(bItem?.featured);

        if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;

        if (aFeatured && bFeatured) {
          const aOrder = Number(aItem?.featureOrder || 99);
          const bOrder = Number(bItem?.featureOrder || 99);
          if (aOrder !== bOrder) return aOrder - bOrder;
        }

        return (originalIndex.get(a) || 0) - (originalIndex.get(b) || 0);
      });

      rows.forEach(row => list.append(row));
    }
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
          <span class="eyebrow">HOMEPAGE FEATURED PHOTO</span>
          <h3>Frame the featured picture</h3>
        </div>
        <button type="button" class="jd-reset-frame">Reset</button>
      </div>
      <p>
        This uses the photo you already uploaded. At 1.00× the full picture fits inside the tile.
        Increase Zoom when you want a tighter crop, then drag the photo to choose the area you want.
      </p>
      <div class="jd-framing-workspace">
        <div class="jd-framing-stage" tabindex="0" aria-label="Featured photo framing preview">
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
    if (!caption) return;

    const clean = cleanCaption(caption.value);

    if (!String(image?.value || '').trim()) {
      caption.value = clean;
      return;
    }

    const x = clamp(form.querySelector('[name="jd-frame-x"]')?.value ?? 50, 0, 100);
    const y = clamp(form.querySelector('[name="jd-frame-y"]')?.value ?? 50, 0, 100);
    const zoom = clamp(form.querySelector('[name="jd-frame-zoom"]')?.value ?? 1, .85, 2.5);

    const marker = `[[JD_FRAME:${Math.round(x)},${Math.round(y)},${zoom.toFixed(2)}]]`;
    caption.value = clean ? `${clean}\n${marker}` : marker;
  }

  function setupOpenEditor(mediaId = '') {
    const form = document.querySelector('#editor-content #record-form');
    if (!formIsMedia(form)) return;
    installFraming(form, mediaId);
    installLargeVideoUpload(form);

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

    if (event.target.closest('#save-all')) {
      setTimeout(refreshMediaCache, 900);
    }
  }, true);

  document.addEventListener('input', event => {
    if (event.target.matches('#filter')) setTimeout(decorateMediaList, 0);
  });

  // Runs before the original Admin onsubmit handler.
  document.addEventListener('submit', event => {
    const form = event.target.closest('#editor-content #record-form');
    if (!formIsMedia(form)) return;

    prepareFrameForSubmit(form);

    if (currentMediaId) {
      const item = mediaCache.get(currentMediaId);
      if (item) {
        item.featured = Boolean(form.querySelector('[name="featured"]')?.checked);
        item.featureOrder = Number(form.querySelector('[name="featureOrder"]')?.value || 0);
      }
    }

    setTimeout(decorateMediaList, 120);
  }, true);

  [700, 1500, 2800].forEach(delay => setTimeout(refreshMediaCache, delay));
})();
