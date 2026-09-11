(() => {
  'use strict';

  // Store the featured framing position inside the existing caption so this
  // works without changing the site's current data schema.
  const FOCUS_RE = /\[\[JD_FOCUS:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  let mediaCache = new Map();
  let currentMediaId = '';

  const clamp = n => Math.max(0, Math.min(100, Number(n) || 50));

  function parseFocus(caption = '') {
    FOCUS_RE.lastIndex = 0;
    const match = FOCUS_RE.exec(String(caption || ''));
    FOCUS_RE.lastIndex = 0;
    return match ? { x: clamp(match[1]), y: clamp(match[2]) } : { x: 50, y: 50 };
  }

  function cleanCaption(caption = '') {
    FOCUS_RE.lastIndex = 0;
    const clean = String(caption || '')
      .replace(FOCUS_RE, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    FOCUS_RE.lastIndex = 0;
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
      dot.setAttribute('aria-label', dot.title);
      thumb.append(dot);

      const text = row.querySelector('.admin-row-info > span:last-child');
      if (text) {
        const badge = document.createElement('span');
        badge.className = 'jd-featured-badge';
        badge.textContent = item.featureOrder ? `FEATURED #${item.featureOrder}` : 'FEATURED';
        text.append(badge);
      }
    });
  }

  function mediaFormIsOpen() {
    const form = document.querySelector('#editor-content #record-form');
    return form && form.querySelector('[name="featured"]') && form.querySelector('[name="image"]');
  }

  function setupFeaturedFraming(mediaId = '') {
    const form = document.querySelector('#editor-content #record-form');
    if (!form || form.dataset.jdFramingReady === '1') return;
    if (!form.querySelector('[name="featured"]') || !form.querySelector('[name="image"]')) return;

    const imageInput = form.querySelector('[name="image"]');
    const captionInput = form.querySelector('[name="caption"]');
    if (!imageInput || !captionInput) return;

    form.dataset.jdFramingReady = '1';

    const cached = mediaCache.get(String(mediaId || ''));
    const initialCaption = cached?.caption ?? captionInput.value ?? '';
    const initialFocus = parseFocus(initialCaption);

    // Keep the marker out of the visible textarea while the user edits.
    captionInput.value = cleanCaption(captionInput.value);

    const panel = document.createElement('section');
    panel.className = 'jd-framing-panel wide';
    panel.innerHTML = `
      <div class="jd-framing-heading">
        <div>
          <span class="eyebrow">HOMEPAGE FEATURED PHOTO</span>
          <h3>Choose the visible area</h3>
        </div>
        <button type="button" class="jd-center-focus">Center photo</button>
      </div>
      <p>
        This works with the photo you already uploaded. Drag the picture inside
        the square to choose what the homepage shows. The original full photo is
        never cropped or changed.
      </p>
      <div class="jd-framing-workspace">
        <div class="jd-framing-stage" tabindex="0" aria-label="Featured photo framing preview">
          <img alt="Featured framing preview">
          <span class="jd-framing-crosshair" aria-hidden="true"></span>
          <span class="jd-drag-tip">DRAG PHOTO</span>
        </div>
        <div class="jd-framing-details">
          <strong>Homepage framing</strong>
          <small>Move up/down for heads and bodies. Move left/right for groups.</small>
          <label>
            Vertical position
            <input class="jd-focus-y" type="range" min="0" max="100" step="1">
          </label>
          <label>
            Horizontal position
            <input class="jd-focus-x" type="range" min="0" max="100" step="1">
          </label>
          <span class="jd-focus-readout"></span>
        </div>
      </div>
      <input type="hidden" name="jd-focus-x">
      <input type="hidden" name="jd-focus-y">
    `;

    const grid = form.querySelector('.form-grid');
    (grid || form).append(panel);

    const stage = panel.querySelector('.jd-framing-stage');
    const preview = panel.querySelector('.jd-framing-stage img');
    const xRange = panel.querySelector('.jd-focus-x');
    const yRange = panel.querySelector('.jd-focus-y');
    const xHidden = panel.querySelector('[name="jd-focus-x"]');
    const yHidden = panel.querySelector('[name="jd-focus-y"]');
    const readout = panel.querySelector('.jd-focus-readout');
    const center = panel.querySelector('.jd-center-focus');

    let focus = { ...initialFocus };
    let drag = null;

    function getImageUrl() {
      return String(imageInput.value || '').trim();
    }

    function paint() {
      const url = getImageUrl();
      panel.classList.toggle('jd-no-feature-image', !url);
      if (url && preview.src !== new URL(url, location.href).href) {
        preview.src = url;
      }
      preview.style.objectPosition = `${focus.x}% ${focus.y}%`;
      xRange.value = String(Math.round(focus.x));
      yRange.value = String(Math.round(focus.y));
      xHidden.value = String(Math.round(focus.x));
      yHidden.value = String(Math.round(focus.y));
      readout.textContent = `Focus: ${Math.round(focus.x)}% horizontal · ${Math.round(focus.y)}% vertical`;
    }

    function setFocus(x, y) {
      focus.x = clamp(x);
      focus.y = clamp(y);
      paint();
    }

    xRange.addEventListener('input', () => setFocus(xRange.value, focus.y));
    yRange.addEventListener('input', () => setFocus(focus.x, yRange.value));
    center.addEventListener('click', () => setFocus(50, 50));

    stage.addEventListener('pointerdown', event => {
      if (!getImageUrl()) return;
      const rect = stage.getBoundingClientRect();
      drag = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        startX: focus.x,
        startY: focus.y,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
        pointerId: event.pointerId
      };
      stage.setPointerCapture?.(event.pointerId);
      stage.classList.add('is-dragging');
      event.preventDefault();
    });

    stage.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.pointerX;
      const dy = event.clientY - drag.pointerY;

      // Dragging the image upward reveals more of the bottom, just like a crop tool.
      setFocus(
        drag.startX - (dx / drag.width) * 100,
        drag.startY - (dy / drag.height) * 100
      );
      event.preventDefault();
    });

    function stopDrag(event) {
      if (!drag) return;
      if (event?.pointerId !== undefined && event.pointerId !== drag.pointerId) return;
      drag = null;
      stage.classList.remove('is-dragging');
    }
    stage.addEventListener('pointerup', stopDrag);
    stage.addEventListener('pointercancel', stopDrag);

    // If a new image is uploaded while this editor is open, the original admin
    // code updates the readonly URL field. Check a few times after the file change
    // instead of running an endless observer/timer.
    const upload = form.querySelector('[data-upload="image"]');
    upload?.addEventListener('change', () => {
      [250, 650, 1300, 2200].forEach(delay => setTimeout(paint, delay));
    });

    paint();
  }

  function prepareFocusForSubmit(form) {
    if (!form || form.dataset.jdFramingReady !== '1') return;

    const caption = form.querySelector('[name="caption"]');
    const image = form.querySelector('[name="image"]');
    const x = form.querySelector('[name="jd-focus-x"]');
    const y = form.querySelector('[name="jd-focus-y"]');
    if (!caption) return;

    const clean = cleanCaption(caption.value);
    if (!String(image?.value || '').trim()) {
      caption.value = clean;
      return;
    }

    const token = `[[JD_FOCUS:${Math.round(clamp(x?.value))},${Math.round(clamp(y?.value))}]]`;
    caption.value = clean ? `${clean}\n${token}` : token;
  }

  // Initialize only in direct response to Admin actions. No MutationObserver,
  // no permanent interval, and nothing continuously scans the editor.
  document.addEventListener('click', event => {
    const edit = event.target.closest('button[data-edit]');
    if (edit) {
      currentMediaId = String(edit.dataset.edit || '');
      [0, 60, 160].forEach(delay => setTimeout(() => {
        if (mediaFormIsOpen()) setupFeaturedFraming(currentMediaId);
      }, delay));
    }

    if (event.target.closest('[data-section="media"]')) {
      setTimeout(() => {
        refreshMediaCache();
        decorateMediaList();
      }, 120);
    }

    if (event.target.closest('#save-all')) {
      setTimeout(refreshMediaCache, 900);
      setTimeout(refreshMediaCache, 1800);
    }
  }, true);

  document.addEventListener('input', event => {
    if (event.target.matches('#filter')) setTimeout(decorateMediaList, 0);
  });

  // Capture phase runs before the existing Admin form's onsubmit handler.
  document.addEventListener('submit', event => {
    const form = event.target.closest('#editor-content #record-form');
    if (!form || !form.querySelector('[name="featured"]')) return;

    prepareFocusForSubmit(form);

    if (currentMediaId) {
      const cached = mediaCache.get(currentMediaId);
      if (cached) {
        cached.featured = Boolean(form.querySelector('[name="featured"]')?.checked);
        cached.featureOrder = Number(form.querySelector('[name="featureOrder"]')?.value || 0);
        cached.caption = form.querySelector('[name="caption"]')?.value || cached.caption;
      }
    }

    setTimeout(decorateMediaList, 120);
  }, true);

  // One short retry sequence after page load, only to wait for authentication.
  [700, 1500, 3000].forEach(delay => setTimeout(refreshMediaCache, delay));
})();
