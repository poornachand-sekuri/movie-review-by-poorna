/** Render exactly five accessible, precisely filled stars without rounding stored ratings. */
export function ratingLabel(value: number | null): string {
  return value == null || !Number.isFinite(value) ? 'Not rated' : `${value} out of 5 stars`;
}
const STAR = 'M10 1.25 12.72 6.77 18.81 7.65 14.41 11.94 15.45 18 10 15.14 4.55 18 5.59 11.94 1.19 7.65 7.28 6.77Z';
export function renderRatingStars(value: number | null): string {
  const rating = value == null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(5, value));
  const paths = Array.from({ length: 5 }, (_, index) => {
    const width = Math.max(0, Math.min(1, rating - index)) * 20;
    return `<g transform="translate(${index * 22} 0)"><path d="${STAR}" fill="#F1F1F1" stroke="#060505" stroke-width=".9"/><svg x="0" y="0" width="${width}" height="20" viewBox="0 0 ${width || 0.0001} 20" overflow="hidden" aria-hidden="true"><path d="${STAR}" fill="#F7010E"/></svg><path d="${STAR}" fill="none" stroke="#060505" stroke-width=".9"/></g>`;
  }).join('');
  return `<svg class="fractional-stars" viewBox="0 0 108 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="display:inline-block;width:5.4em;height:1em;max-width:100%;vertical-align:middle;overflow:visible">${paths}</svg>`;
}
