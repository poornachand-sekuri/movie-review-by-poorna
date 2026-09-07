import type { CiniCafeReview } from './data/cini-cafe';

const PAGE_SIZE = 6;

type CafeSort = 'latest' | 'oldest' | 'title-az' | 'title-za';
type ValueControl = HTMLElement & { value: string };
type FocusableValueControl = ValueControl & { focus: () => void };

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

function queryHtml(selector: string): HTMLElement | null {
  return document.querySelector(selector) as unknown as HTMLElement | null;
}

function clearChildren(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function appendOption(control: HTMLElement, label: string, value: string): void {
  const option = document.createElement('option');
  option.setAttribute('value', value);
  option.textContent = label;
  control.appendChild(option);
}

function readCatalogue(): CiniCafeReview[] {
  const node = queryHtml('#cini-cafe-catalogue');
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
  link.setAttribute('href', `/review/${encodeURIComponent(review.slug)}`);
  link.setAttribute('aria-label', `Read ${review.title} review`);

  const posterZone = document.createElement('div');
  posterZone.className = 'cini-cafe-poster-zone';
  if (review.posterUrl) {
    const poster = document.createElement('img');
    poster.setAttribute('src', review.posterUrl);
    poster.setAttribute('alt', `${review.title} poster`);
    poster.setAttribute('loading', index < 3 ? 'eager' : 'lazy');
    poster.setAttribute('decoding', 'async');
    posterZone.appendChild(poster);
  }

  const info = document.createElement('div');
  info.className = 'cini-cafe-review-info';

  const title = document.createElement('h2');
  title.className = 'cini-cafe-review-title';
  title.textContent = review.title;
  title.setAttribute('title', review.title);

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

  info.appendChild(title);
  info.appendChild(meta);
  link.appendChild(posterZone);
  link.appendChild(info);
  link.appendChild(stars);
  link.appendChild(likes);
  article.appendChild(link);
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

  const measure = title.cloneNode(true) as unknown as HTMLElement;
  measure.style.position = 'fixed';
  measure.style.visibility = 'hidden';
  measure.style.pointerEvents = 'none';
  measure.style.left = '-9999px';
  measure.style.top = '0';
  measure.style.width = `${title.clientWidth}px`;
  measure.style.height = 'auto';
  measure.style.maxHeight = 'none';
  measure.style.overflow = 'visible';
  measure.style.display = 'block';
  measure.style.whiteSpace = 'normal';
  measure.style.lineHeight = String(lineHeightRatio);
  measure.style.setProperty('-webkit-line-clamp', 'unset');
  measure.style.setProperty('-webkit-box-orient', 'unset');
  document.body.appendChild(measure);

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
  const titles = document.querySelectorAll('.cini-cafe-review-title');
  for (const title of Array.from(titles)) {
    fitOneTitle(title as unknown as HTMLElement);
  }
}

export function initCiniCafe(): void {
  const stageNode = queryHtml('[data-cini-cafe-stage]');
  const resultsNode = queryHtml('[data-cini-results]');
  const searchInputNode = queryHtml('[data-cini-search]');
  const searchFormNode = queryHtml('[data-cini-search-form]');
  const languageNode = queryHtml('[data-cini-language]');
  const yearNode = queryHtml('[data-cini-year]');
  const sortNode = queryHtml('[data-cini-sort]');
  const languageLabelNode = queryHtml('[data-cini-language-label]');
  const yearLabelNode = queryHtml('[data-cini-year-label]');
  const sortLabelNode = queryHtml('[data-cini-sort-label]');
  const clearNode = queryHtml('[data-cini-clear]');
  const servingRangeNode = queryHtml('[data-cini-serving-range]');
  const servingTotalNode = queryHtml('[data-cini-serving-total]');
  const paginationNode = queryHtml('[data-cini-pagination]');
  const emptyNode = queryHtml('[data-cini-empty]');

  if (
    !stageNode || !resultsNode || !searchInputNode || !searchFormNode || !languageNode || !yearNode ||
    !sortNode || !languageLabelNode || !yearLabelNode || !sortLabelNode || !clearNode ||
    !servingRangeNode || !servingTotalNode || !paginationNode || !emptyNode
  ) return;

  const stage = stageNode as HTMLElement;
  const resultsLayer = resultsNode as HTMLElement;
  const searchInput = searchInputNode as FocusableValueControl;
  const searchForm = searchFormNode as HTMLElement;
  const languageSelect = languageNode as ValueControl;
  const yearSelect = yearNode as ValueControl;
  const sortSelect = sortNode as ValueControl;
  const languageLabel = languageLabelNode as HTMLElement;
  const yearLabel = yearLabelNode as HTMLElement;
  const sortLabel = sortLabelNode as HTMLElement;
  const clearButton = clearNode as HTMLElement;
  const servingRange = servingRangeNode as HTMLElement;
  const servingTotal = servingTotalNode as HTMLElement;
  const pagination = paginationNode as HTMLElement;
  const emptyState = emptyNode as HTMLElement;

  const state: CafeState = {
    catalogue: readCatalogue(),
    query: '',
    language: '',
    year: '',
    sort: 'latest',
    page: 1,
  };

  const languages = [...new Set(
    state.catalogue
      .map((review) => review.language?.trim())
      .filter((value): value is string => Boolean(value)),
  )].sort((a, b) => a.localeCompare(b));
  const years = [...new Set(state.catalogue.map(yearOf).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));

  clearChildren(languageSelect);
  appendOption(languageSelect, 'All Languages', '');
  for (const language of languages) appendOption(languageSelect, language, language);

  clearChildren(yearSelect);
  appendOption(yearSelect, 'All Years', '');
  for (const year of years) appendOption(yearSelect, year, year);

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
    clearChildren(pagination);

    const previous = document.createElement('button');
    previous.className = 'cini-cafe-page-arrow cini-cafe-page-arrow--previous';
    previous.setAttribute('type', 'button');
    previous.setAttribute('aria-label', 'Previous page');
    previous.toggleAttribute('disabled', state.page === 1);
    previous.addEventListener('click', () => setPage(state.page - 1));
    pagination.appendChild(previous);

    const pages = pageWindow(state.page, totalPages);
    for (let slot = 0; slot < 4; slot += 1) {
      const page = pages[slot];
      if (!page) {
        const empty = document.createElement('span');
        empty.className = 'cini-cafe-page-slot';
        empty.setAttribute('aria-hidden', 'true');
        pagination.appendChild(empty);
        continue;
      }

      const button = document.createElement('button');
      button.className = `cini-cafe-page-button${page === state.page ? ' is-current' : ''}`;
      button.setAttribute('type', 'button');
      button.textContent = String(page);
      button.setAttribute('aria-label', `Page ${page}`);
      if (page === state.page) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => setPage(page));
      pagination.appendChild(button);
    }

    const next = document.createElement('button');
    next.className = 'cini-cafe-page-arrow cini-cafe-page-arrow--next';
    next.setAttribute('type', 'button');
    next.setAttribute('aria-label', 'Next page');
    next.toggleAttribute('disabled', state.page === totalPages);
    next.addEventListener('click', () => setPage(state.page + 1));
    pagination.appendChild(next);
  }

  function render(): void {
    const filtered = filteredReviews(state);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;

    const start = (state.page - 1) * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);
    clearChildren(resultsLayer);
    for (let index = 0; index < visible.length; index += 1) {
      resultsLayer.appendChild(makeCard(visible[index], index));
    }

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
    const cards = Array.from(resultsLayer.querySelectorAll('[data-review-slug]')) as unknown as HTMLElement[];
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

      const node = card.querySelector('[data-review-likes]') as unknown as HTMLElement | null;
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
