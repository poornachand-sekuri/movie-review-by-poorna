/** One animation owner for movie titles across the public rooms. */
export function createTitleMarqueeController() {
  const animations = new Map<HTMLElement, { track: HTMLElement; overflow: number; animation: Animation }>();

  const remove = (element: HTMLElement) => {
    animations.get(element)?.animation.cancel();
    animations.delete(element);
    element.classList.remove('is-moving');
  };

  const fit = (element: HTMLElement, reduceMotion: boolean) => {
    const track = element.querySelector<HTMLElement>(':scope > span');
    if (!track) {
      remove(element);
      return;
    }

    const style = getComputedStyle(element);
    const width = element.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
    const overflow = track.scrollWidth - width;
    const shouldMove = !reduceMotion && !element.closest('[aria-hidden="true"]') && width > 0 && overflow > 1;
    const current = animations.get(element);
    // Comment/reaction updates and observer notifications must not restart a
    // title that is already travelling the correct distance.
    if (shouldMove && current?.track === track && current.overflow === overflow) return;

    remove(element);
    track.style.transform = 'translateX(0)';
    if (!shouldMove) return;

    const travelMs = Math.max(2500, (overflow / 16) * 1000);
    const pauseMs = 1500;
    const totalMs = 2 * (travelMs + pauseMs);
    const end = `translateX(${-overflow}px)`;
    element.classList.add('is-moving');
    const animation = track.animate([
      { transform: 'translateX(0)', offset: 0 },
      { transform: 'translateX(0)', offset: pauseMs / totalMs },
      { transform: end, offset: (pauseMs + travelMs) / totalMs },
      { transform: end, offset: (2 * pauseMs + travelMs) / totalMs },
      { transform: 'translateX(0)', offset: 1 },
    ], { duration: totalMs, iterations: Infinity, easing: 'linear' });
    animations.set(element, { track, overflow, animation });
  };

  return { fit, remove };
}
