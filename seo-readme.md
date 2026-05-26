# Automated SEO Content Growth

This repo is bootstrapped for a daily, PR-based SEO/content-growth loop using pi.

## How the loop works

```text
GitHub Actions schedule / manual dispatch
→ install PHP dependencies + pi
→ run pi -p "/content-growth-ci"
→ pi uses project-local extension tools
→ research Search Console, DataForSEO, Parallel search, and existing content
→ update config/seo.php and .ai growth memory files
→ run Pint + SEO feature tests
→ open a GitHub PR with review notes
→ human reviews and merges
→ next run learns from merged repo state
```

The system is intentionally PR-based. It does **not** deploy or publish directly.

## Source of truth for SEO content

SEO content is rendered through Blade SSR pages and defined in:

```text
config/seo.php
```

Use:

```php
'blog_posts' => [
    'post-slug' => [...],
],
```

for:

```text
/blog/{slug}
```

Use:

```php
'programmatic_pages' => [
    'use-case-slug' => [...],
],
```

for:

```text
/use-cases/{slug}
```

The automated agent has been instructed to prefer additive, reviewable updates to `config/seo.php`.

## Files added for the automated system

```text
.pi/extensions/content-growth/index.ts
.pi/content-growth.config.json
.pi/content-growth.config.example.json
.github/workflows/content-growth.yml
.ai/project-summary.md
.ai/growth-strategy.md
.ai/keyword-research.md
.ai/content-calendar.md
.ai/content-inventory.md
.ai/growth-log.md
.ai/last-pr-summary.md
```

## pi extension tools

The project-local extension is auto-discovered by pi from:

```text
.pi/extensions/content-growth/index.ts
```

It provides token-efficient tools:

| Tool | Purpose |
|---|---|
| `content_inventory_scan` | Compact inventory of existing Blade/config/content assets |
| `gsc_performance` | Compact Google Search Console rows |
| `dataforseo_keyword_metrics` | Compact keyword volume/CPC/competition trends |
| `dataforseo_serp` | Compact organic SERP summaries |
| `parallel_search` | Compact web search via Parallel API |
| `content_growth_prompt` | Debug/inspect the generated workflow prompt |

These are intentionally smaller than raw MCP/API dumps to keep CI agent runs cheaper and more focused.

## GitHub secrets to configure

In GitHub, go to:

```text
Settings → Secrets and variables → Actions → New repository secret
```

Recommended minimum:

```text
ANTHROPIC_API_KEY
DATAFORSEO_LOGIN
DATAFORSEO_PASSWORD
PARALLEL_API_KEY
GOOGLE_APPLICATION_CREDENTIALS_JSON
```

Optional alternatives/additions:

```text
OPENAI_API_KEY
GOOGLE_API_KEY
GSC_ACCESS_TOKEN
PARALLEL_API_BASE
```

### Google Search Console access

For `GOOGLE_APPLICATION_CREDENTIALS_JSON`:

1. Create a Google Cloud service account.
2. Create a JSON key.
3. Add the service account email as a user in Google Search Console for the property.
4. Store the full JSON key as the `GOOGLE_APPLICATION_CREDENTIALS_JSON` GitHub secret.

The configured property is in:

```text
.pi/content-growth.config.json
```

Default:

```json
"searchConsoleProperty": "sc-domain:usekeyframes.com"
```

Update it if your Search Console property uses a URL-prefix property instead.

## Parallel API

The extension expects:

```text
PARALLEL_API_KEY
```

It defaults to:

```text
https://api.parallel.ai/v1beta/search
```

If your Parallel account uses a different endpoint/version, add:

```text
PARALLEL_API_BASE
```

as a GitHub secret.

## DataForSEO

The extension uses:

```text
DATAFORSEO_LOGIN
DATAFORSEO_PASSWORD
```

for keyword metrics and SERP summaries.

## Manual local run

Install pi if needed:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Create a local secrets file:

```bash
cp .env.content-growth.example .env.content-growth
```

Fill the API keys in `.env.content-growth`. This file is gitignored.

Run the CI-safe local workflow:

```bash
scripts/content-growth-local.sh
```

Available modes:

```bash
scripts/content-growth-local.sh ci
scripts/content-growth-local.sh daily
scripts/content-growth-local.sh weekly
scripts/content-growth-local.sh monthly
scripts/content-growth-local.sh audit
scripts/content-growth-local.sh status
```

Equivalent direct pi command:

```bash
pi -p "/content-growth-ci"
```

Or inspect the current strategy state interactively:

```bash
pi
/content-growth-status
```

## Manual GitHub run

After pushing to GitHub and adding secrets:

1. Open the repository on GitHub.
2. Go to **Actions**.
3. Select **Content Growth**.
4. Click **Run workflow**.

If changes are generated, the workflow opens a PR named:

```text
Content growth update
```

## Validation run in CI

The workflow runs:

```bash
vendor/bin/pint --dirty --format agent
php artisan test --compact tests/Feature/SeoPagesTest.php
```

So generated SEO changes must keep the Blade SSR SEO pages working.

## Review checklist for generated PRs

Before merging:

- Content matches Usekeyframes voice.
- Search intent and keyword target make sense.
- Claims are factual and supported if needed.
- Internal links are relevant.
- `config/seo.php` changes are clean and reviewable.
- `.ai/growth-log.md` explains why the change was made.
- `.ai/last-pr-summary.md` gives useful reviewer context.

## Current config

The project is bootstrapped with:

```text
.pi/content-growth.config.json
```

Update competitors when ready:

```json
"competitors": [
  "https://competitor-a.com",
  "https://competitor-b.com"
]
```

The first automated runs will be more useful after competitor URLs and Search Console access are configured.
