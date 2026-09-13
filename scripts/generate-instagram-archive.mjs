import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const WIDTH = 1080;
const HEIGHT = 1350;
const API = 'https://moviereviewbypoorna.com/api/reviews';
const BANNER_URL = 'https://assets.moviereviewbypoorna.com/ui/pages/content/v4/responsive/02_Movie_Reviews_By_Poorna_Banner_lossless.webp';
const BACKGROUND_URL = 'https://assets.moviereviewbypoorna.com/ui/pages/content/v4/responsive/01_Auditorium_Background_master_lossless.webp';
const OUT_ROOT = path.resolve('artifacts/instagram-140');

const esc = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function titleSize(title) {
  const n = [...String(title ?? '')].length;
  if (n <= 16) return 62;
  if (n <= 24) return 54;
  if (n <= 34) return 48;
  return 42;
}

function verdictSize(verdict) {
  const n = [...String(verdict ?? '')].length;
  if (n <= 95) return 48;
  if (n <= 135) return 43;
  if (n <= 180) return 38;
  if (n <= 230) return 34;
  return 31;
}

function stars(rating) {
  const filled = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return Array.from({ length: 5 }, (_, index) =>
    `<span class="star ${index < filled ? 'filled' : 'empty'}">${index < filled ? '★' : '☆'}</span>`,
  ).join('');
}

function mimeFromUrl(url, fallback = 'image/jpeg') {
  const clean = String(url).split('?')[0].toLowerCase();
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.avif')) return 'image/avif';
  if (clean.endsWith('.gif')) return 'image/gif';
  return fallback;
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'MovieReviewsByPoorna-InstagramArchive/1.0' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function dataUrl(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function loadReviews() {
  const items = [];
  for (const offset of [0, 60, 120]) {
    const url = `${API}?limit=60&offset=${offset}`;
    const response = await fetch(url, { headers: { 'user-agent': 'MovieReviewsByPoorna-InstagramArchive/1.0' } });
    if (!response.ok) throw new Error(`Review API failed: ${response.status} ${url}`);
    const payload = await response.json();
    if (!Array.isArray(payload.items)) throw new Error(`Unexpected API payload at offset ${offset}`);
    items.push(...payload.items);
  }
  const unique = new Map(items.map((item) => [String(item.slug), item]));
  const reviews = [...unique.values()];
  if (reviews.length !== 140) throw new Error(`Expected exactly 140 published reviews, got ${reviews.length}`);
  return reviews;
}

function baseStyles() {
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #060402; }
    body { font-family: "Noto Sans", "Noto Sans Telugu", "Noto Color Emoji", Arial, sans-serif; }
    .page { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #080603; color: #f4ead0; }
    .ambience { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .62; filter: brightness(.45) saturate(.9); }
    .veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(3,2,1,.06) 0%, rgba(4,3,2,.42) 31%, rgba(3,2,1,.82) 100%); }
    .banner { position: absolute; z-index: 3; left: 0; top: 0; width: 1080px; height: 360px; object-fit: cover; }
    .gold { color: #e4b74c; }
    .red { color: #df3c31; }
    .caps { text-transform: uppercase; letter-spacing: .10em; }
    .shadow { text-shadow: 0 3px 18px rgba(0,0,0,.85); }
    .line { height: 2px; background: linear-gradient(90deg, transparent, #a87521, #e4b74c, #a87521, transparent); }
    .site { position: absolute; left: 0; right: 0; bottom: 25px; text-align: center; font-size: 23px; font-weight: 700; letter-spacing: .04em; color: #efe4c7; z-index: 5; }
  `;
}

function coverHtml(review, { banner, background, poster }) {
  const ts = titleSize(review.title);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${baseStyles()}
    .kicker { position:absolute; z-index:4; top:378px; left:76px; font-size:22px; font-weight:900; letter-spacing:.16em; color:#df3c31; }
    .title { position:absolute; z-index:4; left:72px; right:72px; top:414px; min-height:78px; display:flex; align-items:center; font-family: Georgia, "Noto Serif", serif; font-size:${ts}px; line-height:1.02; font-weight:900; color:#f1c75f; text-transform:uppercase; text-shadow:0 5px 18px rgba(0,0,0,.95); }
    .poster-frame { position:absolute; z-index:4; left:68px; top:515px; width:566px; height:642px; padding:10px; border:2px solid rgba(228,183,76,.85); background:rgba(0,0,0,.65); box-shadow:0 12px 45px rgba(0,0,0,.78), inset 0 0 0 2px rgba(117,77,22,.45); }
    .poster-frame img { width:100%; height:100%; object-fit:contain; display:block; background:#070604; }
    .meta { position:absolute; z-index:4; left:672px; top:515px; width:340px; min-height:642px; padding:32px 28px; border:1.5px solid rgba(168,117,33,.75); border-radius:22px; background:linear-gradient(180deg, rgba(12,8,4,.94), rgba(5,4,3,.84)); box-shadow:0 16px 42px rgba(0,0,0,.6); }
    .meta-label { font-size:19px; color:#a99a78; font-weight:800; letter-spacing:.12em; margin-bottom:7px; text-transform:uppercase; }
    .meta-value { font-size:31px; color:#f3e5be; font-weight:900; line-height:1.18; margin-bottom:30px; }
    .meta .separator { height:1px; background:rgba(202,149,51,.4); margin:-5px 0 25px; }
    .stars { display:flex; gap:8px; flex-wrap:nowrap; margin:3px 0 26px; }
    .star { font-size:49px; line-height:1; }
    .star.filled { color:#e04439; text-shadow:0 0 14px rgba(224,68,57,.28); }
    .star.empty { color:#f3eee5; opacity:.82; }
    .swipe { position:absolute; z-index:5; left:672px; top:1042px; width:340px; min-height:115px; padding:20px 16px; display:flex; align-items:center; justify-content:center; text-align:center; border:2px solid #d7a83d; border-radius:13px; background:rgba(4,3,2,.92); color:#f5e6bd; font-size:28px; line-height:1.15; font-weight:950; letter-spacing:.05em; box-shadow:0 0 26px rgba(207,145,31,.12); }
    .archive-note { position:absolute; z-index:4; left:68px; top:1177px; width:566px; text-align:center; font-size:20px; color:#b6aa8e; letter-spacing:.05em; }
  </style></head><body><main class="page">
    <img class="ambience" src="${background}" alt=""><div class="veil"></div><img class="banner" src="${banner}" alt="Movie Reviews By Poorna">
    <div class="kicker">POORNA'S VERDICT • REVIEWED ${esc(formatDate(review.reviewedDate))}</div>
    <div class="title">${esc(review.title)}</div>
    <div class="poster-frame"><img src="${poster}" alt="${esc(review.title)} poster"></div>
    <section class="meta">
      <div class="meta-label">Watched In</div><div class="meta-value">${esc(review.language || '—')}</div><div class="separator"></div>
      <div class="meta-label">Poorna's Rating</div><div class="stars" aria-label="${esc(review.rating)} out of 5">${stars(review.rating)}</div><div class="separator"></div>
      <div class="meta-label">Reviewed On</div><div class="meta-value">${esc(formatDate(review.reviewedDate))}</div><div class="separator"></div>
      <div class="meta-label">Release Date</div><div class="meta-value">${esc(formatDate(review.releaseDate))}</div>
    </section>
    <div class="swipe">SWIPE FOR<br>MY POV&nbsp; →</div>
    <div class="archive-note">Same movie. Same review. Same Poorna. Now on Instagram.</div>
    <div class="site">moviereviewbypoorna.com</div>
  </main></body></html>`;
}

function povHtml(review, { banner, background }) {
  const vs = verdictSize(review.verdict || review.excerpt || '');
  const fullReview = `moviereviewbypoorna.com/review/${review.slug}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${baseStyles()}
    .movie { position:absolute; z-index:4; top:382px; left:78px; right:78px; font-family:Georgia,"Noto Serif",serif; font-size:32px; font-weight:900; color:#e9bd55; text-transform:uppercase; letter-spacing:.045em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 4px 18px rgba(0,0,0,.9); }
    .pov-title { position:absolute; z-index:4; top:430px; left:78px; right:78px; font-size:62px; line-height:1; font-weight:950; color:#f6ead0; letter-spacing:.06em; }
    .pov-sub { position:absolute; z-index:4; top:499px; left:81px; right:81px; font-size:22px; font-weight:900; color:#df3c31; letter-spacing:.18em; }
    .verdict { position:absolute; z-index:4; left:76px; top:552px; width:928px; min-height:438px; padding:44px 48px; display:flex; align-items:center; border:2px solid rgba(221,173,69,.88); border-radius:24px; background:linear-gradient(145deg, rgba(11,8,5,.96), rgba(17,10,7,.90)); box-shadow:0 18px 55px rgba(0,0,0,.72), inset 0 0 50px rgba(122,61,24,.10); }
    .verdict p { margin:0; width:100%; font-size:${vs}px; line-height:1.30; font-weight:720; color:#f4ead2; text-wrap:balance; }
    .cta { position:absolute; z-index:4; left:76px; top:1020px; width:928px; min-height:94px; padding:17px 28px; border-radius:15px; border:1.5px solid rgba(207,151,50,.72); background:rgba(6,4,2,.9); text-align:center; }
    .cta strong { display:block; color:#e8b84e; font-size:25px; letter-spacing:.08em; }
    .cta span { display:block; margin-top:5px; color:#e8dfcc; font-size:20px; }
    .question { position:absolute; z-index:4; left:76px; right:76px; top:1145px; text-align:center; }
    .question h2 { margin:0 0 14px; font-family:Georgia,"Noto Serif",serif; font-size:37px; color:#f0c35b; }
    .choices { display:flex; justify-content:center; gap:42px; font-size:22px; font-weight:800; color:#efe6d0; }
    .choice b { color:#df3c31; margin-right:7px; }
    .site { bottom:20px; font-size:19px; color:#a99a78; }
  </style></head><body><main class="page">
    <img class="ambience" src="${background}" alt=""><div class="veil"></div><img class="banner" src="${banner}" alt="Movie Reviews By Poorna">
    <div class="movie">${esc(review.title)}</div>
    <div class="pov-title">MY POV</div>
    <div class="pov-sub">POORNA'S VERDICT</div>
    <section class="verdict"><p>${esc(review.verdict || review.excerpt || 'POV coming soon.')}</p></section>
    <div class="cta"><strong>FULL REVIEW IN THE AUDITORIUM</strong><span>${esc(fullReview)}</span></div>
    <section class="question"><h2>WHAT'S YOUR POV?</h2><div class="choices"><span class="choice"><b>●</b> Agree</span><span class="choice"><b>●</b> Disagree</span><span class="choice"><b>●</b> Tell me below</span></div></section>
    <div class="site">MOVIE REVIEWS BY POORNA • THE AUDITORIUM</div>
  </main></body></html>`;
}

function captionFor(review) {
  const safeTag = String(review.title || '').replace(/[^\p{L}\p{N}]+/gu, '');
  return [
    `🎬 ${review.title}`,
    '',
    `Poorna's Rating: ${review.rating ?? '—'}/5`,
    '',
    `MY POV • POORNA'S VERDICT`,
    review.verdict || review.excerpt || '',
    '',
    `🎟️ Full review: https://moviereviewbypoorna.com/review/${review.slug}`,
    '',
    `What's your POV? Agree or disagree? 👇`,
    '',
    `#MovieReviewsByPoorna #PoornaPOV${safeTag ? ` #${safeTag}` : ''}`,
  ].join('\n');
}

async function main() {
  await fs.rm(OUT_ROOT, { recursive: true, force: true });
  await fs.mkdir(OUT_ROOT, { recursive: true });

  const reviews = await loadReviews();
  const [bannerBuffer, bgBuffer] = await Promise.all([
    fetchBuffer(BANNER_URL),
    fetchBuffer(BACKGROUND_URL),
  ]);
  const shared = {
    banner: dataUrl(bannerBuffer, 'image/webp'),
    background: dataUrl(bgBuffer, 'image/webp'),
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

  const failures = [];
  let done = 0;
  for (const review of reviews) {
    try {
      if (!review.posterUrl) throw new Error('Missing posterUrl');
      const posterBuffer = await fetchBuffer(review.posterUrl);
      const poster = dataUrl(posterBuffer, mimeFromUrl(review.posterUrl));
      const dir = path.join(OUT_ROOT, review.slug);
      await fs.mkdir(dir, { recursive: true });

      await page.setContent(coverHtml(review, { ...shared, poster }), { waitUntil: 'load' });
      await page.screenshot({ path: path.join(dir, '01_cover.png'), type: 'png', fullPage: false });

      await page.setContent(povHtml(review, shared), { waitUntil: 'load' });
      await page.screenshot({ path: path.join(dir, '02_my_pov.png'), type: 'png', fullPage: false });

      await fs.writeFile(path.join(dir, 'caption.txt'), `${captionFor(review)}\n`, 'utf8');
      done += 1;
      console.log(`[${done}/140] ${review.title}`);
    } catch (error) {
      failures.push({ slug: review.slug, title: review.title, error: String(error?.stack || error) });
      console.error(`FAILED ${review.slug}:`, error);
    }
  }

  await browser.close();
  if (failures.length) {
    await fs.writeFile(path.join(OUT_ROOT, 'failures.json'), JSON.stringify(failures, null, 2));
    throw new Error(`Generation failed for ${failures.length} review(s). See failures.json.`);
  }

  const postingOrder = [...reviews].sort((a, b) =>
    String(a.reviewedDate || '').localeCompare(String(b.reviewedDate || '')) || Number(a.id) - Number(b.id),
  );
  const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [
    ['post_order', 'title', 'slug', 'reviewed_date', 'rating', 'language', 'cover_file', 'pov_file'].join(','),
    ...postingOrder.map((review, index) => [
      index + 1,
      csvCell(review.title),
      csvCell(review.slug),
      csvCell(review.reviewedDate),
      review.rating ?? '',
      csvCell(review.language),
      csvCell(`${review.slug}/01_cover.png`),
      csvCell(`${review.slug}/02_my_pov.png`),
    ].join(',')),
  ].join('\n');
  await fs.writeFile(path.join(OUT_ROOT, 'posting_order_oldest_to_newest.csv'), `${csv}\n`, 'utf8');
  await fs.writeFile(path.join(OUT_ROOT, 'live_source_snapshot.json'), JSON.stringify(reviews, null, 2), 'utf8');
  await fs.writeFile(path.join(OUT_ROOT, 'README.txt'), [
    'MOVIE REVIEWS BY POORNA — INSTAGRAM ARCHIVE',
    '',
    `Generated from the live production API: ${API}`,
    `Review count: ${reviews.length}`,
    'Image size: 1080 x 1350 PNG',
    '',
    'Each movie folder contains:',
    '  01_cover.png   — movie/poster/rating cover',
    '  02_my_pov.png  — exact live My POV / Poorna\'s Verdict',
    '  caption.txt     — baseline Instagram caption',
    '',
    'Brand artwork is sourced from the same Cloudflare R2 Auditorium banner/background used by the live website.',
    'Movie posters are fetched from each review\'s exact live posterUrl. Posters are fitted, never cropped.',
    '',
    'For initial Instagram backfill, use posting_order_oldest_to_newest.csv so the latest reviews naturally remain near the top of the profile after all 140 are posted.',
  ].join('\n'), 'utf8');

  console.log('Successfully generated all 140 reviews / 280 Instagram PNGs.');
}

await main();
