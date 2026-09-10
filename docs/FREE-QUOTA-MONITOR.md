# Free-quota monitoring

The monitoring-only branch `ops/free-quota-monitor` contains a small Actions job for the user's initial three-day observation period. It does not deploy a Worker or query application data. Its sole remote data request is a read-only query to Cloudflare's GraphQL Analytics API, returning account-wide and movie-review database daily row/query totals for today and the previous three UTC days.

The account-wide totals are used against the free D1 allowance: 5,000,000 rows read and 100,000 rows written per UTC day. Other D1 databases count towards this shared allowance. An absent current-day record is shown as unavailable, never silently treated as zero. Analytics can lag or be sampled; low recorded usage does not prove the site is healthy.

Secrets are provided only to the fetching step: `CLOUDFLARE_ANALYTICS_API_TOKEN` (Account Analytics Read, seven-day expiry) and the existing `CLOUDFLARE_ACCOUNT_ID`. The deployment token is not used. No dependencies are installed. Aggregate metrics are written to the GitHub job log as `CLOUDFLARE_USAGE_REPORT` JSON and to the run summary; no token, account identifier, review content, visitor data or query text is printed.

ChatGPT schedules the checks at 09:00 and 21:00 Asia/Kolkata for the initial three days, after a successful access test. Each check re-runs only this monitoring job, waits for completion, reads its fresh report and compares it with the preceding report and completed UTC days. There is no second cron scheduler. Do not re-run site validation or deployment workflows for monitoring. If the connection, token or branch becomes unavailable, report the access issue instead of querying site pages or recreating deleted work. A renewed token is needed for monitoring beyond its expiry.

The workflow's narrowly scoped branch-push trigger tests initial setup and monitor code changes. A new run can also be started manually when the workflow is available in the default branch. Monitoring does not require merging this branch or bypassing production validation. Keep this branch until the observation period ends.

Official references: [D1 metrics](https://developers.cloudflare.com/d1/observability/metrics-analytics/), [D1 free allowance](https://developers.cloudflare.com/d1/platform/pricing/), [Analytics token permissions](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/).
