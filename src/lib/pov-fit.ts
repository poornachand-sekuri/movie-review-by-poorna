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
      const minimum = Math.min(maximum, rootSize * 0.875);
      const style = getComputedStyle(panel);
      // Optional panel-specific reduction applies after fitting, including
      // the scrolling fallback, so a smaller ceiling cannot be fitted away.
      const fontScale = Math.min(1, Math.max(0.5, parseFloat(style.getPropertyValue('--pov-font-scale')) || 1));
      const availableHeight = panel.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 1;
      const fits = () => paragraph.getBoundingClientRect().height <= availableHeight
        && paragraph.scrollWidth <= paragraph.clientWidth;
      const setSize = (size: number) => { paragraph.style.fontSize = `${size}px`; };

      if (fits()) {
        setSize(maximum * fontScale);
        return;
      }
      setSize(minimum);
      // Preserve complete content and readable type when scrolling is necessary.
      if (!fits()) {
        setSize(minimum * fontScale);
        return;
      }

      let low = minimum;
      let high = maximum;
      while (high - low > 0.25) {
        const middle = (low + high) / 2;
        setSize(middle);
        if (fits()) low = middle;
        else high = middle;
      }
      setSize(low * fontScale);
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
