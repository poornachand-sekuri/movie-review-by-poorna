export const COMPACT_REVIEW_FIELDS = Object.freeze([
  'i',
  't',
  's',
  'd',
  'l',
  'm',
  'c',
  'e',
  'rd',
  'r',
  'v'
]);

export function compactReview(review = {}) {
  return {
    i: review.i,
    t: review.t || '',
    s: review.s || '',
    d: review.d || '',
    l: review.l || '',
    m: review.m || '',
    c: review.c || 0,
    e: review.e || '',
    rd: review.rd || '',
    r: review.r == null ? null : review.r,
    v: review.v || ''
  };
}

export function compactReviews(reviews) {
  return Array.isArray(reviews) ? reviews.map(compactReview) : [];
}

export function contentPayload(reviews, requestedSlug = '') {
  const source = Array.isArray(reviews) ? reviews : [];
  const active = source.find(review => review.s === requestedSlug) || source[0] || null;
  return {
    reviews: compactReviews(source),
    active
  };
}
