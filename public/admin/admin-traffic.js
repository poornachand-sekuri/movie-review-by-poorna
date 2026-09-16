(() => {
  const nativeFetch = window.fetch.bind(window);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (match) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[match]));
  const num = (value) => new Intl.NumberFormat('en-IN').format(Number(value) || 0);

  function sourceLabel(source) {
    const labels = {
      instagram: 'Instagram', facebook: 'Facebook', x: 'X', whatsapp: 'WhatsApp',
      google: 'Google', bing: 'Bing', referral: 'Referral', direct: 'Direct', unknown: 'Unknown',
    };
    return labels[source] || String(source || 'Unknown').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function platformLabel(platform) {
    const labels = { instagram: 'Instagram', facebook: 'Facebook', x: 'X', whatsapp: 'WhatsApp', copy: 'Copy Link', more: 'More / Native Share' };
    return labels[platform] || sourceLabel(platform);
  }

  function ensureUi() {
    const metrics = document.querySelector('#dashboardPanel .metric-grid');
    if (metrics && !document.getElementById('metricSocialFollows')) {
      metrics.insertAdjacentHTML('beforeend', `
        <article class="metric-card"><span>Social Follows</span><strong id="metricSocialFollows">—</strong><small>Stay Connected clicks</small></article>
        <article class="metric-card"><span>Review Shares</span><strong id="metricReviewShares">—</strong><small>Share This Review actions</small></article>
      `);
    }

    const grid = document.querySelector('#dashboardPanel .dashboard-grid');
    if (grid && !document.getElementById('trafficSourcesBody')) {
      grid.insertAdjacentHTML('beforeend', `
        <section class="dash-card">
          <div class="section-title-row"><h2>Traffic Sources</h2><span class="hint">Views / visitors</span></div>
          <div class="table-wrap"><table><thead><tr><th>Source</th><th>Views</th><th>Visitors</th></tr></thead><tbody id="trafficSourcesBody"></tbody></table></div>
          <p class="hint">Source tracking starts with this release; older views appear as Unknown.</p>
        </section>
        <section class="dash-card">
          <div class="section-title-row"><h2>Social Actions</h2><span class="hint">Clicks / visitors</span></div>
          <div class="table-wrap"><table><thead><tr><th>Action</th><th>Platform</th><th>Clicks</th><th>Visitors</th></tr></thead><tbody id="socialActionsBody"></tbody></table></div>
        </section>
        <section class="dash-card span-two">
          <div class="section-title-row"><h2>Top Landing Pages by Source</h2><span class="hint">Where attributed visitors entered</span></div>
          <div class="table-wrap"><table><thead><tr><th>Source</th><th>Landing Page</th><th>Visitors</th></tr></thead><tbody id="landingPagesBody"></tbody></table></div>
        </section>
        <section class="dash-card span-two">
          <div class="section-title-row"><h2>Top Reviews by Source</h2><span class="hint">Views / visitors</span></div>
          <div class="table-wrap"><table><thead><tr><th>Source</th><th>Review</th><th>Views</th><th>Visitors</th></tr></thead><tbody id="sourceReviewsBody"></tbody></table></div>
        </section>
      `);
    }
  }

  function render(data) {
    ensureUi();
    const follows = document.getElementById('metricSocialFollows');
    const shares = document.getElementById('metricReviewShares');
    if (follows) follows.textContent = num(data.socialEventTotals?.follow);
    if (shares) shares.textContent = num(data.socialEventTotals?.share);

    const sourceBody = document.getElementById('trafficSourcesBody');
    if (sourceBody) {
      const rows = data.trafficSources || [];
      sourceBody.innerHTML = rows.length
        ? rows.map((row) => `<tr><td>${esc(sourceLabel(row.source))}</td><td class="number-cell">${num(row.views)}</td><td class="number-cell">${num(row.visitors)}</td></tr>`).join('')
        : '<tr><td colspan="3">No attributed traffic yet.</td></tr>';
    }

    const actionBody = document.getElementById('socialActionsBody');
    if (actionBody) {
      const rows = data.socialEvents || [];
      actionBody.innerHTML = rows.length
        ? rows.map((row) => `<tr><td>${esc(row.eventType === 'social_follow_click' ? 'Follow' : 'Share')}</td><td>${esc(platformLabel(row.platform))}</td><td class="number-cell">${num(row.clicks)}</td><td class="number-cell">${num(row.visitors)}</td></tr>`).join('')
        : '<tr><td colspan="4">No social actions yet.</td></tr>';
    }

    const landingBody = document.getElementById('landingPagesBody');
    if (landingBody) {
      const rows = data.landingPagesBySource || [];
      landingBody.innerHTML = rows.length
        ? rows.map((row) => `<tr><td>${esc(sourceLabel(row.source))}</td><td>${esc(row.title || row.page)}</td><td class="number-cell">${num(row.visitors)}</td></tr>`).join('')
        : '<tr><td colspan="3">No landing-page attribution yet.</td></tr>';
    }

    const reviewBody = document.getElementById('sourceReviewsBody');
    if (reviewBody) {
      const rows = data.topReviewsBySource || [];
      reviewBody.innerHTML = rows.length
        ? rows.map((row) => `<tr><td>${esc(sourceLabel(row.source))}</td><td>${esc(row.title || row.slug)}</td><td class="number-cell">${num(row.views)}</td><td class="number-cell">${num(row.visitors)}</td></tr>`).join('')
        : '<tr><td colspan="4">No source-specific review traffic yet.</td></tr>';
    }
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const input = args[0];
      const rawUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(rawUrl, window.location.href);
      if (url.pathname === '/api/admin/analytics' && response.ok) {
        void response.clone().json().then(render).catch(() => {});
      }
    } catch {}
    return response;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureUi, { once: true });
  else ensureUi();
})();
