import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mobileCss = readFileSync('src/styles/mobile-readability.css', 'utf8');
const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const siteFrame = readFileSync('src/layouts/SiteFrame.astro', 'utf8');

test('mobile default view keeps the cinematic layout readable without zoom', () => {
  assert.match(siteFrame, /import '\.\.\/styles\/mobile-readability\.css';/);
  assert.match(mobileCss, /\.lounge-stage\s*\{[^}]*width:\s*min\(94vw,\s*470px\)\s*!important;/s);
  assert.match(mobileCss, /\.now-title\s*\{[^}]*font-size:\s*clamp\(16px,/s);
  assert.match(mobileCss, /\.recent-card__title\s*\{[^}]*font-size:\s*clamp\(12px,/s);
  assert.match(mobileCss, /\.cini-cafe-review-title\s*\{[^}]*font-size:\s*clamp\(11px,/s);
  assert.match(mobileCss, /\.auditorium-review-scroll\s*\{[^}]*font-size:\s*clamp\(13px,/s);
  assert.match(mobileCss, /\.auditorium-related-title\s*\{[^}]*font-size:\s*clamp\(10\.5px,/s);
});

test('phone form controls retain a 16px floor to avoid browser input zoom', () => {
  assert.match(mobileCss, /\.cini-cafe-search-input\s*\{[^}]*font-size:\s*16px\s*!important;/s);
  assert.match(mobileCss, /\.opinion-form input,[\s\S]*?font-size:\s*16px\s*!important;/);
});

test('ratings use a consistent high-contrast red and white pattern', () => {
  assert.match(tokens, /--rating-star-filled:\s*#ff3b30;/);
  assert.match(tokens, /--rating-star-empty:\s*#f7f7f7;/);
  assert.match(tokens, /--rating-star-empty-opacity:\s*0\.96;/);
  assert.match(mobileCss, /\.cini-cafe-review-stars\s*\{[\s\S]*?font-size:\s*clamp\(8\.5px,\s*2\.3cqw,\s*10px\)/);
});
