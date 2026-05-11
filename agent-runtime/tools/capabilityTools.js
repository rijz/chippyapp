import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_FETCH_TIMEOUT_MS = 12000;
const DEFAULT_SEARCH_RESULTS = 5;
const MAX_SEARCH_RESULTS = 10;
const DEFAULT_PAGE_TEXT_CHARS = 12000;
const MAX_PAGE_TEXT_CHARS = 80000;
const DEFAULT_FILE_READ_BYTES = 16000;
const MAX_FILE_READ_BYTES = 250000;
const DEFAULT_FS_LIST_LIMIT = 200;
const MAX_FS_LIST_LIMIT = 1000;
const DEFAULT_SHELL_TIMEOUT_MS = 10000;
const MAX_SHELL_TIMEOUT_MS = 30000;
const DEFAULT_SHELL_OUTPUT_CHARS = 12000;
const MAX_SHELL_OUTPUT_CHARS = 120000;
const DEFAULT_SHELL_ALLOWLIST = [
  'echo',
  'pwd',
  'ls',
  'cat',
  'rg',
  'date',
  'whoami',
  'uname',
  'node',
  'npm',
];

function boolFrom(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function intFrom(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

function stringList(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== 'string') return fallback;
  const values = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : fallback;
}

function truncateText(value, maxChars) {
  const normalized = String(value || '');
  if (normalized.length <= maxChars) {
    return { text: normalized, truncated: false };
  }
  return {
    text: normalized.slice(0, maxChars),
    truncated: true,
  };
}

function toPosixRelative(targetPath, rootPath) {
  const relative = path.relative(rootPath, targetPath);
  if (!relative) return '.';
  return relative.split(path.sep).join('/');
}

function resolveWithinRoot(rawPath, rootPath) {
  const requested = typeof rawPath === 'string' && rawPath.trim() ? rawPath.trim() : '.';
  const resolved = path.resolve(rootPath, requested);
  const relative = path.relative(rootPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes configured tool root.');
  }
  return resolved;
}

function buildCapabilityConfig(options = {}) {
  const fsRoot = path.resolve(
    options.fsRoot ||
      process.env.CHIPPY_TOOL_FS_ROOT ||
      process.cwd()
  );

  const shellAllowlist = new Set(
    stringList(
      options.shellAllowlist || process.env.CHIPPY_SHELL_ALLOWLIST,
      DEFAULT_SHELL_ALLOWLIST,
    )
      .map((item) => item.toLowerCase())
      .map((item) => path.basename(item))
      .filter(Boolean)
  );

  return {
    fsRoot,
    enableWebSearch: boolFrom(options.enableWebSearch ?? process.env.CHIPPY_ENABLE_WEB_SEARCH_TOOL, true),
    enableBrowserFetch: boolFrom(options.enableBrowserFetch ?? process.env.CHIPPY_ENABLE_BROWSER_TOOL, true),
    enableFsRead: boolFrom(options.enableFsRead ?? process.env.CHIPPY_ENABLE_FS_READ_TOOL, true),
    enableFsWrite: boolFrom(options.enableFsWrite ?? process.env.CHIPPY_ENABLE_FS_WRITE_TOOL, false),
    enableShell: boolFrom(options.enableShell ?? process.env.CHIPPY_ENABLE_SHELL_TOOL, false),
    shellAllowAll: boolFrom(options.shellAllowAll ?? process.env.CHIPPY_SHELL_ALLOW_ALL, false),
    shellAllowlist,
    searchEndpoint: typeof (options.searchEndpoint || process.env.CHIPPY_SEARCH_API_URL) === 'string'
      ? String(options.searchEndpoint || process.env.CHIPPY_SEARCH_API_URL).trim()
      : '',
  };
}

function ensureHttpUrl(url) {
  const parsed = new URL(String(url || '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }
  return parsed;
}

async function fetchTextWithTimeout(url, { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers,
    });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url, options = {}) {
  const { response, text } = await fetchTextWithTimeout(url, options);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { response, json, rawText: text };
}

function collectDuckDuckGoRelated(topics, acc = []) {
  const list = Array.isArray(topics) ? topics : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    if (Array.isArray(item.Topics)) {
      collectDuckDuckGoRelated(item.Topics, acc);
      continue;
    }
    const title = typeof item.Text === 'string' ? item.Text.trim() : '';
    const url = typeof item.FirstURL === 'string' ? item.FirstURL.trim() : '';
    if (title && url) {
      acc.push({ title, url, snippet: title, source: 'duckduckgo_related' });
    }
  }
  return acc;
}

function decodeHtmlEntities(text = '') {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function extractTitleFromHtml(html = '') {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return '';
  return decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim();
}

function extractReadableTextFromHtml(html = '') {
  const stripped = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim();
}

function normalizeShellArgs(args) {
  if (!Array.isArray(args)) return [];
  return args.map((item) => String(item ?? ''));
}

function normalizeSearchQuery(raw = '') {
  return String(raw || '')
    .trim()
    .replace(/[?!.]+$/g, '')
    .replace(/^(what|who|when|where|why|how)\s+(is|are|was|were|do|does|did|can|could|would|should)\s+/i, '')
    .replace(/^the\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function runShellCommand({
  command,
  args,
  cwd,
  timeoutMs,
  maxOutputChars,
}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const appendChunk = (existing, chunk) => {
      const next = `${existing}${String(chunk || '')}`;
      if (next.length <= maxOutputChars) return next;
      return next.slice(0, maxOutputChars);
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      const hardTimeout = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 500);
      hardTimeout.unref?.();
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout = appendChunk(stdout, chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = appendChunk(stderr, chunk);
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr: appendChunk(stderr, error?.message || String(error)),
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: Number.isInteger(code) && code === 0 && !timedOut,
        exitCode: Number.isInteger(code) ? code : null,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

async function queryDuckDuckGo({ query, maxResults }) {
  const endpoint = new URL('https://api.duckduckgo.com/');
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('no_html', '1');
  endpoint.searchParams.set('skip_disambig', '1');
  endpoint.searchParams.set('no_redirect', '1');

  const { response, json } = await fetchJsonWithTimeout(endpoint, {
    timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
    headers: {
      'User-Agent': 'chippy-agent-runtime/1.0',
      Accept: 'application/json',
    },
  });

  if (!response.ok || !json || typeof json !== 'object') {
    return [];
  }

  const results = [];
  if (json.AbstractText && json.AbstractURL) {
    results.push({
      title: String(json.Heading || query),
      url: String(json.AbstractURL),
      snippet: String(json.AbstractText),
      source: 'duckduckgo_abstract',
    });
  }

  const related = collectDuckDuckGoRelated(json.RelatedTopics, []);
  for (const item of related) {
    results.push(item);
    if (results.length >= maxResults) break;
  }

  return results.slice(0, maxResults);
}

function extractDuckDuckGoResultUrl(rawHref = '') {
  const href = String(rawHref || '').trim();
  if (!href) return '';
  try {
    const parsed = new URL(href, 'https://duckduckgo.com');
    const encoded = parsed.searchParams.get('uddg');
    if (encoded) {
      const decoded = decodeURIComponent(encoded);
      return ensureHttpUrl(decoded).toString();
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

async function queryDuckDuckGoHtml({ query, maxResults }) {
  const endpoint = new URL('https://html.duckduckgo.com/html/');
  endpoint.searchParams.set('q', query);

  const { response, text } = await fetchTextWithTimeout(endpoint, {
    timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
    headers: {
      'User-Agent': 'chippy-agent-runtime/1.0',
      Accept: 'text/html',
    },
  });
  if (!response.ok || !text) return [];

  const results = [];
  const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = resultRegex.exec(text)) !== null) {
    const url = extractDuckDuckGoResultUrl(match[1]);
    const title = decodeHtmlEntities(String(match[2] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    if (!url || !title) continue;

    const snippetRegex = new RegExp(
      `<a[^>]*href="${String(match[1]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*?<a[^>]*class="result__snippet"[^>]*>([\\s\\S]*?)<\\/a>|<div[^>]*class="result__snippet"[^>]*>([\\s\\S]*?)<\\/div>`,
      'i'
    );
    const snippetMatch = text.slice(match.index, Math.min(text.length, match.index + 2000)).match(snippetRegex);
    const snippetRaw = snippetMatch?.[1] || snippetMatch?.[2] || '';
    const snippet = decodeHtmlEntities(String(snippetRaw).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

    results.push({
      title,
      url,
      snippet,
      source: 'duckduckgo_html',
    });
    if (results.length >= maxResults) break;
  }

  return results.slice(0, maxResults);
}

async function queryWikipedia({ query, maxResults }) {
  const endpoint = new URL('https://en.wikipedia.org/w/api.php');
  endpoint.searchParams.set('action', 'opensearch');
  endpoint.searchParams.set('search', query);
  endpoint.searchParams.set('limit', String(maxResults));
  endpoint.searchParams.set('namespace', '0');
  endpoint.searchParams.set('format', 'json');

  const { response, json } = await fetchJsonWithTimeout(endpoint, {
    timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
    headers: {
      'User-Agent': 'chippy-agent-runtime/1.0',
      Accept: 'application/json',
    },
  });

  if (!response.ok || !Array.isArray(json) || json.length < 4) {
    return [];
  }

  const titles = Array.isArray(json[1]) ? json[1] : [];
  const snippets = Array.isArray(json[2]) ? json[2] : [];
  const urls = Array.isArray(json[3]) ? json[3] : [];

  const out = [];
  for (let i = 0; i < Math.min(maxResults, titles.length, urls.length); i += 1) {
    const title = String(titles[i] || '').trim();
    const url = String(urls[i] || '').trim();
    if (!title || !url) continue;
    out.push({
      title,
      url,
      snippet: String(snippets[i] || '').trim(),
      source: 'wikipedia_opensearch',
    });
  }
  return out;
}

async function queryCustomSearch({ endpoint, query, maxResults }) {
  if (!endpoint) return [];
  const url = ensureHttpUrl(endpoint);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(maxResults));

  const { response, json } = await fetchJsonWithTimeout(url, {
    timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
    headers: {
      'User-Agent': 'chippy-agent-runtime/1.0',
      Accept: 'application/json',
    },
  });
  if (!response.ok || !json || typeof json !== 'object') {
    return [];
  }

  const candidates = Array.isArray(json.results)
    ? json.results
    : (Array.isArray(json.items) ? json.items : []);
  return candidates
    .map((item) => {
      const title = String(item?.title || item?.name || '').trim();
      const rawUrl = item?.url || item?.link || '';
      const snippet = String(item?.snippet || item?.description || '').trim();
      const source = String(item?.source || 'custom_search').trim() || 'custom_search';
      if (!title || !rawUrl) return null;
      try {
        const parsed = ensureHttpUrl(rawUrl);
        return {
          title,
          url: parsed.toString(),
          snippet,
          source,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(0, maxResults);
}

export function registerCapabilityTools(registry, options = {}) {
  const config = buildCapabilityConfig(options);

  registry.register({
    name: 'system.now',
    description: 'Return the current system timestamp for grounding time-sensitive answers.',
    inputSchema: {
      type: 'object',
      required: [],
      properties: {},
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['utcIso', 'utcDate', 'epochMs', 'timezone'],
      properties: {
        utcIso: { type: 'string' },
        utcDate: { type: 'string' },
        epochMs: { type: 'integer' },
        timezone: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'read',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/tools/capabilityTools.js',
    idempotencyKey: () => 'system.now',
    handler: async () => {
      const now = new Date();
      return {
        utcIso: now.toISOString(),
        utcDate: now.toISOString().slice(0, 10),
        epochMs: now.getTime(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      };
    },
  });

  registry.register({
    name: 'web.search',
    description: 'Search the web for public information and return top links.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'integer', minimum: 1, maximum: MAX_SEARCH_RESULTS },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['query', 'provider', 'results', 'truncated'],
      properties: {
        query: { type: 'string' },
        provider: { type: 'string' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            required: ['title', 'url', 'snippet', 'source'],
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              snippet: { type: 'string' },
              source: { type: 'string' },
            },
            additionalProperties: true,
          },
        },
        truncated: { type: 'boolean' },
        warning: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'read',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/tools/capabilityTools.js',
    idempotencyKey: ({ input }) => `web.search:${JSON.stringify(input || {})}`,
    handler: async ({ input }) => {
      const query = String(input?.query || '').trim();
      const normalizedQuery = normalizeSearchQuery(query);
      const maxResults = intFrom(input?.maxResults, DEFAULT_SEARCH_RESULTS, {
        min: 1,
        max: MAX_SEARCH_RESULTS,
      });

      if (!config.enableWebSearch) {
        return {
          query,
          provider: 'disabled',
          results: [],
          truncated: false,
          warning: 'web.search disabled by CHIPPY_ENABLE_WEB_SEARCH_TOOL=false',
        };
      }

      let provider = 'duckduckgo';
      let results = [];
      const candidateQueries = Array.from(new Set([query, normalizedQuery].filter(Boolean)));

      try {
        for (const searchQuery of candidateQueries) {
          if (results.length > 0) break;

          if (config.searchEndpoint) {
            results = await queryCustomSearch({
              endpoint: config.searchEndpoint,
              query: searchQuery,
              maxResults,
            });
            provider = results.length > 0 ? 'custom' : 'custom_fallback';
          }

          if (results.length === 0) {
            results = await queryDuckDuckGoHtml({ query: searchQuery, maxResults });
            provider = 'duckduckgo_html';
          }

          if (results.length === 0) {
            results = await queryDuckDuckGo({ query: searchQuery, maxResults });
            provider = 'duckduckgo';
          }
          if (results.length === 0) {
            results = await queryWikipedia({ query: searchQuery, maxResults });
            provider = 'wikipedia';
          }
        }
      } catch (error) {
        return {
          query,
          provider,
          results: [],
          truncated: false,
          warning: `search_failed:${error.message || error}`,
        };
      }

      return {
        query,
        provider,
        results: results.slice(0, maxResults),
        truncated: results.length > maxResults,
      };
    },
  });

  registry.register({
    name: 'browser.fetch_page',
    description: 'Fetch a webpage and extract readable text for grounding answers.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string' },
        maxChars: { type: 'integer', minimum: 500, maximum: MAX_PAGE_TEXT_CHARS },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 30000 },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['url', 'finalUrl', 'status', 'ok', 'title', 'contentType', 'text', 'truncated'],
      properties: {
        url: { type: 'string' },
        finalUrl: { type: 'string' },
        status: { type: 'integer' },
        ok: { type: 'boolean' },
        title: { type: 'string' },
        contentType: { type: 'string' },
        text: { type: 'string' },
        truncated: { type: 'boolean' },
        warning: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'read',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/tools/capabilityTools.js',
    idempotencyKey: ({ input }) => `browser.fetch_page:${JSON.stringify(input || {})}`,
    handler: async ({ input }) => {
      const urlInput = String(input?.url || '').trim();
      const maxChars = intFrom(input?.maxChars, DEFAULT_PAGE_TEXT_CHARS, {
        min: 500,
        max: MAX_PAGE_TEXT_CHARS,
      });
      const timeoutMs = intFrom(input?.timeoutMs, DEFAULT_FETCH_TIMEOUT_MS, {
        min: 1000,
        max: 30000,
      });

      if (!config.enableBrowserFetch) {
        return {
          url: urlInput,
          finalUrl: urlInput,
          status: 0,
          ok: false,
          title: '',
          contentType: '',
          text: '',
          truncated: false,
          warning: 'browser.fetch_page disabled by CHIPPY_ENABLE_BROWSER_TOOL=false',
        };
      }

      let url;
      try {
        url = ensureHttpUrl(urlInput);
      } catch (error) {
        return {
          url: urlInput,
          finalUrl: urlInput,
          status: 0,
          ok: false,
          title: '',
          contentType: '',
          text: '',
          truncated: false,
          warning: `invalid_url:${error.message || error}`,
        };
      }

      try {
        const { response, text } = await fetchTextWithTimeout(url, {
          timeoutMs,
          headers: {
            'User-Agent': 'chippy-agent-runtime/1.0',
            Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
          },
        });

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        const title = contentType.includes('html') ? extractTitleFromHtml(text) : '';
        const extracted = contentType.includes('html') ? extractReadableTextFromHtml(text) : String(text || '').trim();
        const { text: clippedText, truncated } = truncateText(extracted, maxChars);

        return {
          url: url.toString(),
          finalUrl: response.url || url.toString(),
          status: response.status,
          ok: response.ok,
          title,
          contentType,
          text: clippedText,
          truncated,
        };
      } catch (error) {
        return {
          url: url.toString(),
          finalUrl: url.toString(),
          status: 0,
          ok: false,
          title: '',
          contentType: '',
          text: '',
          truncated: false,
          warning: `fetch_failed:${error.message || error}`,
        };
      }
    },
  });

  registry.register({
    name: 'fs.list',
    description: 'List files and folders under a bounded workspace root.',
    inputSchema: {
      type: 'object',
      required: [],
      properties: {
        path: { type: 'string' },
        recursive: { type: 'boolean' },
        includeHidden: { type: 'boolean' },
        maxEntries: { type: 'integer', minimum: 1, maximum: MAX_FS_LIST_LIMIT },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['path', 'root', 'entries', 'truncated'],
      properties: {
        path: { type: 'string' },
        root: { type: 'string' },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            required: ['path', 'name', 'type'],
            properties: {
              path: { type: 'string' },
              name: { type: 'string' },
              type: { type: 'string' },
              size: { type: ['integer', 'null'] },
              modifiedAt: { type: ['string', 'null'] },
            },
            additionalProperties: true,
          },
        },
        truncated: { type: 'boolean' },
      },
      additionalProperties: true,
    },
    sideEffect: 'read',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/tools/capabilityTools.js',
    idempotencyKey: ({ input }) => `fs.list:${JSON.stringify(input || {})}`,
    handler: async ({ input }) => {
      if (!config.enableFsRead) {
        return {
          path: '.',
          root: config.fsRoot,
          entries: [],
          truncated: false,
        };
      }

      const maxEntries = intFrom(input?.maxEntries, DEFAULT_FS_LIST_LIMIT, {
        min: 1,
        max: MAX_FS_LIST_LIMIT,
      });
      const recursive = input?.recursive === true;
      const includeHidden = input?.includeHidden === true;
      const startPath = resolveWithinRoot(input?.path || '.', config.fsRoot);

      const queue = [startPath];
      const entries = [];
      let truncated = false;

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) break;

        let children = [];
        try {
          children = await fs.readdir(current, { withFileTypes: true });
        } catch {
          continue;
        }

        children.sort((a, b) => a.name.localeCompare(b.name));

        for (const child of children) {
          if (!includeHidden && child.name.startsWith('.')) continue;
          const absoluteChild = path.join(current, child.name);
          let stat = null;
          try {
            stat = await fs.lstat(absoluteChild);
          } catch {
            stat = null;
          }

          const type = child.isDirectory()
            ? 'dir'
            : (child.isFile() ? 'file' : (child.isSymbolicLink() ? 'symlink' : 'other'));

          entries.push({
            path: toPosixRelative(absoluteChild, config.fsRoot),
            name: child.name,
            type,
            size: stat?.isFile() ? Number(stat.size) : null,
            modifiedAt: stat?.mtime ? stat.mtime.toISOString() : null,
          });

          if (entries.length >= maxEntries) {
            truncated = true;
            break;
          }

          if (recursive && child.isDirectory()) {
            queue.push(absoluteChild);
          }
        }

        if (truncated) break;
      }

      if (queue.length > 0) truncated = true;

      return {
        path: toPosixRelative(startPath, config.fsRoot),
        root: config.fsRoot,
        entries,
        truncated,
      };
    },
  });

  registry.register({
    name: 'fs.read',
    description: 'Read a text file under the bounded workspace root.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string' },
        maxBytes: { type: 'integer', minimum: 1, maximum: MAX_FILE_READ_BYTES },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['path', 'root', 'encoding', 'content', 'bytes', 'truncated', 'isBinary'],
      properties: {
        path: { type: 'string' },
        root: { type: 'string' },
        encoding: { type: 'string' },
        content: { type: 'string' },
        bytes: { type: 'integer' },
        truncated: { type: 'boolean' },
        isBinary: { type: 'boolean' },
        warning: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'read',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/tools/capabilityTools.js',
    idempotencyKey: ({ input }) => `fs.read:${JSON.stringify(input || {})}`,
    handler: async ({ input }) => {
      if (!config.enableFsRead) {
        return {
          path: String(input?.path || ''),
          root: config.fsRoot,
          encoding: 'utf8',
          content: '',
          bytes: 0,
          truncated: false,
          isBinary: false,
          warning: 'fs.read disabled by CHIPPY_ENABLE_FS_READ_TOOL=false',
        };
      }

      const absolutePath = resolveWithinRoot(input?.path, config.fsRoot);
      const maxBytes = intFrom(input?.maxBytes, DEFAULT_FILE_READ_BYTES, {
        min: 1,
        max: MAX_FILE_READ_BYTES,
      });

      let stat = null;
      try {
        stat = await fs.stat(absolutePath);
      } catch (error) {
        return {
          path: toPosixRelative(absolutePath, config.fsRoot),
          root: config.fsRoot,
          encoding: 'utf8',
          content: '',
          bytes: 0,
          truncated: false,
          isBinary: false,
          warning: `read_failed:${error.message || error}`,
        };
      }

      if (!stat.isFile()) {
        return {
          path: toPosixRelative(absolutePath, config.fsRoot),
          root: config.fsRoot,
          encoding: 'utf8',
          content: '',
          bytes: Number(stat.size || 0),
          truncated: false,
          isBinary: false,
          warning: 'read_failed:path_is_not_file',
        };
      }

      const fileHandle = await fs.open(absolutePath, 'r');
      try {
        const buffer = Buffer.alloc(maxBytes + 1);
        const { bytesRead } = await fileHandle.read(buffer, 0, maxBytes + 1, 0);
        const truncated = bytesRead > maxBytes;
        const safeBytes = truncated ? maxBytes : bytesRead;
        const slice = buffer.subarray(0, safeBytes);
        const isBinary = slice.includes(0);
        const encoding = isBinary ? 'base64' : 'utf8';
        const content = isBinary ? slice.toString('base64') : slice.toString('utf8');

        return {
          path: toPosixRelative(absolutePath, config.fsRoot),
          root: config.fsRoot,
          encoding,
          content,
          bytes: Number(stat.size || safeBytes),
          truncated,
          isBinary,
        };
      } finally {
        await fileHandle.close();
      }
    },
  });

  registry.register({
    name: 'fs.write',
    description: 'Write or append text to a file under the bounded workspace root.',
    inputSchema: {
      type: 'object',
      required: ['path', 'content'],
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        append: { type: 'boolean' },
        createDirs: { type: 'boolean' },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['ok', 'mode', 'path', 'root', 'bytesWritten'],
      properties: {
        ok: { type: 'boolean' },
        mode: { type: 'string' },
        path: { type: 'string' },
        root: { type: 'string' },
        bytesWritten: { type: 'integer' },
        reason: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'write',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/tools/capabilityTools.js',
    idempotencyKey: ({ input }) => `fs.write:${JSON.stringify(input || {})}`,
    handler: async ({ input, dryRun }) => {
      const absolutePath = resolveWithinRoot(input?.path, config.fsRoot);
      const relativePath = toPosixRelative(absolutePath, config.fsRoot);
      const content = String(input?.content || '');
      const bytes = Buffer.byteLength(content, 'utf8');

      if (!config.enableFsWrite) {
        return {
          ok: false,
          mode: 'disabled',
          path: relativePath,
          root: config.fsRoot,
          bytesWritten: 0,
          reason: 'fs.write disabled by CHIPPY_ENABLE_FS_WRITE_TOOL=false',
        };
      }

      if (dryRun) {
        return {
          ok: true,
          mode: 'dry-run',
          path: relativePath,
          root: config.fsRoot,
          bytesWritten: bytes,
        };
      }

      const append = input?.append === true;
      const createDirs = input?.createDirs !== false;
      if (createDirs) {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      }

      if (append) {
        await fs.appendFile(absolutePath, content, 'utf8');
      } else {
        await fs.writeFile(absolutePath, content, 'utf8');
      }

      return {
        ok: true,
        mode: 'written',
        path: relativePath,
        root: config.fsRoot,
        bytesWritten: bytes,
      };
    },
  });

  registry.register({
    name: 'shell.exec',
    description: 'Execute an allowlisted shell command in a bounded working directory.',
    inputSchema: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string' },
        args: {
          type: 'array',
          items: { type: 'string' },
        },
        cwd: { type: 'string' },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: MAX_SHELL_TIMEOUT_MS },
        maxOutputChars: { type: 'integer', minimum: 200, maximum: MAX_SHELL_OUTPUT_CHARS },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['ok', 'mode', 'command', 'args', 'cwd', 'exitCode', 'stdout', 'stderr', 'timedOut', 'durationMs'],
      properties: {
        ok: { type: 'boolean' },
        mode: { type: 'string' },
        command: { type: 'string' },
        args: {
          type: 'array',
          items: { type: 'string' },
        },
        cwd: { type: 'string' },
        exitCode: { type: ['integer', 'null'] },
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        timedOut: { type: 'boolean' },
        durationMs: { type: 'integer' },
        reason: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'write',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/tools/capabilityTools.js',
    idempotencyKey: ({ input }) => `shell.exec:${JSON.stringify(input || {})}`,
    handler: async ({ input, dryRun }) => {
      const rawCommand = String(input?.command || '').trim();
      const args = normalizeShellArgs(input?.args);
      const commandName = path.basename(rawCommand || '');
      let cwd;
      try {
        cwd = resolveWithinRoot(input?.cwd || '.', config.fsRoot);
      } catch (error) {
        return {
          ok: false,
          mode: 'blocked',
          command: rawCommand,
          args,
          cwd: String(input?.cwd || '.'),
          exitCode: null,
          stdout: '',
          stderr: '',
          timedOut: false,
          durationMs: 0,
          reason: error.message || String(error),
        };
      }

      if (!config.enableShell) {
        return {
          ok: false,
          mode: 'disabled',
          command: rawCommand,
          args,
          cwd: toPosixRelative(cwd, config.fsRoot),
          exitCode: null,
          stdout: '',
          stderr: '',
          timedOut: false,
          durationMs: 0,
          reason: 'shell.exec disabled by CHIPPY_ENABLE_SHELL_TOOL=false',
        };
      }

      if (!rawCommand) {
        return {
          ok: false,
          mode: 'blocked',
          command: rawCommand,
          args,
          cwd: toPosixRelative(cwd, config.fsRoot),
          exitCode: null,
          stdout: '',
          stderr: '',
          timedOut: false,
          durationMs: 0,
          reason: 'command is required',
        };
      }

      if (!config.shellAllowAll && !config.shellAllowlist.has(commandName.toLowerCase())) {
        return {
          ok: false,
          mode: 'blocked',
          command: rawCommand,
          args,
          cwd: toPosixRelative(cwd, config.fsRoot),
          exitCode: null,
          stdout: '',
          stderr: '',
          timedOut: false,
          durationMs: 0,
          reason: `command "${commandName}" is not in CHIPPY_SHELL_ALLOWLIST`,
        };
      }

      if (dryRun) {
        return {
          ok: true,
          mode: 'dry-run',
          command: rawCommand,
          args,
          cwd: toPosixRelative(cwd, config.fsRoot),
          exitCode: null,
          stdout: '',
          stderr: '',
          timedOut: false,
          durationMs: 0,
        };
      }

      const timeoutMs = intFrom(input?.timeoutMs, DEFAULT_SHELL_TIMEOUT_MS, {
        min: 1000,
        max: MAX_SHELL_TIMEOUT_MS,
      });
      const maxOutputChars = intFrom(input?.maxOutputChars, DEFAULT_SHELL_OUTPUT_CHARS, {
        min: 200,
        max: MAX_SHELL_OUTPUT_CHARS,
      });

      const executed = await runShellCommand({
        command: rawCommand,
        args,
        cwd,
        timeoutMs,
        maxOutputChars,
      });

      return {
        ok: executed.ok,
        mode: 'executed',
        command: rawCommand,
        args,
        cwd: toPosixRelative(cwd, config.fsRoot),
        exitCode: executed.exitCode,
        stdout: executed.stdout,
        stderr: executed.stderr,
        timedOut: executed.timedOut,
        durationMs: executed.durationMs,
      };
    },
  });
}
