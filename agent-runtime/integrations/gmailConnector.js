import { google } from 'googleapis';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
];

function normalizeHeaderName(name = '') {
  return String(name || '').trim().toLowerCase();
}

function parseHeaders(headers = []) {
  const map = {};
  for (const header of Array.isArray(headers) ? headers : []) {
    const key = normalizeHeaderName(header?.name);
    if (!key) continue;
    map[key] = String(header?.value || '');
  }
  return map;
}

function decodeBase64Url(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function htmlToText(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPayloadText(payload = null) {
  if (!payload || typeof payload !== 'object') return '';

  const partList = [];
  if (payload.body?.data) {
    partList.push({
      mimeType: payload.mimeType || '',
      data: payload.body.data,
    });
  }

  const stack = Array.isArray(payload.parts) ? [...payload.parts] : [];
  while (stack.length > 0) {
    const part = stack.shift();
    if (!part || typeof part !== 'object') continue;
    if (part.body?.data) {
      partList.push({
        mimeType: part.mimeType || '',
        data: part.body.data,
      });
    }
    if (Array.isArray(part.parts)) {
      stack.push(...part.parts);
    }
  }

  const plain = partList.find((item) => /text\/plain/i.test(String(item.mimeType || '')));
  if (plain?.data) {
    return decodeBase64Url(plain.data).trim();
  }

  const html = partList.find((item) => /text\/html/i.test(String(item.mimeType || '')));
  if (html?.data) {
    return htmlToText(decodeBase64Url(html.data));
  }

  return '';
}

function parseEmailAddress(raw = '') {
  const value = String(raw || '').trim();
  if (!value) return { email: null, name: null };

  const match = value.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return {
      name: String(match[1] || '').trim().replace(/^"|"$/g, '') || null,
      email: String(match[2] || '').trim().toLowerCase() || null,
    };
  }

  if (value.includes('@')) {
    return { email: value.toLowerCase(), name: null };
  }

  return { email: null, name: value };
}

function normalizeMessageDate(raw = '', fallbackMs = Date.now()) {
  const parsed = Date.parse(String(raw || '').trim());
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return new Date(fallbackMs).toISOString();
}

function sanitizeSubject(subject = '') {
  const value = String(subject || '').trim();
  return value || 'No subject';
}

function normalizeTextBody(text = '') {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildQuery({ query = '', includeUnreadOnly = true } = {}) {
  const parts = [];
  if (includeUnreadOnly) parts.push('is:unread');
  parts.push('-category:promotions', '-category:social');
  if (query && String(query).trim()) {
    parts.push(String(query).trim());
  } else {
    parts.push('newer_than:14d');
  }
  return parts.join(' ');
}

export function getGmailConnectorConfig() {
  const clientId = String(process.env.GMAIL_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const refreshToken = String(process.env.GMAIL_REFRESH_TOKEN || '').trim();
  const redirectUri = String(
    process.env.GMAIL_REDIRECT_URI
      || process.env.GOOGLE_REDIRECT_URI
      || process.env.VITE_APP_URL
      || 'https://app.hellochippy.com/integrations'
  ).trim();
  const userId = String(process.env.GMAIL_USER_ID || 'me').trim() || 'me';
  const replyFrom = String(process.env.GMAIL_REPLY_FROM || '').trim() || null;

  return {
    clientId,
    clientSecret,
    refreshToken,
    redirectUri,
    userId,
    replyFrom,
    scopes: GMAIL_SCOPES,
  };
}

export function isGmailConnectorConfigured() {
  const config = getGmailConnectorConfig();
  return Boolean(config.clientId && config.clientSecret && config.refreshToken);
}

function createGmailAuthClient(config = getGmailConnectorConfig()) {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error('Gmail connector missing required credentials (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN).');
  }
  const auth = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri,
  );
  auth.setCredentials({ refresh_token: config.refreshToken });
  return auth;
}

function formatGmailMessage(message = {}, fallbackToEmail = null) {
  const payload = message.payload || {};
  const headers = parseHeaders(payload.headers || []);
  const from = parseEmailAddress(headers.from || '');
  const to = parseEmailAddress(headers.to || '');
  const messageIdHeader = String(headers['message-id'] || '').trim() || null;
  const references = String(headers.references || '').trim() || null;
  const fallbackDate = Number(message.internalDate);
  const dateIso = normalizeMessageDate(headers.date, Number.isFinite(fallbackDate) ? fallbackDate : Date.now());

  return {
    id: String(message.id || ''),
    threadId: String(message.threadId || ''),
    fromEmail: from.email,
    fromName: from.name,
    toEmail: to.email || fallbackToEmail || null,
    subject: sanitizeSubject(headers.subject),
    body: normalizeTextBody(extractPayloadText(payload)),
    status: 'open',
    source: 'gmail',
    inReplyToId: messageIdHeader,
    messageIdHeader,
    references,
    receivedAt: dateIso,
    raw: {
      labelIds: Array.isArray(message.labelIds) ? message.labelIds : [],
      snippet: String(message.snippet || ''),
      historyId: message.historyId || null,
      sizeEstimate: message.sizeEstimate || null,
    },
  };
}

export async function listUnreadGmailMessages({ maxResults = 10, query = '', includeUnreadOnly = true } = {}) {
  const config = getGmailConnectorConfig();
  const auth = createGmailAuthClient(config);
  const gmail = google.gmail({ version: 'v1', auth });
  const userId = config.userId || 'me';
  const limit = Math.max(1, Math.min(Number(maxResults) || 10, 50));

  const listResponse = await gmail.users.messages.list({
    userId,
    q: buildQuery({ query, includeUnreadOnly }),
    maxResults: limit,
  });

  const ids = Array.isArray(listResponse?.data?.messages) ? listResponse.data.messages : [];
  if (ids.length === 0) return [];

  const messages = [];
  for (const row of ids.slice(0, limit)) {
    const id = String(row?.id || '').trim();
    if (!id) continue;
    const detail = await gmail.users.messages.get({
      userId,
      id,
      format: 'full',
    });
    const formatted = formatGmailMessage(detail?.data || {}, config.replyFrom || null);
    if (!formatted.id) continue;
    messages.push(formatted);
  }

  return messages;
}

function ensureWrappedMessageId(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('<') && raw.endsWith('>')) return raw;
  if (raw.includes('@')) return `<${raw.replace(/^<|>$/g, '')}>`;
  return '';
}

function buildReplyRaw({
  toEmail,
  subject,
  body,
  inReplyTo = '',
  references = '',
  replyFrom = null,
}) {
  const normalizedInReplyTo = ensureWrappedMessageId(inReplyTo);
  const referenceValue = String(references || '').trim();
  const normalizedReferences = [
    ...referenceValue.split(/\s+/).map((item) => ensureWrappedMessageId(item)).filter(Boolean),
    normalizedInReplyTo,
  ];

  const uniqueReferences = Array.from(new Set(normalizedReferences));
  const lines = [];
  if (replyFrom) lines.push(`From: ${replyFrom}`);
  lines.push(`To: ${String(toEmail || '').trim()}`);
  lines.push(`Subject: ${String(subject || '').trim()}`);
  if (normalizedInReplyTo) lines.push(`In-Reply-To: ${normalizedInReplyTo}`);
  if (uniqueReferences.length > 0) lines.push(`References: ${uniqueReferences.join(' ')}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('MIME-Version: 1.0');
  lines.push('');
  lines.push(normalizeTextBody(body || ''));

  const raw = lines.join('\r\n');
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export async function sendGmailReply({
  toEmail,
  subject,
  body,
  threadId = '',
  inReplyTo = '',
  references = '',
  inboundMessageId = '',
}) {
  const config = getGmailConnectorConfig();
  const auth = createGmailAuthClient(config);
  const gmail = google.gmail({ version: 'v1', auth });
  const userId = config.userId || 'me';

  const raw = buildReplyRaw({
    toEmail,
    subject,
    body,
    inReplyTo,
    references,
    replyFrom: config.replyFrom,
  });

  const response = await gmail.users.messages.send({
    userId,
    requestBody: {
      raw,
      ...(threadId ? { threadId } : {}),
    },
  });

  let markedRead = null;
  const inboundId = String(inboundMessageId || '').trim();
  if (inboundId) {
    try {
      await gmail.users.messages.modify({
        userId,
        id: inboundId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
      markedRead = true;
    } catch {
      markedRead = false;
    }
  }

  return {
    ok: true,
    messageId: response?.data?.id || null,
    threadId: response?.data?.threadId || threadId || null,
    source: 'gmail',
    markedRead,
  };
}
