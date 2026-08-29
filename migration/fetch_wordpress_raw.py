#!/usr/bin/env python3
"""One-time WordPress archive snapshot for the full first-party migration.

This script intentionally stores the untouched WordPress source separately from
future edited/native records. It also inventories media URLs so the media move
to R2 can be verified independently.
"""

from __future__ import annotations

import html
import json
import re
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

SITE = "moviereviewbypoorna.wordpress.com"
API = f"https://public-api.wordpress.com/rest/v1.1/sites/{SITE}/posts/"
ROOT = Path(__file__).resolve().parent
RAW_DIR = ROOT / "raw"
POSTS_DIR = RAW_DIR / "posts"


class MediaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.urls: set[str] = set()

    def handle_starttag(self, tag: str, attrs):
        attrs = dict(attrs)
        for key in ("src", "data-src", "href"):
            value = attrs.get(key)
            if value and self._is_media(value):
                self.urls.add(self._absolute(value))
        srcset = attrs.get("srcset") or attrs.get("data-srcset")
        if srcset:
            for part in srcset.split(","):
                candidate = part.strip().split()[0] if part.strip() else ""
                if candidate and self._is_media(candidate):
                    self.urls.add(self._absolute(candidate))

    @staticmethod
    def _is_media(url: str) -> bool:
        u = url.lower()
        return "/wp-content/uploads/" in u or bool(re.search(r"\.(?:jpe?g|png|webp|gif|avif)(?:\?|$)", u))

    @staticmethod
    def _absolute(url: str) -> str:
        if url.startswith("//"):
            return "https:" + url
        if url.startswith("/"):
            return "https://" + SITE + url
        return url


def request_json(url: str, attempts: int = 4):
    last = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MovieReviewByPoorna-Migration/1.0"})
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:  # pragma: no cover - network environment
            last = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Unable to fetch {url}: {last}")


def safe_slug(value: str, post_id: int) -> str:
    decoded = urllib.parse.unquote(value or "").strip("/")
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", decoded).strip("-")
    return cleaned[:110] or f"post-{post_id}"


def plain_text(markup: str) -> str:
    text = re.sub(r"<script\b[^>]*>[\s\S]*?</script>", " ", markup or "", flags=re.I)
    text = re.sub(r"<style\b[^>]*>[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def compact_post(post: dict) -> dict:
    content = post.get("content") or ""
    parser = MediaParser()
    parser.feed(content)
    featured = post.get("featured_image") or ""
    if featured:
        parser.urls.add(featured)
    return {
        "id": int(post.get("ID")),
        "title_raw": post.get("title") or "",
        "slug_raw": post.get("slug") or "",
        "date": post.get("date") or "",
        "modified": post.get("modified") or "",
        "URL": post.get("URL") or "",
        "status": post.get("status") or "",
        "type": post.get("type") or "",
        "excerpt_html": post.get("excerpt") or "",
        "excerpt_text": plain_text(post.get("excerpt") or ""),
        "content_html": content,
        "content_text": plain_text(content),
        "featured_image": featured,
        "media_urls": sorted(parser.urls),
        "categories": sorted((post.get("categories") or {}).keys()),
        "tags": sorted((post.get("tags") or {}).keys()),
    }


def main() -> None:
    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    all_posts: list[dict] = []
    offset = 0
    page_size = 100
    found = None

    while found is None or offset < found:
        params = urllib.parse.urlencode({"number": page_size, "offset": offset, "context": "display", "order_by": "date", "order": "DESC"})
        data = request_json(API + "?" + params)
        found = int(data.get("found") or 0)
        batch = data.get("posts") or []
        if not batch:
            break
        all_posts.extend(batch)
        offset += len(batch)
        if len(batch) < page_size:
            break

    records = [compact_post(p) for p in all_posts if p.get("status") == "publish" and p.get("type") == "post"]
    records.sort(key=lambda r: (r["date"], r["id"]), reverse=True)

    manifest = []
    all_media: set[str] = set()
    for record in records:
        filename = f'{record["id"]}-{safe_slug(record["slug_raw"], record["id"])}.json'
        (POSTS_DIR / filename).write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        all_media.update(record["media_urls"])
        manifest.append({
            "id": record["id"],
            "slug": record["slug_raw"],
            "title": record["title_raw"],
            "date": record["date"],
            "source_file": f"posts/{filename}",
            "featured_image": record["featured_image"],
            "media_count": len(record["media_urls"]),
        })

    (RAW_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (RAW_DIR / "media-urls.txt").write_text("\n".join(sorted(all_media)) + ("\n" if all_media else ""), encoding="utf-8")
    report = {
        "source": SITE,
        "published_posts": len(records),
        "unique_media_urls": len(all_media),
        "newest_post": manifest[0] if manifest else None,
        "oldest_post": manifest[-1] if manifest else None,
        "purpose": "Immutable source snapshot for first-party migration and editorial QA",
    }
    (RAW_DIR / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
