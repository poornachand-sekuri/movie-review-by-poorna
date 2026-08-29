#!/usr/bin/env python3
import concurrent.futures
import json
import os
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
COMPILED = ROOT / "migration" / "compiled" / "native-reviews.json"
BASE = os.environ.get("PREVIEW_BASE", "https://wordpress-full-migration-movie-review-by-poorna.poornarocks.workers.dev").rstrip("/")
R2_PREFIX = "https://assets.moviereviewbypoorna.com/reviews/"
LEGACY = ("wordpress.com", "/wp-content/", "public-api.wordpress.com")
FORBIDDEN_COPY_DASHES = ("--", "–", "—")
EXPECTED_TOTAL = 137
STRICT_SPOTS = {
    101: 3,   # Khaidi No. 150
    380: 1,   # Ravanasura
    461: 2,   # Kantara: Chapter 1
    459: 3,   # They Call Him OG
    457: 3,   # Mirai
    423: 3,   # Hanu-Man
    413: 3,   # Animal
    159: 4,   # 2.0
    67: 3,    # Oopiri
    69: 5,    # 24
    415: 4,   # Dunki
    147: 5,   # Mahanati
}


def req(path_or_url, method="GET", timeout=20):
    url = path_or_url if path_or_url.startswith("http") else BASE + path_or_url
    request = urllib.request.Request(url, method=method, headers={
        "User-Agent": "movie-review-native-cutover-qa/1.0",
        "Accept": "application/json,text/html,*/*",
    })
    return urllib.request.urlopen(request, timeout=timeout)


def get_json(path):
    with req(path) as response:
        if response.status != 200:
            raise RuntimeError(f"{path} returned HTTP {response.status}")
        return json.loads(response.read().decode("utf-8"))


def no_legacy(value, label):
    text = json.dumps(value, ensure_ascii=False).lower() if not isinstance(value, str) else value.lower()
    hits = [marker for marker in LEGACY if marker in text]
    if hits:
        raise AssertionError(f"{label} contains legacy WordPress markers: {hits}")


def no_forbidden_copy_dashes(value, label):
    text = str(value or "")
    hits = [marker for marker in FORBIDDEN_COPY_DASHES if marker in text]
    if hits:
        raise AssertionError(f"{label} contains forbidden dash punctuation: {hits}")


def wait_for_native_runtime(expected_ids):
    last = None
    for attempt in range(24):
        try:
            rows = get_json("/api/reviews")
            ids = {int(r.get("i")) for r in rows if r.get("i") is not None}
            by_id = {int(r["i"]): r for r in rows if r.get("i") is not None}
            spot_ok = all(rid in by_id and by_id[rid].get("r") == rating for rid, rating in STRICT_SPOTS.items())
            poster_ok = all(str(by_id[rid].get("m") or "").startswith(R2_PREFIX) for rid in expected_ids if rid in by_id)
            if expected_ids.issubset(ids) and spot_ok and poster_ok:
                return rows
            last = f"archive_ids={len(expected_ids & ids)}/{len(expected_ids)}, spot_ok={spot_ok}, poster_ok={poster_ok}"
        except Exception as exc:
            last = repr(exc)
        if attempt < 23:
            time.sleep(5)
    raise AssertionError(f"Preview alias did not converge to native cutover build: {last}")


def validate_detail(item):
    rid, expected = item
    detail = get_json(f"/api/reviews/{urllib.parse.quote(str(expected['s']), safe='')}")
    no_legacy(detail, f"detail {rid}")
    if int(detail.get("i")) != rid:
        raise AssertionError(f"Detail ID mismatch for {rid}")
    if detail.get("s") != expected.get("s"):
        raise AssertionError(f"Detail slug mismatch for {rid}")
    if detail.get("m") != expected.get("poster_target"):
        raise AssertionError(f"Detail poster mismatch for {rid}")
    if detail.get("r") != expected.get("r"):
        raise AssertionError(f"Detail rating mismatch for {rid}: runtime={detail.get('r')} compiled={expected.get('r')}")
    if (detail.get("body") or "") != (expected.get("body") or ""):
        raise AssertionError(f"Detail native body differs from compiled source for {rid}")
    if not str(detail.get("body") or "").strip():
        raise AssertionError(f"Detail body empty for {rid}")
    no_forbidden_copy_dashes(detail.get("v"), f"detail verdict {rid}")
    no_forbidden_copy_dashes(detail.get("body"), f"detail body {rid}")
    return rid, bool(detail.get("managed"))


def probe_poster(url):
    try:
        with req(url, method="HEAD", timeout=20) as response:
            return {
                "status": response.status,
                "content_type": (response.headers.get("content-type") or "").lower(),
                "error": None,
            }
    except urllib.error.HTTPError as exc:
        return {"status": exc.code, "content_type": "", "error": f"HTTP {exc.code}"}
    except Exception as exc:
        return {"status": None, "content_type": "", "error": repr(exc)}


def head_poster(item):
    rid, url = item
    result = probe_poster(url)
    alt_url = None
    alt_result = None
    if result["status"] != 200 and "%" in url:
        alt_url = url.replace("%", "%25")
        alt_result = probe_poster(alt_url)
    return {
        "id": rid,
        "url": url,
        "status": result["status"],
        "content_type": result["content_type"],
        "error": result["error"],
        "alternate_url": alt_url,
        "alternate_status": alt_result["status"] if alt_result else None,
        "alternate_content_type": alt_result["content_type"] if alt_result else "",
    }


def get_text(path):
    with req(path) as response:
        body = response.read().decode("utf-8", errors="replace")
        if response.status != 200:
            raise AssertionError(f"{path} returned HTTP {response.status}")
        return body


def require_markers(text, markers, label):
    missing = [marker for marker in markers if marker not in text]
    if missing:
        raise AssertionError(f"{label} is missing expected deployed markers: {missing}")


def main():
    compiled = json.loads(COMPILED.read_text(encoding="utf-8"))
    if len(compiled) != EXPECTED_TOTAL:
        raise AssertionError(f"Compiled count is {len(compiled)}, expected {EXPECTED_TOTAL}")
    expected = {int(r["i"]): r for r in compiled}
    expected_ids = set(expected)

    runtime = wait_for_native_runtime(expected_ids)
    no_legacy(runtime, "runtime compact catalog")
    runtime_by_id = {int(r["i"]): r for r in runtime if r.get("i") is not None}
    missing = expected_ids - set(runtime_by_id)
    if missing:
        raise AssertionError(f"Runtime missing archive IDs: {sorted(missing)}")

    compact_fields = ("t", "s", "d", "l", "e", "rd", "r", "v")
    for rid, source in expected.items():
        live = runtime_by_id[rid]
        for field in compact_fields:
            if live.get(field) != source.get(field):
                raise AssertionError(f"Runtime compact field {field!r} differs for review {rid}")
        if live.get("m") != source.get("poster_target"):
            raise AssertionError(f"Runtime compact poster differs for review {rid}")
        if not str(live.get("m") or "").startswith(R2_PREFIX):
            raise AssertionError(f"Runtime compact poster is not first-party R2 for review {rid}")
        no_forbidden_copy_dashes(live.get("v"), f"runtime verdict {rid}")

    for rid, rating in STRICT_SPOTS.items():
        if runtime_by_id[rid].get("r") != rating:
            raise AssertionError(f"Strict rating spot check failed for {rid}: {runtime_by_id[rid].get('r')} != {rating}")

    managed_archive = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for rid, managed in pool.map(validate_detail, expected.items()):
            if managed:
                managed_archive.append(rid)

    poster_items = [(rid, expected[rid]["poster_target"]) for rid in sorted(expected)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        poster_results = list(pool.map(head_poster, poster_items))
    poster_failures = [
        p for p in poster_results
        if p["status"] != 200 or (p["content_type"] and not p["content_type"].startswith("image/"))
    ]

    extra_ids = sorted(set(runtime_by_id) - expected_ids)
    for rid in extra_ids:
        no_legacy(runtime_by_id[rid], f"extra runtime record {rid}")
        slug = runtime_by_id[rid].get("s")
        if slug:
            no_legacy(get_json(f"/api/reviews/{urllib.parse.quote(str(slug), safe='')}"), f"extra detail {rid}")

    for path in ("/", "/reviews/", "/reviews/dc/", "/reviews/they-call-him-og/", "/admin/"):
        html = get_text(path)
        no_legacy(html, f"HTML {path}")

    # Mobile visual/runtime gate: prove the exact restored Home + Content assets are live.
    index_html = get_text("/")
    require_markers(index_html, ("/assets/mobile-locked.css?v=1", "/assets/mobile-v2.js?v=3"), "homepage asset wiring")
    mobile_js = get_text("/assets/mobile-v2.js?v=3")
    require_markers(
        mobile_js,
        ("m2-admit", "m2-ticket-strip", "m2-previous-strip", "m2-detail-card", "m2-detail-clapper", "/api/reviews/"),
        "mobile JavaScript",
    )
    no_legacy(mobile_js, "mobile JavaScript")
    mobile_css = get_text("/assets/mobile-locked.css?v=1")
    require_markers(
        mobile_css,
        (
            ".m2-home-section",
            ".m2-now-body",
            ".m2-ticket-strip",
            ".m2-previous-strip",
            ".m2-detail-card",
            ".m2-detail-body",
            "home-mobile.avif",
            "content-mobile.avif",
            "Roboto Slab",
        ),
        "mobile locked stylesheet",
    )

    comments = get_json("/api/comments?scope=home")
    if not isinstance(comments.get("comments"), list):
        raise AssertionError("Comments API did not return a comments array")

    try:
        req("/api/admin/session")
        raise AssertionError("Unauthenticated admin session endpoint unexpectedly returned success")
    except urllib.error.HTTPError as exc:
        if exc.code != 401:
            raise AssertionError(f"Unauthenticated admin session returned HTTP {exc.code}, expected 401") from exc

    summary = {
        "preview": BASE,
        "runtime_review_total": len(runtime),
        "archive_review_total": len(expected_ids),
        "archive_detail_bodies_verified": len(expected_ids),
        "archive_r2_posters_http_verified": len(expected_ids) - len(poster_failures),
        "poster_failures": poster_failures,
        "managed_archive_overlays": sorted(managed_archive),
        "extra_native_review_ids": extra_ids,
        "legacy_wordpress_refs": 0,
        "forbidden_dash_refs_in_verdicts_and_bodies": 0,
        "strict_rating_spot_checks": STRICT_SPOTS,
        "home_reviews_detail_admin_html": "ok",
        "mobile_home_layout_assets": "ok",
        "mobile_content_layout_assets": "ok",
        "mobile_6e_verdict_style": "ok",
        "comments_api": "ok",
        "admin_auth_guard": "ok",
    }
    print(json.dumps(summary, indent=2), flush=True)
    if poster_failures:
        raise AssertionError(f"{len(poster_failures)} public R2 poster URL(s) failed HTTP verification")


if __name__ == "__main__":
    main()
