const $ = selector => document.querySelector(selector);

function stars(rating) {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
}

function formatDate(value) {
  if (!value) return '—';
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value);
  const [year, month, day] = parts;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function requestedSlug() {
  const url = new URL(location.href);
  return url.searchParams.get('review') || '';
}

function renderCast(castCrew, slug) {
  const target = $('#movieCast');
  target.replaceChildren();
  const labels = ['ACTOR', 'ACTRESS', 'DIRECTOR', 'MUSIC'];
  const values = castCrew?.records?.[slug] || [];

  labels.forEach((label, index) => {
    const people = values[index] || [];
    if (!people.length) return;
    const row = document.createElement('div');
    row.className = 'cv3-cast-row';
    const role = document.createElement('span');
    role.textContent = label;
    const names = document.createElement('strong');
    names.textContent = people.join(', ');
    row.append(role, names);
    target.append(row);
  });

  if (!target.children.length) {
    const row = document.createElement('div');
    row.className = 'cv3-cast-row';
    row.innerHTML = '<span>CAST</span><strong>—</strong>';
    target.append(row);
  }
}

function renderRelated(movies, active) {
  const grid = $('#relatedGrid');
  grid.replaceChildren();
  movies
    .filter(movie => movie.s !== active.s)
    .slice(0, 4)
    .forEach(movie => {
      const card = document.createElement('a');
      card.className = 'cv3-related-card';
      card.href = `./index.html?review=${encodeURIComponent(movie.s)}`;

      const poster = document.createElement('div');
      poster.className = 'cv3-related-poster';
      const img = document.createElement('img');
      img.src = movie.m;
      img.alt = `${movie.t} poster`;
      img.loading = 'lazy';
      img.decoding = 'async';
      poster.append(img);

      const title = document.createElement('h3');
      title.textContent = movie.t;
      const rating = document.createElement('div');
      rating.className = 'cv3-related-stars';
      rating.textContent = stars(movie.r);

      card.append(poster, title, rating);
      grid.append(card);
    });
}

function renderMovie(movie, castCrew, movies) {
  document.title = `${movie.t} — Content V3 Design Preview`;
  $('#movieTitle').textContent = movie.t;
  $('#movieLanguage').textContent = movie.l || '—';
  $('#movieRelease').textContent = formatDate(movie.rd);
  $('#movieRating').textContent = stars(movie.r);
  $('#movieRating').setAttribute('aria-label', `${Math.round(Number(movie.r) || 0)} out of 5 stars`);
  $('#moviePov').textContent = movie.v || movie.e || '—';

  const poster = $('#moviePoster');
  poster.src = movie.m;
  poster.alt = `${movie.t} poster`;
  poster.decoding = 'async';

  $('#reviewBody').innerHTML = movie.body || `<p>${movie.e || ''}</p>`;
  renderCast(castCrew, movie.s);
  renderRelated(movies, movie);
  $('#previewRoot').setAttribute('aria-busy', 'false');
}

function wireConceptInteractions() {
  document.querySelectorAll('.cv3-vote').forEach(button => {
    button.addEventListener('click', () => {
      const pressed = button.getAttribute('aria-pressed') === 'true';
      document.querySelectorAll('.cv3-vote').forEach(other => other.setAttribute('aria-pressed', 'false'));
      button.setAttribute('aria-pressed', pressed ? 'false' : 'true');
      const count = button.querySelector(':scope > strong');
      count.textContent = pressed ? '0' : '1';
      document.querySelectorAll('.cv3-vote').forEach(other => {
        if (other !== button) other.querySelector(':scope > strong').textContent = '0';
      });
    });
  });

  const explain = label => () => alert(`${label} is shown for visual placement only in this isolated UI concept.`);
  $('.cv3-header-menu')?.addEventListener('click', explain('Menu'));
  $('.cv3-header-search')?.addEventListener('click', explain('Search'));
}

async function init() {
  wireConceptInteractions();
  try {
    const [movieResponse, castResponse] = await Promise.all([
      fetch('/data/index.json', { headers: { accept: 'application/json' } }),
      fetch('/data/cast-crew.json', { headers: { accept: 'application/json' } })
    ]);
    if (!movieResponse.ok || !castResponse.ok) throw new Error('Preview data failed to load.');
    const [movies, castCrew] = await Promise.all([movieResponse.json(), castResponse.json()]);
    if (!Array.isArray(movies) || !movies.length) throw new Error('No review data was found.');
    const slug = requestedSlug();
    const active = movies.find(movie => movie.s === slug) || movies[0];
    renderMovie(active, castCrew, movies);
  } catch (error) {
    $('#movieTitle').textContent = 'Preview unavailable';
    $('#moviePov').textContent = error.message || 'Unable to load preview data.';
    $('#previewRoot').setAttribute('aria-busy', 'false');
  }
}

init();
