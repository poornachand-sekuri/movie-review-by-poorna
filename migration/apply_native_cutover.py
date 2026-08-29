#!/usr/bin/env python3
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
COMPILED = ROOT / "migration" / "compiled" / "native-reviews.json"
PUBLIC_INDEX = ROOT / "public" / "data" / "index.json"
WORKER = ROOT / "src" / "worker.js"
WORKER_V2 = ROOT / "src" / "worker-v2.js"
APP_V4 = ROOT / "public" / "assets" / "app-v4.js"
BRIDGE = ROOT / "public" / "assets" / "review-data-bridge.js"
MOBILE_V2 = ROOT / "public" / "assets" / "mobile-v2.js"
MEDIA_CONSOLE = ROOT / "public" / "admin" / "media-migration.html"
REPORT = ROOT / "migration" / "compiled" / "cutover-report.json"
PRE_MEDIA_COMMIT = "be5b8bdccc1e7e36be1292b7c60256bbdf74e67e"
R2_PREFIX = "https://assets.moviereviewbypoorna.com/reviews/"
EXPECTED_TOTAL = 137


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def publish_native_catalog():
    native = load_json(COMPILED)
    previous = load_json(PUBLIC_INDEX) if PUBLIC_INDEX.exists() else []
    comments = {int(row.get("i")): int(row.get("c") or 0) for row in previous if row.get("i") is not None}

    if len(native) != EXPECTED_TOTAL:
        raise SystemExit(f"Expected {EXPECTED_TOTAL} compiled reviews, found {len(native)}")

    seen_ids = set()
    seen_slugs = set()
    output = []
    for row in native:
        rid = int(row["i"])
        slug = str(row["s"])
        if rid in seen_ids:
            raise SystemExit(f"Duplicate review id: {rid}")
        if slug in seen_slugs:
            raise SystemExit(f"Duplicate review slug: {slug}")
        seen_ids.add(rid)
        seen_slugs.add(slug)

        poster = str(row.get("poster_target") or "")
        if not poster.startswith(R2_PREFIX):
            raise SystemExit(f"Review {rid} has a non-R2 poster target: {poster}")
        body = str(row.get("body") or "")
        if not body.strip():
            raise SystemExit(f"Review {rid} has an empty native body")

        output.append({
            "i": rid,
            "t": row.get("t") or "",
            "s": slug,
            "d": row.get("d") or "",
            "l": row.get("l") or "",
            "m": poster,
            "c": comments.get(rid, 0),
            "e": row.get("e") or "",
            "rd": row.get("rd") or "",
            "r": row.get("r"),
            "v": row.get("v") or "",
            "body": body,
            "gallery": list(row.get("gallery") or []),
        })

    output.sort(key=lambda row: (str(row.get("d") or ""), int(row["i"])), reverse=True)
    text = json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n"
    lowered = text.lower()
    for marker in ("wordpress.com", "/wp-content/", "public-api.wordpress.com", "poster_source"):
        if marker in lowered:
            raise SystemExit(f"Forbidden legacy marker leaked into public catalog: {marker}")
    PUBLIC_INDEX.write_text(text, encoding="utf-8")
    return output


def strip_wordpress_runtime():
    text = WORKER.read_text(encoding="utf-8")

    wp_line = "const WP_POSTS = 'https://public-api.wordpress.com/rest/v1.1/sites/moviereviewbypoorna.wordpress.com/posts/';\n"
    if wp_line in text:
        text = text.replace(wp_line, "")

    legacy_image = """function absoluteLegacyImage(src) {\n  if (!src) return '';\n  return /^https?:\\/\\//i.test(src) ? src : `https://moviereviewbypoorna.wordpress.com${src.startsWith('/') ? '' : '/'}${src}`;\n}\n\n"""
    if legacy_image in text:
        text = text.replace(legacy_image, "")

    text = text.replace("m: absoluteLegacyImage(q.m || ''),", "m: q.m || '',")

    old_admin = """async function getAdminReview(id, env, requestUrl) {\n  const reviews = await combinedReviews(env, requestUrl, true);\n  const review = reviews.find(r => Number(r.i) === Number(id));\n  if (!review) return json({ error: 'Review not found.' }, 404);\n  let body = review.body || '';\n  if (!body) {\n    try {\n      const res = await fetch(`${WP_POSTS}${id}?context=display`);\n      if (res.ok) body = (await res.json()).content || '';\n    } catch {}\n  }\n  return json({ ...review, body, gallery: review.gallery || [] });\n}\n"""
    new_admin = """async function getAdminReview(id, env, requestUrl) {\n  const reviews = await combinedReviews(env, requestUrl, true);\n  const review = reviews.find(r => Number(r.i) === Number(id));\n  if (!review) return json({ error: 'Review not found.' }, 404);\n  return json({ ...review, body: review.body || '', gallery: review.gallery || [] });\n}\n"""
    if old_admin in text:
        text = text.replace(old_admin, new_admin)

    forbidden = ("WP_POSTS", "absoluteLegacyImage", "public-api.wordpress.com", "moviereviewbypoorna.wordpress.com")
    leftovers = [marker for marker in forbidden if marker in text]
    if leftovers:
        raise SystemExit(f"Worker still contains legacy runtime markers: {leftovers}")
    WORKER.write_text(text, encoding="utf-8")


def strip_browser_wordpress_fallbacks():
    app = APP_V4.read_text(encoding="utf-8")
    app = re.sub(r"^const WP_API=.*?\n", "", app, count=1, flags=re.M)
    app = app.replace(
        "function archive(active='reviews',title='Reviews',sub='All published reviews imported from the WordPress archive.',data=INDEX)",
        "function archive(active='reviews',title='Reviews',sub='All published movie reviews.',data=INDEX)",
    )
    native_review_page = """async function reviewPage(slug){let p=INDEX.find(x=>x.slug===slug);if(!p)return notfound();let body='';try{let r=await fetch(`/api/reviews/${encodeURIComponent(p.slug)}`,{credentials:'same-origin',cache:'no-store'});if(r.ok){let full=await r.json();body=full.body||''}}catch(e){}if(!body)body=`<p>${esc(p.excerpt||'Review content is temporarily unavailable.')}</p>`;let ix=INDEX.indexOf(p),related=INDEX.slice(ix+1,ix+5);if(related.length<4)related=[...related,...INDEX.slice(0,4-related.length)];return `<main class="master-page content-master"><img class="master-art" data-master-key="content" alt="" aria-hidden="true"><div class="master-layer">${hotzones()}${posterSlot(p,'content-poster')}<section class="content-info"><h1>${esc(p.title)}</h1><div class="row"><div class="label">Language:</div><div class="value">${esc(p.language||'To be added')}</div></div><div class="row"><div class="label">Release Date:</div><div class="value">${esc(p.release_date||'To be added')}</div></div><div class="row"><div class="label">Rating:</div><div class="value master-stars">${stars(p.rating)}</div></div><div class="row verdict-row"><div class="label">Popcorn Verdict:</div><div class="value verdict-value">${esc(popcornVerdict(p))}</div></div></section><article class="content-review-body collapsed" id="reviewBody">${body}</article><button class="mobile-readmore" data-review-more>READ MORE⌄</button><section class="content-related-grid">${related.map(p=>recentOverlayCard(p,true)).join('')}</section></div></main>${masterSearchOverlay()}`}
"""
    app, n = re.subn(r"async function reviewPage\(slug\)\{.*?\}\nfunction header", native_review_page + "function header", app, count=1, flags=re.S)
    if n != 1:
        raise SystemExit("Could not replace desktop WordPress review-body fallback")
    app = re.sub(
        r"async function loadIndex\(\)\{.*?\}\nasync function render",
        "async function loadIndex(){let raw=await fetch('/data/index.json').then(r=>r.json());INDEX=raw.map(q=>({id:q.i,title:q.t,slug:q.s,published:q.d+' 00:00:00',year:(q.d||'').slice(0,4),language:q.l||'',featured_image:q.m||'',excerpt:q.e||'',release_date:q.rd||null,rating:q.r??null,popcorn_verdict:q.v||'',chunk:q.c}))}\nasync function render",
        app,
        count=1,
        flags=re.S,
    )
    APP_V4.write_text(app, encoding="utf-8")

    mobile = MOBILE_V2.read_text(encoding="utf-8")
    mobile = re.sub(r"^  const WP_API=.*?\n", "", mobile, count=1, flags=re.M)
    mobile = re.sub(r"^  const img=.*?;$", "  const img=p=>p?.m||'';", mobile, count=1, flags=re.M)
    native_mobile_review = """  async function reviewPage(slug){const p=INDEX.find(x=>x.s===slug);if(!p)return `<div class="mobile-v2">${header()}<section class="m2-section"><h1>Review not found</h1><a href="/">Return Home</a></section>${bottom('reviews')}</div>`;let body='';try{const r=await fetch(`/api/reviews/${encodeURIComponent(p.s)}`,{credentials:'same-origin',cache:'no-store'});if(r.ok){const full=await r.json();body=full.body||''}}catch(e){}if(!body)body=`<p>${esc(p.e||'Review content is temporarily unavailable.')}</p>`;let ix=INDEX.indexOf(p),related=INDEX.slice(ix+1,ix+5);if(related.length<4)related=[...related,...INDEX.slice(0,4-related.length)];return `<div class="mobile-v2">${header()}<div class="m2-clapper" aria-hidden="true"></div><main class="m2-detail">${poster(p,'m2-detail-poster')}<section class="m2-info-card"><h1 class="m2-info-title">${esc(p.t)}</h1><div class="m2-info-row"><div class="m2-info-label">Language</div><div class="m2-info-value">${esc(p.l||'To be added')}</div></div><div class="m2-info-row"><div class="m2-info-label">Release Date</div><div class="m2-info-value">${esc(p.rd||'To be added')}</div></div><div class="m2-info-row"><div class="m2-info-label">Rating</div><div class="m2-info-value">${stars(p.r)}</div></div><div class="m2-info-row verdict"><div class="m2-info-label">Popcorn Verdict</div><div class="m2-info-value">${esc(verdict(p))}</div></div></section></main><section class="m2-review-stage"><div class="m2-review-ribbon">★ Review</div><article class="m2-review-body">${body}</article><div class="m2-seats" aria-hidden="true"></div></section><section class="m2-section"><div class="m2-section-head"><h2>Related Reviews</h2><a class="m2-viewall" href="/reviews/">View All →</a></div><div class="m2-card-grid">${related.map(movieCard).join('')}</div></section><div class="m2-footer-art" aria-hidden="true"></div>${bottom('reviews')}${searchOverlay()}</div>`}
"""
    mobile, n = re.subn(r"  async function reviewPage\(slug\)\{.*?\}\n  function renderSearch", native_mobile_review + "  function renderSearch", mobile, count=1, flags=re.S)
    if n != 1:
        raise SystemExit("Could not replace mobile WordPress review-body fallback")
    MOBILE_V2.write_text(mobile, encoding="utf-8")

    BRIDGE.write_text("""(()=>{\n  const nativeFetch=window.fetch.bind(window);\n  let catalogPromise=null;\n  async function apiCatalog(){\n    if(catalogPromise)return catalogPromise;\n    catalogPromise=(async()=>{try{const r=await nativeFetch('/api/reviews',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('api unavailable');return {response:r}}catch(e){catalogPromise=null;throw e}})();\n    return catalogPromise;\n  }\n  window.fetch=async function(input,init){\n    const raw=typeof input==='string'?input:input?.url;\n    let url;try{url=new URL(raw,location.href)}catch{return nativeFetch(input,init)}\n    if(url.origin===location.origin&&url.pathname==='/data/index.json'){\n      try{return (await apiCatalog()).response.clone()}catch{return nativeFetch(input,init)}\n    }\n    return nativeFetch(input,init);\n  };\n})();\n""", encoding="utf-8")

    for path in (APP_V4, MOBILE_V2, BRIDGE):
        text = path.read_text(encoding="utf-8")
        forbidden = ("public-api.wordpress.com", "moviereviewbypoorna.wordpress.com", "WP_API")
        leftovers = [marker for marker in forbidden if marker in text]
        if leftovers:
            raise SystemExit(f"{path.name} still contains browser legacy markers: {leftovers}")


def restore_comments_worker():
    result = subprocess.run(
        ["git", "show", f"{PRE_MEDIA_COMMIT}:src/worker-v2.js"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    WORKER_V2.write_text(result.stdout, encoding="utf-8")


def remove_temporary_media_console():
    if MEDIA_CONSOLE.exists():
        MEDIA_CONSOLE.unlink()


def write_report(public_rows):
    report = {
        "native_review_total": len(public_rows),
        "native_body_total": sum(1 for row in public_rows if str(row.get("body") or "").strip()),
        "r2_poster_url_total": sum(1 for row in public_rows if str(row.get("m") or "").startswith(R2_PREFIX)),
        "public_wordpress_reference_total": 0,
        "runtime_wordpress_reference_total": 0,
        "temporary_media_console_removed": not MEDIA_CONSOLE.exists(),
        "worker_v2_restored_from": PRE_MEDIA_COMMIT,
        "static_cutover_ready": True,
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def main():
    public_rows = publish_native_catalog()
    strip_wordpress_runtime()
    strip_browser_wordpress_fallbacks()
    restore_comments_worker()
    remove_temporary_media_console()
    write_report(public_rows)
    print(f"Prepared native cutover for {len(public_rows)} reviews.")


if __name__ == "__main__":
    main()
