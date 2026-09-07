import type { CiniCafeReview } from './data/cini-cafe';

const PAGE_SIZE = 6;

type CafeSort = 'latest' | 'oldest' | 'title-az' | 'title-za';

interface CafeState {
  catalogue: CiniCafeReview[];
  query: string;
  language: string;
  year: string;
  sort: CafeSort;
  page: number;
}

function yearOf(review: CiniCafeReview): string {
  const value = review.releaseDate || review.reviewedDate || '';
  return String(value).match(/^(\d{4})/)?.[1] ?? '';
}

function searchableText(review: CiniCafeReview): string {
  return [review.title, review.language, yearOf(review), ...review.searchTerms]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

function starString(rating: number | null): string {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)}`;
}

function pageWindow(current: number, total: number): number[] {
  if (total <= 4) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 2) return [1, 2, 3, 4];
  if (current >= total - 1) return [total - 3, total - 2, total - 1, total];
  return [current - 1, current, current + 1, current + 2];
}

function readCatalogue(): CiniCafeReview[] {
  const node = document.querySelector<HTMLScriptElement>('#cini-cafe-catalogue');
  if (!node?.textContent) return [];

  try {
    const value: unknown = JSON.parse(node.textContent);
    return Array.isArray(value) ? (value as CiniCafeReview[]) : [];
  } catch {
    return [];
  }
}

function filteredReviews(state: CafeState): CiniCafeReview[] {
  const query = state.query.trim().toLocaleLowerCase();
  const list = state.catalogue.filter((review) => {
    if (query && !searchableText(review).includes(query)) return false;
    if (state.language && review.language !== state.language) return false;
    if (state.year && yearOf(review) !== state.year) return false;
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

  return list;
}

function makeCard(review: CiniCafeReview, index: number): HTMLElement {
  const article = document.createElement('article');
  article.className = 'cini-cafe-review-card';
  article.dataset.reviewSlug = review.slug;

  const link = document.createElement('a');
  link.className = 'cini-cafe-review-link';
  link.href = `/review/${encodeURIComponent(review.slug)}`;
  link.setAttribute('aria-label', `Read ${review.title} review`);

  const posterZone = document.createElement('div');
  posterZone.className = 'cini-cafe-poster-zone';
  if (review.posterUrl) {
    const poster = document.createElement('img');
    poster.src = review.posterUrl;
    poster.alt = `${review.title} poster`;
    poster.loading = index < 3 ? 'eager' : 'lazy';
    poster.decoding = 'async';
    posterZone.append(poster);
  }

  const info = document.createElement('div');
  info.className = 'cini-cafe-review-info';

  const title = document.createElement('h2');
  title.className = 'cini-cafe-review-title';
  title.textContent = review.title;
  title.title = review.title;

  const meta = document.createElement('p');
  meta.className = 'cini-cafe-review-meta';
  meta.textContent = [review.language, yearOf(review)].filter(Boolean).join(' • ');

  const stars = document.createElement('div');
  stars.className = 'cini-cafe-review-stars';
  stars.textContent = starString(review.rating);
  stars.setAttribute('aria-label', `${Math.round(Number(review.rating) || 0)} out of 5 stars`);

  const likes = document.createElement('div');
  likes.className = 'cini-cafe-review-likes';
  likes.dataset.reviewLikes = review.slug;
  likes.textContent = String(review.likes);
  likes.setAttribute('aria-label', `${review.likes} like${review.likes === 1 ? '' : 's'}`);

  info.append(title, meta);
  link.append(posterZone, info, stars, likes);
  article.append(link);
  return article;
}

function fitOneTitle(title: HTMLElement): void {
  const text = title.textContent?.trim() ?? '';
  if (!text || title.clientWidth <= 0) return;

  title.style.fontSize = '';
  const computed = getComputedStyle(title);
  const startSize = Number.parseFloat(computed.fontSize) || 18;
  const minimum = 12;
  const lineHeightRatio = 1.05;

  const measure = title.cloneNode(true) as HTMLElement;
  Object.assign(measure.style, {
    position: 'fixed',
    visibility: 'hidden',
    pointerEvents: 'none',
    left: '-9999px',
    top: '0',
    width: `${title.clientWidth}px`,
    height: 'auto',
    maxHeight: 'none',
    overflow: 'visible',
    display: 'block',
    WebkitLineClamp: 'unset',
    WebkitBoxOrient: 'unset',
    whiteSpace: 'normal',
    lineHeight: String(lineHeightRatio),
  });
  document.body.append(measure);

  let size = startSize;
  while (size > minimum) {
    measure.style.fontSize = `${size}px`;
    if (measure.scrollHeight <= size * lineHeightRatio * 3 + 2) break;
    size -= 0.5;
  }

  measure.remove();
  title.style.fontSize = `${Math.max(minimum, size)}px`;
}

function fitTitles(): void {
  document.querySelectorAll<HTMLElement>('.cini-cafe-review-title').forEach(fitOneTitle);
}

export function initCiniCafe(): void {
  const stage = document.querySelector<HTMLElement>('[data-cini-cafe-stage]');
  const resultsLayer = document.querySelector<HTMLElement>('[data-cini-results]');
  const searchInput = document.querySelector<HTMLInputElement>('[data-cini-search]');
  const searchForm = document.querySelector<HTMLFormElement>('[data-cini-search-form]');
  const languageSelect = document.querySelector<HTMLSelectElement>('[data-cini-language]');
  const yearSelect = document.querySelector<HTMLSelectElement>('[data-cini-year]');
  const sortSelect = document.querySelector<HTMLSelectElement>('[data-cini-sort]');
  const languageLabel = document.querySelector<HTMLElement>('[data-cini-language-label]');
  const yearLabel = document.querySelector<HTMLElement>('[data-cini-year-label]');
  const sortLabel = document.querySelector<HTMLElement>('[data-cini-sort-label]');
  const clearButton = document.querySelector<HTMLButtonElement>('[data-cini-clear]');
  const servingRange = document.querySelector<HTMLElement>('[data-cini-serving-range]');
  const servingTotal = document.querySelector<HTMLElement>('[data-cini-serving-total]');
  const pagination = document.querySelector<HTMLElement>('[data-cini-pagination]');
  const emptyState = document.querySelector<HTMLElement>('[data-cini-empty]');

  if (
    !stage || !resultsLayer || !searchInput || !searchForm || !languageSelect || !yearSelect ||
    !sortSelect || !languageLabel || !yearLabel || !sortLabel || !clearButton ||
    !servingRange || !servingTotal || !pagination || !emptyState
  ) return;

  const state: CafeState = {
    catalogue: readCatalogue(),
    query: '',
    language: '',
    year: '',
    sort: 'latest',
    page: 1,
  };

  const languages = [...new Set(state.catalogue.map((review) => review.language?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
  const years = [...new Set(state.catalogue.map(yearOf).filter(Boolean))].sort((a, b) => Number(b) - Number(a));

  languageSelect.replaceChildren(new Option('All Languages', ''), ...languages.map((value) => new Option(value, value)));
  yearSelect.replaceChildren(new Option('All Years', ''), ...years.map((value) => new Option(value, value)));

  function syncLabels(): void {
    languageLabel.textContent = state.language || 'Language';
    yearLabel.textContent = state.year || 'Year';
    const sortNames: Record<CafeSort, string> = {
      latest: 'Sort By',
      oldest: 'Oldest',
      'title-az': 'Title A–Z',
      'title-za': 'Title Z–A',
    };
    sortLabel.textContent = sortNames[state.sort];
    searchInput.toggleAttribute('data-has-value', Boolean(state.query));
  }

  function setPage(nextPage: number): void {
    const totalPages = Math.max(1, Math.ceil(filteredReviews(state).length / PAGE_SIZE));
    state.page = Math.max(1, Math.min(totalPages, nextPage));
    render();

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stage.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function renderPagination(totalPages: number): void {
    pagination.replaceChildren();

    const previous = document.createElement('button');
    previous.className = 'cini-cafe-page-arrow cini-cafe-page-arrow--previous';
    previous.type = 'button';
    previous.setAttribute('aria-label', 'Previous page');
    previous.disabled = state.page === 1;
    previous.addEventListener('click', () => setPage(state.page - 1));
    pagination.append(previous);

    const pages = pageWindow(state.page, totalPages);
    for (let slot = 0; slot < 4; slot += 1) {
      const page = pages[slot];
      if (!page) {
        const empty = document.createElement('span');
        empty.className = 'cini-cafe-page-slot';
        empty.setAttribute('aria-hidden', 'true');
        pagination.append(empty);
        continue;
      }

      const button = document.createElement('button');
      button.className = `cini-cafe-page-button${page === state.page ? ' is-current' : ''}`;
      button.type = 'button';
      button.textContent = String(page);
      button.setAttribute('aria-label', `Page ${page}`);
      if (page === state.page) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => setPage(page));
      pagination.append(button);
    }

    const next = document.createElement('button');
    next.className = 'cini-cafe-page-arrow cini-cafe-page-arrow--next';
    next.type = 'button';
    next.setAttribute('aria-label', 'Next page');
    next.disabled = state.page === totalPages;
    next.addEventListener('click', () => setPage(state.page + 1));
    pagination.append(next);
  }

  function render(): void {
    const filtered = filteredReviews(state);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;

    const start = (state.page - 1) * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);
    resultsLayer.replaceChildren(...visible.map(makeCard));

    const first = filtered.length ? start + 1 : 0;
    const last = Math.min(start + PAGE_SIZE, filtered.length);
    servingRange.textContent = filtered.length ? `${first}–${last}` : '0';
    servingTotal.textContent = String(filtered.length);

    emptyState.hidden = filtered.length !== 0;
    renderPagination(totalPages);
    syncLabels();
    stage.setAttribute('aria-busy', 'false');
    requestAnimationFrame(fitTitles);
  }

  async function refreshVisibleLikes(): Promise<void> {
    const cards = [...resultsLayer.querySelectorAll<HTMLElement>('[data-review-slug]')];
    await Promise.allSettled(cards.map(async (card) => {
      const slug = card.dataset.reviewSlug;
      if (!slug) return;
      const response = await fetch(`/api/reviews/${encodeURIComponent(slug)}/reactions`, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) return;
      const payload = await response.json() as { likes?: unknown };
      const likes = Math.max(0, Number(payload.likes) || 0);
      const item = state.catalogue.find((review) => review.slug === slug);
      if (item) item.likes = likes;
      const node = card.querySelector<HTMLElement>('[data-review-likes]');
      if (node) {
        node.textContent = String(likes);
        node.setAttribute('aria-label', `${likes} like${likes === 1 ? '' : 's'}`);
      }
    }));
  }

  searchForm.addEventListener('submit', (event) => event.preventDefault());
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    state.page = 1;
    render();
  });
  languageSelect.addEventListener('change', () => {
    state.language = languageSelect.value;
    state.page = 1;
    render();
  });
  yearSelect.addEventListener('change', () => {
    state.year = yearSelect.value;
    state.page = 1;
    render();
  });
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value as CafeSort;
    state.page = 1;
    render();
  });
  clearButton.addEventListener('click', () => {
    state.query = '';
    state.language = '';
    state.year = '';
    state.sort = 'latest';
    state.page = 1;
    searchInput.value = '';
    languageSelect.value = '';
    yearSelect.value = '';
    sortSelect.value = 'latest';
    render();
    searchInput.focus();
  });

  window.addEventListener('resize', () => requestAnimationFrame(fitTitles));
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void refreshVisibleLikes();
  });

  render();
}
