import assert from 'node:assert/strict';
import test from 'node:test';
import { initPosterBackgrounds, refreshPosterBackgrounds } from '../src/lib/poster-background.ts';

test('poster backdrops respect lazy loading, selected sources, dynamic cards and errors', () => {
  const originalDocument = globalThis.document;
  const originalImage = globalThis.HTMLImageElement;
  const classes = () => ({
    values: new Set(),
    toggle(name, enabled) { enabled ? this.values.add(name) : this.values.delete(name); },
  });
  class Image {
    complete = false;
    naturalWidth = 0;
    src = 'https://example.com/original.jpg';
    currentSrc = '';
    classList = classes();
    parentElement = {
      classList: classes(),
      style: {
        values: new Map(),
        setProperty(name, value) { this.values.set(name, value); },
        removeProperty(name) { this.values.delete(name); },
      },
    };
    matches() { return true; }
  }
  const image = new Image();
  const listeners = new Map();
  globalThis.HTMLImageElement = Image;
  globalThis.document = {
    querySelectorAll() { return [image]; },
    addEventListener(name, listener, capture) {
      assert.equal(capture, true);
      listeners.set(name, listener);
    },
  };
  const background = (target) => target.parentElement.style.values.get('--review-poster-background');
  try {
    initPosterBackgrounds();
    refreshPosterBackgrounds();
    assert.equal(background(image), undefined, 'unloaded posters must not fetch decorative copies');

    image.complete = true;
    image.naturalWidth = 600;
    image.currentSrc = 'https://example.com/selected.webp';
    listeners.get('load')({ target: image });
    assert.equal(background(image), 'url("https://example.com/selected.webp")');
    assert(image.classList.values.has('review-poster-foreground'));

    const dynamicCard = new Image();
    dynamicCard.complete = true;
    dynamicCard.naturalWidth = 300;
    listeners.get('load')({ target: dynamicCard });
    assert.equal(background(dynamicCard), 'url("https://example.com/original.jpg")');

    image.naturalWidth = 0;
    listeners.get('error')({ target: image });
    assert.equal(background(image), undefined, 'failed replacements clear the old backdrop');
    assert(!image.parentElement.classList.values.has('review-poster-soft'));
    assert(!image.classList.values.has('review-poster-foreground'));
  } finally {
    globalThis.document = originalDocument;
    globalThis.HTMLImageElement = originalImage;
  }
});
