(() => {
  const narrow = matchMedia('(max-width: 700px)');
  // Tell an embedding page how tall the book is, so its iframe can fit without empty space.
  const report = () => { if (parent !== window) { const b = document.querySelector('[data-billerbook]'); if (b) parent.postMessage({ billerbook: 'height', h: Math.ceil(b.getBoundingClientRect().height) }, '*'); } };
  for (const book of document.querySelectorAll('[data-billerbook]')) {
    const slides = [...book.querySelectorAll('.bb-spread')];
    const count = book.querySelector('.bb-count');
    const prev = book.querySelector('.bb-prev'), next = book.querySelector('.bb-next');
    let views = [], v = 0;
    const build = () => {
      views = [];
      slides.forEach((s, k) => {
        if (narrow.matches && !s.classList.contains('single')) { views.push([k, 'l']); views.push([k, 'r']); }
        else views.push([k, null]);
      });
    };
    const show = (n, dir = 0) => {
      v = Math.max(0, Math.min(views.length - 1, n));
      const [k, side] = views[v];
      slides.forEach((s, j) => { s.hidden = j !== k; s.classList.toggle('bb-l', j === k && side === 'l'); s.classList.toggle('bb-r', j === k && side === 'r'); });
      const s = slides[k], cap = s.querySelector('figcaption'), lab = s.dataset.label || cap.textContent;
      cap.textContent = side ? (lab.split('–')[side === 'l' ? 0 : 1] || lab) : lab;
      s.style.setProperty('--bb-dir', dir * 24 + 'px');
      count.textContent = (v + 1) + ' / ' + views.length;
      prev.disabled = v === 0; next.disabled = v === views.length - 1;
      if (history.replaceState) history.replaceState(null, '', '#' + (k + 1));
      const pre = slides[k + 1]?.querySelector('img'); if (pre) pre.loading = 'eager';
      requestAnimationFrame(report);
    };
    const toSpread = (k) => views.findIndex(([j]) => j === k);
    const apply = () => {
      const k = views.length ? views[v][0] : Math.max(0, Math.min(slides.length - 1, (parseInt(location.hash.slice(1), 10) || 1) - 1));
      document.documentElement.classList.toggle('bb-pages', narrow.matches);
      build(); show(Math.max(0, toSpread(k)));
    };
    prev.onclick = () => show(v - 1, -1); next.onclick = () => show(v + 1, 1);
    const full = book.querySelector('.bb-full');
    full.onclick = () => {
      if (document.fullscreenElement) return document.exitFullscreen();
      if (book.requestFullscreen && document.fullscreenEnabled) return book.requestFullscreen();
      // iPhone Safari has no element full screen: open the book on its own page instead.
      if (parent !== window) window.open(location.href, '_blank', 'noopener');
    };
    book.tabIndex = 0;
    book.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(v + 1, 1); if (e.key === 'ArrowLeft') show(v - 1, -1); });
    let x0 = null, y0 = null;
    book.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
    book.addEventListener('pointerup', (e) => { if (x0 == null) return; const d = e.clientX - x0, dy = e.clientY - y0; x0 = null; if (Math.abs(d) > 50 && Math.abs(d) > Math.abs(dy)) show(v + (d < 0 ? 1 : -1), d < 0 ? 1 : -1); });
    narrow.addEventListener('change', apply);
    addEventListener('resize', report);
    book.querySelectorAll('img').forEach((im) => im.addEventListener('load', report));
    apply();
  }
})();
