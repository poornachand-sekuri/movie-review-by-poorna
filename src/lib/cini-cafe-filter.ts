import type { CiniCafeReview } from './data/cini-cafe';

export type CafeSort = 'latest' | 'oldest' | 'title-az' | 'title-za';
export interface CafeState {
  catalogue: CiniCafeReview[];
  query: string;
  language: string;
  year: string;
  sort: CafeSort;
  page: number;
}

export function yearOf(review: CiniCafeReview): string {
  const value = review.releaseDate || review.reviewedDate || '';
  return String(value).match(/^(\d{4})/)?.[1] ?? '';
}

function searchableText(review: CiniCafeReview): string {
  return [review.title, review.language, yearOf(review), ...review.searchTerms]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

/** Search text is indexed once; page changes reuse the last filtered/sorted result. */
export function createCafeFilter(catalogue: readonly CiniCafeReview[]) {
  const index = new Map(catalogue.map((review) => [review, { text: searchableText(review), year: yearOf(review) }]));
  let key = '';
  let result: CiniCafeReview[] = [];
  return (state: Pick<CafeState, 'query' | 'language' | 'year' | 'sort'>): CiniCafeReview[] => {
    const nextKey = JSON.stringify([state.query.trim().toLocaleLowerCase(), state.language, state.year, state.sort]);
    if (nextKey === key) return result;
    const query = state.query.trim().toLocaleLowerCase();
    const list = catalogue.filter((review) => {
      if (query && !index.get(review)!.text.includes(query)) return false;
      if (state.language && review.language !== state.language) return false;
      if (state.year && index.get(review)!.year !== state.year) return false;
      return true;
    });

    const latest = (a: CiniCafeReview, b: CiniCafeReview) =>
      String(b.releaseDate || b.reviewedDate || '').localeCompare(String(a.releaseDate || a.reviewedDate || '')) || b.id - a.id;
    const titleAZ = (a: CiniCafeReview, b: CiniCafeReview) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

    if (state.sort === 'oldest') list.sort((a, b) => -latest(a, b));
    else if (state.sort === 'title-az') list.sort(titleAZ);
    else if (state.sort === 'title-za') list.sort((a, b) => -titleAZ(a, b));
    else list.sort(latest);

    key = nextKey;
    result = list;
    return result;
  };
}
