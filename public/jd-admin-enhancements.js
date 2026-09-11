(() => {
  const FOCUS_RE = /\[\[JD_FOCUS:\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\]/gi;
  let currentMediaId = null;
  let serverMedia = new Map();
  const pendingFeatured = new Map();

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

  async function refreshAdminData() {
    try {
      const response = await fetch('/api/admin/content', { credentials: 'same-origin' });
      if (!response.ok) return;
      const body = await response.json();
      serverMedia = new Map((body.data?.media || []).map(item => [String(item.id), item]));
      markFeaturedRows();
    } catch {}
  }

  function isFeatured(id) {
    if (pendingFeatured.has(id)) return pendingFeatured.get(id);
    return Boolean(serverMedia.get(id)?.featured);
  }

  function markFeaturedRows() {
    document.querySelectorAll('#item-list .admin-row').forEach(row => {
      const edit = row.querySelector('button[data-edit]');
      const id = String(edit?.dataset.edit || '');
      const thumb = row.querySelector('.admin-media-thumb');
      if (!id || !thumb) return;
      let dot = thumb.querySelector('.jd-featured-dot');
      if (isFeatured(id)) {
        if (!dot) {
          dot = document.createElement('span');
          dot.className = 'jd-featured-dot';
          dot.title = 'Featured on homepage';
          dot.setAttribute('aria-label', 'Featured on homepage');
          thumb.append(dot);
        }
        row.classList.add('jd-is-featured');
      } else {
        dot?.remove();
        row.classList.remove('jd-is-featured');
      }
    });
  }

  function makeFocalControl(form) {
    if (form.dataset.jdFocalReady === '1') return;
    if (!form.querySelector('[name="featureOrder"]') || !form.querySelector('[name="featured"]')) return;

    const imageInput = form.querySelector('[name="image"]');
    const caption = form.querySelector('[name="caption"]');
    if (!imageInput || !caption) return;

    form.dataset.jdFocalReady = '1';

    const initial = readFocus(caption.value);
    caption.value = cleanCaption(caption.value);

    const block = document.createElement('div');
    block.className = 'jd-focal-control wide';
    block.innerHTML = `
      <div class="jd-focal-head">
        <div>
          <span class="eyebrow">FEATURED PHOTO FRAMING</span>
          <strong>Choose what shows on the homepage</strong>
        </div>
        <button type="button" class="jd-focus-reset">Center</button>
      </div>
      <p>Drag the photo inside the square. This only changes the homepage framing — the original photo stays untouched and opens in full when clicked.</p>
      <div class="jd-focus-stage" tabindex="0" aria-label="Drag photo to choose featured crop">
        <img alt="Featured photo framing preview">
        <span class="jd-focus-guide" aria-hidden="true"></span>
      </div>
      <div class="jd-focus-readout">Focus: <b>50% / 50%</b></div>
    `;

    const formGrid = form.querySelector('.form-grid');
    formGrid?.append(block);

    const stage = block.querySelector('.jd-focus-stage');
    const image = block.querySelector('img');
    const readout = block.querySelector('.jd-focus-readout b');
    const reset = block.querySelector('.jd-focus-reset');

    let focus = { ...initial };
    let drag = null;

    function update() {
      const src = imageInput.value.trim();
      image.src = src || '';
      block.classList.toggle('jd-no-image', !src);
      image.style.objectPosition = `${focus.x}% ${focus.y}%`;
      readout.textContent = `${Math.round(focus.x)}% / ${Math.round(focus.y)}%`;
    }

    function setFocus(x, y) {
      focus.x = clamp(x);
      focus.y = clamp(y);
      form.dataset.jdFocusX = String(focus.x);
      form.dataset.jdFocusY = String(focus.y);
      update();
    }

    form.dataset.jdFocusX = String(focus.x);
    form.dataset.jdFocusY = String(focus.y);
    update();

    stage.addEventListener('pointerdown', event => {
      if (!imageInput.value.trim()) return;
      const rect = stage.getBoundingClientRect();
      drag = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        x: focus.x,
        y: focus.y,
        width: rect.width,
        height: rect.height
      };
      stage.setPointerCapture?.(event.pointerId);
      stage.classList.add('is-dragging');
    });

    stage.addEventListener('pointermove', event => {
      if (!drag) return;
      const dx = event.clientX - drag.pointerX;
      const dy = event.clientY - drag.pointerY;
      setFocus(drag.x - (dx / drag.width) * 100, drag.y - (dy / drag.height) * 100);
    });

    const endDrag = () => {
      drag = null;
      stage.classList.remove('is-dragging');
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    reset.addEventListener('click', () => setFocus(50, 50));

    const previewObserver = new MutationObserver(update);
    previewObserver.observe(form, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });

    const syncTimer = setInterval(() => {
      if (!document.body.contains(form)) {
        clearInterval(syncTimer);
        previewObserver.disconnect();
        return;
      }
      update();
    }, 500);
  }

  function enhanceEditor() {
    const form = document.querySelector('#editor-content #record-form');
    if (!form) return;
    makeFocalControl(form);
  }

  document.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit]');
    if (edit) currentMediaId = String(edit.dataset.edit || '');
    if (event.target.closest('#add-item')) currentMediaId = null;
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target.closest('#editor-content #record-form');
    if (!form || form.dataset.jdFocalReady !== '1') return;

    const caption = form.querySelector('[name="caption"]');
    const imageInput = form.querySelector('[name="image"]');
    const featured = form.querySelector('[name="featured"]');
    if (!caption) return;

    const clean = cleanCaption(caption.value);
    if (imageInput?.value.trim()) {
      const x = clamp(form.dataset.jdFocusX);
      const y = clamp(form.dataset.jdFocusY);
      const token = `[[JD_FOCUS:${Math.round(x)},${Math.round(y)}]]`;
      caption.value = clean ? `${clean}\n${token}` : token;
    } else {
      caption.value = clean;
    }

    if (currentMediaId && featured) pendingFeatured.set(currentMediaId, featured.checked);

    setTimeout(() => {
      markFeaturedRows();
      refreshAdminData();
    }, 250);
  }, true);

  const observer = new MutationObserver(() => {
    enhanceEditor();
    markFeaturedRows();
  });

  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    enhanceEditor();
    refreshAdminData();
    setInterval(() => {
      if (document.querySelector('#item-list .admin-row')) refreshAdminData();
    }, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
