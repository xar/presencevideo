import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createSign } from 'node:crypto';

interface GrowthConfig {
  siteUrl?: string;
  brand?: string;
  audience?: string;
  product?: string;
  competitors?: string[];
  contentRoot?: string;
  maxActionsPerRun?: number;
  publishMode?: 'draft' | 'publish';
  searchConsoleProperty?: string;
  primaryMarkets?: string[];
  excludedTopics?: string[];
}

type GrowthMode = 'daily' | 'weekly' | 'monthly' | 'audit' | 'ci';

const DEFAULT_CONFIG: GrowthConfig = {
  maxActionsPerRun: 1,
  publishMode: 'draft',
  primaryMarkets: ['US'],
};

const MAX_TEXT_CHARS = 900;
const CONTENT_EXTENSIONS = new Set(['.md', '.mdx', '.svelte', '.vue', '.tsx', '.jsx', '.html', '.blade.php']);

function loadConfig(cwd: string): GrowthConfig {
  const path = join(cwd, '.pi', 'content-growth.config.json');

  if (!existsSync(path)) {
    return DEFAULT_CONFIG;
  }

  return {
    ...DEFAULT_CONFIG,
    ...JSON.parse(readFileSync(path, 'utf8')),
  } as GrowthConfig;
}

function enabledIntegrations(): string[] {
  const integrations: string[] = [];

  if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
    integrations.push('DataForSEO');
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GSC_ACCESS_TOKEN) {
    integrations.push('Google Search Console');
  }

  if (process.env.PARALLEL_API_KEY) {
    integrations.push('Parallel Search API');
  }

  if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY) {
    integrations.push('LLM provider');
  }

  return integrations;
}

function compactJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function truncate(text: string, max = MAX_TEXT_CHARS): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();

  if (cleaned.length <= max) {
    return cleaned;
  }

  return `${cleaned.slice(0, max)}…`;
}

async function fetchJson(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${truncate(text, 1500)}`);
  }

  return data;
}

async function dataForSeo(path: string, body: unknown): Promise<any> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error('Missing DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD.');
  }

  return fetchJson(`https://api.dataforseo.com/v3${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getSearchConsoleAccessToken(): Promise<string> {
  if (process.env.GSC_ACCESS_TOKEN) {
    return process.env.GSC_ACCESS_TOKEN;
  }

  const credentialsRaw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
    ?? (process.env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      ? readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')
      : undefined);

  if (!credentialsRaw) {
    throw new Error('Missing GSC_ACCESS_TOKEN or Google service-account credentials.');
  }

  const credentials = JSON.parse(credentialsRaw) as { client_email: string; private_key: string; token_uri?: string };
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: credentials.token_uri ?? 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(credentials.private_key);
  const assertion = `${header}.${payload}.${base64Url(signature)}`;

  const token = await fetchJson(credentials.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  return token.access_token;
}

function walkFiles(root: string, maxFiles: number, files: string[] = []): string[] {
  if (!existsSync(root) || files.length >= maxFiles) {
    return files;
  }

  for (const entry of readdirSync(root)) {
    if (files.length >= maxFiles || ['node_modules', '.git', 'vendor', 'storage', 'dist', 'build', '.next'].includes(entry)) {
      continue;
    }

    const path = join(root, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      walkFiles(path, maxFiles, files);
    } else if (stats.isFile() && (CONTENT_EXTENSIONS.has(extname(path)) || path.endsWith('.blade.php'))) {
      files.push(path);
    }
  }

  return files;
}

function frontmatterValue(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?`, 'mi'));

  return match?.[1]?.trim();
}

function headings(text: string): string[] {
  return Array.from(text.matchAll(/^#{1,3}\s+(.+)$/gm)).slice(0, 12).map((match) => match[1].trim());
}

function seoConfigInventory(cwd: string): unknown | null {
  const path = join(cwd, 'config', 'seo.php');

  if (!existsSync(path)) {
    return null;
  }

  const text = readFileSync(path, 'utf8');
  const programmaticPagesSection = text.match(/'programmatic_pages'\s*=>\s*\[([\s\S]*?)\n\s*\],\n\n\s*'blog_posts'/)?.[1] ?? '';
  const blogPostsSection = text.match(/'blog_posts'\s*=>\s*\[([\s\S]*?)\n\s*\],\n\];/)?.[1] ?? '';

  return {
    path: 'config/seo.php',
    storage: 'Laravel config array rendered by Blade SSR routes',
    programmaticPages: Array.from(programmaticPagesSection.matchAll(/^\s{8}'([^']+)'\s*=>\s*\[/gm)).map((match) => match[1]),
    blogPosts: Array.from(blogPostsSection.matchAll(/^\s{8}'([^']+)'\s*=>\s*\[/gm)).map((match) => match[1]),
    note: 'Add blog posts under blog_posts and use-case/programmatic SEO pages under programmatic_pages.',
  };
}

function buildGrowthPrompt(config: GrowthConfig, mode: GrowthMode): string {
  const integrations = enabledIntegrations();
  const isCi = mode === 'ci';

  return `Run the autonomous content-growth workflow for this website.

MODE: ${mode}${isCi ? ' — CI SAFE PR MODE' : ''}

CONFIG:
${JSON.stringify(config, null, 2)}

AVAILABLE INTEGRATIONS DETECTED:
${integrations.length ? integrations.map((item) => `- ${item}`).join('\n') : '- None detected from environment; use available project/MCP tools and note missing integrations.'}

TOKEN-EFFICIENT TOOLS AVAILABLE:
- content_inventory_scan: compact existing content inventory.
- gsc_performance: compact Search Console rows for queries/pages.
- dataforseo_keyword_metrics: compact keyword volume/CPC/competition/difficulty.
- dataforseo_serp: compact organic SERP summaries.
- parallel_search: compact web search results via Parallel API.
Use these tools instead of raw MCP dumps when possible.

OBJECTIVE:
Build a self-improving SEO/content system. Do not just write random blog posts. Use Search Console, SEO data, search APIs, existing content, and competitor/market research when available.

REQUIRED WORKFLOW:
1. Inspect existing project content structure and brand voice. If config/seo.php exists, treat it as the source of truth for Blade SSR blog/use-case SEO content.
2. Ensure these strategy files exist and update them as needed:
   - .ai/project-summary.md
   - .ai/growth-strategy.md
   - .ai/keyword-research.md
   - .ai/content-calendar.md
   - .ai/content-inventory.md
   - .ai/growth-log.md
3. Analyze performance/opportunity:
   - Search Console: pages/queries with clicks, impressions, CTR, position, gains/losses.
   - SEO/search data: keyword demand, difficulty, SERP intent, competitor gaps.
   - Existing site: content gaps, cannibalization, internal linking opportunities.
4. Score opportunities by business relevance, search intent fit, ranking feasibility, topical authority value, internal linking value, and conversion potential.
5. Execute no more than ${config.maxActionsPerRun ?? 1} high-leverage action(s). For this Laravel Blade SSR setup, prefer adding reviewable entries to config/seo.php unless the existing project structure clearly uses separate content files.
6. If creating content, first create a brief with target keyword, intent, angle, SERP gaps, structure, internal links, CTA, and sources needed.
7. Avoid AI slop: no generic intros, unsupported claims, keyword stuffing, or thin summaries.
8. If factual claims are added, verify them and include references.
9. Update .ai/growth-log.md with date, data used, decisions, action, expected impact, and next action.
10. Run relevant tests/formatters only if code/content pipeline files are changed and the project has those checks.
${isCi ? `
CI SAFETY RULES:
- Do not publish directly or deploy.
- Prefer drafts unless config explicitly says otherwise.
- Avoid destructive rewrites; create additive, reviewable changes.
- Do not edit secrets, dependency files, or unrelated application code.
- If data/API access is missing, still update logs with the limitation and either make no content changes or prepare a researched brief.
- Write .ai/last-pr-summary.md with concise PR notes: data reviewed, files changed, reviewer checklist, risks, and next action.
` : ''}
OUTPUT SUMMARY:
At the end, summarize data reviewed, top opportunities, actions performed, files changed, and next 24-hour recommendation.
${isCi ? 'Confirm .ai/last-pr-summary.md was written.' : ''}
`;
}

export default function contentGrowthExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'content_inventory_scan',
    label: 'Content Inventory Scan',
    description: 'Return a compact inventory of existing content files: path, title, description, headings, word count, and modified date.',
    parameters: Type.Object({
      root: Type.Optional(Type.String({ description: 'Root directory to scan. Defaults to configured contentRoot or common content directories.' })),
      maxFiles: Type.Optional(Type.Number({ default: 80 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const config = loadConfig(ctx.cwd);
      const roots = params.root ? [params.root] : [config.contentRoot, 'content', 'resources/js/pages', 'resources/views', 'src/content', 'app'].filter(Boolean) as string[];
      const files = roots.flatMap((root) => walkFiles(join(ctx.cwd, root), params.maxFiles ?? 80)).slice(0, params.maxFiles ?? 80);
      const items = files.map((path) => {
        const text = readFileSync(path, 'utf8');
        const stats = statSync(path);

        return {
          path: relative(ctx.cwd, path),
          title: frontmatterValue(text, 'title') ?? headings(text)[0] ?? null,
          description: frontmatterValue(text, 'description') ?? null,
          headings: headings(text),
          words: text.split(/\s+/).filter(Boolean).length,
          modified: stats.mtime.toISOString().slice(0, 10),
          excerpt: truncate(text.replace(/^---[\s\S]*?---/, ''), 260),
        };
      });
      const seoConfig = seoConfigInventory(ctx.cwd);
      const inventory = seoConfig ? [{ type: 'seo_config', ...seoConfig }, ...items] : items;

      return { content: [{ type: 'text', text: compactJson(inventory) }], details: { count: inventory.length, items: inventory } };
    },
  });

  pi.registerTool({
    name: 'dataforseo_keyword_metrics',
    label: 'DataForSEO Keyword Metrics',
    description: 'Token-efficient keyword metrics from DataForSEO. Returns only volume, CPC, competition, difficulty, and intent when available.',
    parameters: Type.Object({
      keywords: Type.Array(Type.String()),
      locationCode: Type.Optional(Type.Number({ default: 2840, description: 'DataForSEO location code. 2840 = United States.' })),
      languageCode: Type.Optional(Type.String({ default: 'en' })),
      limit: Type.Optional(Type.Number({ default: 25 })),
    }),
    async execute(_toolCallId, params) {
      const keywords = params.keywords.slice(0, params.limit ?? 25);
      const data = await dataForSeo('/keywords_data/google_ads/search_volume/live', [{
        keywords,
        location_code: params.locationCode ?? 2840,
        language_code: params.languageCode ?? 'en',
      }]);
      const rows = (data.tasks?.[0]?.result ?? []).map((item: any) => ({
        keyword: item.keyword,
        volume: item.search_volume ?? 0,
        cpc: item.cpc ?? null,
        competition: item.competition ?? null,
        competitionIndex: item.competition_index ?? null,
        trend: item.monthly_searches?.slice(-6)?.map((month: any) => month.search_volume) ?? [],
      })).sort((a: any, b: any) => (b.volume ?? 0) - (a.volume ?? 0));

      return { content: [{ type: 'text', text: compactJson(rows) }], details: { rows } };
    },
  });

  pi.registerTool({
    name: 'dataforseo_serp',
    label: 'DataForSEO SERP Summary',
    description: 'Token-efficient organic SERP summary from DataForSEO for a keyword.',
    parameters: Type.Object({
      keyword: Type.String(),
      locationCode: Type.Optional(Type.Number({ default: 2840 })),
      languageCode: Type.Optional(Type.String({ default: 'en' })),
      limit: Type.Optional(Type.Number({ default: 10 })),
    }),
    async execute(_toolCallId, params) {
      const data = await dataForSeo('/serp/google/organic/live/advanced', [{
        keyword: params.keyword,
        location_code: params.locationCode ?? 2840,
        language_code: params.languageCode ?? 'en',
        depth: Math.min(params.limit ?? 10, 20),
      }]);
      const items = (data.tasks?.[0]?.result?.[0]?.items ?? [])
        .filter((item: any) => item.type === 'organic')
        .slice(0, params.limit ?? 10)
        .map((item: any) => ({
          rank: item.rank_group,
          title: item.title,
          url: item.url,
          domain: item.domain,
          description: truncate(item.description ?? '', 240),
          breadcrumb: item.breadcrumb ?? null,
        }));

      return { content: [{ type: 'text', text: compactJson(items) }], details: { keyword: params.keyword, items } };
    },
  });

  pi.registerTool({
    name: 'gsc_performance',
    label: 'Search Console Performance',
    description: 'Token-efficient Search Console performance rows for queries/pages. Uses GSC_ACCESS_TOKEN or service-account credentials.',
    parameters: Type.Object({
      siteUrl: Type.Optional(Type.String({ description: 'Search Console property, e.g. sc-domain:example.com or https://example.com/' })),
      startDate: Type.String({ description: 'YYYY-MM-DD' }),
      endDate: Type.String({ description: 'YYYY-MM-DD' }),
      dimensions: Type.Optional(Type.Array(Type.Union([Type.Literal('query'), Type.Literal('page'), Type.Literal('country'), Type.Literal('device')]))),
      rowLimit: Type.Optional(Type.Number({ default: 50 })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const config = loadConfig(ctx.cwd);
      const siteUrl = params.siteUrl ?? config.searchConsoleProperty ?? config.siteUrl;

      if (!siteUrl) {
        throw new Error('Missing siteUrl/searchConsoleProperty in params or config.');
      }

      const token = await getSearchConsoleAccessToken();
      const encodedSite = encodeURIComponent(siteUrl);
      const data = await fetchJson(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: params.startDate,
          endDate: params.endDate,
          dimensions: params.dimensions ?? ['query', 'page'],
          rowLimit: Math.min(params.rowLimit ?? 50, 250),
          dataState: 'final',
        }),
      });
      const rows = (data.rows ?? []).map((row: any) => ({
        keys: row.keys,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Number(row.ctr?.toFixed?.(4) ?? row.ctr),
        position: Number(row.position?.toFixed?.(2) ?? row.position),
      }));

      return { content: [{ type: 'text', text: compactJson(rows) }], details: { siteUrl, rows } };
    },
  });

  pi.registerTool({
    name: 'parallel_search',
    label: 'Parallel Search',
    description: 'Token-efficient web search using Parallel API. Returns title, URL, snippet, and source fields only.',
    parameters: Type.Object({
      query: Type.String(),
      maxResults: Type.Optional(Type.Number({ default: 8 })),
    }),
    async execute(_toolCallId, params, signal) {
      const apiKey = process.env.PARALLEL_API_KEY;

      if (!apiKey) {
        throw new Error('Missing PARALLEL_API_KEY.');
      }

      const baseUrl = process.env.PARALLEL_API_BASE ?? 'https://api.parallel.ai/v1beta/search';
      const data = await fetchJson(baseUrl, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: params.query,
          max_results: Math.min(params.maxResults ?? 8, 10),
        }),
      });
      const rawResults = data.results ?? data.data?.results ?? data.items ?? [];
      const results = rawResults.slice(0, params.maxResults ?? 8).map((item: any) => ({
        title: item.title ?? item.name ?? null,
        url: item.url ?? item.link ?? item.source_url ?? null,
        snippet: truncate(item.snippet ?? item.text ?? item.description ?? item.summary ?? '', 360),
        source: item.source ?? item.domain ?? null,
      }));

      return { content: [{ type: 'text', text: compactJson(results) }], details: { query: params.query, results } };
    },
  });

  pi.registerCommand('content-growth-run', {
    description: 'Run the autonomous SEO/content growth workflow. Args: daily | weekly | monthly | audit.',
    handler: async (args, ctx) => {
      const rawMode = args.trim() || 'daily';
      const mode = ['daily', 'weekly', 'monthly', 'audit'].includes(rawMode) ? rawMode as GrowthMode : 'daily';
      const config = loadConfig(ctx.cwd);

      ctx.ui.notify(`Starting content growth run: ${mode}`, 'info');
      pi.sendUserMessage(buildGrowthPrompt(config, mode));
    },
  });

  pi.registerCommand('content-growth-ci', {
    description: 'Run the autonomous SEO/content growth workflow in CI-safe PR mode.',
    handler: async (_args, ctx) => {
      const config = {
        ...loadConfig(ctx.cwd),
        publishMode: 'draft' as const,
      };

      ctx.ui.notify('Starting content growth CI run', 'info');
      pi.sendUserMessage(buildGrowthPrompt(config, 'ci'));
    },
  });

  pi.registerCommand('content-growth-status', {
    description: 'Inspect content growth strategy files and recommend the next action.',
    handler: async (_args, ctx) => {
      const config = loadConfig(ctx.cwd);
      pi.sendUserMessage(`Inspect the content growth state for this project.\n\nCONFIG:\n${JSON.stringify(config, null, 2)}\n\nReview .ai/project-summary.md, .ai/growth-strategy.md, .ai/keyword-research.md, .ai/content-calendar.md, .ai/content-inventory.md, and .ai/growth-log.md if they exist. Summarize current status, missing setup, last action, and the best next action. Do not make changes unless necessary to fix missing/invalid tracking files.`);
    },
  });

  pi.registerTool({
    name: 'content_growth_prompt',
    label: 'Content Growth Prompt',
    description: 'Generate the autonomous SEO/content growth prompt for CI or inspection.',
    parameters: Type.Object({
      mode: Type.Optional(Type.Union([
        Type.Literal('daily'),
        Type.Literal('weekly'),
        Type.Literal('monthly'),
        Type.Literal('audit'),
        Type.Literal('ci'),
      ])),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const config = loadConfig(ctx.cwd);
      const prompt = buildGrowthPrompt(config, params.mode ?? 'daily');

      return {
        content: [{ type: 'text', text: prompt }],
        details: { config, integrations: enabledIntegrations() },
      };
    },
  });
}
