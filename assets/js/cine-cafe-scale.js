(() => {
  const DESIGN_WIDTH = 1023;
  const DESIGN_HEIGHT = 1537;

  function scaleCiniCafeCanvas() {
    const viewport = document.getElementById('cineCafeViewport');
    const stage = document.getElementById('cineCafeStage');
    if (!viewport || !stage) return;

    const width = viewport.clientWidth;
    const scale = width / DESIGN_WIDTH;
    stage.style.transform = `scale(${scale})`;
    viewport.style.height = `${DESIGN_HEIGHT * scale}px`;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scaleCiniCafeCanvas, { once: true });
  } else {
    scaleCiniCafeCanvas();
  }

  window.addEventListener('resize', scaleCiniCafeCanvas, { passive: true });
})();
