#!/usr/bin/env python3
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
COMPILED = ROOT / "migration" / "compiled" / "native-reviews.json"
PUBLIC_INDEX = ROOT / "public" / "data" / "index.json"
R2_PREFIX = "https://assets.moviereviewbypoorna.com/reviews/"
EXPECTED_TOTAL = 137
FORBIDDEN = ("wordpress.com", "/wp-content/", "public-api.wordpress.com", "WP_POSTS", "absoluteLegacyImage")
TEXT_SUFFIXES = {".js", ".mjs", ".cjs", ".json", ".html", ".css", ".txt", ".xml", ".svg"}


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def fail(message):
    raise SystemExit(message)


def validate_catalog():
    native = load(COMPILED)
    public = load(PUBLIC_INDEX)
    if len(native) != EXPECTED_TOTAL or len(public) != EXPECTED_TOTAL:
        fail(f"Review count mismatch: compiled={len(native)} public={len(public)} expected={EXPECTED_TOTAL}")

    native_by_id = {int(row["i"]): row for row in native}
    public_by_id = {int(row["i"]): row for row in public}
    if set(native_by_id) != set(public_by_id):
        fail("Public/native review ID sets differ")

    allowed_public_fields = {"i", "t", "s", "d", "l", "m", "c", "e", "rd", "r", "v", "body", "gallery"}
    for rid, expected in native_by_id.items():
        actual = public_by_id[rid]
        extra = set(actual) - allowed_public_fields
        if extra:
            fail(f"Review {rid} exposes unexpected public fields: {sorted(extra)}")
        comparisons = {
            "t": expected.get("t") or "",
            "s": expected.get("s") or "",
            "d": expected.get("d") or "",
            "l": expected.get("l") or "",
            "e": expected.get("e") or "",
            "rd": expected.get("rd") or "",
            "r": expected.get("r"),
            "v": expected.get("v") or "",
            "body": expected.get("body") or "",
        }
        for field, value in comparisons.items():
            if actual.get(field) != value:
                fail(f"Review {rid} public field {field!r} differs from compiled native source")
        poster = str(actual.get("m") or "")
        if poster != str(expected.get("poster_target") or "") or not poster.startswith(R2_PREFIX):
            fail(f"Review {rid} poster is not the compiled R2 target")
        if not str(actual.get("body") or "").strip():
            fail(f"Review {rid} has no native body")

    text = PUBLIC_INDEX.read_text(encoding="utf-8")
    lowered = text.lower()
    for marker in ("wordpress.com", "/wp-content/", "public-api.wordpress.com", "poster_source"):
        if marker.lower() in lowered:
            fail(f"Public catalog contains forbidden legacy marker: {marker}")


def validate_runtime_tree():
    hits = []
    for base in (ROOT / "src", ROOT / "public"):
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for marker in FORBIDDEN:
                if marker.lower() in text.lower():
                    hits.append(f"{path.relative_to(ROOT)} :: {marker}")
    if hits:
        fail("Legacy WordPress runtime/public references remain:\n" + "\n".join(hits))


def main():
    validate_catalog()
    validate_runtime_tree()
    print("Native cutover validation passed: 137/137 reviews, R2 posters, zero WordPress refs in src/public.")


if __name__ == "__main__":
    main()
