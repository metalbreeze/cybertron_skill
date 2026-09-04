# Verifying External API Endpoints

Authoritative guide for picking endpoint URLs when integrating any
third-party API (payment gateways, ad platforms, ERP systems, OAuth
providers, social platforms, …).

> **TL;DR** — Official docs are the only authoritative source for
> endpoint URLs. Community SDKs go stale faster than people realize:
> a 3-month-old SDK can already point at endpoints the provider has
> deprecated. Use SDKs for field names and shapes, never for URLs.

---

## Why this exists

Real failure case from this codebase, 2026-05-08:

1. We needed Kuaishou's "list ad campaigns" endpoint for §5.1
2. We grepped two community Go SDKs (`bububa/kwai-marketing-api`,
   `openthe88/kwai-marketing-api`) and saw `URL: "v1/campaign/list"`
3. Wrote a client method using `/rest/openapi/v1/campaign/list`
4. Shipped to production
5. KS responded with `code=30020001 该接口今天调用量已经超限=[0]`
   — a misleading "rate-limit exhausted" error that wasted 2 hours of
   debugging time, including writing speculative gotcha docs and
   nearly emailing the provider's support team
6. Real cause: KS deprecated and **took offline** the entire
   `/v1/campaign|ad_unit|creative...` family in **2025-02**. The
   community SDKs were last updated in 2024-11 and never caught up.
   The new endpoint lives at `/rest/openapi/gw/dsp/campaign/list`.

The 2 hours could have been 5 minutes if we had checked
`developers.e.kuaishou.com/tools/logs` (the provider's changelog)
before writing any code.

---

## The verification ladder

Run all 5 steps before writing the first line of client code. Each
takes < 1 minute.

### Step 1 — Find the endpoint in the official docs

- Navigate to the provider's developer docs site (not blog posts,
  not Stack Overflow, not GitHub READMEs)
- Use the docs site's own navigation tree to locate the endpoint by
  function ("list campaigns" → 投放管理 → 广告创编 → 广告计划 → 查询)
- If you can only find it via Google, double-check that the result
  is on the provider's official domain — many "API references" in
  search results are mirrors that haven't been updated in years

### Step 2 — Read the endpoint URL straight off the page

Most provider docs have a header section with the canonical URL:

```
请求接口: https://ad.e.kuaishou.com/rest/openapi/gw/dsp/campaign/list
请求方式: POST
数据格式: JSON
更新时间: 2026-04-01 15:55
```

This URL is the source of truth. Copy it character-for-character into
your client code. Do not transform, abbreviate, or "clean it up".

### Step 3 — Grep the changelog for the URL

Find the provider's changelog / release notes / "更新日志" / "what's
new" page. Search for your exact URL. If it appears anywhere in a
"deprecated" / "下线" / "sunset" / "removed" / "EOL" context, **stop
and find the new endpoint** before continuing.

Common changelog locations:
- `<docs-domain>/changelog`
- `<docs-domain>/release-notes`
- `<docs-domain>/tools/logs` (some providers tuck it under tools)
- `<docs-domain>/whats-new`
- A pinned blog category named "API updates"

If the provider has no public changelog, check their GitHub releases
page (for SDKs) or their developer email digests.

### Step 4 — Check the page's "last updated" date

The detail page usually shows when it was last modified ("更新时间",
"Last updated", "Last edited"). This is a soft signal:

| Last updated | Treat as |
|---|---|
| < 6 months | Likely current |
| 6-12 months | Verify against changelog before relying |
| 1-2 years | High suspicion — endpoint family may have been migrated |
| > 2 years | Assume stale; spot-check a sibling endpoint to confirm |

Especially suspicious: an endpoint whose page hasn't been touched in
years sitting next to siblings with recent updates. That's the
fingerprint of an abandoned endpoint family that nobody bothered to
mark deprecated.

### Step 5 — Use SDKs only for field details, never for URLs

Once the URL is locked in from Step 2, *then* open the SDK source for:

- Exact field names in request/response (docs often missing fields)
- Type information (uint64 vs string for IDs, float64 vs int for money)
- Nested struct shapes
- Per-endpoint success-code conventions (some endpoints use
  `code: 0` for success, others use `code: 1` — see ks-gotchas.md §3)
- Pagination conventions (page+pageSize vs cursor vs offset)

Never cross-check URLs from SDK against docs and conclude "they match
so it's fine" — they may both be stale relative to current production.

---

## Time-based heuristics for SDK staleness

Check the SDK's last commit date *before* you start reading its code.
If you skip this step, you'll spend time understanding stale code.

```
gh api repos/<org>/<repo>/commits --jq '.[0].commit.author.date'
# or for npm: npm view <package> time.modified
# or for PyPI: pip show <package> | grep Updated
```

| SDK age (last commit) | Trust level | Action |
|---|---|---|
| < 3 months | High | Still verify URLs against docs |
| 3-6 months | Medium | Verify URLs **and** check provider changelog |
| 6-12 months | Low | Assume at least one endpoint has moved; URL verification mandatory |
| 12-18 months | Very low | Field-name reference only; treat all URLs as suspect |
| > 18 months | None | Abandonware; only useful for "what does response shape look like" forensics |

Critical caveat: even a 1-week-old commit doesn't help if the
*maintainer* hasn't tracked the provider's deprecations. Some SDKs
get version bumps for unrelated changes while their endpoint paths
silently rot. Always pair "SDK age" with "is the URL also in the
provider's current docs" — never trust either signal alone.

---

## Versioning prefix as a signal

When a provider has multiple URL prefixes simultaneously available,
that's almost always a generation marker:

| Pattern | Typical meaning |
|---|---|
| `/v1/...` | First public version. Often partly deprecated. |
| `/v2/...` `/v3/...` | Successive revisions. Some endpoints migrated, others stayed on v1. |
| `/api/v2/...` | A deliberate "we re-architected" jump. |
| `/gw/...` `/openapi/gw/...` | New gateway architecture. The future. |
| `/legacy/...` `/old/...` | Explicitly marked as deprecated; will be removed. |
| `/internal/...` `/private/...` | Not for external use; will break without notice. |

If you see two prefixes in the same provider's surface, ask
explicitly: **"Which generation is current for this resource?"**
before picking either. Migration of endpoint families is rarely
all-or-nothing — `/v1/report/...` may live forever while
`/v1/campaign/...` was sunset two years ago.

---

## What SDKs are still good for

The lessons above are about URLs, not about throwing out SDKs
entirely. SDKs remain valuable for:

✅ **Field names** — provider docs frequently miss fields that
actually appear in responses (the access_token response in
ks-gotchas.md §2 is a textbook case)

✅ **Type information** — knowing a field is `uint64` vs `string`
matters for JSON unmarshal in Go, less so for JS

✅ **Nested struct shapes** — when a doc just says `data: object` and
you need the actual hierarchy

✅ **Success-code conventions per endpoint** — some providers use
inconsistent code semantics across endpoints; SDKs encode the working
convention

✅ **Pagination patterns** — page-based vs cursor-based vs hybrid

✅ **Header conventions** — auth header name, content-type quirks,
request signing schemes

❌ **URL paths** — verify against current docs every time

❌ **Whether the endpoint exists at all** — verify against changelog

---

## Pre-coding checklist

Before writing the first line of any external API client method:

- [ ] Endpoint URL copied verbatim from official docs page
- [ ] URL searched in provider's changelog — no "deprecated" hits
- [ ] Doc page "last updated" recorded; if > 12 months, sanity-check
      against a sibling endpoint
- [ ] If using an SDK as field-detail reference: SDK's last commit
      date noted; if > 6 months, treat URLs as untrustworthy
- [ ] Authentication scheme verified from official docs (some
      endpoints use header-based, some body-based, some both)
- [ ] Success code convention noted per endpoint (don't assume
      `code: 0` is universal)
- [ ] Date/time format requirements noted (some endpoints want
      `yyyy-MM-dd`, others ISO 8601, others Unix timestamps)
- [ ] Error case for "endpoint deprecated" thought through: when
      the URL eventually does go down, what's the failure mode in
      our code? Will the error bubble up cleanly or silently look
      like "no data"?

If any item can't be checked off, surface that gap to the user
explicitly before writing code. The 30 seconds it takes to confirm a
URL against docs is dwarfed by the time spent debugging a deprecated
endpoint that's returning misleading errors.

---

## When the official docs are wrong or missing

Sometimes the provider's docs are themselves out of date or omit a
field entirely. In that case:

1. Note the discrepancy in your project's `*-api-gotchas.md` file
2. Send the request anyway and capture the actual response
3. If the response field exists but is undocumented, build to the
   *observed* shape and link the gotcha entry
4. Schedule periodic re-verification — undocumented behavior can be
   "fixed" (broken from your perspective) without warning

This is the inverse of the URL case: for fields, trust empirical
observation over docs when they conflict. For URLs, trust docs over
SDKs when they conflict.

---

## Real-world examples library

Add new entries here as the project hits new failures. Each entry
should record: the symptom, the root cause, and the verification
step that *would* have prevented it.

### Kuaishou Marketing API: `/v1/campaign/list` deprecated 2025-02

- **Symptom**: `code=30020001 该接口今天调用量已经超限=[0]` on first
  call, despite never having called this endpoint
- **Root cause**: endpoint deprecated 2025-02-12, provider reused the
  rate-limit error code with a misleading message instead of
  returning a clean "endpoint deprecated" code
- **What would have caught it**: Step 3 of the verification ladder —
  searching `developers.e.kuaishou.com/tools/logs` for the URL would
  have found the deprecation notice with `gw/dsp/...` as the new path
- **Time wasted**: ~2 hours debugging + speculation
- **Time the verification step would have taken**: ~1 minute
