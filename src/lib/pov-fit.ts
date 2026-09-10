const initialized = new WeakSet<HTMLElement>();

/** Fit the rendered paragraph, including wrapping, within the artwork's safe area. */
export function initPovFit(): void {
  document.querySelectorAll<HTMLElement>('[data-pov-fit]').forEach((panel) => {
    if (initialized.has(panel)) return;
    const paragraph = panel.querySelector<HTMLParagraphElement>('p');
    if (!paragraph) return;
    initialized.add(panel);

    let frame = 0;
    const fit = () => {
      frame = 0;
      if (!panel.clientWidth || !panel.clientHeight) return;

      // CSS supplies the comfortable ceiling for this panel and viewport.
      paragraph.style.removeProperty('font-size');
      const maximum = parseFloat(getComputedStyle(paragraph).fontSize);
      const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const style = getComputedStyle(panel);
      // A compact artwork panel may supply a smaller, container-scaled floor.
      // Other panels retain the root-relative readable minimum.
      const minimum = Math.min(maximum, rootSize * 0.875, parseFloat(style.fontSize));
      const availableHeight = panel.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 1;
      const fits = () => paragraph.getBoundingClientRect().height <= availableHeight
        && paragraph.scrollWidth <= paragraph.clientWidth;
      const setSize = (size: number) => { paragraph.style.fontSize = `${size}px`; };

      if (fits()) return;
      setSize(minimum);
      // Preserve complete content and readable type when scrolling is necessary.
      if (!fits()) return;

      let low = minimum;
      let high = maximum;
      while (high - low > 0.25) {
        const middle = (low + high) / 2;
        setSize(middle);
        if (fits()) low = middle;
        else high = middle;
      }
      setSize(low);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    // Observe the fixed safe area, not the paragraph we resize, to avoid loops.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(schedule).observe(panel);
    new MutationObserver(schedule).observe(paragraph, { childList: true, characterData: true, subtree: true });
    window.addEventListener('resize', schedule, { passive: true });
    document.fonts.ready.then(schedule).catch(() => {});
    document.fonts.addEventListener('loadingdone', schedule);
    schedule();
  });
}
