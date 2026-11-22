(() => {
  for (const book of document.querySelectorAll('[data-billerbook]')) {
    const slides = [...book.querySelectorAll('.bb-spread')];
    const count = book.querySelector('.bb-count');
    const prev = book.querySelector('.bb-prev'), next = book.querySelector('.bb-next');
    let i = Math.max(0, Math.min(slides.length - 1, (parseInt(location.hash.slice(1), 10) || 1) - 1));
    const show = (n, dir = 0) => {
      i = Math.max(0, Math.min(slides.length - 1, n));
      slides.forEach((s, k) => { s.hidden = k !== i; });
      slides[i].style.setProperty('--bb-dir', dir * 24 + 'px');
      count.textContent = (i + 1) + ' / ' + slides.length;
      prev.disabled = i === 0; next.disabled = i === slides.length - 1;
      if (history.replaceState) history.replaceState(null, '', '#' + (i + 1));
      const pre = slides[i + 1]?.querySelector('img'); if (pre) pre.loading = 'eager';
    };
    prev.onclick = () => show(i - 1, -1); next.onclick = () => show(i + 1, 1);
    book.querySelector('.bb-full').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : book.requestFullscreen?.());
    book.tabIndex = 0;
    book.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(i + 1, 1); if (e.key === 'ArrowLeft') show(i - 1, -1); });
    let x0 = null;
    book.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    book.addEventListener('pointerup', (e) => { if (x0 == null) return; const d = e.clientX - x0; x0 = null; if (Math.abs(d) > 50) show(i + (d < 0 ? 1 : -1), d < 0 ? 1 : -1); });
    show(i);
  }
})();
