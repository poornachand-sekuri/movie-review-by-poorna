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
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
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
  if (n <= 95) return 46;
  if (n <= 135) return 41;
  if (n <= 180) return 37;
  if (n <= 230) return 33;
  return 30;
}

function charsPerLine(fontSize) {
  if (fontSize >= 46) return 30;
  if (fontSize >= 41) return 34;
  if (fontSize >= 37) return 39;
  if (fontSize >= 33) return 44;
  return 49;
}

function wrapWords(text, maxChars) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && [...candidate].length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function stars(rating) {
  const filled = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return Array.from({ length: 5 }, (_, i) => `<span class="star ${i < filled ? 'filled' : 'empty'}">${i < filled ? '★' : '☆'}</span>`).join('');
}

function mimeFromUrl(url) {
  const clean = String(url).split('?')[0].toLowerCase();
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.avif')) return 'image/avif';
  return 'image/jpeg';
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'MovieReviewsByPoorna-InstagramArchive/2.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
const dataUrl = (buffer, mime) => `data:${mime};base64,${buffer.toString('base64')}`;

async function loadReviews() {
  const items = [];
  for (const offset of [0, 60, 120]) {
    const response = await fetch(`${API}?limit=60&offset=${offset}`, { headers: { 'user-agent': 'MovieReviewsByPoorna-InstagramArchive/2.0' } });
    if (!response.ok) throw new Error(`Review API failed at offset ${offset}: ${response.status}`);
    const payload = await response.json();
    items.push(...payload.items);
  }
  const reviews = [...new Map(items.map((item) => [String(item.slug), item])).values()];
  if (reviews.length !== 140) throw new Error(`Expected 140 published reviews, got ${reviews.length}`);
  return reviews;
}

function baseStyles() {
  return `
  *{box-sizing:border-box} html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#060402}
  body{font-family:"Noto Sans","Noto Sans Telugu","Noto Color Emoji","DejaVu Sans",sans-serif}
  .page{position:relative;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#080603;color:#f4ead0}
  .ambience{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.62;filter:brightness(.45) saturate(.9)}
  .veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,2,1,.06),rgba(4,3,2,.45) 31%,rgba(3,2,1,.85) 100%)}
  .banner{position:absolute;z-index:3;left:0;top:0;width:1080px;height:360px;object-fit:cover}
  .site{position:absolute;z-index:5;left:0;right:0;bottom:24px;text-align:center;font-size:22px;font-weight:700;letter-spacing:.02em;color:#efe4c7}
  `;
}

function coverHtml(review, { banner, background, poster }) {
  const ts = titleSize(review.title);
  const reviewed = formatDate(review.reviewedDate);
  const released = formatDate(review.releaseDate);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${baseStyles()}
  .kicker{position:absolute;z-index:4;top:379px;left:76px;font-size:21px;font-weight:900;letter-spacing:.075em;color:#df3c31;white-space:nowrap}
  .title{position:absolute;z-index:4;left:72px;right:72px;top:414px;min-height:78px;display:flex;align-items:center;font-family:Georgia,"Noto Serif",serif;font-size:${ts}px;line-height:1.02;font-weight:900;color:#f1c75f;text-transform:uppercase;text-shadow:0 5px 18px rgba(0,0,0,.95)}
  .poster-frame{position:absolute;z-index:4;left:68px;top:515px;width:566px;height:642px;padding:10px;border:2px solid rgba(228,183,76,.85);background:rgba(0,0,0,.65);box-shadow:0 12px 45px rgba(0,0,0,.78),inset 0 0 0 2px rgba(117,77,22,.45)}
  .poster-frame img{width:100%;height:100%;object-fit:contain;display:block;background:#070604}
  .meta{position:absolute;z-index:4;left:672px;top:515px;width:340px;height:505px;padding:28px 27px 22px;border:1.5px solid rgba(168,117,33,.75);border-radius:22px;background:linear-gradient(180deg,rgba(12,8,4,.95),rgba(5,4,3,.87));box-shadow:0 16px 42px rgba(0,0,0,.6)}
  .meta-label{font-size:18px;color:#b7a780;font-weight:800;letter-spacing:.075em;margin-bottom:6px;text-transform:uppercase}
  .meta-value{font-size:28px;color:#f3e5be;font-weight:900;line-height:1.1;margin-bottom:18px;white-space:nowrap;letter-spacing:0}
  .separator{height:1px;background:rgba(202,149,51,.35);margin:-2px 0 18px}
  .stars{display:flex;gap:6px;flex-wrap:nowrap;margin:4px 0 19px}.star{font-size:47px;line-height:1}.filled{color:#e04439;text-shadow:0 0 14px rgba(224,68,57,.28)}.empty{color:#f3eee5;opacity:.82}
  .swipe{position:absolute;z-index:5;left:672px;top:1040px;width:340px;height:117px;padding:16px;display:flex;align-items:center;justify-content:center;text-align:center;border:2px solid #d7a83d;border-radius:13px;background:rgba(4,3,2,.94);color:#f5e6bd;font-size:27px;line-height:1.12;font-weight:950;letter-spacing:.025em}
  .archive-note{position:absolute;z-index:4;left:68px;top:1175px;width:566px;text-align:center;font-size:19px;line-height:1.35;color:#c0b294;letter-spacing:.015em}
  </style></head><body><main class="page">
  <img class="ambience" src="${background}" alt=""><div class="veil"></div><img class="banner" src="${banner}" alt="Movie Reviews By Poorna">
  <div class="kicker">POORNA'S VERDICT&nbsp; • &nbsp;REVIEWED ${esc(reviewed)}</div><div class="title">${esc(review.title)}</div>
  <div class="poster-frame"><img src="${poster}" alt="${esc(review.title)} poster"></div>
  <section class="meta"><div class="meta-label">Watched In</div><div class="meta-value">${esc(review.language || '—')}</div><div class="separator"></div>
  <div class="meta-label">Poorna's Rating</div><div class="stars">${stars(review.rating)}</div><div class="separator"></div>
  <div class="meta-label">Reviewed On</div><div class="meta-value">${esc(reviewed)}</div><div class="separator"></div>
  <div class="meta-label">Release Date</div><div class="meta-value">${esc(released)}</div></section>
  <div class="swipe">SWIPE FOR<br>MY POV&nbsp; →</div><div class="archive-note">Same movie. Same review. Same Poorna.<br>Now on Instagram.</div>
  <div class="site">moviereviewbypoorna.com</div></main></body></html>`;
}

function povHtml(review, { banner, background }) {
  const verdict = review.verdict || review.excerpt || 'POV coming soon.';
  const vs = verdictSize(verdict);
  const lineHtml = wrapWords(verdict, charsPerLine(vs)).map(esc).join('<br>');
  const fullReview = `moviereviewbypoorna.com/review/${review.slug}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${baseStyles()}
  .movie{position:absolute;z-index:4;top:383px;left:78px;right:78px;font-family:Georgia,"Noto Serif",serif;font-size:31px;font-weight:900;color:#e9bd55;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 4px 18px rgba(0,0,0,.9)}
  .pov-title{position:absolute;z-index:4;top:433px;left:78px;right:78px;font-size:61px;line-height:1;font-weight:950;color:#f6ead0;letter-spacing:0}.pov-sub{position:absolute;z-index:4;top:501px;left:81px;right:81px;font-size:21px;font-weight:900;color:#df3c31;letter-spacing:.095em}
  .verdict{position:absolute;z-index:4;left:76px;top:552px;width:928px;height:438px;padding:38px 48px;display:flex;align-items:center;border:2px solid rgba(221,173,69,.88);border-radius:24px;background:linear-gradient(145deg,rgba(11,8,5,.96),rgba(17,10,7,.91));box-shadow:0 18px 55px rgba(0,0,0,.72),inset 0 0 50px rgba(122,61,24,.10)}
  .verdict p{margin:0;width:100%;font-family:"Noto Sans","Noto Sans Telugu","Noto Color Emoji","DejaVu Sans",sans-serif;font-size:${vs}px;line-height:1.31;font-weight:700;color:#f4ead2;letter-spacing:0;word-spacing:0;text-align:left;white-space:normal}
  .cta{position:absolute;z-index:4;left:76px;top:1020px;width:928px;height:94px;padding:16px 26px;border-radius:15px;border:1.5px solid rgba(207,151,50,.72);background:rgba(6,4,2,.92);text-align:center}.cta strong{display:block;color:#e8b84e;font-size:25px;letter-spacing:.025em}.cta span{display:block;margin-top:5px;color:#e8dfcc;font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .question{position:absolute;z-index:4;left:76px;right:76px;top:1145px;text-align:center}.question h2{margin:0 0 14px;font-family:Georgia,"Noto Serif",serif;font-size:37px;color:#f0c35b;letter-spacing:0}.choices{display:flex;justify-content:center;gap:40px;font-size:21px;font-weight:800;color:#efe6d0}.choice b{color:#df3c31;margin-right:7px}.site{bottom:20px;font-size:18px;color:#a99a78;letter-spacing:.01em}
  </style></head><body><main class="page"><img class="ambience" src="${background}" alt=""><div class="veil"></div><img class="banner" src="${banner}" alt="Movie Reviews By Poorna">
  <div class="movie">${esc(review.title)}</div><div class="pov-title">MY&nbsp;POV</div><div class="pov-sub">POORNA'S VERDICT</div>
  <section class="verdict"><p>${lineHtml}</p></section><div class="cta"><strong>FULL REVIEW IN THE AUDITORIUM</strong><span>${esc(fullReview)}</span></div>
  <section class="question"><h2>WHAT'S YOUR POV?</h2><div class="choices"><span class="choice"><b>●</b>Agree</span><span class="choice"><b>●</b>Disagree</span><span class="choice"><b>●</b>Tell me below</span></div></section><div class="site">MOVIE REVIEWS BY POORNA • THE AUDITORIUM</div>
  </main></body></html>`;
}

function captionFor(review) {
  const safeTag = String(review.title || '').replace(/[^\p{L}\p{N}]+/gu, '');
  return [`🎬 ${review.title}`,'',`Poorna's Rating: ${review.rating ?? '—'}/5`,'','MY POV • POORNA\'S VERDICT',review.verdict || review.excerpt || '','',`🎟️ Full review: https://moviereviewbypoorna.com/review/${review.slug}`,'',`What's your POV? Agree or disagree? 👇`,'',`#MovieReviewsByPoorna #PoornaPOV${safeTag ? ` #${safeTag}` : ''}`].join('\n');
}

async function main() {
  await fs.rm(OUT_ROOT,{recursive:true,force:true}); await fs.mkdir(OUT_ROOT,{recursive:true});
  const reviews=await loadReviews();
  const [bannerBuffer,bgBuffer]=await Promise.all([fetchBuffer(BANNER_URL),fetchBuffer(BACKGROUND_URL)]);
  const shared={banner:dataUrl(bannerBuffer,'image/webp'),background:dataUrl(bgBuffer,'image/webp')};
  const browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:WIDTH,height:HEIGHT},deviceScaleFactor:1});
  const failures=[]; let done=0;
  for(const review of reviews){try{
    if(!review.posterUrl) throw new Error('Missing posterUrl');
    const posterBuffer=await fetchBuffer(review.posterUrl); const poster=dataUrl(posterBuffer,mimeFromUrl(review.posterUrl)); const dir=path.join(OUT_ROOT,review.slug); await fs.mkdir(dir,{recursive:true});
    await page.setContent(coverHtml(review,{...shared,poster}),{waitUntil:'load'}); await page.screenshot({path:path.join(dir,'01_cover.png'),type:'png',fullPage:false});
    await page.setContent(povHtml(review,shared),{waitUntil:'load'}); await page.screenshot({path:path.join(dir,'02_my_pov.png'),type:'png',fullPage:false});
    await fs.writeFile(path.join(dir,'caption.txt'),`${captionFor(review)}\n`,'utf8'); done++; console.log(`[${done}/140] ${review.title}`);
  }catch(error){failures.push({slug:review.slug,title:review.title,error:String(error?.stack||error)});console.error(`FAILED ${review.slug}:`,error)}}
  await browser.close(); if(failures.length){await fs.writeFile(path.join(OUT_ROOT,'failures.json'),JSON.stringify(failures,null,2));throw new Error(`Generation failed for ${failures.length} review(s).`)}
  const postingOrder=[...reviews].sort((a,b)=>String(a.reviewedDate||'').localeCompare(String(b.reviewedDate||''))||Number(a.id)-Number(b.id)); const cell=(v)=>`"${String(v??'').replaceAll('"','""')}"`;
  const csv=[['post_order','title','slug','reviewed_date','rating','language','cover_file','pov_file'].join(','),...postingOrder.map((r,i)=>[i+1,cell(r.title),cell(r.slug),cell(r.reviewedDate),r.rating??'',cell(r.language),cell(`${r.slug}/01_cover.png`),cell(`${r.slug}/02_my_pov.png`)].join(','))].join('\n');
  await fs.writeFile(path.join(OUT_ROOT,'posting_order_oldest_to_newest.csv'),`${csv}\n`,'utf8'); await fs.writeFile(path.join(OUT_ROOT,'live_source_snapshot.json'),JSON.stringify(reviews,null,2),'utf8');
  await fs.writeFile(path.join(OUT_ROOT,'README.txt'),['MOVIE REVIEWS BY POORNA — INSTAGRAM ARCHIVE','','Source of truth: live production API + exact R2 posterUrl per review.','140 reviews / 280 PNGs / 1080 x 1350.', 'Each movie folder: 01_cover.png, 02_my_pov.png, caption.txt.','','The exact live Auditorium banner/background are reused from Cloudflare R2.','Posters use object-fit: contain and are never cropped.','Use posting_order_oldest_to_newest.csv for the initial Instagram backfill.'].join('\n'),'utf8');
  console.log('Successfully generated 140 reviews / 280 Instagram PNGs.');
}
await main();
