(() => {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- 1. Nền particles (canvas) ---------- */
  (() => {
    const canvas = $('#bg-canvas');
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return;
    let width = 0, height = 0, particles = [];

    function resizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(70, Math.floor((width * height) / 22000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.6 + 0.6,
        hue: [210, 265, 330, 140][Math.floor(Math.random() * 4)],
      }));
    }

    function drawParticles() {
      ctx.clearRect(0, 0, width, height);
      const maxDist = 130;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < maxDist) {
            ctx.strokeStyle = `rgba(88, 166, 255, ${(1 - d / maxDist) * 0.18})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, 0.7)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(drawParticles);
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    if (!prefersReduced) {
      drawParticles();
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  })();

  /* ---------- 2. Gõ chữ ở hero ---------- */
  (() => {
    const typedEl = $('#typed');
    if (!typedEl) return;
    const phrases = [
      'Dịch ngay khi mọi người đang nói',
      'Hỗ trợ nhiều ngôn ngữ trong cùng một cuộc họp',
      'Họp xong là có biên bản',
    ];

    if (prefersReduced) {
      typedEl.textContent = phrases[0];
      return;
    }
    let p = 0, c = 0, deleting = false;
    const tick = () => {
      const current = phrases[p];
      if (!deleting) {
        c++;
        typedEl.textContent = current.slice(0, c);
        if (c === current.length) {
          deleting = true;
          return setTimeout(tick, 1800);
        }
        return setTimeout(tick, 55);
      }
      c--;
      typedEl.textContent = current.slice(0, c);
      if (c === 0) {
        deleting = false;
        p = (p + 1) % phrases.length;
        return setTimeout(tick, 350);
      }
      setTimeout(tick, 25);
    };
    tick();
  })();

  /* ---------- 3–4. Slide engine: slide hiện tại, dot nav, bộ đếm, hash, auto-fit, hiệu ứng vào slide ---------- */
  const deck = (() => {
    const slides = $$('main > .slide');
    const total = slides.length;
    if (!total) return null;

    const root = document.documentElement;
    const progressBar = $('#progress-bar');
    const nav = $('#nav');
    const counter = $('#slide-counter');
    const dotNav = $('#dot-nav');
    const navAnchors = $$('.nav-links a');
    const MIN_ZOOM = 0.72;
    const SETTLE_MS = 1000;

    let cur = -1;
    let pending = null; // { index, y } while a programmatic scroll is in flight
    let pendingTimer = 0;

    const isFree = (s) => s.classList.contains('slide-free');
    const behavior = () => (prefersReduced ? 'auto' : 'smooth');

    // Mobile menu
    const navToggle = $('#nav-toggle');
    const navLinks = $('#nav-links');
    function closeMenu() {
      if (!navToggle || !navLinks) return;
      navLinks.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
    if (navToggle && navLinks) {
      navToggle.addEventListener('click', () => {
        const open = navLinks.classList.toggle('open');
        navToggle.classList.toggle('open', open);
        navToggle.setAttribute('aria-expanded', String(open));
      });
      $$('a', navLinks).forEach((a) => a.addEventListener('click', closeMenu));
    }

    // Dot nav
    const dots = slides.map((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dot';
      b.dataset.title = s.dataset.title || s.id;
      b.setAttribute('aria-label', `${i + 1}. ${b.dataset.title}`);
      b.addEventListener('click', () => goTo(i));
      if (dotNav) dotNav.appendChild(b);
      return b;
    });

    /* Counters, bars and timeline animate each time their slide becomes active */
    function animateCount(el) {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target)) return;
      if (prefersReduced) {
        el.textContent = target;
        return;
      }
      const duration = 1200;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * eased);
        if (t < 1) requestAnimationFrame(step);
      };
      el.textContent = '0';
      requestAnimationFrame(step);
    }

    function onEnter(slide) {
      $$('[data-count]', slide).forEach(animateCount);
      $$('.bar-fill', slide).forEach((el) => {
        if (el.dataset.width) el.style.width = `${el.dataset.width}%`;
      });
      $$('.timeline', slide).forEach((el) => el.classList.add('visible'));
    }

    function onLeave(slide) {
      if (prefersReduced) return;
      $$('.bar-fill', slide).forEach((el) => { el.style.width = '0%'; });
    }

    const leaveTimers = new WeakMap();
    function setActive(i) {
      if (i === cur || i < 0 || i >= total) return;
      const prev = slides[cur];
      if (prev) {
        prev.classList.remove('active');
        // Keep the outgoing slide visible while it scrolls away
        prev.classList.add('leaving');
        clearTimeout(leaveTimers.get(prev));
        leaveTimers.set(prev, setTimeout(() => prev.classList.remove('leaving'), 900));
        onLeave(prev);
        if (dots[cur]) {
          dots[cur].classList.remove('active');
          dots[cur].removeAttribute('aria-current');
        }
      }
      cur = i;
      const s = slides[i];
      clearTimeout(leaveTimers.get(s));
      s.classList.remove('leaving');
      s.classList.add('active');
      onEnter(s);

      if (dots[i]) {
        dots[i].classList.add('active');
        dots[i].setAttribute('aria-current', 'step');
      }
      if (counter) counter.textContent = `${i + 1} / ${total}`;
      if (progressBar) progressBar.style.width = `${((i + 1) / total) * 100}%`;
      const section = s.dataset.section;
      navAnchors.forEach((a) => a.classList.toggle('current', a.getAttribute('href') === `#${section}`));
      try {
        history.replaceState(null, '', `#${s.id}`);
      } catch (_) { /* file:// or sandbox may refuse */ }
    }

    // Current slide = the one containing the viewport midpoint
    function indexAtMidpoint() {
      const mid = window.scrollY + window.innerHeight / 2;
      for (let i = total - 1; i >= 0; i--) {
        if (slides[i].offsetTop <= mid) return i;
      }
      return 0;
    }

    function settle() {
      clearTimeout(pendingTimer);
      pending = null;
      setActive(indexAtMidpoint());
    }

    function scrollToY(y, index, instant) {
      const maxY = root.scrollHeight - window.innerHeight;
      const top = Math.max(0, Math.min(Math.round(y), maxY));
      // Jumps across several slides (dot nav, Home/End, menu) are instant; one-slide steps animate
      if (Math.abs(top - window.scrollY) > 1.5 * window.innerHeight) instant = true;
      pending = { index, y: top };
      setActive(index);
      window.scrollTo({ top, behavior: instant ? 'auto' : behavior() });
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(settle, instant ? 60 : SETTLE_MS);
    }

    function goTo(i, instant) {
      const idx = Math.max(0, Math.min(total - 1, i));
      scrollToY(slides[idx].offsetTop, idx, instant);
    }

    // Move exactly one slide; inside a free (tall) slide move 75% of the viewport
    function step(dir) {
      const i = pending ? pending.index : indexAtMidpoint();
      const y = pending ? pending.y : window.scrollY;
      const s = slides[i];
      const vh = window.innerHeight;
      if (isFree(s)) {
        const top = s.offsetTop;
        if (dir > 0) {
          const maxY = root.scrollHeight - vh;
          if (y < maxY - 2) scrollToY(Math.min(y + 0.75 * vh, maxY), i);
          return; // end of deck: no wrap-around
        }
        if (y > top + 2) {
          scrollToY(Math.max(y - 0.75 * vh, top), i);
          return;
        }
      }
      const j = i + dir;
      if (j < 0 || j >= total) return;
      goTo(j);
    }

    // Scroll tracking (rAF-throttled); wheel/trackpad scroll is never blocked
    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
          if (!pending) setActive(indexAtMidpoint());
        });
      },
      { passive: true }
    );
    window.addEventListener('scrollend', () => { if (pending) settle(); });
    // A wheel/touch gesture cancels the programmatic target
    ['wheel', 'touchstart'].forEach((ev) =>
      window.addEventListener(ev, () => { if (pending) { clearTimeout(pendingTimer); pending = null; } }, { passive: true })
    );

    // In-page links to a slide (nav, CTA, inline links) → animated jump to that slide
    function slideIndexForHash(hash) {
      if (!hash || hash.length < 2) return -1;
      let el = null;
      try { el = document.getElementById(decodeURIComponent(hash.slice(1))); } catch (_) { el = null; }
      if (!el) return -1;
      const slide = el.closest('.slide');
      return slide ? slides.indexOf(slide) : -1;
    }
    document.addEventListener('click', (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      const hash = a.getAttribute('href');
      const idx = slideIndexForHash(hash);
      if (idx < 0) return;
      e.preventDefault();
      const target = document.getElementById(hash.slice(1));
      // Link to a block inside the appendix: open it and scroll there
      if (target && target.tagName === 'DETAILS' && !target.classList.contains('slide')) {
        target.open = true;
        requestAnimationFrame(() => {
          const y = window.scrollY + target.getBoundingClientRect().top - 80;
          scrollToY(y, idx);
        });
        return;
      }
      goTo(idx);
    });

    /* Auto-fit: CSS zoom on .slide-inner, k >= MIN_ZOOM */
    let fitting = false;
    let fitQueued = false;
    function fitSlide(s) {
      const inner = $('.slide-inner', s);
      if (!inner) return;
      inner.style.zoom = '';
      if (isFree(s) || window.innerWidth <= 720) return;
      const cs = getComputedStyle(s);
      const avail = s.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const fits = (k) => {
        inner.style.zoom = k === 1 ? '' : String(k);
        return inner.getBoundingClientRect().height <= avail + 0.5;
      };
      if (fits(1)) return;
      // Zoom also reflows text (narrower lines wrap less), so binary-search the largest k that fits
      let lo = MIN_ZOOM * 100;
      let hi = 100;
      if (!fits(lo / 100)) {
        console.warn(`[Musubi] Slide "${s.dataset.title || s.id}" cần zoom < ${MIN_ZOOM} — nên chia nhỏ nội dung.`);
        return;
      }
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (fits(mid / 100)) lo = mid;
        else hi = mid;
      }
      fits(lo / 100);
    }
    function fitAll() {
      fitQueued = false;
      fitting = true;
      slides.forEach(fitSlide);
      fitting = false;
    }
    function scheduleFit() {
      if (fitting || fitQueued) return;
      fitQueued = true;
      requestAnimationFrame(fitAll);
    }
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(() => { if (!fitting) scheduleFit(); });
      slides.forEach((s) => {
        const inner = $('.slide-inner', s);
        if (inner && !isFree(s)) ro.observe(inner);
      });
    }
    window.addEventListener('resize', scheduleFit);
    document.addEventListener('toggle', scheduleFit, true);

    // Initial state: fit, then jump (no animation) to the slide in the hash
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    fitAll();
    function jumpToHash() {
      const idx = slideIndexForHash(location.hash);
      if (idx >= 0) {
        window.scrollTo({ top: slides[idx].offsetTop, behavior: 'auto' });
      }
      settle();
    }
    jumpToHash();
    root.classList.add('slides-ready');
    window.addEventListener('load', () => {
      fitAll();
      if (!pending) jumpToHash();
    });

    return {
      slides,
      total,
      step,
      goTo,
      current: () => (pending ? pending.index : indexAtMidpoint()),
      closeMenu,
    };
  })();

  /* ---------- 5. Pipeline: bấm để xem chi tiết ---------- */
  (() => {
    const pipeSteps = $$('.pipe-step');
    const pipeDetail = $('#pipe-detail');
    if (!pipeSteps.length || !pipeDetail) return;

    const PIPE_IMAGES = [
      'mascot-assets/characters/claudina-arm-up.png',
      'mascot-assets/characters/transmaru-hands-up.png',
      'mascot-assets/characters/consal-congrats.png',
      'mascot-assets/characters/inobe-thanks.png',
    ];

    const pipeContent = [
      {
        title: '① Trước họp',
        items: [
          'Tạo dự án và thêm thành viên, chỉ cần làm một lần.',
          'Thêm vài từ chuyên môn của dự án: tên module, từ viết tắt, những từ không cần dịch.',
          'Chọn kiểu biên bản mà nhóm quen dùng.',
        ],
      },
      {
        title: '② Trong họp',
        items: [
          'Musubi nghe qua mic và loa của máy tính, nên dùng được với Teams, Zoom, Meet hay họp trực tiếp.',
          'Chữ và bản dịch hiện ra ngay khi mọi người nói, kèm tên người đang nói.',
          'Gặp từ lạ thì bấm vào xem giải thích.',
        ],
      },
      {
        title: '③ Sau họp',
        items: [
          'Vài phút sau có biên bản: quyết định, việc cần làm, ai làm, hạn khi nào.',
          'Dòng nào cũng bấm xem lại được đúng câu người ta đã nói.',
          'Người phụ trách đọc lại, sửa chỗ chưa đúng rồi mới chốt.',
        ],
      },
      {
        title: '④ Chia sẻ',
        items: [
          'Sao chép hoặc xuất file để gửi cho cả nhóm.',
          'AI không tự gửi gì cả. Người dùng quyết định.',
          'Duyệt những từ mới để buổi sau dịch chuẩn hơn.',
        ],
      },
    ];

    function showPipeStep(index) {
      const data = pipeContent[index];
      if (!data) return;
      current = index;
      pipeSteps.forEach((b) => b.classList.remove('active'));
      void pipeDetail.offsetWidth; // restart the progress bar animation
      pipeSteps[index].classList.add('active');
      pipeDetail.innerHTML = '';
      const inner = document.createElement('div');
      inner.className = 'detail-inner';
      const mascot = document.createElement('img');
      mascot.className = 'detail-mascot';
      mascot.src = PIPE_IMAGES[index];
      mascot.alt = '';
      mascot.draggable = false;
      const h = document.createElement('h3');
      h.textContent = data.title;
      const ul = document.createElement('ul');
      data.items.forEach((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        ul.appendChild(li);
      });
      inner.append(mascot, h, ul);
      pipeDetail.appendChild(inner);
    }

    // Auto-play: step through the four stages in a loop while the slide is on screen.
    const section = pipeDetail.closest('.slide');
    const pipeline = $('.pipeline');
    const STEP_MS = 5000;
    let current = 0;
    let timer = null;

    function schedule() {
      clearTimeout(timer);
      if (prefersReduced) return;
      timer = setTimeout(() => {
        showPipeStep((current + 1) % pipeContent.length);
        schedule();
      }, STEP_MS);
    }

    function startLoop() {
      showPipeStep(0);
      if (pipeline && !prefersReduced) pipeline.classList.add('auto');
      schedule();
    }

    function stopLoop() {
      clearTimeout(timer);
      timer = null;
      if (pipeline) pipeline.classList.remove('auto');
    }

    pipeSteps.forEach((btn, i) => btn.addEventListener('click', () => {
      showPipeStep(i);
      if (timer) schedule();
    }));

    const syncLoop = () => {
      const visible = section && section.classList.contains('active');
      if (visible && !timer) startLoop();
      else if (!visible && timer) stopLoop();
    };
    if (section) new MutationObserver(syncLoop).observe(section, { attributes: true, attributeFilter: ['class'] });
    showPipeStep(0);
    syncLoop();
  })();

  /* ---------- 8. Tabs (AI) ---------- */
  (() => {
    const tabBtns = $$('.tab-btn');
    if (!tabBtns.length) return;
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
        $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${target}`));
      });
    });
  })();

  /* ---------- 9. Video demo: dự phòng khi thiếu file + chip tua ---------- */
  (() => {
    const video = $('#demo-video');
    const fallback = $('#video-fallback');
    if (!video) return;

    let broken = false;
    function markBroken() {
      if (broken) return;
      broken = true;
      try { video.pause(); } catch (_) { /* ignore */ }
      video.hidden = true;
      video.style.display = 'none';
      if (fallback) fallback.removeAttribute('hidden');
    }

    // A failing <source> fires `error` on the source element (it does not bubble to <video>).
    $$('source', video).forEach((s) => s.addEventListener('error', markBroken));
    video.addEventListener('error', markBroken);

    // Loading may already have failed before this script ran. networkState is briefly
    // NO_SOURCE at the start of resource selection, so only trust it once metadata
    // has had time to load (readyState still 0 after 3 s).
    if (video.error) markBroken();
    setTimeout(() => {
      if (video.readyState === 0 && (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)) {
        markBroken();
      }
    }, 3000);

    const usable = () => !broken && !video.error && video.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE;

    $$('.video-chip[data-t]').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (!usable()) return;
        const t = Number(chip.dataset.t);
        if (!Number.isFinite(t)) return;
        try {
          video.currentTime = t;
          const p = video.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) { /* ignore */ }
      });
    });
  })();

  /* ---------- 10. Máy tính ROI ---------- */
  // Pure compute (no DOM) — kept self-contained so it can be copied out and tested in Node.
  const ROI = {
    DAYS: 22,
    REVIEW_MIN: 5,
    STAFF_MD: 4,
    HOURS_PER_MD: 8,
    PILOT_MONTHS: 3,
    SERVER_VND: 24 * 26000,
    RATES: { translate: 15000, textonly: 13000 },
  };

  function computeRoi({ perDay, duration, writing, skip, hourly, rate }) {
    const ops = ROI.STAFF_MD * ROI.HOURS_PER_MD * hourly + ROI.SERVER_VND;
    const net2For = (pd) => {
      const m = pd * ROI.DAYS;
      const hw = (m * Math.max(writing - ROI.REVIEW_MIN, 0)) / 60;
      const hs = (m * skip * duration) / 60;
      const aiCost = ((m * duration) / 60) * rate;
      return { m, hw, hs, aiCost, net: (hw + hs) * hourly - aiCost - ops };
    };
    const base = net2For(perDay);
    const hoursWriting = base.hw;
    const hoursSkip = base.hs;
    const hours = hoursWriting + hoursSkip;
    const ai = base.aiCost;
    const net1 = hoursWriting * hourly - ai - ops;
    const net2 = base.net;
    const payback = net2 > 0 ? (ROI.PILOT_MONTHS * ops) / net2 : null;
    let breakeven = null;
    for (let n = 1; n <= 200; n++) {
      if (net2For(n).net >= 0) { breakeven = n; break; }
    }
    return { meetings: base.m, hoursWriting, hoursSkip, hours, ai, ops, net1, net2, payback, breakeven };
  }

  (() => {
    const root = $('#roi');
    if (!root) return;

    const nf1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
    const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
    const fmt1 = (x) => nf1.format(x).replace('-', '−');
    const millions = (v) => `${fmt1(Math.round(v / 1e5) / 10)} triệu ₫`;

    const num = (id, def) => {
      const el = $(`#${id}`);
      const v = el ? parseFloat(el.value) : NaN;
      return Number.isFinite(v) ? v : def;
    };
    const setText = (id, text) => {
      const el = $(`#${id}`);
      if (el) el.textContent = text;
    };

    function readInputs() {
      const checked = $('input[name="roi-plan"]:checked', root) || $('input[name="roi-plan"]:checked');
      const plan = checked && ROI.RATES[checked.value] ? checked.value : 'translate';
      return {
        perDay: num('roi-perday', 10),
        duration: num('roi-duration', 60),
        writing: num('roi-writing', 45),
        skip: num('roi-skip', 0.3),
        hourly: num('roi-hourly', 100000),
        rate: ROI.RATES[plan],
      };
    }

    function render() {
      const input = readInputs();
      const r = computeRoi(input);

      setText('roi-perday-val', `${nf0.format(input.perDay)} cuộc họp/ngày`);
      setText('roi-duration-val', `${nf0.format(input.duration)} phút`);
      setText('roi-writing-val', `${nf0.format(input.writing)} phút`);
      setText('roi-skip-val', `${nf1.format(input.skip)} người`);
      setText('roi-hourly-val', `${nf0.format(input.hourly)} ₫`);

      setText('roi-hours', `${fmt1(Math.round(r.hours * 10) / 10)} giờ`);
      setText('roi-aicost', millions(r.ai));
      setText('roi-net', millions(r.net2));
      const netEl = $('#roi-net');
      if (netEl) netEl.classList.toggle('negative', r.net2 < 0);
      setText('roi-net-minutes', millions(r.net1));
      const net1El = $('#roi-net-minutes');
      if (net1El) net1El.classList.toggle('negative', r.net1 < 0);
      setText(
        'roi-payback',
        r.payback === null ? 'Chưa hoàn lại được với giả định này' : `${fmt1(Math.round(r.payback * 10) / 10)} tháng`
      );
      setText(
        'roi-breakeven',
        r.breakeven === null ? 'Chưa có lãi với giả định này' : `≥ ${r.breakeven} cuộc họp/ngày`
      );
    }

    root.addEventListener('input', render);
    root.addEventListener('change', render);
    render();
  })();

  /* ---------- 11. Chế độ thuyết trình: click, phím tắt, màn đen, ẩn con trỏ ---------- */
  (() => {
    const hint = $('#presenter-hint');
    if (!deck) return;
    if (window.matchMedia('(pointer: coarse)').matches) {
      if (hint) hint.classList.add('hidden');
      return;
    }

    const STORE_KEY = 'musubi-presenter';
    const HINT_ON = 'Click: tiếp · Shift+click/←: lùi · F: toàn màn hình · B: màn đen · P: tắt';
    const HINT_OFF = 'Chế độ thuyết trình: tắt · P: bật';
    const IGNORE =
      'a, button, input, select, textarea, label, video, summary, details, [contenteditable], nav, ' +
      '.no-advance, .explorer, .chat, .pipeline, .tabs, .roi, .table-wrap, .dot-nav, #slide-counter, #presenter-hint';
    const LOCK_MS = 450;
    const CURSOR_IDLE_MS = 3000;

    const blank = $('#blank-screen');
    let on = true;
    try {
      on = localStorage.getItem(STORE_KEY) !== 'off';
    } catch (_) { /* storage blocked → default on */ }

    let locked = false;
    let hintTimer = 0;

    function showHint(ms) {
      if (!hint) return;
      hint.textContent = on ? HINT_ON : HINT_OFF;
      hint.classList.remove('hidden');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => hint.classList.add('hidden'), ms);
    }

    function applyMode() {
      document.body.classList.toggle('presenter-on', on);
    }

    function step(dir) {
      if (locked) return;
      locked = true;
      setTimeout(() => { locked = false; }, LOCK_MS);
      deck.step(dir);
    }

    function go(index) {
      if (locked) return;
      locked = true;
      setTimeout(() => { locked = false; }, LOCK_MS);
      deck.goTo(index);
    }

    const isBlank = () => !!(blank && blank.classList.contains('on'));
    function setBlank(v) {
      if (!blank) return;
      blank.classList.toggle('on', v);
      blank.setAttribute('aria-hidden', String(!v));
    }

    function toggleFullscreen() {
      const d = document;
      try {
        if (d.fullscreenElement) {
          d.exitFullscreen();
        } else if (d.documentElement.requestFullscreen) {
          const p = d.documentElement.requestFullscreen();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } catch (_) { /* fullscreen not allowed */ }
    }

    function hasSelection() {
      const sel = window.getSelection ? window.getSelection() : null;
      return !!(sel && !sel.isCollapsed && sel.toString().trim() !== '');
    }

    // Shift+click would otherwise extend the text selection and get ignored by hasSelection()
    document.addEventListener('mousedown', (e) => {
      if (!on || !e.shiftKey || e.button !== 0) return;
      const t = e.target;
      if (t instanceof Element && !t.closest(IGNORE)) e.preventDefault();
    });

    document.addEventListener('click', (e) => {
      if (isBlank()) {
        setBlank(false);
        return;
      }
      if (!on) return;
      if (e.button !== 0 || e.detail > 1) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (hasSelection()) return;
      const t = e.target;
      if (!(t instanceof Element) || t.closest(IGNORE)) return;
      step(e.shiftKey ? -1 : 1);
    });

    function isTyping(el) {
      if (!el || !(el instanceof Element)) return false;
      return !!el.closest('input, textarea, select, summary, [contenteditable]:not([contenteditable="false"])');
    }

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(document.activeElement) || isTyping(e.target)) return;
      const k = e.key;

      if (k === 'p' || k === 'P') {
        if (e.repeat) return;
        e.preventDefault();
        on = !on;
        try { localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch (_) { /* ignore */ }
        applyMode();
        showHint(on ? 5000 : 2500);
        return;
      }
      if (k === 'f' || k === 'F') {
        if (e.repeat) return;
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (k === 'b' || k === 'B') {
        if (e.repeat) return;
        e.preventDefault();
        setBlank(!isBlank());
        return;
      }
      if (k === 'Escape') {
        // Blank screen first, then any open <details> in the current slide
        if (isBlank()) {
          setBlank(false);
          return;
        }
        const slide = deck.slides[deck.current()];
        const open = slide ? $$('details[open]', slide) : [];
        if (open.length) open.forEach((d) => { d.open = false; });
        deck.closeMenu();
        return;
      }
      if (!on) return;

      // Space on a focused button/link keeps its native meaning
      if (k === ' ' && document.activeElement instanceof Element && document.activeElement.closest('button, a')) return;

      if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') {
        e.preventDefault();
        step(1);
      } else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') {
        e.preventDefault();
        step(-1);
      } else if (k === 'Home') {
        e.preventDefault();
        go(0);
      } else if (k === 'End') {
        e.preventDefault();
        go(deck.total - 1);
      }
    });

    // Hide the cursor after 3 s without movement
    let cursorTimer = 0;
    function wakeCursor() {
      document.body.classList.remove('cursor-hidden');
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(() => document.body.classList.add('cursor-hidden'), CURSOR_IDLE_MS);
    }
    document.addEventListener('mousemove', wakeCursor, { passive: true });
    document.addEventListener('mousedown', wakeCursor, { passive: true });
    wakeCursor();

    applyMode();
    showHint(5000);
  })();
})();
