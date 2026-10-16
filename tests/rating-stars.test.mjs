import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderRatingStars, ratingLabel } from '../src/lib/rating-stars.ts';

test('each quarter-step paints precisely five stars without rounding', () => {
  for (let quarter = 0; quarter <= 20; quarter++) {
    const rating = quarter / 4;
    const svg = renderRatingStars(rating);
    assert.equal((svg.match(/<g transform=/g) || []).length, 5);
    const partial = rating % 1;
    if (partial) assert.match(svg, new RegExp(`width="${partial * 20}"`));
    assert.equal(ratingLabel(rating), `${rating} out of 5 stars`);
  }
});

test('unrated is different from zero and existing whole-star ratings remain exact', () => {
  assert.equal(ratingLabel(null), 'Not rated');
  assert.equal(ratingLabel(0), '0 out of 5 stars');
  for (let rating = 0; rating <= 5; rating++) {
    assert.equal(ratingLabel(rating), `${rating} out of 5 stars`);
  }
});

test('admin persistence keeps quarter-step validation and direct rating saves', () => {
  const source = readFileSync(new URL('../src/lib/data/admin-reviews.ts', import.meta.url), 'utf8');
  assert.match(source, /Number\.isInteger\(rating \* 4\)/);
  assert.match(source, /value\.rating/);
});
