# Likes / Dislikes and Comments API Contract

The frontend is deliberately decoupled from the persistence backend. Set `CONFIG.apiBase` in `assets/js/config.js` when the production API is available.

A Cloudflare Worker + D1 is a good fit if the site is being kept within Cloudflare, but the contract below is host-agnostic.

## Reactions

### GET `/reactions?slug=<movie-slug>`

Response:

```json
{
  "like": 124,
  "dislike": 8,
  "myVote": "like"
}
```

`myVote` may be `"like"`, `"dislike"` or `null`.

### POST `/reactions`

Request:

```json
{
  "slug": "salaar-part-1-ceasefire",
  "vote": "like"
}
```

Response uses the same shape as the GET endpoint.

Production requirements:

- validate the movie slug against the review catalog
- allow only `like` / `dislike`
- prevent one client from endlessly inflating counts
- allow switching a previous vote without double-counting
- never trust counts sent from the browser

## Public comments

### GET `/comments?slug=<movie-slug>`

Return approved comments only:

```json
{
  "comments": [
    {
      "id": "...",
      "name": "Movie Lover",
      "comment": "Loved the review.",
      "created_at": "2026-08-31T10:00:00Z"
    }
  ]
}
```

Do not expose commenter email addresses publicly.

### POST `/comments`

Request:

```json
{
  "slug": "salaar-part-1-ceasefire",
  "name": "Movie Lover",
  "email": "viewer@example.com",
  "comment": "Loved the review."
}
```

New comments must be stored as `pending` and must not become public until an admin approves them.

Suggested response:

```json
{
  "status": "pending"
}
```

## Admin moderation

Admin routes must require authentication and must never rely on a hidden frontend button as security.

Minimum actions:

- list pending comments
- approve pending comment
- reject pending comment
- delete an already approved comment

Suggested state model:

```text
pending -> approved -> deleted
        -> rejected
```

Suggested D1 tables:

```sql
CREATE TABLE reactions (
  slug TEXT NOT NULL,
  voter_key TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('like','dislike')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (slug, voter_key)
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  comment TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','deleted')),
  created_at TEXT NOT NULL,
  moderated_at TEXT
);
```

Add rate limiting, spam protection and server-side input length validation before public launch.
