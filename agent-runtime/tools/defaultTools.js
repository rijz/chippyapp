import { emailService } from '../../emailService.js';
import { ToolRegistry } from './toolRegistry.js';
import { registerCapabilityTools } from './capabilityTools.js';
import { isGmailConnectorConfigured, listUnreadGmailMessages, sendGmailReply } from '../integrations/gmailConnector.js';

function defaultFixtureContext(context) {
  return context?.fixture || {
    tenantId: 'tenant-demo-001',
    companyName: 'Chippy Team',
    leads: [
      {
        id: 'lead-001',
        name: 'Alex Morgan',
        email: 'alex@example.com',
        serviceInterest: 'HVAC Tune-up',
      },
    ],
    slots: [
      { start: '2026-02-16T09:00:00-05:00', end: '2026-02-16T09:30:00-05:00' },
      { start: '2026-02-16T10:00:00-05:00', end: '2026-02-16T10:30:00-05:00' },
    ],
    emails: [
      {
        id: 'msg-001',
        threadId: 'thread-001',
        fromEmail: 'alex@example.com',
        fromName: 'Alex Morgan',
        subject: 'Need to reschedule appointment',
        body: 'Hi team, can I move my appointment to tomorrow afternoon?',
        status: 'open',
        source: 'fixture',
        receivedAt: '2026-02-14T09:30:00-05:00',
      },
    ],
  };
}

function resolveTenantId(context = {}) {
  return context.userId || context.tenantId || context?.fixture?.tenantId || null;
}

function fixedIdempotency(name, input) {
  const raw = JSON.stringify(input || {});
  return `${name}:${raw}`;
}

function resolveEmailSource(context = {}) {
  const value = String(context?.emailSource || process.env.CHIPPY_EMAIL_SOURCE || '').trim().toLowerCase();
  if (value === 'gmail' || value === 'fixture' || value === 'storage') {
    return value;
  }
  return 'storage';
}

function shouldUseGmailInbox(context = {}) {
  return resolveEmailSource(context) === 'gmail';
}

function shouldUseGmailTransport(input = {}, context = {}) {
  const providerValue = String(input?.mailProvider || '').trim().toLowerCase();
  if (providerValue === 'gmail') return true;
  const transportValue = String(
    context?.emailTransport
    || process.env.CHIPPY_EMAIL_REPLY_TRANSPORT
    || ''
  ).trim().toLowerCase();
  if (transportValue === 'gmail') return true;
  return shouldUseGmailInbox(context);
}

function normalizeFixtureLead(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id || null,
    name: row.name || null,
    email: row.email || null,
    phone: row.phone || null,
    status: row.status || null,
    source: row.source || null,
    serviceInterest: row.service || row.serviceInterest || null,
    locationId: row.location_id || null,
    locationName: row.location_name || null,
    notes: row.notes || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function findLeadFromFixture(input, context) {
  const fixture = defaultFixtureContext(context);
  const leads = Array.isArray(fixture.leads) ? fixture.leads : [];

  const lead = leads.find((item) => {
    if (input.leadId && item.id === input.leadId) return true;
    if (input.email && String(item.email || '').toLowerCase() === String(input.email).toLowerCase()) return true;
    return false;
  }) || null;

  return normalizeFixtureLead(lead);
}

function getDateWindowForSlots(input = {}, context = {}) {
  const baseDate = input.date || context.requestedDate;
  const start = baseDate ? new Date(`${baseDate}T00:00:00`) : new Date();
  if (Number.isNaN(start.getTime())) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return { startDate: now, endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
  }

  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startDate: start, endDate: end };
}

async function fetchSlotsFromApi(input = {}, context = {}) {
  const apiBaseUrl = context.apiBaseUrl || process.env.CHIPPY_API_URL || process.env.APP_API_URL || '';
  const tenantId = resolveTenantId(context);
  if (!apiBaseUrl || !tenantId) {
    return { ok: false, reason: 'missing_api_base_url_or_tenant_id', slots: [] };
  }

  const { startDate, endDate } = getDateWindowForSlots(input, context);
  const endpoint = `${String(apiBaseUrl).replace(/\/$/, '')}/api/calendar/slots`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: tenantId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        slotDuration: Number(context.slotDuration || 60),
        businessHours: context.businessHours || { start: 9, end: 17 },
        provider: 'google',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, reason: `api_error_${response.status}`, details: text, slots: [] };
    }

    const data = await response.json();
    return { ok: true, slots: Array.isArray(data?.slots) ? data.slots : [] };
  } catch (error) {
    return { ok: false, reason: 'api_request_failed', details: error.message, slots: [] };
  }
}

function listInboxFromFixture(context = {}, limit = 5) {
  const fixture = defaultFixtureContext(context);
  const emails = Array.isArray(fixture.emails) ? fixture.emails : [];
  return emails.slice(0, Math.max(1, Number(limit) || 5)).map((item, index) => ({
    id: item.id || `fixture-msg-${index + 1}`,
    threadId: item.threadId || `fixture-thread-${index + 1}`,
    fromEmail: item.fromEmail || item.customerEmail || item.email || null,
    fromName: item.fromName || item.customerName || null,
    toEmail: item.toEmail || null,
    subject: item.subject || 'Customer inquiry',
    body: item.body || '',
    status: item.status || 'open',
    source: item.source || 'fixture',
    inReplyToId: item.inReplyToId || null,
    receivedAt: item.receivedAt || item.createdAt || null,
  }));
}

function classifyEmail({ subject = '', body = '' } = {}) {
  const text = `${subject}\n${body}`.toLowerCase();
  const isComplaint = /(angry|upset|refund|cancel|terrible|bad experience|complaint)/.test(text);
  const isBooking = /(book|appointment|schedule|availability|slot|reschedule)/.test(text);
  const isPricing = /(price|pricing|cost|quote|estimate)/.test(text);
  const isSupport = /(help|issue|problem|error|not working|support)/.test(text);

  let category = 'general';
  if (isComplaint) category = 'complaint';
  else if (isBooking) category = 'booking';
  else if (isPricing) category = 'pricing';
  else if (isSupport) category = 'support';

  const priority = isComplaint ? 'high' : (isBooking || isSupport ? 'medium' : 'low');
  const needsHuman = isComplaint || /legal|lawsuit|chargeback/.test(text);
  const sentiment = isComplaint ? 'negative' : 'neutral';
  const summary = body ? String(body).trim().slice(0, 180) : String(subject).trim().slice(0, 180);

  return { category, priority, needsHuman, sentiment, summary };
}

function composeEmailReply({
  fromName = 'there',
  companyName = 'Chippy Team',
  category = 'general',
  needsHuman = false,
  summary = '',
} = {}) {
  const subject = `${companyName}: Re: your message`;
  if (needsHuman) {
    return {
      subject,
      body: [
        `Hi ${fromName},`,
        '',
        'Thanks for reaching out. I have escalated this to a team member who will follow up shortly.',
        summary ? `Context captured: ${summary}` : '',
        '',
        `Best,`,
        companyName,
      ].filter(Boolean).join('\n'),
      tone: 'empathetic',
    };
  }

  const categoryLine = {
    booking: 'We can help you with scheduling and next available times.',
    pricing: 'We can share pricing options and a quick estimate.',
    support: 'We can help troubleshoot this and get you unstuck.',
    complaint: 'We take this seriously and will resolve it quickly.',
    general: 'Thanks for your message. We are happy to help.',
  }[category] || 'Thanks for your message. We are happy to help.';

  return {
    subject,
    body: [
      `Hi ${fromName},`,
      '',
      categoryLine,
      'Please reply with any additional details and preferred timing, and we will take it from here.',
      '',
      `Best,`,
      companyName,
    ].join('\n'),
    tone: category === 'complaint' ? 'empathetic' : 'professional',
  };
}

export function createDefaultToolRegistry(options = {}) {
  const storage = options.storage || null;
  const registry = new ToolRegistry();

  registry.register({
    name: 'lead.lookup',
    description: 'Lookup a lead record by id or email.',
    inputSchema: {
      type: 'object',
      required: [],
      properties: {
        leadId: { type: 'string' },
        email: { type: 'string' },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['lead', 'source'],
      properties: {
        lead: { type: ['object', 'null'] },
        source: { type: 'string' },
        warning: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'read',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/storage/storageRouter.js',
    idempotencyKey: ({ input }) => fixedIdempotency('lead.lookup', input),
    handler: async ({ input, context }) => {
      const tenantId = resolveTenantId(context) || undefined;
      if (storage && typeof storage.lookupLead === 'function') {
        const result = await storage.lookupLead({
          leadId: input.leadId,
          email: input.email,
          context: {
            ...context,
            tenantId,
          },
        });

        if (result?.lead) {
          return {
            lead: result.lead,
            source: result.source || 'storage',
            ...(result.warning ? { warning: result.warning } : {}),
          };
        }

        const fallbackLead = findLeadFromFixture(input, context);
        return {
          lead: fallbackLead,
          source: fallbackLead ? 'fixture' : (result?.source || 'storage'),
          ...(result?.warning ? { warning: result.warning } : {}),
        };
      }

      return {
        lead: findLeadFromFixture(input, context),
        source: 'fixture',
      };
    },
  });

  registry.register({
    name: 'followup.compose',
    description: 'Create follow-up subject/body for a lead.',
    inputSchema: {
      type: 'object',
      required: ['leadName', 'serviceInterest'],
      properties: {
        leadName: { type: 'string' },
        serviceInterest: { type: 'string' },
        companyName: { type: 'string' },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['subject', 'body', 'source'],
      properties: {
        subject: { type: 'string' },
        body: { type: 'string' },
        source: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'none',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/emailService.js',
    idempotencyKey: ({ input }) => fixedIdempotency('followup.compose', input),
    handler: async ({ input }) => {
      const companyName = input.companyName || 'Chippy Team';
      const subject = `${companyName}: Quick follow-up on ${input.serviceInterest}`;
      const body = [
        `Hi ${input.leadName},`,
        '',
        `Following up on your ${input.serviceInterest} request.`,
        'Reply with your preferred time window and we will confirm availability.',
      ].join('\n');

      return { subject, body, source: 'template' };
    },
  });

  registry.register({
    name: 'followup.send_preview',
    description: 'Preview follow-up send operation in dry-run mode, or send for real when approved.',
    inputSchema: {
      type: 'object',
      required: ['toEmail', 'subject', 'body'],
      properties: {
        toEmail: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
        leadName: { type: 'string' },
        companyName: { type: 'string' },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['ok', 'mode'],
      properties: {
        ok: { type: 'boolean' },
        mode: { type: 'string' },
        preview: { type: 'object' },
        reason: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'write',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/emailService.js',
    idempotencyKey: ({ input }) => fixedIdempotency('followup.send_preview', input),
    handler: async ({ input, context, dryRun }) => {
      const preview = {
        toEmail: input.toEmail,
        subject: input.subject,
        body: input.body,
      };

      if (dryRun) {
        return {
          ok: true,
          mode: 'dry-run',
          preview,
        };
      }

      if (!process.env.RESEND_API_KEY) {
        return {
          ok: false,
          mode: 'live-skipped',
          reason: 'RESEND_API_KEY is missing',
          preview,
        };
      }

      const companyName = input.companyName || context.companyName || context?.fixture?.companyName || 'Chippy Team';
      const leadName = input.leadName || 'Customer';

      await emailService.sendFollowUpToCustomer(input.toEmail, leadName, {
        subject: input.subject,
        bodyText: input.body,
        companyName,
      });

      return {
        ok: true,
        mode: 'live-send-requested',
        preview,
      };
    },
  });

  registry.register({
    name: 'booking.check_slots',
    description: 'Retrieve available booking slots from backend API or fixture context.',
    inputSchema: {
      type: 'object',
      required: [],
      properties: {
        date: { type: 'string' },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['slots', 'source'],
      properties: {
        slots: { type: 'array' },
        source: { type: 'string' },
        warning: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'read',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/src/services/calendarTools.ts',
    idempotencyKey: ({ input }) => fixedIdempotency('booking.check_slots', input),
    handler: async ({ input, context }) => {
      const apiResult = await fetchSlotsFromApi(input, context);
      if (apiResult.ok) {
        return {
          slots: apiResult.slots,
          source: 'api',
        };
      }

      const fixture = defaultFixtureContext(context);
      const slots = Array.isArray(fixture.slots) ? fixture.slots : [];
      return {
        slots,
        source: 'fixture',
        warning: apiResult.reason || 'api_not_available',
      };
    },
  });

  registry.register({
    name: 'email.inbox_list',
    description: 'List inbound customer emails that are open for response.',
    inputSchema: {
      type: 'object',
      required: [],
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        status: { type: 'string' },
        query: { type: 'string' },
        unreadOnly: { type: 'boolean' },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['messages', 'source'],
      properties: {
        messages: { type: 'array' },
        source: { type: 'string' },
        warning: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'read',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/storage/sqliteStorageAdapter.js',
    idempotencyKey: ({ input }) => fixedIdempotency('email.inbox_list', input),
    handler: async ({ input, context }) => {
      const limit = Number(input.limit || context.emailLimit || 5);
      const status = input.status || 'open';
      const tenantId = resolveTenantId(context) || undefined;
      const query = String(input.query || context.emailQuery || '').trim();
      const unreadOnly = input.unreadOnly !== undefined ? input.unreadOnly !== false : true;
      const inboxSource = resolveEmailSource(context);

      if (inboxSource === 'gmail') {
        if (!isGmailConnectorConfigured()) {
          return {
            messages: [],
            source: 'gmail',
            warning: 'gmail_connector_not_configured',
          };
        }

        const gmailMessages = await listUnreadGmailMessages({
          maxResults: limit,
          query,
          includeUnreadOnly: unreadOnly,
        });

        if (storage && typeof storage.upsertInboundEmail === 'function') {
          const persisted = [];
          for (const message of gmailMessages) {
            const row = await storage.upsertInboundEmail({
              tenantId,
              message,
              context,
            });
            persisted.push({
              ...row,
              messageIdHeader: message.messageIdHeader || null,
              references: message.references || null,
              raw: message.raw || {},
            });
          }
          return {
            messages: persisted,
            source: 'gmail',
          };
        }

        return {
          messages: gmailMessages,
          source: 'gmail',
        };
      }

      if (inboxSource === 'fixture') {
        return {
          messages: listInboxFromFixture(context, limit),
          source: 'fixture',
        };
      }

      if (storage && typeof storage.listInboxMessages === 'function') {
        const messages = await storage.listInboxMessages({
          tenantId,
          limit,
          status,
          context,
        });
        return {
          messages,
          source: 'storage',
        };
      }

      return {
        messages: listInboxFromFixture(context, limit),
        source: 'fixture',
      };
    },
  });

  registry.register({
    name: 'email.thread_classify',
    description: 'Classify a customer email by intent, priority, and escalation need.',
    inputSchema: {
      type: 'object',
      required: ['subject', 'body'],
      properties: {
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['category', 'priority', 'needsHuman', 'sentiment', 'summary'],
      properties: {
        category: { type: 'string' },
        priority: { type: 'string' },
        needsHuman: { type: 'boolean' },
        sentiment: { type: 'string' },
        summary: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'none',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/tools/defaultTools.js',
    idempotencyKey: ({ input }) => fixedIdempotency('email.thread_classify', input),
    handler: async ({ input }) => classifyEmail(input),
  });

  registry.register({
    name: 'email.reply_compose',
    description: 'Compose a context-aware customer email reply draft.',
    inputSchema: {
      type: 'object',
      required: ['fromName', 'category'],
      properties: {
        fromName: { type: 'string' },
        companyName: { type: 'string' },
        category: { type: 'string' },
        needsHuman: { type: 'boolean' },
        summary: { type: 'string' },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['subject', 'body', 'tone'],
      properties: {
        subject: { type: 'string' },
        body: { type: 'string' },
        tone: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'none',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/tools/defaultTools.js',
    idempotencyKey: ({ input }) => fixedIdempotency('email.reply_compose', input),
    handler: async ({ input }) => composeEmailReply(input),
  });

  registry.register({
    name: 'email.reply_send',
    description: 'Send or preview a customer email reply.',
    inputSchema: {
      type: 'object',
      required: ['toEmail', 'subject', 'body'],
      properties: {
        toEmail: { type: 'string' },
        toName: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
        threadId: { type: 'string' },
        inReplyToId: { type: 'string' },
        references: { type: 'string' },
        mailProvider: { type: 'string' },
        inboundMessageId: { type: 'string' },
        companyName: { type: 'string' },
      },
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      required: ['ok', 'mode', 'preview'],
      properties: {
        ok: { type: 'boolean' },
        mode: { type: 'string' },
        preview: { type: 'object' },
        reason: { type: 'string' },
        outboundMessageId: { type: 'string' },
      },
      additionalProperties: true,
    },
    sideEffect: 'write',
    supportsDryRun: true,
    sourceModule: '/Users/rijesh/Documents/GitHub/chippyapp/emailService.js',
    idempotencyKey: ({ input }) => fixedIdempotency('email.reply_send', input),
    handler: async ({ input, context, dryRun }) => {
      const preview = {
        toEmail: input.toEmail,
        subject: input.subject,
        body: input.body,
      };
      const tenantId = resolveTenantId(context) || undefined;

      if (dryRun) {
        return {
          ok: true,
          mode: 'dry-run',
          preview,
        };
      }

      const companyName = input.companyName || context.companyName || context?.fixture?.companyName || 'Chippy Team';
      const toName = input.toName || 'Customer';
      let mode = 'live-send-requested';
      let ok = true;
      let reason = undefined;

      if (shouldUseGmailTransport(input, context)) {
        if (!isGmailConnectorConfigured()) {
          ok = false;
          mode = 'live-skipped';
          reason = 'Gmail connector is not configured';
        } else {
          await sendGmailReply({
            toEmail: input.toEmail,
            subject: input.subject,
            body: input.body,
            threadId: input.threadId || '',
            inReplyTo: input.inReplyToId || '',
            references: input.references || '',
            inboundMessageId: input.inboundMessageId || '',
          });
          mode = 'live-send-gmail';
        }
      } else if (!process.env.RESEND_API_KEY) {
        ok = false;
        mode = 'live-skipped';
        reason = 'RESEND_API_KEY is missing';
      } else {
        await emailService.sendFollowUpToCustomer(input.toEmail, toName, {
          subject: input.subject,
          bodyText: input.body,
          companyName,
        });
      }

      let outboundMessageId = null;
      if (storage && typeof storage.recordOutboundEmail === 'function') {
        const outbound = await storage.recordOutboundEmail({
          tenantId,
          threadId: input.threadId,
          toEmail: input.toEmail,
          toName,
          subject: input.subject,
          body: input.body,
          source: 'agent-runtime',
          inReplyToId: input.inReplyToId || null,
          status: ok ? 'sent' : 'pending_manual',
          context,
        });
        outboundMessageId = outbound?.id || null;
      }

      if (input.inboundMessageId && storage && typeof storage.updateEmailMessageStatus === 'function') {
        const normalizedReason = ok
          ? 'reply_sent'
          : `reply_skipped_${String(reason || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        await storage.updateEmailMessageStatus({
          messageId: input.inboundMessageId,
          status: ok ? 'replied' : 'pending_manual',
          note: normalizedReason,
        });
      }

      return {
        ok,
        mode,
        preview,
        ...(reason ? { reason } : {}),
        ...(outboundMessageId ? { outboundMessageId } : {}),
      };
    },
  });

  registerCapabilityTools(registry, options);

  return registry;
}
