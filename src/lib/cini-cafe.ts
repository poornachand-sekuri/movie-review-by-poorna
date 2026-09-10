import { watchReactionChanges } from './reaction-sync';
import { renderCafeCard } from './cini-cafe-card';
import type { CiniCafeReview } from './data/cini-cafe';
import { CAFE_PAGE_SIZE, createCafeFilter, yearOf, type CafeState, type CafeSort } from './cini-cafe-filter';

// Keep DOM controls compatible with Cloudflare's global HTMLRewriter Element.
type ValueControl = HTMLElement & { value: string };

function pageWindow(current: number, total: number): number[] {
  if (total <= 4) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 2) return [1, 2, 3, 4];
  if (current >= total - 1) return [total - 3, total - 2, total - 1, total];
  return [current - 1, current, current + 1, current + 2];
}

function appendOption(control: HTMLElement, label: string, value: string): void {
  const option = document.createElement('option');
  option.setAttribute('value', value);
  option.textContent = label;
  control.appendChild(option);
}

function readCatalogue(): CiniCafeReview[] {
  const node = document.querySelector<HTMLElement>('#cini-cafe-catalogue');
  if (!node?.textContent) return [];

  try {
    const value: unknown = JSON.parse(node.textContent);
    return Array.isArray(value) ? (value as CiniCafeReview[]) : [];
  } catch {
    return [];
  }
}

export function initCiniCafe(): void {
  const stageNode = document.querySelector<HTMLElement>('[data-cini-cafe-stage]');
  const resultsLayerNode = document.querySelector<HTMLElement>('[data-cini-results]');
  const searchInputNode = document.querySelector<ValueControl>('[data-cini-search]');
  const searchFormNode = document.querySelector<HTMLElement>('[data-cini-search-form]');
  const languageSelectNode = document.querySelector<ValueControl>('[data-cini-language]');
  const yearSelectNode = document.querySelector<ValueControl>('[data-cini-year]');
  const sortSelectNode = document.querySelector<ValueControl>('[data-cini-sort]');
  const languageLabelNode = document.querySelector<HTMLElement>('[data-cini-language-label]');
  const yearLabelNode = document.querySelector<HTMLElement>('[data-cini-year-label]');
  const sortLabelNode = document.querySelector<HTMLElement>('[data-cini-sort-label]');
  const clearButtonNode = document.querySelector<HTMLElement>('[data-cini-clear]');
  const servingRangeNode = document.querySelector<HTMLElement>('[data-cini-serving-range]');
  const servingTotalNode = document.querySelector<HTMLElement>('[data-cini-serving-total]');
  const paginationNode = document.querySelector<HTMLElement>('[data-cini-pagination]');
  const emptyStateNode = document.querySelector<HTMLElement>('[data-cini-empty]');

  if (
    !stageNode || !resultsLayerNode || !searchInputNode || !searchFormNode || !languageSelectNode ||
    !yearSelectNode || !sortSelectNode || !languageLabelNode || !yearLabelNode || !sortLabelNode ||
    !clearButtonNode || !servingRangeNode || !servingTotalNode || !paginationNode || !emptyStateNode
  ) return;

  const stage = stageNode;
  const resultsLayer = resultsLayerNode;
  const searchInput = searchInputNode;
  const searchForm = searchFormNode;
  const languageSelect = languageSelectNode;
  const yearSelect = yearSelectNode;
  const sortSelect = sortSelectNode;
  const languageLabel = languageLabelNode;
  const yearLabel = yearLabelNode;
  const sortLabel = sortLabelNode;
  const clearButton = clearButtonNode;
  const servingRange = servingRangeNode;
  const servingTotal = servingTotalNode;
  const pagination = paginationNode;
  const emptyState = emptyStateNode;

  const state: CafeState = {
    catalogue: readCatalogue(),
    query: new URLSearchParams(window.location.search).get('q') ?? '',
    language: '',
    year: '',
    sort: 'latest',
    page: 1,
  };

  const filteredReviews = createCafeFilter(state.catalogue);
  searchInput.value = state.query;
  sortSelect.value = state.sort;
  const languages = [...new Set(
    state.catalogue
      .map((review) => review.language?.trim())
      .filter((value): value is string => Boolean(value)),
  )].sort((a, b) => a.localeCompare(b));
  const years = [...new Set(state.catalogue.map(yearOf).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));

  languageSelect.replaceChildren();
  appendOption(languageSelect, 'All Languages', '');
  for (const language of languages) appendOption(languageSelect, language, language);

  yearSelect.replaceChildren();
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
    const totalPages = Math.max(1, Math.ceil(filteredReviews(state).length / CAFE_PAGE_SIZE));
    state.page = Math.max(1, Math.min(totalPages, nextPage));
    render();

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stage.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function renderPagination(totalPages: number): void {
    pagination.replaceChildren();

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

  function render(updateCards = true): void {
    const filtered = filteredReviews(state);
    const totalPages = Math.max(1, Math.ceil(filtered.length / CAFE_PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;

    const start = (state.page - 1) * CAFE_PAGE_SIZE;
    const visible = filtered.slice(start, start + CAFE_PAGE_SIZE);
    if (updateCards) resultsLayer.innerHTML = visible.map(renderCafeCard).join('');

    const first = filtered.length ? start + 1 : 0;
    const last = Math.min(start + CAFE_PAGE_SIZE, filtered.length);
    servingRange.textContent = filtered.length ? `${first}–${last}` : '0';
    servingTotal.textContent = String(filtered.length);

    emptyState.hidden = filtered.length !== 0;
    renderPagination(totalPages);
    syncLabels();
    stage.setAttribute('aria-busy', 'false');
    if (updateCards) void refreshVisibleLikes();
  }

  const reactionRevisions = new Map<string, number>();
  async function refreshVisibleLikes(changedSlug?: string): Promise<void> {
    const cards = Array.from(resultsLayer.querySelectorAll<HTMLElement>('[data-review-slug]'));
    const slugs = changedSlug ? [changedSlug] : cards.map((card) => card.dataset.reviewSlug).filter((slug): slug is string => !!slug);
    await Promise.allSettled(slugs.map(async (slug) => {
      const item = state.catalogue.find((review) => review.slug === slug);
      if (!item) return;
      const revision = (reactionRevisions.get(slug) ?? 0) + 1;
      reactionRevisions.set(slug, revision);

      const response = await fetch(`/api/reviews/${encodeURIComponent(slug)}/reactions`, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return;

      const payload = await response.json() as { likes?: unknown };
      if (!Number.isInteger(payload.likes) || Number(payload.likes) < 0 || reactionRevisions.get(slug) !== revision) return;
      const likes = Number(payload.likes);
      item.likes = likes;

      const card = Array.from(resultsLayer.querySelectorAll<HTMLElement>('[data-review-slug]')).find((node) => node.dataset.reviewSlug === slug);
      const node = card?.querySelector<HTMLElement>('[data-review-likes]');
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

  watchReactionChanges((slug) => { void refreshVisibleLikes(slug); });

  render(false);
}
