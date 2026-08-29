#!/usr/bin/env python3
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
COMPILED = ROOT / "migration" / "compiled" / "native-reviews.json"
PUBLIC_INDEX = ROOT / "public" / "data" / "index.json"
WORKER = ROOT / "src" / "worker.js"
WORKER_V2 = ROOT / "src" / "worker-v2.js"
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
    restore_comments_worker()
    remove_temporary_media_console()
    write_report(public_rows)
    print(f"Prepared native cutover for {len(public_rows)} reviews.")


if __name__ == "__main__":
    main()
