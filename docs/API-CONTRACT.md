# Likes / Dislikes and Comments API Contract

Production APIs are same-origin Cloudflare Worker routes under `/api`.

## Reactions

### GET `/api/reactions?slug=<movie-slug>`

Returns shared totals plus this browser's current vote.

```json
{
  "like": 124,
  "dislike": 8,
  "myVote": "like"
}
```

### POST `/api/reactions`

```json
{
  "slug": "salaar-part-1-ceasefire",
  "vote": "like"
}
```

The Worker validates the slug, accepts only `like` / `dislike`, prevents repeat inflation from the same browser and supports switching a previous vote.

## Public comments

Comments are target-based so the same backend can serve review pages and the Home page.

Supported targets:

- review page: `target=review`, `target_id=<movie-slug>`
- Home page: `target=home`, `target_id=home`

### GET `/api/comments?target=review&target_id=<movie-slug>`

Only approved comments are returned, newest first. Public responses never contain email addresses or client identifiers.

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

### POST `/api/comments`

Review-page submission:

```json
{
  "target": "review",
  "target_id": "salaar-part-1-ceasefire",
  "name": "Movie Lover",
  "email": "viewer@example.com",
  "comment": "Loved the review."
}
```

Home-page submission uses `"target": "home"` and `"target_id": "home"`.

Successful submissions are stored as `pending` and are not public until approved.

```json
{
  "status": "pending",
  "id": "..."
}
```

Server-side safeguards include:

- same-origin write protection
- review-slug validation against the live catalog
- name, email and comment length validation
- email format validation
- honeypot bot field support
- per-browser submission cooldown
- duplicate-comment rejection window
- private email storage

## Admin moderation

Admin routes are disabled until the Cloudflare Worker secret `ADMIN_COMMENTS_TOKEN` is configured. They require:

```text
Authorization: Bearer <ADMIN_COMMENTS_TOKEN>
```

### GET `/api/admin/comments`

Defaults to pending comments. Optional query parameters:

- `status=pending|approved|rejected|deleted|all`
- `target=review|home`
- `target_id=<id>`
- `limit=<1-200>`

Admin responses may include commenter email addresses because this endpoint is authenticated.

### POST `/api/admin/comments/<comment-id>`

```json
{
  "action": "approve"
}
```

Allowed actions: `approve`, `reject`, `delete`.

State model:

```text
pending -> approved -> deleted
        -> rejected
```

## Storage

Reactions use one SQLite-backed Durable Object per review. Comments use one central SQLite-backed `CommentsStore` Durable Object so a moderation queue can span Home and all review pages.

The comments table stores:

```text
id
target_type
target_id
name
email
comment
status
client_key
created_at
moderated_at
```

The reusable frontend adapter is `assets/js/comments.js`. Content pages call it with a review target; the Home comments UI can call the same module with the Home target when that branch is ready.
