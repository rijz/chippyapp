import 'dotenv/config';
import { emailService } from './emailService.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0, // Capture 100% of the transactions
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});

import Stripe from 'stripe';
import {
  checkGoogleAvailability,
  createGoogleEvent,
  refreshGoogleToken,
  getGoogleAvailableSlots
} from './src/services/googleCalendarProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================
// DDoS & Security Protection
// =====================
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';

const app = express();

// Sentry Request Handler removed (handled by instrumentation in v8+)


const PORT = process.env.PORT || 8080;

// Trust proxy for Cloud Run / load balancers
app.set('trust proxy', 1);

// Security headers (XSS, clickjacking, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // Disable for SPA compatibility
  crossOriginEmbedderPolicy: false, // Allow widget embedding
  frameguard: false, // Allow embedding in iframes on other domains (for chat widget)
}));

// CORS - Allow your domains + localhost
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:8080',
  'https://chippyai.com',
  'https://www.chippyai.com',
  process.env.VITE_APP_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like server-side or Postman)
    // But in production, you may want to restrict this
    if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from: ${origin}`);
      callback(null, true); // Allow but log - change to callback(new Error('Not allowed by CORS')) to block
    }
  },
  credentials: true,
}));

// Global rate limiter - prevents basic DDoS
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 100 : 500, // Higher limit for dev
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
});
app.use(globalLimiter);

// Strict rate limiter for expensive API endpoints (Gemini, scraping)
const expensiveApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Only 20 requests per minute for expensive APIs
  message: { error: 'AI request limit reached. Please wait before sending more messages.' },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
});

// Very strict limiter for the Gemini proxy (costs money per request!)
const geminiProxyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 30 : 100, // Higher limit for dev
  message: { error: 'Chat limit reached. Please wait a moment.' },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
});

// Calendar endpoint limiter
const calendarLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 30 : 200, // Higher limit for dev
  message: { error: 'Too many calendar requests. Please wait.' },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
});

// Widget config limiter (semi-public endpoint)
const widgetConfigLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 60 : 200, // Higher limit for dev
  message: { error: 'Widget rate limit exceeded.' },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
});

// Request size limit - prevent large payload attacks
app.use(express.json({ limit: '100kb' })); // Limit JSON body to 100KB
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

// Initialize Supabase Admin (Service Role)
import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Initialize Google OAuth2 Client (for Calendar connection)
import { google } from 'googleapis';
const oauth2Client = new google.auth.OAuth2(
  process.env.VITE_GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage'
);

// Webhook needs raw body
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const amount = session.amount_total; // e.g. 4900 for $49.00

      if (userId) {
        console.log(`Processing subscription for User ${userId}, Amount: ${amount}`);

        // Determine Plan
        let newPlan = 'Starter';
        let limits = { conversations: 100, locations: 1, admins: 1, calendars: 1 };

        if (amount === 9900) {
          newPlan = 'Growth';
          limits = { conversations: 500, locations: 3, admins: 3, calendars: 3 };
        } else if (amount === 24900) {
          newPlan = 'Advanced';
          limits = { conversations: 1500, locations: 5, admins: 5, calendars: 5 };
        }

        try {
          // 1. Fetch current settings to preserve other data
          const { data: currentData, error: fetchError } = await supabaseAdmin
            .from('settings')
            .select('subscription')
            .eq('user_id', userId)
            .single();

          if (fetchError && fetchError.code !== 'PGRST116') { // Ignore not found, we'll create
            console.error('Error fetching settings:', fetchError);
          }

          const currentUsage = currentData?.subscription?.usage || {
            conversations: 0, locations: 1, admins: 1, calendars: 0
          };

          // 2. Upsert new subscription state
          const { error: updateError } = await supabaseAdmin
            .from('settings')
            .upsert({
              user_id: userId,
              subscription: {
                plan: newPlan,
                status: 'active',
                nextBillingDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toLocaleDateString(),
                usage: {
                  ...currentUsage,
                  // We don't reset usage here, just plan type. 
                  // In a real app, you might reset monthly counters on 'invoice.payment_succeeded'
                }
              },
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

          if (updateError) throw updateError;
          console.log(`Successfully upgraded User ${userId} to ${newPlan}`);

        } catch (dbError) {
          console.error('Supabase Update Error:', dbError);
        }
      }
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Note: JSON body parsing is handled above with size limits (100kb)

// Serve static files from 'dist' if it exists (standard build)
// Then 'public' for embed widget.js
// Fallback to serving the root directory (for runtime-transpilation environments)
const distPath = path.join(__dirname, 'dist');
const publicPath = path.join(__dirname, 'public');
const servePath = path.join(__dirname);

// =====================
// Widget.js - Special CORS handling for cross-origin embedding
// =====================
app.get('/widget.js', (req, res) => {
  // Set CORS headers to allow any origin to load this script
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', 'application/javascript');

  // Serve the widget.js file - try public first, then dist
  const publicWidget = path.join(publicPath, 'widget.js');
  res.sendFile(publicWidget, (err) => {
    if (err) {
      // If not in public, try dist (Vite build output acts as fallback)
      const distWidget = path.join(distPath, 'widget.js');
      res.sendFile(distWidget, (err2) => {
        if (err2) {
          console.error('[Serve] widget.js not found in public or dist');
          // Return a safe script that logs error to browser console instead of 404 HTML
          res.status(404).send('console.error("Chippy Widget: File not found");');
        }
      });
    }
  });
});

app.use(express.static(distPath));
app.use(express.static(publicPath));
app.use(express.static(servePath));

// =====================
// Embed Security - Dynamic frame-ancestors CSP
// =====================
// Middleware to set CSP header for embed pages based on user's allowed domains
app.get('/embed', async (req, res, next) => {
  try {
    const userId = req.query.u;
    const referer = req.headers.referer || req.headers.origin || '';

    if (userId) {
      // Fetch user's allowed embed domains from settings
      const { data: settings } = await supabaseAdmin
        .from('settings')
        .select('allowed_embed_domains, tenant_config')
        .eq('user_id', userId)
        .maybeSingle();

      // Get allowed domains - start with explicitly configured domains
      let allowedDomains = settings?.allowed_embed_domains || [];
      let defaultDomain = null;

      // If no explicit domains, use the tenant's website URL as the default
      if (allowedDomains.length === 0 && settings?.tenant_config?.companyUrl) {
        try {
          const url = new URL(settings.tenant_config.companyUrl);
          defaultDomain = url.origin;
          allowedDomains = [defaultDomain];
        } catch (e) {
          // Invalid URL, skip
        }
      }

      // Also check knowledge base for website if still empty
      if (allowedDomains.length === 0) {
        const { data: knowledge } = await supabaseAdmin
          .from('knowledge_bases')
          .select('content')
          .eq('user_id', userId)
          .maybeSingle();

        if (knowledge?.content?.website) {
          try {
            const url = new URL(knowledge.content.website);
            defaultDomain = url.origin;
            allowedDomains = [defaultDomain];
          } catch (e) {
            // Invalid URL, skip
          }
        }
      }

      // Log access attempt for security monitoring
      if (referer) {
        try {
          const refererOrigin = new URL(referer).origin;
          const isAuthorized = allowedDomains.some(domain =>
            refererOrigin === domain || refererOrigin === 'null' // 'null' is for local file:// access
          ) || refererOrigin.includes('hellochippy.com') || refererOrigin.includes('localhost');

          if (!isAuthorized && allowedDomains.length > 0) {
            console.warn(`[Embed Security] Unauthorized access attempt for user ${userId} from ${refererOrigin}. Allowed: ${allowedDomains.join(', ')}`);
          }
        } catch (e) {
          // Invalid referer URL
        }
      }

      // Always set CSP header for security
      // Include 'self' for dashboard preview and all allowed domains
      const frameAncestors = [
        "'self'",
        "https://app.hellochippy.com",
        "https://hellochippy.com",
        "http://localhost:5173",
        "http://localhost:8080",
        ...allowedDomains
      ].join(' ');

      res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors}`);

      // Add X-Frame-Options as fallback for older browsers
      // Using ALLOW-FROM is deprecated, but CSP handles modern browsers
    }

    next();
  } catch (error) {
    console.error('[Embed CSP] Error:', error);
    next(); // Continue without CSP on error
  }
});

// =====================
// Public Widget Config API (for embeds - bypasses RLS)
// =====================
app.get('/api/widget-config/:userId', widgetConfigLimiter, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Fetch settings using admin client (bypasses RLS)
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('settings')
      .select('tenant_config, widget_config')
      .eq('user_id', userId)
      .maybeSingle();

    if (settingsError) {
      console.error('[API] Settings fetch error:', settingsError);
    }

    // Fetch knowledge base using admin client
    const { data: knowledge, error: knowledgeError } = await supabaseAdmin
      .from('knowledge_bases')
      .select('content')
      .eq('user_id', userId)
      .maybeSingle();

    if (knowledgeError) {
      console.error('[API] Knowledge fetch error:', knowledgeError);
    }

    // Fetch calendar connections (for booking availability)
    const { data: calendarConnections, error: calendarError } = await supabaseAdmin
      .from('calendar_connections')
      .select('id, provider, location_id, location_name, calendar_name, is_active')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (calendarError) {
      console.error('[API] Calendar connections fetch error:', calendarError);
    }

    if (!settings && !knowledge) {
      return res.status(404).json({ error: 'Widget not found' });
    }

    // Map calendar connections to frontend format (excluding sensitive tokens)
    const safeCalendarConnections = (calendarConnections || []).map(c => ({
      id: c.id,
      provider: c.provider,
      locationId: c.location_id,
      locationName: c.location_name,
      calendarName: c.calendar_name,
      isActive: c.is_active
    }));

    res.json({
      tenantConfig: settings?.tenant_config || null,
      widgetConfig: settings?.widget_config || null,
      knowledgeData: knowledge?.content || null,
      calendarConnections: safeCalendarConnections
    });

  } catch (error) {
    console.error('[API] Widget config error:', error);
    res.status(500).json({ error: 'Failed to load widget configuration' });
  }
});

// Serve runtime environment configuration
app.get('/env-config.js', (req, res) => {
  const env = {
    VITE_GOOGLE_API_KEY: process.env.VITE_GOOGLE_API_KEY || '',
    VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID || '',
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
    VITE_STRIPE_PUBLIC_KEY: process.env.VITE_STRIPE_PUBLIC_KEY || ''
  };
  res.type('application/javascript');
  res.send(`window.__ENV__ = ${JSON.stringify(env)};`);
});

// =====================
// Super Admin APIs (bypass RLS with service role)
// =====================

// Super admin email whitelist
const SUPER_ADMIN_EMAILS = [
  'p.rijesh1@gmail.com',
  // Add more super admin emails here
];

// Middleware to verify super admin access
const verifySuperAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!SUPER_ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
      return res.status(403).json({ error: 'Not authorized as super admin' });
    }

    req.superAdminUser = user;
    next();
  } catch (error) {
    console.error('[SuperAdmin] Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// GET /api/superadmin/stats - Dashboard stats
app.get('/api/superadmin/stats', verifySuperAdmin, async (req, res) => {
  try {
    // Get total users
    const { count: totalUsers } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // Get recent signups (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: recentSignups } = await supabaseAdmin
      .from('profiles')
      .select('id, email, created_at, full_name, business_name')
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    // Get total leads
    const { count: totalLeads } = await supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact', head: true });

    // Get total chat sessions
    const { count: totalConversations } = await supabaseAdmin
      .from('chat_sessions')
      .select('*', { count: 'exact', head: true });

    // Get bookings count
    const { count: totalBookings } = await supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Booked');

    res.json({
      totalUsers: totalUsers || 0,
      activeUsers: recentSignups?.length || 0,
      totalConversations: totalConversations || 0,
      totalBookings: totalBookings || 0,
      totalLeads: totalLeads || 0,
      recentSignups: recentSignups || []
    });
  } catch (error) {
    console.error('[SuperAdmin] Stats error:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /api/superadmin/users - List all users
app.get('/api/superadmin/users', verifySuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, business_name, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ users: data || [] });
  } catch (error) {
    console.error('[SuperAdmin] Users error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// GET /api/superadmin/users/:userId - Get single user details
app.get('/api/superadmin/users/:userId', verifySuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) throw profileError;

    // Get user's leads count
    const { count: leadsCount } = await supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Get user's chat sessions count
    const { count: sessionsCount } = await supabaseAdmin
      .from('chat_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    res.json({
      ...profile,
      leadsCount: leadsCount || 0,
      sessionsCount: sessionsCount || 0
    });
  } catch (error) {
    console.error('[SuperAdmin] User detail error:', error);
    res.status(500).json({ error: 'Failed to load user details' });
  }
});


// =====================
// Widget Data APIs (for embed widget - bypasses RLS)
// =====================

// Rate limiter for widget data APIs (be careful - these can be called frequently)
const widgetDataLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: { error: 'Too many requests' }
});

// =====================
// SECURITY: Input sanitization for widget APIs
// =====================
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .replace(/data:/gi, '') // Remove data: protocol
    .trim()
    .slice(0, 1000); // Limit length
};

const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * POST /api/widget/lead
 * Creates or updates a lead from the embed widget
 */
app.post('/api/widget/lead', widgetDataLimiter, async (req, res) => {
  try {
    // Sanitize all input to prevent XSS
    const userId = sanitizeInput(req.body.userId);
    const lead = sanitizeObject(req.body.lead);

    if (!userId || !lead) {
      return res.status(400).json({ error: 'Missing userId or lead data' });
    }

    // Check if lead exists by email (if email provided)
    let existingLead = null;
    if (lead.email) {
      const { data } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('user_id', userId)
        .eq('email', lead.email.toLowerCase())
        .maybeSingle();
      existingLead = data;
    }

    if (existingLead) {
      // Update existing lead
      const updateData = {
        updated_at: new Date().toISOString()
      };
      // Only update fields that are provided
      if (lead.name) updateData.name = lead.name;
      if (lead.phone !== undefined) updateData.phone = lead.phone || null;
      if (lead.status) updateData.status = lead.status;
      if (lead.notes) updateData.notes = lead.notes;
      if (lead.locationId) updateData.location_id = lead.locationId;
      if (lead.locationName) updateData.location_name = lead.locationName;
      if (lead.service) updateData.service = lead.service;

      const { error } = await supabaseAdmin
        .from('leads')
        .update(updateData)
        .eq('id', existingLead.id);

      if (error) throw error;
      res.json({ success: true, action: 'updated', id: existingLead.id });
    } else {
      // Create new lead
      const newId = `lead-${Date.now()}`;
      const { error } = await supabaseAdmin
        .from('leads')
        .insert({
          id: newId,
          user_id: userId,
          name: lead.name || 'Unknown',
          email: (lead.email || '').toLowerCase(),
          phone: lead.phone || null,
          status: lead.status || 'New',
          source: lead.source || 'AI Chat',
          notes: lead.notes || null,
          location_id: lead.locationId || null,
          location_name: lead.locationName || null,
          service: lead.service || null
        });

      if (error) throw error;
      res.json({ success: true, action: 'created', id: newId });
    }
  } catch (error) {
    console.error('[API] Widget lead error:', error);
    res.status(500).json({ error: 'Failed to save lead' });
  }
});

/**
 * POST /api/widget/session
 * Saves a chat session from the embed widget
 */
app.post('/api/widget/session', widgetDataLimiter, async (req, res) => {
  try {
    // Sanitize all input to prevent XSS
    const userId = sanitizeInput(req.body.userId);
    const session = sanitizeObject(req.body.session);

    if (!userId || !session) {
      return res.status(400).json({ error: 'Missing userId or session data' });
    }

    // Compute response time metrics from messages (if timestamps exist)
    const parseMessageTimestamp = (value) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      const ts = date.getTime();
      return Number.isFinite(ts) ? ts : null;
    };

    const computeResponseStats = (messages) => {
      if (!Array.isArray(messages) || messages.length === 0) {
        return { firstResponseMs: null, avgResponseMs: null };
      }

      const responseTimes = [];
      for (let i = 0; i < messages.length; i += 1) {
        const msg = messages[i];
        if (!msg || msg.role !== 'user') continue;
        const userTs = parseMessageTimestamp(msg.timestamp);
        if (!userTs) continue;

        for (let j = i + 1; j < messages.length; j += 1) {
          const next = messages[j];
          if (next && next.role === 'model') {
            const modelTs = parseMessageTimestamp(next.timestamp);
            if (modelTs) {
              responseTimes.push(Math.max(0, modelTs - userTs));
            }
            break;
          }
        }
      }

      if (responseTimes.length === 0) {
        return { firstResponseMs: null, avgResponseMs: null };
      }

      const total = responseTimes.reduce((sum, value) => sum + value, 0);
      return {
        firstResponseMs: responseTimes[0],
        avgResponseMs: Math.round(total / responseTimes.length)
      };
    };

    const responseStats = computeResponseStats(session.messages);

    // Upsert session to chat_sessions table
    const { error } = await supabaseAdmin
      .from('chat_sessions')
      .upsert({
        id: session.id,
        user_id: userId,
        customer_name: session.customerName || 'Visitor',
        customer_email: session.customerEmail ? String(session.customerEmail).toLowerCase() : null,
        customer_phone: session.customerPhone || null,
        messages: session.messages,
        summary: session.summary || `Chat with ${session.messages?.length || 0} messages`,
        type: session.type || 'General',
        sentiment: session.sentiment || 'neutral',
        status: session.status || 'Opened',
        created_at: session.timestamp || new Date().toISOString(),
        first_response_ms: responseStats.firstResponseMs,
        avg_response_ms: responseStats.avgResponseMs
      }, { onConflict: 'id' });

    if (error) throw error;
    res.json({ success: true });

    // Background triage + follow-up scheduling (non-blocking)
    setTimeout(async () => {
      try {
        const { data: sessionRow } = await supabaseAdmin
          .from('chat_sessions')
          .select('id, user_id, customer_name, customer_email, followup_status, triage')
          .eq('id', session.id)
          .maybeSingle();

        if (!sessionRow) return;

        let triage = sessionRow.triage;
        if (!triage && session.messages && session.messages.length >= 3) {
          const { data: settings } = await supabaseAdmin
            .from('settings')
            .select('tenant_config')
            .eq('user_id', userId)
            .maybeSingle();

          triage = await generateTriage({
            messages: session.messages,
            companyName: settings?.tenant_config?.companyName
          });

          if (triage) {
            await supabaseAdmin
              .from('chat_sessions')
              .update({ triage, triage_updated_at: new Date().toISOString() })
              .eq('id', session.id);

            // Mirror triage onto lead if we have an email
            const email = session.customerEmail ? String(session.customerEmail).toLowerCase() : null;
            if (email) {
              await supabaseAdmin
                .from('leads')
                .update({
                  intent: triage.intent || null,
                  priority: triage.priority || null,
                  next_action: triage.nextAction || null
                })
                .eq('user_id', userId)
                .eq('email', email);
            }
          }
        }

        await scheduleFollowUpIfNeeded({ userId, sessionRow, sessionPayload: session });
      } catch (e) {
        console.error('[API] Background triage/follow-up error:', e);
      }
    }, 0);
  } catch (error) {
    console.error('[API] Widget session error:', error);
    res.status(500).json({ error: 'Failed to save session' });
  }
});

/**
 * POST /api/widget/interaction
 * Saves interaction data for analytics and review queue
 */
app.post('/api/widget/interaction', widgetDataLimiter, async (req, res) => {
  try {
    // Sanitize all input to prevent XSS
    const userId = sanitizeInput(req.body.userId);
    const query = sanitizeInput(req.body.query);
    const response = sanitizeInput(req.body.response);
    const analysis = sanitizeObject(req.body.analysis);
    const sessionId = sanitizeInput(req.body.sessionId);

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // 1. Update analytics (increment chat count)
    const { data: analytics } = await supabaseAdmin
      .from('analytics')
      .select('total_chats, dashboard_data')
      .eq('user_id', userId)
      .maybeSingle();

    const newTotalChats = (analytics?.total_chats || 0) + 1;

    // Update dashboard data for today
    const today = new Date().toLocaleDateString('en-US', { weekday: 'short' });
    let dashboardData = analytics?.dashboard_data || [];
    const todayIndex = dashboardData.findIndex(d => d.name === today);
    if (todayIndex >= 0) {
      dashboardData[todayIndex].chats = (dashboardData[todayIndex].chats || 0) + 1;
    }

    await supabaseAdmin
      .from('analytics')
      .upsert({
        user_id: userId,
        total_chats: newTotalChats,
        dashboard_data: dashboardData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    // 2. Save to review queue if low confidence
    if (analysis && analysis.confidence !== undefined && analysis.confidence < 0.7) {
      const reviewId = `review-${Date.now()}`;
      await supabaseAdmin
        .from('review_items')
        .insert({
          id: reviewId,
          user_id: userId,
          query: query,
          response: response,
          confidence: analysis.confidence,
          sentiment: analysis.sentiment || 'neutral',
          topics: analysis.topics || [],
          status: 'PENDING',
          created_at: new Date().toISOString()
        });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Widget interaction error:', error);
    res.status(500).json({ error: 'Failed to save interaction' });
  }
});

/**
 * POST /api/widget/feedback
 * Saves user feedback rating for a chat session
 */
app.post('/api/widget/feedback', widgetDataLimiter, async (req, res) => {
  try {
    const userId = sanitizeInput(req.body.userId);
    const sessionId = sanitizeInput(req.body.sessionId);
    const rating = req.body?.rating;
    const sentiment = sanitizeInput(req.body?.sentiment);
    const comment = sanitizeInput(req.body?.comment);

    if (!userId || !sessionId || rating === undefined || rating === null) {
      return res.status(400).json({ error: 'Missing userId, sessionId, or rating' });
    }

    const ratingValue = Number(rating);
    if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({ error: 'Rating must be a number between 1 and 5' });
    }

    const { error } = await supabaseAdmin
      .from('chat_sessions')
      .update({
        feedback_rating: ratingValue,
        feedback_sentiment: sentiment || null,
        feedback_comment: comment || null,
        feedback_created_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Widget feedback error:', error);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

/**
 * GET /api/overview-metrics/:userId
 * Aggregates chat + interaction + outcome metrics for the dashboard
 */
app.get('/api/overview-metrics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const days = Number(req.query.days || 7);

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // =====================
    // SECURITY: Verify the caller owns this userId
    // =====================
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (user.id !== userId) {
      return res.status(403).json({ error: 'You can only access your own metrics' });
    }
    // =====================

    const since = new Date();
    since.setDate(since.getDate() - (Number.isFinite(days) ? days : 7));
    const sinceIso = since.toISOString();

    const parseMessages = (messages) => {
      if (!messages) return [];
      if (Array.isArray(messages)) return messages;
      if (typeof messages === 'string') {
        try {
          const parsed = JSON.parse(messages);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const { data: chats, error: chatError } = await supabaseAdmin
      .from('chat_sessions')
      .select('id, customer_email, customer_phone, messages, sentiment, type, status, triage, followup_status, created_at, first_response_ms, avg_response_ms, feedback_rating')
      .eq('user_id', userId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false });

    if (chatError) throw chatError;

    const chatRows = chats || [];
    const totalChats = chatRows.length;

    const uniqueChatters = new Set();
    const chatEmailSet = new Set();
    const sentimentCounts = {};
    const intentCounts = {};
    let totalMessages = 0;
    let followupRequired = 0;
    let followupSent = 0;
    let responseTimeSum = 0;
    let responseTimeCount = 0;
    let feedbackSum = 0;
    let feedbackCount = 0;

    for (const chat of chatRows) {
      const email = chat.customer_email ? String(chat.customer_email).toLowerCase() : null;
      const phone = chat.customer_phone || null;
      if (email) {
        uniqueChatters.add(`email:${email}`);
        chatEmailSet.add(email);
      } else if (phone) {
        uniqueChatters.add(`phone:${phone}`);
      } else if (chat.id) {
        uniqueChatters.add(`session:${chat.id}`);
      }

      const messages = parseMessages(chat.messages);
      totalMessages += messages.length;

      const sentiment = chat.sentiment || 'neutral';
      sentimentCounts[sentiment] = (sentimentCounts[sentiment] || 0) + 1;

      let intent = chat.type || 'General';
      if (chat.triage && typeof chat.triage === 'object') {
        intent = chat.triage.intent || intent;
      } else if (typeof chat.triage === 'string') {
        try {
          const parsed = JSON.parse(chat.triage);
          intent = parsed?.intent || intent;
        } catch {
          // ignore parse errors
        }
      }
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;

      if (chat.followup_status === 'scheduled' || chat.followup_status === 'sent') {
        followupRequired += 1;
      }
      if (chat.followup_status === 'sent') {
        followupSent += 1;
      }

      const avgResponseMs = chat.avg_response_ms || null;
      if (avgResponseMs !== null && avgResponseMs !== undefined) {
        responseTimeSum += Number(avgResponseMs) || 0;
        responseTimeCount += 1;
      }

      if (chat.feedback_rating !== null && chat.feedback_rating !== undefined) {
        feedbackSum += Number(chat.feedback_rating) || 0;
        feedbackCount += 1;
      }
    }

    const avgMessagesPerChat = totalChats > 0 ? Number((totalMessages / totalChats).toFixed(2)) : 0;
    const avgResponseTimeMs = responseTimeCount > 0 ? Math.round(responseTimeSum / responseTimeCount) : null;
    const avgFeedbackRating = feedbackCount > 0 ? Number((feedbackSum / feedbackCount).toFixed(2)) : null;

    const { data: reviewItems, error: reviewError } = await supabaseAdmin
      .from('review_items')
      .select('confidence, sentiment, topics, created_at')
      .eq('user_id', userId)
      .gte('created_at', sinceIso);

    if (reviewError) throw reviewError;

    const reviewRows = reviewItems || [];
    const lowConfidenceCount = reviewRows.length;
    const topicCounts = {};
    for (const item of reviewRows) {
      const topics = Array.isArray(item.topics) ? item.topics : [];
      for (const topic of topics) {
        if (!topic) continue;
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }

    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('id, source, created_at')
      .eq('user_id', userId)
      .gte('created_at', sinceIso);

    if (leadsError) throw leadsError;
    const leadRows = leads || [];
    const leadsCaptured = leadRows.length;
    const leadsFromChat = leadRows.filter(lead => lead.source === 'AI Chat').length;

    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from('bookings')
      .select('id, customer_email, created_at')
      .eq('user_id', userId)
      .gte('created_at', sinceIso);

    if (bookingsError) throw bookingsError;
    const bookingRows = bookings || [];
    const bookingsCreated = bookingRows.length;
    const bookingsFromChat = bookingRows.filter(b => {
      const email = b.customer_email ? String(b.customer_email).toLowerCase() : null;
      return email && chatEmailSet.has(email);
    }).length;

    const chatToLeadConversion = totalChats > 0 ? Number((leadsFromChat / totalChats).toFixed(3)) : 0;
    const chatToBookingConversion = totalChats > 0 ? Number((bookingsFromChat / totalChats).toFixed(3)) : 0;
    const lowConfidenceRate = totalChats > 0 ? Number((lowConfidenceCount / totalChats).toFixed(3)) : 0;
    const followupRequiredRate = totalChats > 0 ? Number((followupRequired / totalChats).toFixed(3)) : 0;
    const followupSentRate = totalChats > 0 ? Number((followupSent / totalChats).toFixed(3)) : 0;

    const topIntents = Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));

    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));

    res.json({
      range: {
        days,
        since: sinceIso
      },
      chats: {
        total: totalChats,
        uniqueVisitors: uniqueChatters.size,
        avgMessagesPerChat,
        sentiment: sentimentCounts,
        avgResponseTimeMs,
        followupRequiredRate,
        followupSentRate
      },
      quality: {
        lowConfidenceCount,
        lowConfidenceRate,
        avgFeedbackRating
      },
      outcomes: {
        leadsCaptured,
        bookingsCreated,
        leadsFromChat,
        bookingsFromChat,
        chatToLeadConversion,
        chatToBookingConversion
      },
      insights: {
        topIntents,
        topReviewTopics: topTopics
      }
    });
  } catch (error) {
    console.error('[API] Overview metrics error:', error);
    res.status(500).json({ error: 'Failed to load overview metrics' });
  }
});

// =====================
// Allowed Embed Domains API
// =====================

// Get allowed embed domains for a user
app.get('/api/embed-domains/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Fetch settings
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('settings')
      .select('allowed_embed_domains, tenant_config')
      .eq('user_id', userId)
      .maybeSingle();

    if (settingsError) {
      console.error('[API] Settings fetch error:', settingsError);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }

    // Get allowed domains
    let allowedDomains = settings?.allowed_embed_domains || [];
    let defaultDomain = null;

    // If no explicit domains, try to get website URL as default
    if (allowedDomains.length === 0 && settings?.tenant_config?.companyUrl) {
      try {
        const url = new URL(settings.tenant_config.companyUrl);
        defaultDomain = url.origin;
      } catch (e) {
        // Invalid URL
      }
    }

    // Also check knowledge base
    if (!defaultDomain) {
      const { data: knowledge } = await supabaseAdmin
        .from('knowledge_bases')
        .select('content')
        .eq('user_id', userId)
        .maybeSingle();

      if (knowledge?.content?.website) {
        try {
          const url = new URL(knowledge.content.website);
          defaultDomain = url.origin;
        } catch (e) {
          // Invalid URL
        }
      }
    }

    res.json({
      allowedDomains,
      defaultDomain, // Suggested domain from their website
      isConfigured: allowedDomains.length > 0
    });

  } catch (error) {
    console.error('[API] Embed domains error:', error);
    res.status(500).json({ error: 'Failed to fetch embed domains' });
  }
});

// Update allowed embed domains (PROTECTED - requires authentication)
app.put('/api/embed-domains/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { domains } = req.body;

    // =====================
    // SECURITY: Verify the caller owns this userId
    // =====================
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Verify the authenticated user matches the userId being modified
    if (user.id !== userId) {
      console.warn(`[Security] User ${user.id} attempted to modify embed domains for ${userId}`);
      return res.status(403).json({ error: 'You can only modify your own embed domains' });
    }
    // =====================

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    if (!Array.isArray(domains)) {
      return res.status(400).json({ error: 'domains must be an array' });
    }

    // Validate and normalize domains
    const validDomains = [];
    for (const domain of domains) {
      if (typeof domain !== 'string' || domain.trim() === '') continue;

      try {
        // Try to parse as URL, extract origin
        let normalized = domain.trim();
        if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
          normalized = 'https://' + normalized;
        }
        const url = new URL(normalized);
        validDomains.push(url.origin);
      } catch (e) {
        // Skip invalid domains
        console.warn(`[API] Invalid domain skipped: ${domain}`);
      }
    }

    // Update settings
    const { error: updateError } = await supabaseAdmin
      .from('settings')
      .upsert({
        user_id: userId,
        allowed_embed_domains: validDomains,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (updateError) {
      console.error('[API] Update error:', updateError);
      return res.status(500).json({ error: 'Failed to update embed domains' });
    }

    res.json({
      success: true,
      allowedDomains: validDomains
    });

  } catch (error) {
    console.error('[API] Embed domains update error:', error);
    res.status(500).json({ error: 'Failed to update embed domains' });
  }
});

// Create Stripe Checkout Session
app.post('/api/create-checkout-session', async (req, res) => {
  const { priceId, userId, userEmail } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${req.headers.origin}/account?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/account`,
      customer_email: userEmail,
      client_reference_id: userId,
      metadata: { userId }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================
// Gemini API Proxy for Chat Widget
// =====================
// This proxies chat requests through the backend to keep the API key secure
// CRITICAL: This endpoint costs money per request! Strict rate limiting applied.
const PRICING_INTENT_TOKENS = [
  'price',
  'pricing',
  'plan',
  'plans',
  'cost',
  'rate',
  'fees',
  'how much',
  'cheapest',
  'lowest',
  'compare',
  'difference',
  '$'
];

const isPricingIntent = (text = '') => {
  const normalized = String(text || '').toLowerCase();
  return PRICING_INTENT_TOKENS.some(token => normalized.includes(token));
};

const extractLastUserText = (contents = []) => {
  if (!Array.isArray(contents)) return '';
  for (let i = contents.length - 1; i >= 0; i -= 1) {
    const item = contents[i];
    if (item?.role === 'user' && Array.isArray(item.parts)) {
      const textPart = item.parts.find(p => typeof p?.text === 'string');
      if (textPart?.text) return textPart.text;
    }
  }
  return '';
};

const extractNumericPrice = (price = '') => {
  const match = String(price).replace(/,/g, '').match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  return parseFloat(match[1]);
};

const formatPricingPlans = (plans = []) => {
  return plans
    .filter(plan => plan && (plan.name || plan.price))
    .map(plan => {
      const features = Array.isArray(plan.features) && plan.features.length > 0
        ? ` — ${plan.features.join(', ')}`
        : '';
      return `${plan.name || 'Plan'}: ${plan.price || 'Price not specified'}${features}`;
    });
};

const buildPricingResponse = (knowledge, queryText) => {
  if (!knowledge) return null;
  if (typeof knowledge.pricing === 'string' && knowledge.pricing.trim()) {
    return `Here is our pricing:\n\n${knowledge.pricing.trim()}`;
  }
  if (!Array.isArray(knowledge.pricing)) return null;
  const plans = knowledge.pricing.filter(plan => plan && (plan.name || plan.price));
  if (plans.length === 0) return null;

  const normalized = String(queryText || '').toLowerCase();
  const formatted = formatPricingPlans(plans);

  if (normalized.includes('cheapest') || normalized.includes('lowest')) {
    let cheapest = null;
    for (const plan of plans) {
      const value = extractNumericPrice(plan.price);
      if (value === null) continue;
      if (!cheapest || value < cheapest.value) {
        cheapest = { value, plan };
      }
    }
    if (cheapest) {
      return `${cheapest.plan.name} is the cheapest at ${cheapest.plan.price}.`;
    }
  }

  if (normalized.includes('difference') || normalized.includes('compare')) {
    return `Here’s how the plans compare:\n\n${formatted.join('\n')}`;
  }

  return `Here are our pricing plans:\n\n${formatted.join('\n')}`;
};

const fetchKnowledgeBase = async (tenantId) => {
  const { data, error } = await supabaseAdmin
    .from('knowledge_bases')
    .select('content')
    .eq('user_id', tenantId)
    .maybeSingle();

  if (error) {
    console.error('[KB] Fetch error:', error);
    return null;
  }
  return data?.content || null;
};

const fetchWidgetConfig = async (tenantId) => {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('widget_config')
    .eq('user_id', tenantId)
    .maybeSingle();

  if (error) {
    console.error('[Settings] Fetch error:', error);
    return null;
  }
  return data?.widget_config || null;
};

const matchDisabledCustomCapability = (widgetConfig, text = '') => {
  const custom = widgetConfig?.capabilities?.custom;
  if (!Array.isArray(custom) || custom.length === 0) return null;
  const normalized = String(text || '').toLowerCase();
  return custom.find(cap => cap && cap.enabled === false && (
    (cap.key && normalized.includes(String(cap.key).toLowerCase())) ||
    (cap.label && normalized.includes(String(cap.label).toLowerCase()))
  ));
};

app.all('/api-proxy/*', geminiProxyLimiter, async (req, res) => {
  try {
    const geminiPath = req.params[0]; // e.g., "v1beta/models/gemini-2.0-flash:generateContent"
    const geminiUrl = `https://generativelanguage.googleapis.com/${geminiPath}?key=${process.env.VITE_GEMINI_API_KEY}`;

    console.log(`[API Proxy] Forwarding to: ${geminiPath}`);

    const tenantId = req.headers['x-tenant-id'];
    if (req.body?.system_instruction && !tenantId) {
      return res.status(400).json({ error: 'Missing tenant id for chat request' });
    }

    if (tenantId && req.body?.contents) {
      const lastUserText = extractLastUserText(req.body.contents);
      const widgetConfig = await fetchWidgetConfig(String(tenantId));

      if (lastUserText) {
        const blockedCustom = matchDisabledCustomCapability(widgetConfig, lastUserText);
        if (blockedCustom) {
          return res.json({
            candidates: [
              {
                content: {
                  parts: [{ text: `I’m not able to help with ${blockedCustom.label || 'that'} right now. Is there something else I can assist with?` }]
                }
              }
            ]
          });
        }
      }

      if (lastUserText && isPricingIntent(lastUserText)) {
        const canAnswerPricing = widgetConfig?.capabilities?.canAnswerPricing !== false;
        if (!canAnswerPricing) {
          return res.json({
            candidates: [
              {
                content: {
                  parts: [{ text: "I’m not able to share pricing right now. Would you like me to connect you with someone?" }]
                }
              }
            ]
          });
        }
        const knowledge = await fetchKnowledgeBase(String(tenantId));
        const pricingResponse = buildPricingResponse(knowledge, lastUserText);
        const fallback = "I don't have pricing details available right now. Would you like me to connect you with someone?";
        return res.json({
          candidates: [
            {
              content: {
                parts: [{ text: pricingResponse || fallback }]
              }
            }
          ]
        });
      }
    }

    const response = await fetch(geminiUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('[API Proxy] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getBusinessHoursForDate = (date, hoursByDay) => {
  const key = DAY_KEYS[date.getDay()];
  const value = hoursByDay?.[key] || hoursByDay?.[key.toLowerCase()] || hoursByDay?.[key.toUpperCase()];
  if (!value) return null;
  if (String(value).toLowerCase().includes('closed')) return null;
  return value;
};

const parseHoursRange = (input) => {
  if (!input) return null;
  const normalized = String(input)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/(\d)\.(\d{2})/g, '$1:$2')
    .replace(' to ', ' - ')
    .trim();

  const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  const startHour = parseInt(match[1], 10);
  const startMin = match[2] ? parseInt(match[2], 10) : 0;
  const startMeridiem = match[3] || '';

  const endHour = parseInt(match[4], 10);
  const endMin = match[5] ? parseInt(match[5], 10) : 0;
  const endMeridiem = match[6] || startMeridiem;

  const toMinutes = (hour, minute, meridiem) => {
    if (!meridiem) {
      if (hour > 23) return null;
      return hour * 60 + minute;
    }
    const isPm = meridiem.toLowerCase() === 'pm';
    let h = hour % 12;
    if (isPm) h += 12;
    return h * 60 + minute;
  };

  const start = toMinutes(startHour, startMin, startMeridiem);
  const end = toMinutes(endHour, endMin, endMeridiem);
  if (start === null || end === null) return null;
  return { start, end };
};

const isWithinBusinessHours = (date, hoursText) => {
  const range = parseHoursRange(hoursText);
  if (!range) return true;
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (range.start <= range.end) {
    return minutes >= range.start && minutes <= range.end;
  }
  return minutes >= range.start || minutes <= range.end;
};

// =====================
// Web Scraper + Gemini Analysis Endpoint
// =====================
import { scrapeWebsite } from './scraper.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY || '');

// =====================
// AI Triage + Follow-Up Helpers
// =====================
const FOLLOWUP_DEFAULTS = {
  enabled: true,
  delayMinutes: 0,
  sendToCustomer: true,
  sendToOwner: false,
  customerSubject: 'Thanks for chatting with {{company_name}}',
  customerBody:
    "Hi {{customer_name}},\n\n" +
    "Here’s a quick recap of your chat:\n" +
    "{{summary}}\n\n" +
    "{{next_action}}\n\n" +
    "You can also visit {{company_url}} or reply to this email with any questions.\n\n" +
    "- {{company_name}}",
  ownerSubject: 'Follow-up needed: {{customer_name}}',
  ownerBody:
    "Customer: {{customer_name}} ({{customer_email}})\n" +
    "Priority: {{priority}}\n" +
    "Intent: {{intent}}\n\n" +
    "Summary:\n" +
    "{{summary}}\n\n" +
    "Next action:\n" +
    "{{next_action}}",
  replyToEmail: ''
};

const safeJsonParse = (text, fallback = null) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

const normalizeMessagesForTriage = (messages = []) => {
  const cleaned = (Array.isArray(messages) ? messages : [])
    .filter(m => m && m.text && m.role)
    .slice(-12)
    .map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${String(m.text).slice(0, 800)}`);
  return cleaned.join('\n');
};

const renderTemplate = (template, vars) => {
  if (!template) return '';
  return Object.entries(vars).reduce((acc, [key, value]) => {
    const safeVal = value === undefined || value === null ? '' : String(value);
    return acc.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), safeVal);
  }, template);
};

const generateTriage = async ({ messages, companyName }) => {
  const transcript = normalizeMessagesForTriage(messages);
  if (!transcript) return null;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(`You are an assistant helping a business owner triage inbound chats.

BUSINESS: ${companyName || 'Unknown'}

CHAT TRANSCRIPT:
${transcript}

Return JSON only (no markdown) with this exact structure:
{
  "summary": "1-2 sentences, plain English",
  "intent": "short phrase describing what the customer wants",
  "priority": "Hot | Warm | Cold",
  "nextAction": "the single best next step for the owner"
}
`);

  let text = result.response.text();
  text = text.replace(/```json/g, "").replace(/```/g, "").trim();
  return safeJsonParse(text, null);
};

const scheduleFollowUpIfNeeded = async ({ userId, sessionRow, sessionPayload }) => {
  if (!userId || !sessionRow) return;

  const { data: settings } = await supabaseAdmin
    .from('settings')
    .select('widget_config, tenant_config')
    .eq('user_id', userId)
    .maybeSingle();

  const followUp = {
    ...FOLLOWUP_DEFAULTS,
    ...(settings?.widget_config?.followUp || {})
  };

  if (!followUp.enabled) return;

  // Avoid duplicate scheduling
  if (sessionRow.followup_status === 'scheduled' || sessionRow.followup_status === 'sent') {
    return;
  }

  const customerEmail = (sessionPayload?.customerEmail || sessionRow.customer_email || '').toLowerCase();
  const customerName = sessionPayload?.customerName || sessionRow.customer_name || 'Visitor';

  const recipients = [];
  if (followUp.sendToCustomer && customerEmail) recipients.push('customer');
  if (followUp.sendToOwner) recipients.push('owner');

  if (recipients.length === 0) {
    await supabaseAdmin
      .from('chat_sessions')
      .update({ followup_status: 'skipped' })
      .eq('id', sessionRow.id);
    return;
  }

  // Skip if already booked
  if (customerEmail) {
    const { data: bookedLead } = await supabaseAdmin
      .from('leads')
      .select('id, status')
      .eq('user_id', userId)
      .eq('email', customerEmail)
      .maybeSingle();

    if (bookedLead?.status === 'Booked') {
      await supabaseAdmin
        .from('chat_sessions')
        .update({ followup_status: 'skipped' })
        .eq('id', sessionRow.id);
      return;
    }
  }

  const delayMs = Math.max(0, Number(followUp.delayMinutes || 0)) * 60 * 1000;
  const scheduledAt = new Date(Date.now() + delayMs).toISOString();

  await supabaseAdmin
    .from('chat_sessions')
    .update({
      followup_status: 'scheduled',
      followup_scheduled_at: scheduledAt,
      followup_recipients: recipients
    })
    .eq('id', sessionRow.id);

  // Mirror follow-up status to lead if available
  if (customerEmail) {
    await supabaseAdmin
      .from('leads')
      .update({
        followup_status: 'scheduled',
        followup_scheduled_at: scheduledAt
      })
      .eq('user_id', userId)
      .eq('email', customerEmail);
  }
};

// Rate Limiter for /api/scrape (in-memory, per IP)
const scrapeRateLimiter = new Map(); // IP -> { count, windowStart }
const SCRAPE_RATE_LIMIT = 5; // Max requests per window
const SCRAPE_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour window

const checkScrapeRateLimit = (ip) => {
  const now = Date.now();
  const record = scrapeRateLimiter.get(ip);

  if (!record || now - record.windowStart > SCRAPE_RATE_WINDOW_MS) {
    // Reset or create new window
    scrapeRateLimiter.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (record.count >= SCRAPE_RATE_LIMIT) {
    return false; // Rate limited
  }

  record.count++;
  return true;
};

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  // Check rate limit
  if (!checkScrapeRateLimit(clientIp)) {
    console.log(`[API] Rate limit exceeded for IP: ${clientIp}`);
    return res.status(429).json({
      error: 'Rate limit exceeded. You can only scan 5 websites per hour. Please try again later.'
    });
  }

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Invalid URL. Only HTTP and HTTPS are supported.' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format.' });
  }

  // Set a timeout for the entire request (Cloud Run has 5 min max)
  const timeoutMs = 120000; // 2 minutes
  const timeout = setTimeout(() => {
    console.error('[API] Scrape request timed out');
    if (!res.headersSent) {
      res.status(504).json({ error: 'Request timed out. Try a simpler website.' });
    }
  }, timeoutMs);

  try {
    console.log(`[API] Scraping: ${url}`);
    console.log(`[API] PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'Not set'}`);

    // Step 1: Scrape the website
    let scrapedData;
    try {
      scrapedData = await scrapeWebsite(url);
    } catch (scrapeError) {
      console.error('[API] Scraper Error:', scrapeError.message);
      clearTimeout(timeout);
      return res.status(500).json({ error: `Scraper failed: ${scrapeError.message}` });
    }

    if (!scrapedData.combinedText || scrapedData.combinedText.length < 100) {
      clearTimeout(timeout);
      return res.status(400).json({ error: 'Could not extract enough content from the website.' });
    }

    console.log(`[API] Scraped ${scrapedData.pages.length} pages. Sending to Gemini...`);

    // Step 2: Send to Gemini for structuring
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are a business data extractor. Analyze the following website text content and extract structured information.

SCRAPED WEBSITE CONTENT:
"""
${scrapedData.combinedText}
"""

Based on this content, extract and return a JSON object with this exact structure (no markdown, no backticks):
{
  "companyName": "Official business name",
  "website": "${url}",
  "phoneNumber": "Primary phone number if found (or null)",
  "businessCategory": "2-3 word industry category (e.g., 'Hair Salon', 'E-Commerce Platform')",
  "keywords": ["5", "relevant", "industry", "keywords"],
  "summary": "2-sentence executive summary of what they do and who they serve",
  "services": [
    {
      "id": "svc_1",
      "name": "Service Name",
      "description": "Brief description of the service (optional)",
      "pricing": {
        "type": "fixed | starting_from | hourly | custom | contact",
        "amount": 50,
        "currency": "USD",
        "customText": "Only if type is 'custom'"
      },
      "duration": 30,
      "category": "Service category if applicable"
    }
  ],
  "businessHours": "Operating hours if found (or 'Not specified')",
  "contactInfo": "Email, address, other contact methods (or 'Not specified')",
  "policies": "Cancellation, refund, or booking policies found. If none, say 'No policies found.'",
  "locations": [
    {
      "name": "Location name (e.g., 'Downtown Office', 'Main Street Clinic')",
      "address": "Full street address",
      "city": "City name",
      "state": "State/Province",
      "zip": "Postal/ZIP code",
      "phone": "Location-specific phone if different from main",
      "hours": "Location-specific hours if different"
    }
  ]
}

IMPORTANT SERVICE EXTRACTION RULES:
- Extract EVERY distinct service/product offered by the business
- For each service, try to find its specific price:
  - "fixed": Exact price (e.g., "Haircut - $35" → amount: 35, type: "fixed")
  - "starting_from": Minimum price (e.g., "Color from $75" → amount: 75, type: "starting_from")
  - "hourly": Rate per hour (e.g., "$50/hour" → amount: 50, type: "hourly")
  - "custom": Variable pricing (e.g., "pricing varies" → type: "custom", customText: "Varies by project")
  - "contact": No price found (→ type: "contact")
- Include duration in minutes if mentioned (e.g., "45 min appointment" → duration: 45)
- Generate sequential IDs like "svc_1", "svc_2", etc.
- If no pricing found for a service, use type: "contact"

OTHER INSTRUCTIONS:
- For LOCATIONS: Look for physical addresses, storefronts, clinics, offices, or branches. Return empty array [] if none found.
- Return ONLY valid JSON, no explanations.`;

    const result = await model.generateContent(prompt);
    let text = result.response.text();

    // Clean up response
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const knowledgeBaseData = JSON.parse(text);

    // Add metadata
    knowledgeBaseData.sources = scrapedData.pages.map(p => p.url);
    knowledgeBaseData.lastUpdated = new Date().toISOString();

    console.log(`[API] Successfully structured data for: ${knowledgeBaseData.companyName}`);

    clearTimeout(timeout);
    res.json(knowledgeBaseData);

  } catch (error) {
    clearTimeout(timeout);
    console.error('[API] Scrape Error:', error);
    res.status(500).json({ error: error.message || 'Scraping failed' });
  }
});

// =====================
// Single-Page Pricing Scraper
// =====================
app.post('/api/scrape-pricing', async (req, res) => {
  const { url, existingServices } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Validate URL
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Invalid URL. Only HTTP and HTTPS are supported.' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format.' });
  }

  const timeoutMs = 60000; // 1 minute for single page
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Request timed out.' });
    }
  }, timeoutMs);

  try {
    console.log(`[API] Scraping pricing page: ${url}`);

    // Use the scraper but just for this single page
    const browser = await (await import('puppeteer')).default.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const content = await page.evaluate(() => {
      const remove = ['script', 'style', 'nav', 'footer', 'header'];
      remove.forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
      return document.body?.innerText?.substring(0, 30000) || '';
    });

    await browser.close();

    if (!content || content.length < 50) {
      clearTimeout(timeout);
      return res.status(400).json({ error: 'Could not extract content from this page.' });
    }

    // Extract pricing using Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const serviceContext = existingServices && existingServices.length > 0
      ? `\nEXISTING SERVICES TO MATCH:\n${existingServices.map(s => `- ${s.name}`).join('\n')}\n`
      : '';

    const prompt = `Extract pricing information from this pricing page content.${serviceContext}

PAGE CONTENT:
"""
${content}
"""

Return a JSON array of service pricing objects (no markdown, no backticks):
[
  {
    "name": "Service Name",
    "pricing": {
      "type": "fixed | starting_from | hourly | custom | contact",
      "amount": 50,
      "currency": "USD",
      "customText": "Only if type is custom"
    },
    "duration": 30,
    "description": "Brief description if found"
  }
]

Rules:
- Match services to existing services if provided
- "fixed": exact price ($35)
- "starting_from": minimum price (from $50)
- "hourly": per hour rate ($50/hr)
- "custom": variable (use customText to explain)
- duration in minutes if mentioned
- Return ONLY valid JSON array`;

    const result = await model.generateContent(prompt);
    let text = result.response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const pricingData = JSON.parse(text);

    clearTimeout(timeout);
    console.log(`[API] Extracted pricing for ${pricingData.length} services`);
    res.json({ services: pricingData });

  } catch (error) {
    clearTimeout(timeout);
    console.error('[API] Pricing Scrape Error:', error);
    res.status(500).json({ error: error.message || 'Failed to extract pricing' });
  }
});

// =====================
// Calendar Booking Endpoint
// =====================

// Rate limiter for bookings
const bookingRateLimiter = new Map();
const BOOKING_RATE_LIMIT = 10; // Max 10 bookings per window
const BOOKING_RATE_WINDOW_MS = 60 * 1000; // 1 minute window

const checkBookingRateLimit = (ip) => {
  const now = Date.now();
  const record = bookingRateLimiter.get(ip);

  if (!record || now - record.windowStart > BOOKING_RATE_WINDOW_MS) {
    bookingRateLimiter.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (record.count >= BOOKING_RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
};

app.post('/api/bookings/create', async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress;

  // Rate limiting
  if (!checkBookingRateLimit(clientIp)) {
    return res.status(429).json({
      success: false,
      error: 'Too many booking requests. Please try again later.'
    });
  }

  try {
    const {
      provider = 'google',
      customerName,
      customerEmail,
      customerPhone,
      startTime,
      endTime,
      description,
      timezone
    } = req.body;

    // Validate required fields
    if (!customerName || !customerEmail || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerName, customerEmail, startTime, endTime'
      });
    }

    // Validate times are in the future
    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();

    if (start < now) {
      return res.status(400).json({
        success: false,
        error: 'Booking time must be in the future'
      });
    }

    if (end <= start) {
      return res.status(400).json({
        success: false,
        error: 'End time must be after start time'
      });
    }

    // For now, only Google Calendar is supported
    // In the future, this would route to different providers based on the 'provider' param
    if (provider !== 'google') {
      return res.status(400).json({
        success: false,
        error: `Provider '${provider}' is not yet supported. Currently only 'google' is available.`
      });
    }

    // Return booking info for client-side Google Calendar creation
    // The actual calendar event will be created client-side using gapi
    // because we need the user's OAuth token
    res.json({
      success: true,
      bookingId: `pending_${Date.now()}`,
      provider: 'google',
      details: {
        customerName,
        customerEmail,
        customerPhone,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        description,
        timezone: timezone || 'America/New_York'
      },
      message: 'Booking details validated. Please create event using client-side Google Calendar API.'
    });

  } catch (error) {
    console.error('[API] Booking creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create booking'
    });
  }
});

// =====================
// Calendar Availability & Booking Endpoints
// =====================

/**
 * Helper: Get and refresh calendar connection if needed
 */
async function getCalendarConnection(userId, provider = 'google') {
  // Fetch user's calendar connection
  const { data: connection, error } = await supabaseAdmin
    .from('calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('is_active', true)
    .single();

  if (error || !connection) {
    return null;
  }

  // Check if token needs refresh
  const now = new Date();
  const expiresAt = new Date(connection.token_expires_at);

  if (expiresAt < now) {
    console.log(`[Calendar] Token expired for user ${userId}, refreshing...`);
    console.log(`[Calendar] Using Client ID: ${process.env.VITE_GOOGLE_CLIENT_ID?.substring(0, 10)}...`);
    console.log(`[Calendar] Using Client Secret: ${process.env.GOOGLE_CLIENT_SECRET ? (process.env.GOOGLE_CLIENT_SECRET.startsWith('GOCSPX') ? 'Valid Format (GOCSPX...)' : 'INVALID FORMAT (' + process.env.GOOGLE_CLIENT_SECRET.substring(0, 5) + '...)') : 'MISSING'}`);

    try {
      const { access_token, expires_at } = await refreshGoogleToken(connection.refresh_token);

      console.log('[Calendar] Token refreshed successfully');

      // Update token in database
      await supabaseAdmin
        .from('calendar_connections')
        .update({
          access_token,
          token_expires_at: expires_at,
          last_used_at: new Date().toISOString()
        })
        .eq('id', connection.id);

      connection.access_token = access_token;
      connection.token_expires_at = expires_at;
    } catch (refreshError) {
      console.error('[Calendar] Token refresh failed:', refreshError.message);
      // Don't throw immediately, try with existing token just in case (though likely will fail)
      throw new Error('Calendar connection expired. Please reconnect.');
    }
  } else {
    // Update last used timestamp
    await supabaseAdmin
      .from('calendar_connections')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', connection.id);
  }

  return connection;
}

/**
 * POST /api/calendar/availability
 * Check if a specific time slot is available
 */
app.post('/api/calendar/availability', calendarLimiter, async (req, res) => {
  try {
    const { userId, startTime, endTime, provider = 'google' } = req.body;

    if (!userId || !startTime || !endTime) {
      console.log('[API] Missing fields:', { userId, startTime, endTime });
      return res.status(400).json({
        error: 'Missing required fields: userId, startTime, endTime'
      });
    }

    const widgetConfig = await fetchWidgetConfig(String(userId));
    const canBookAppointments = widgetConfig?.capabilities?.canBookAppointments !== false;
    if (!canBookAppointments) {
      return res.status(403).json({ error: 'Booking is not enabled for this widget.' });
    }

    console.log(`[API] Checking availability for user ${userId} from ${startTime} to ${endTime}`);

    // Get calendar connection
    const connection = await getCalendarConnection(userId, provider);

    if (!connection) {
      // No calendar connected - return as available (fallback)
      return res.json({
        available: true,
        conflicts: 0,
        message: 'No calendar connected'
      });
    }

    // Check availability using provider
    if (provider === 'google') {
      const result = await checkGoogleAvailability(
        connection.access_token,
        connection.calendar_id,
        new Date(startTime),
        new Date(endTime)
      );

      res.json(result);
    } else {
      res.status(400).json({ error: `Provider '${provider}' not yet supported` });
    }
  } catch (error) {
    console.error('[API] Calendar availability error:', error);
    res.status(500).json({
      error: error.message || 'Failed to check availability'
    });
  }
});

/**
 * POST /api/calendar/slots
 * Get all available time slots for a date range
 */
app.post('/api/calendar/slots', calendarLimiter, async (req, res) => {
  try {
    const {
      userId,
      startDate,
      endDate,
      slotDuration = 60,
      businessHours = { start: 9, end: 17 },
      provider = 'google'
    } = req.body;

    if (!userId || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required fields: userId, startDate, endDate'
      });
    }

    const widgetConfig = await fetchWidgetConfig(String(userId));
    const canBookAppointments = widgetConfig?.capabilities?.canBookAppointments !== false;
    if (!canBookAppointments) {
      return res.status(403).json({ error: 'Booking is not enabled for this widget.' });
    }

    const connection = await getCalendarConnection(userId, provider);

    if (!connection) {
      return res.json({
        slots: [],
        message: 'No calendar connected'
      });
    }

    if (provider === 'google') {
      const slots = await getGoogleAvailableSlots(
        connection.access_token,
        connection.calendar_id,
        new Date(startDate),
        new Date(endDate),
        slotDuration,
        businessHours
      );

      res.json({ slots });
    } else {
      res.status(400).json({ error: `Provider '${provider}' not yet supported` });
    }
  } catch (error) {
    console.error('[API] Calendar slots error:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch available slots'
    });
  }
});

/**
 * POST /api/callback/request
 * Validates and records a callback request (server-enforced business hours)
 */
app.post('/api/callback/request', calendarLimiter, async (req, res) => {
  try {
    const {
      tenantId,
      customer_name,
      customer_phone,
      customer_email,
      service,
      purpose,
      preferred_time,
      requested_datetime
    } = req.body || {};

    if (!tenantId || !customer_name || !customer_phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const widgetConfig = await fetchWidgetConfig(String(tenantId));
    const canRequestCallback = widgetConfig?.capabilities?.canRequestCallback !== false;
    if (!canRequestCallback) {
      return res.status(403).json({ error: 'Callback requests are not enabled.' });
    }

  if (requested_datetime) {
      const knowledge = await fetchKnowledgeBase(String(tenantId));
      const hoursByDay = knowledge?.businessHoursByDay || null;
      if (hoursByDay) {
        const requestedAt = new Date(requested_datetime);
        const hoursForDay = getBusinessHoursForDate(requestedAt, hoursByDay);
        if (!hoursForDay) {
          return res.status(400).json({
            error: `We’re closed on ${requestedAt.toLocaleDateString('en-US', { weekday: 'long' })}.`
          });
        }
        if (!isWithinBusinessHours(requestedAt, hoursForDay)) {
          return res.status(400).json({
            error: `Requested time is outside business hours (${hoursForDay}).`
          });
        }
      }
  }

    const payload = {
      request_id: `cb_${Date.now()}`,
      customer: {
        name: customer_name,
        email: customer_email,
        phone: customer_phone
      },
      service,
      purpose,
      preferred_time,
      requested_datetime
    };

    const { error } = await supabaseAdmin
      .from('bdl_events')
      .insert({
        tenant_id: tenantId,
        type: 'callback.requested',
        occurred_at: new Date().toISOString(),
        payload,
        source: 'chat'
      });

    if (error) throw error;

    res.json({
      success: true,
      payload
    });
  } catch (error) {
    console.error('[API] Callback request error:', error);
    res.status(500).json({ error: error.message || 'Failed to request callback' });
  }
});

/**
 * POST /api/calendar/create-event
 * Create a calendar event using owner's calendar
 */
app.post('/api/calendar/create-event', calendarLimiter, async (req, res) => {
  try {
    const {
      userId,
      summary,
      description,
      startTime,
      endTime,
      attendees = [],
      timezone = 'America/New_York',
      provider = 'google',
      customerName,
      customerEmail,
      customerPhone,
      serviceType,
      locationId,
      locationName
    } = req.body;

    if (!userId || !summary || !startTime || !endTime) {
      return res.status(400).json({
        error: 'Missing required fields: userId, summary, startTime, endTime'
      });
    }

    const widgetConfig = await fetchWidgetConfig(String(userId));
    const canBookAppointments = widgetConfig?.capabilities?.canBookAppointments !== false;
    if (!canBookAppointments) {
      return res.status(403).json({ error: 'Booking is not enabled for this widget.' });
    }

    const connection = await getCalendarConnection(userId, provider);

    if (!connection) {
      return res.status(400).json({
        error: 'No calendar connected. Please connect your calendar first.'
      });
    }

    if (provider === 'google') {
      const result = await createGoogleEvent(
        connection.access_token,
        connection.calendar_id,
        {
          summary,
          description,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          attendees: Array.isArray(attendees)
            ? attendees
                .filter(Boolean)
                .map(a => (typeof a === 'string' ? { email: a } : a))
            : [],
          timezone
        }
      );

      // Send transactional emails asynchronously
      try {
        const emailFromAttendees = Array.isArray(attendees)
          ? attendees.find(a => typeof a === 'string' ? a : a?.email)?.email || attendees.find(a => typeof a === 'string') || null
          : null;
        const resolvedCustomerEmail = customerEmail || emailFromAttendees || null;
        const resolvedCustomerName = customerName || description?.match(/Name: (.*?)(\n|$)/)?.[1] || description?.match(/Customer: (.*?)(\n|$)/)?.[1] || 'Valued Customer';
        const resolvedCustomerPhone = customerPhone || description?.match(/Phone: (.*?)(\n|$)/)?.[1] || null;

        if (resolvedCustomerEmail) {
          // Send confirmation to customer
          emailService.sendBookingConfirmation(resolvedCustomerEmail, resolvedCustomerName, {
            startTime,
            description: summary
          });

          // Send notification to owner
          if (connection.provider_email) {
            emailService.sendOwnerNotification(connection.provider_email, 'booking', {
              customerName: resolvedCustomerName,
              customerEmail: resolvedCustomerEmail,
              startTime: startTime,
              description: description
            });
          }
        }

        // ANALYTICS: Track booking in database
        const { error: dbError } = await supabaseAdmin.from('bookings').insert({
          user_id: userId,
          customer_email: resolvedCustomerEmail,
          customer_name: resolvedCustomerName,
          customer_phone: resolvedCustomerPhone,
          service_type: serviceType || 'Appointment',
          description: summary,
          start_time: startTime,
          end_time: endTime,
          status: 'confirmed',
          provider: 'google',
          location_id: locationId || null,
          location_name: locationName || null
        });

        if (dbError) console.error('[Analytics] Failed to track booking:', dbError);
      } catch (emailErr) {
        console.error('[API] Failed to send transactional emails:', emailErr);
      }

      res.json(result);
    } else {
      res.status(400).json({ error: `Provider '${provider}' not yet supported` });
    }
  } catch (error) {
    console.error('[API] Calendar event creation error:', error);
    res.status(500).json({
      error: error.message || 'Failed to create calendar event'
    });
  }
});

/**
 * POST /api/bookings/backfill
 * Backfill booking customer info by parsing description when missing
 */
app.post('/api/bookings/backfill', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { userId } = req.body || {};
    if (!userId || user.id !== userId) {
      return res.status(403).json({ error: 'Not authorized for this user' });
    }

    const { data: bookings, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .or('customer_name.is.null,customer_email.is.null,customer_phone.is.null');

    if (fetchError) throw fetchError;
    if (!bookings || bookings.length === 0) {
      return res.json({ success: true, updated: 0 });
    }

    let updated = 0;
    for (const booking of bookings) {
      const description = booking.description || '';
      const name = description.match(/Name: (.*?)(\n|$)/)?.[1]
        || description.match(/Customer: (.*?)(\n|$)/)?.[1]
        || null;
      const email = description.match(/Email: (.*?)(\n|$)/)?.[1] || null;
      const phone = description.match(/Phone: (.*?)(\n|$)/)?.[1] || null;

      if (!name && !email && !phone) {
        continue;
      }

      const { error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({
          customer_name: booking.customer_name || name,
          customer_email: booking.customer_email || email,
          customer_phone: booking.customer_phone || phone
        })
        .eq('id', booking.id);

      if (updateError) {
        console.error('[Backfill] Update failed:', updateError);
        continue;
      }
      updated += 1;
    }

    res.json({ success: true, updated });
  } catch (error) {
    console.error('[API] Booking backfill error:', error);
    res.status(500).json({ error: 'Failed to backfill bookings' });
  }
});

/**
 * POST /api/calendar/connect
 * Exchange auth code for tokens (Authorization Code Flow)
 */
app.post('/api/calendar/connect', calendarLimiter, async (req, res) => {
  try {
    const { code, userId, locationId, locationName } = req.body;

    if (!code || !userId) {
      return res.status(400).json({ error: 'Missing required fields: code, userId' });
    }

    // Check for mock code - means frontend doesn't have VITE credentials
    if (code === 'mock_auth_code') {
      console.error('[API /calendar/connect] Received MOCK auth code! Frontend is missing VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_API_KEY at build time.');
      return res.status(400).json({
        error: 'Configuration error: Google credentials not available. Please ensure VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY are set during the build process.',
        code: 'MOCK_MODE'
      });
    }

    // Exchange code for tokens
    // For redirect flow, we need to provide the same redirect_uri that was used to get the code

    // Create a new OAuth client with the correct redirect_uri for this request
    const redirectUri = process.env.VITE_APP_URL
      ? process.env.VITE_APP_URL.replace(/\/$/, '') + '/integrations'
      : 'https://app.hellochippy.com/integrations';



    const tokenExchangeClient = new google.auth.OAuth2(
      process.env.VITE_GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { tokens } = await tokenExchangeClient.getToken(code);

    // Set credentials in client to verify they work
    oauth2Client.setCredentials(tokens);

    // Get user's email to store
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    // Check if there's already a connection for this user + provider + location
    // For multi-location, each location can have its own calendar
    // Note: For null location_id, we need to use .is('location_id', null) instead of .eq()
    let existingQuery = supabaseAdmin
      .from('calendar_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'google');

    if (locationId) {
      existingQuery = existingQuery.eq('location_id', locationId);
    } else {
      existingQuery = existingQuery.is('location_id', null);
    }

    const { data: existingConnections } = await existingQuery;

    let connectionId;

    if (existingConnections && existingConnections.length > 0) {
      // Update existing connection
      connectionId = existingConnections[0].id;
      const { error } = await supabaseAdmin
        .from('calendar_connections')
        .update({
          provider_email: email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(tokens.expiry_date).toISOString(),
          calendar_id: 'primary',
          is_active: true,
          connected_at: new Date().toISOString(),
          location_name: locationName || null
        })
        .eq('id', connectionId);

      if (error) {
        console.error('[API] Database error updating connection:', error);
        throw error;
      }
    } else {
      // Insert new connection
      const { data, error } = await supabaseAdmin
        .from('calendar_connections')
        .insert({
          user_id: userId,
          provider: 'google',
          provider_email: email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(tokens.expiry_date).toISOString(),
          calendar_id: 'primary',
          is_active: true,
          connected_at: new Date().toISOString(),
          location_id: locationId || null,
          location_name: locationName || null,
          display_order: 0
        })
        .select('id')
        .single();

      if (error) {
        console.error('[API] Database error saving connection:', error);
        throw error;
      }

      connectionId = data.id;
    }

    res.json({ success: true, email: email, connectionId });

  } catch (error) {
    console.error('[API] Auth code exchange error:', error);
    res.status(500).json({
      error: 'Failed to connect calendar. ' + error.message
    });
  }
});

/**
 * POST /api/calendar/cancel-event
 * Cancel an existing calendar event
 */
app.post('/api/calendar/cancel-event', calendarLimiter, async (req, res) => {
  try {
    const { userId, eventId, customerEmail, reason, provider = 'google' } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required field: userId' });
    }

    const widgetConfig = await fetchWidgetConfig(String(userId));
    const canBookAppointments = widgetConfig?.capabilities?.canBookAppointments !== false;
    if (!canBookAppointments) {
      return res.status(403).json({ error: 'Booking is not enabled for this widget.' });
    }

    const connection = await getCalendarConnection(userId, provider);

    if (!connection) {
      return res.status(400).json({
        error: 'No calendar connected. Please connect your calendar first.'
      });
    }

    if (provider === 'google') {
      const calendar = google.calendar({ version: 'v3' });
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: connection.access_token });

      // If we have eventId, delete directly
      if (eventId) {
        await calendar.events.delete({
          auth,
          calendarId: connection.calendar_id || 'primary',
          eventId: eventId
        });
      } else if (customerEmail) {
        // Find event by attendee email (last 30 days)
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const events = await calendar.events.list({
          auth,
          calendarId: connection.calendar_id || 'primary',
          timeMin: thirtyDaysAgo.toISOString(),
          q: customerEmail,
          singleEvents: true
        });

        const matchingEvent = events.data.items?.find(e =>
          e.attendees?.some(a => a.email === customerEmail)
        );

        if (matchingEvent) {
          await calendar.events.delete({
            auth,
            calendarId: connection.calendar_id || 'primary',
            eventId: matchingEvent.id
          });
        } else {
          return res.status(404).json({ error: 'No matching appointment found for this email' });
        }
      } else {
        return res.status(400).json({ error: 'Please provide eventId or customerEmail to identify the appointment' });
      }

      res.json({ success: true, message: 'Appointment cancelled successfully' });
    } else {
      res.status(400).json({ error: `Provider '${provider}' not yet supported` });
    }

  } catch (error) {
    console.error('[API] Cancel event error:', error);
    res.status(500).json({
      error: error.message || 'Failed to cancel appointment'
    });
  }
});

/**
 * POST /api/calendar/reschedule-event
 * Reschedule an existing calendar event
 */
app.post('/api/calendar/reschedule-event', calendarLimiter, async (req, res) => {
  try {
    const { userId, eventId, customerEmail, newStartTime, provider = 'google' } = req.body;

    if (!userId || !newStartTime) {
      return res.status(400).json({ error: 'Missing required fields: userId, newStartTime' });
    }

    const widgetConfig = await fetchWidgetConfig(String(userId));
    const canBookAppointments = widgetConfig?.capabilities?.canBookAppointments !== false;
    if (!canBookAppointments) {
      return res.status(403).json({ error: 'Booking is not enabled for this widget.' });
    }

    const connection = await getCalendarConnection(userId, provider);

    if (!connection) {
      return res.status(400).json({
        error: 'No calendar connected. Please connect your calendar first.'
      });
    }

    if (provider === 'google') {
      const calendar = google.calendar({ version: 'v3' });
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: connection.access_token });

      let targetEventId = eventId;

      // Find event by email if no ID provided
      if (!targetEventId && customerEmail) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const events = await calendar.events.list({
          auth,
          calendarId: connection.calendar_id || 'primary',
          timeMin: thirtyDaysAgo.toISOString(),
          q: customerEmail,
          singleEvents: true
        });

        const matchingEvent = events.data.items?.find(e =>
          e.attendees?.some(a => a.email === customerEmail)
        );

        if (matchingEvent) {
          targetEventId = matchingEvent.id;
        }
      }

      if (!targetEventId) {
        return res.status(404).json({ error: 'No matching appointment found' });
      }

      // Get original event to preserve duration
      const originalEvent = await calendar.events.get({
        auth,
        calendarId: connection.calendar_id || 'primary',
        eventId: targetEventId
      });

      const originalStart = new Date(originalEvent.data.start.dateTime);
      const originalEnd = new Date(originalEvent.data.end.dateTime);
      const duration = originalEnd.getTime() - originalStart.getTime();

      const newStart = new Date(newStartTime);
      const newEnd = new Date(newStart.getTime() + duration);

      // Update the event
      await calendar.events.patch({
        auth,
        calendarId: connection.calendar_id || 'primary',
        eventId: targetEventId,
        requestBody: {
          start: { dateTime: newStart.toISOString(), timeZone: 'America/New_York' },
          end: { dateTime: newEnd.toISOString(), timeZone: 'America/New_York' }
        }
      });

      res.json({ success: true, message: 'Appointment rescheduled successfully' });
    } else {
      res.status(400).json({ error: `Provider '${provider}' not yet supported` });
    }

  } catch (error) {
    console.error('[API] Reschedule event error:', error);
    res.status(500).json({
      error: error.message || 'Failed to reschedule appointment'
    });
  }
});

// =====================
// Persistent Memory / Learning Endpoints
// =====================

/**
 * POST /api/memory/recall
 * Retrieves relevant memories for context augmentation
 */
app.post('/api/memory/recall', async (req, res) => {
  try {
    const { userId, query, sessionId, limit = 4 } = req.body;

    if (!userId || !query) {
      return res.status(400).json({ error: 'Missing userId or query' });
    }

    // 1. Generate Embedding for the query
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(query);
    const embedding = result.embedding.values;

    // 2. Search matches via RPC
    const { data: globalMemories, error: error1 } = await supabaseAdmin.rpc('match_memories', {
      query_embedding: embedding,
      match_threshold: 0.65,
      match_count: limit,
      p_user_id: userId
    });

    if (error1) throw error1;

    // Filter logic:
    // If it's a global memory (no session_id), include it.
    // If it's a session memory, only include if session_id matches.
    const relevantMemories = (globalMemories || []).filter(m => {
      const scope = m.metadata?.scope || 'global';
      const mSessionId = m.metadata?.session_id;

      if (scope === 'global') return true;
      if (mSessionId === sessionId) return true;
      return false;
    });

    res.json({ memories: relevantMemories });

  } catch (error) {
    console.error('[Memory] Recall Error:', error);
    res.status(500).json({ error: 'Failed to recall memories' });
  }
});

/**
 * POST /api/memory/memorize
 * Stores a new memory fact
 */
app.post('/api/memory/memorize', async (req, res) => {
  try {
    const { userId, text, sessionId, scope = 'session' } = req.body;

    if (!userId || !text) {
      return res.status(400).json({ error: 'Missing userId or text' });
    }

    // 1. Generate Embedding
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    const embedding = result.embedding.values;

    // 2. Insert Memory
    const { error } = await supabaseAdmin.from('memories').insert({
      user_id: userId,
      content: text,
      embedding: embedding,
      metadata: {
        scope: scope, // 'session' or 'global'
        session_id: sessionId,
        source: 'conversation'
      }
    });

    if (error) throw error;

    res.json({ success: true });

  } catch (error) {
    console.error('[Memory] Memorize Error:', JSON.stringify(error, null, 2));
    res.status(500).json({ error: 'Failed to memorize', details: error.message });
  }
});

// =====================
// Business Decision Layer (BDL) Endpoints
// =====================

/**
 * GET /api/bdl/memory/:userId
 * Retrieves the compiled business memory snapshot for a tenant
 */
app.get('/api/bdl/memory/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const { data, error } = await supabaseAdmin
      .from('business_memory')
      .select('*')
      .eq('tenant_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json({ memory: data || null });
  } catch (error) {
    console.error('[BDL] Memory fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch business memory' });
  }
});

/**
 * POST /api/bdl/memory
 * Upserts the compiled business memory snapshot for a tenant
 */
app.post('/api/bdl/memory', async (req, res) => {
  try {
    const { tenantId, version, compiledAt, bmsText, sourceHash } = req.body || {};

    if (!tenantId || !bmsText || !sourceHash) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { error } = await supabaseAdmin
      .from('business_memory')
      .upsert({
        tenant_id: tenantId,
        version: version || 1,
        compiled_at: compiledAt || new Date().toISOString(),
        bms_text: bmsText,
        source_hash: sourceHash,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id' });

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('[BDL] Memory upsert error:', error);
    res.status(500).json({ error: 'Failed to save business memory' });
  }
});

/**
 * GET /api/bdl/faq/:userId
 * Retrieves tenant FAQ memory entries
 */
app.get('/api/bdl/faq/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Number(req.query.limit || 50);

    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const { data, error } = await supabaseAdmin
      .from('tenant_faq')
      .select('*')
      .eq('tenant_id', userId)
      .order('usage_count', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ faq: data || [] });
  } catch (error) {
    console.error('[BDL] FAQ fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch tenant FAQ' });
  }
});

/**
 * POST /api/bdl/faq
 * Inserts a new tenant FAQ entry
 */
app.post('/api/bdl/faq', async (req, res) => {
  try {
    const { tenantId, question, answer, source, createdAt } = req.body || {};

    if (!tenantId || !question || !answer || !source) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { error } = await supabaseAdmin
      .from('tenant_faq')
      .insert({
        tenant_id: tenantId,
        question,
        answer,
        source,
        created_at: createdAt || new Date().toISOString()
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('[BDL] FAQ insert error:', error);
    res.status(500).json({ error: 'Failed to save tenant FAQ' });
  }
});

/**
 * POST /api/bdl/events
 * Persists a BDL event for skill orchestration
 */
app.post('/api/bdl/events', async (req, res) => {
  try {
    const { tenantId, type, occurredAt, payload, source } = req.body || {};

    if (!tenantId || !type || !payload || !source) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { error } = await supabaseAdmin
      .from('bdl_events')
      .insert({
        tenant_id: tenantId,
        type,
        occurred_at: occurredAt || new Date().toISOString(),
        payload,
        source
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('[BDL] Event insert error:', error);
    res.status(500).json({ error: 'Failed to persist event' });
  }
});

/**
 * GET /api/bdl/skills/:userId
 * Retrieves skill subscriptions for a tenant
 */
app.get('/api/bdl/skills/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const { data, error } = await supabaseAdmin
      .from('skill_subscriptions')
      .select('skill_id, status')
      .eq('tenant_id', userId);

    if (error) throw error;
    res.json({ skills: data || [] });
  } catch (error) {
    console.error('[BDL] Skill fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch skill subscriptions' });
  }
});

/**
 * POST /api/bdl/skills
 * Upserts a skill subscription
 */
app.post('/api/bdl/skills', async (req, res) => {
  try {
    const { tenantId, skillId, status, config } = req.body || {};

    if (!tenantId || !skillId || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { error } = await supabaseAdmin
      .from('skill_subscriptions')
      .upsert({
        tenant_id: tenantId,
        skill_id: skillId,
        status,
        config: config || {},
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,skill_id' });

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('[BDL] Skill upsert error:', error);
    res.status(500).json({ error: 'Failed to save skill subscription' });
  }
});


// Handle SPA routing: return index.html for all non-file requests
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      // If dist/index.html doesn't exist, serve root index.html
      res.sendFile(path.join(servePath, 'index.html'));
    }
  });
});

// =====================
// Follow-Up Email Processor (Cron)
// =====================
const processScheduledFollowUps = async () => {
  try {
    const nowIso = new Date().toISOString();
    const { data: sessions, error } = await supabaseAdmin
      .from('chat_sessions')
      .select('id, user_id, customer_name, customer_email, summary, triage, followup_recipients, followup_status, followup_scheduled_at')
      .eq('followup_status', 'scheduled')
      .lte('followup_scheduled_at', nowIso)
      .limit(50);

    if (error) throw error;
    if (!sessions || sessions.length === 0) return;

    for (const session of sessions) {
      try {
        const userId = session.user_id;
        const { data: settings } = await supabaseAdmin
          .from('settings')
          .select('tenant_config, widget_config')
          .eq('user_id', userId)
          .maybeSingle();

        const followUp = {
          ...FOLLOWUP_DEFAULTS,
          ...(settings?.widget_config?.followUp || {})
        };

        if (!followUp.enabled) {
          await supabaseAdmin
            .from('chat_sessions')
            .update({ followup_status: 'skipped' })
            .eq('id', session.id);
          continue;
        }

        const recipients = Array.isArray(session.followup_recipients)
          ? session.followup_recipients
          : safeJsonParse(session.followup_recipients, []);

        const triage = session.triage || {};
        const summary = triage.summary || session.summary;
        const nextAction = triage.nextAction;
        const priority = triage.priority;
        const intent = triage.intent;

        const companyName = settings?.tenant_config?.companyName || 'Your Team';
        const companyUrl = settings?.tenant_config?.companyUrl || '';

        const customerEmail = session.customer_email ? String(session.customer_email).toLowerCase() : '';
        const customerName = session.customer_name || 'Visitor';

        const templateVars = {
          customer_name: customerName || 'Customer',
          customer_email: customerEmail || '',
          company_name: companyName,
          company_url: companyUrl,
          summary: summary || '',
          next_action: nextAction || '',
          priority: priority || '',
          intent: intent || ''
        };

        const replyTo = followUp.replyToEmail || undefined;

        if (recipients.includes('customer') && customerEmail) {
          const subject = renderTemplate(followUp.customerSubject || '', templateVars) || `Thanks for chatting with ${companyName}`;
          const bodyText = renderTemplate(followUp.customerBody || '', templateVars);
          await emailService.sendFollowUpToCustomer(customerEmail, customerName, {
            subject,
            bodyText,
            companyName,
            replyTo
          });
        }

        if (recipients.includes('owner')) {
          const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(userId);
          const ownerEmail = ownerData?.user?.email;
          if (ownerEmail) {
            const subject = renderTemplate(followUp.ownerSubject || '', templateVars) || `Follow-up needed: ${customerName || 'New chat'}`;
            const bodyText = renderTemplate(followUp.ownerBody || '', templateVars);
            await emailService.sendFollowUpToOwner(ownerEmail, {
              customerName,
              subject,
              bodyText,
              companyName,
              replyTo
            });
          }
        }

        const sentAt = new Date().toISOString();
        await supabaseAdmin
          .from('chat_sessions')
          .update({ followup_status: 'sent', followup_sent_at: sentAt })
          .eq('id', session.id);

        if (customerEmail) {
          await supabaseAdmin
            .from('leads')
            .update({ followup_status: 'sent', followup_sent_at: sentAt })
            .eq('user_id', userId)
            .eq('email', customerEmail);
        }
      } catch (innerErr) {
        console.error('[Cron] Follow-up send error:', innerErr);
      }
    }
  } catch (err) {
    console.error('[Cron] Follow-up processor failed:', err);
  }
};

// Run every 2 minutes
cron.schedule('*/5 * * * *', async () => {
  await processScheduledFollowUps();
});

// =====================
// BDL Event + Job Processor (v0.2)
// =====================
const BDL_DEFAULT_ON_SKILLS = new Set(['appointment-reminders', 'daily-admin-report']);

const isSkillActive = async (tenantId, skillId) => {
  const { data, error } = await supabaseAdmin
    .from('skill_subscriptions')
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('skill_id', skillId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[BDL] Skill lookup error:', error);
    return false;
  }

  if (!data) return BDL_DEFAULT_ON_SKILLS.has(skillId);
  return data.status === 'active';
};

const enqueueBdlJob = async (tenantId, type, executeAt, payload, idempotencyKey) => {
  const { error } = await supabaseAdmin
    .from('bdl_jobs')
    .insert({
      tenant_id: tenantId,
      type,
      execute_at: executeAt,
      status: 'queued',
      payload,
      idempotency_key: idempotencyKey
    });

  if (error && error.code !== '23505') {
    console.error('[BDL] Job enqueue error:', error);
  }
};

const processBdlEvents = async () => {
  try {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    const { data: events, error } = await supabaseAdmin
      .from('bdl_events')
      .select('id, tenant_id, type, occurred_at, payload')
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(200);

    if (error) throw error;
    if (!events || events.length === 0) return;

    for (const event of events) {
      if (event.type === 'booking.created') {
        const active = await isSkillActive(event.tenant_id, 'appointment-reminders');
        if (!active) continue;

        const startAt = event.payload?.start_at || event.payload?.startAt;
        if (!startAt) continue;

        const startTime = new Date(startAt);
        const offsets = [
          { label: '24h', ms: 24 * 60 * 60 * 1000 },
          { label: '2h', ms: 2 * 60 * 60 * 1000 }
        ];

        for (const offset of offsets) {
          const executeAt = new Date(startTime.getTime() - offset.ms).toISOString();
          if (new Date(executeAt) < new Date()) continue;

          await enqueueBdlJob(
            event.tenant_id,
            'appointment-reminder',
            executeAt,
            {
              customer: event.payload?.customer,
              service: event.payload?.service,
              location_id: event.payload?.location_id,
              start_at: startAt
            },
            `${event.id}:appointment-reminder:${offset.label}`
          );
        }
      }

      if (event.type === 'report.daily') {
        const active = await isSkillActive(event.tenant_id, 'daily-admin-report');
        if (!active) continue;

        await enqueueBdlJob(
          event.tenant_id,
          'daily-admin-report',
          event.occurred_at,
          { date: event.payload?.date || event.occurred_at },
          `${event.id}:daily-admin-report`
        );
      }
    }
  } catch (error) {
    console.error('[BDL] Event processor error:', error);
  }
};

const processBdlJobs = async () => {
  try {
    const { data: jobs, error } = await supabaseAdmin
      .from('bdl_jobs')
      .select('*')
      .eq('status', 'queued')
      .lte('execute_at', new Date().toISOString())
      .order('execute_at', { ascending: true })
      .limit(20);

    if (error) throw error;
    if (!jobs || jobs.length === 0) return;

    for (const job of jobs) {
      await supabaseAdmin
        .from('bdl_jobs')
        .update({ status: 'running' })
        .eq('id', job.id);

      try {
        if (job.type === 'appointment-reminder') {
          const customerEmail = job.payload?.customer?.email;
          if (customerEmail) {
            const customerName = job.payload?.customer?.name || 'Customer';
            await emailService.sendAppointmentReminder(customerEmail, customerName, {
              startTime: job.payload?.start_at,
              service: job.payload?.service
            });
          }
        }

        if (job.type === 'daily-admin-report') {
          const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(job.tenant_id);
          if (user?.email) {
            const since = new Date();
            since.setDate(since.getDate() - 1);

            const { count: bookingCount } = await supabaseAdmin
              .from('bookings')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', job.tenant_id)
              .gte('created_at', since.toISOString());

            const { count: leadCount } = await supabaseAdmin
              .from('leads')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', job.tenant_id)
              .gte('created_at', since.toISOString());

            const { count: chatCount } = await supabaseAdmin
              .from('chat_sessions')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', job.tenant_id)
              .gte('created_at', since.toISOString());

            await emailService.sendDailyReport(user.email, {
              bookings: bookingCount || 0,
              leads: leadCount || 0,
              chats: chatCount || 0
            });
          }
        }

        await supabaseAdmin
          .from('bdl_jobs')
          .update({ status: 'completed' })
          .eq('id', job.id);
      } catch (jobErr) {
        console.error('[BDL] Job execution error:', jobErr);
        await supabaseAdmin
          .from('bdl_jobs')
          .update({ status: 'failed' })
          .eq('id', job.id);
      }
    }
  } catch (error) {
    console.error('[BDL] Job processor error:', error);
  }
};

cron.schedule('*/2 * * * *', async () => {
  await processBdlEvents();
});

cron.schedule('* * * * *', async () => {
  await processBdlJobs();
});

// Daily report events at 7:00 AM server time
cron.schedule('0 7 * * *', async () => {
  try {
    const { data: subscriptions, error } = await supabaseAdmin
      .from('skill_subscriptions')
      .select('tenant_id, status')
      .eq('skill_id', 'daily-admin-report');

    if (error) throw error;
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('settings')
      .select('user_id');

    if (settingsError) throw settingsError;

    const statusByTenant = new Map((subscriptions || []).map(s => [s.tenant_id, s.status]));
    const activeTenantIds = new Set((subscriptions || []).filter(s => s.status === 'active').map(s => s.tenant_id));
    const allTenantIds = (settings || []).map(s => s.user_id).filter(Boolean);
    const combinedTenantIds = Array.from(new Set([...allTenantIds, ...activeTenantIds]));

    if (combinedTenantIds.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    for (const tenantId of combinedTenantIds) {
      const status = statusByTenant.get(tenantId);
      const shouldSend = status === 'active' || (status === undefined && BDL_DEFAULT_ON_SKILLS.has('daily-admin-report'));
      if (!shouldSend) continue;

      await supabaseAdmin.from('bdl_events').insert({
        tenant_id: tenantId,
        type: 'report.daily',
        occurred_at: new Date().toISOString(),
        payload: { date: today },
        source: 'system'
      });
    }
  } catch (error) {
    console.error('[BDL] Daily report scheduler error:', error);
  }
});

// =====================
// Follow-Up Test Email (Authenticated)
// =====================
app.post('/api/followup/test', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const bodyUserId = sanitizeInput(req.body.userId);
    const toEmail = sanitizeInput(req.body.toEmail || user.email);
    const mode = sanitizeInput(req.body.mode);
    const subject = sanitizeInput(req.body.subject);
    const body = sanitizeInput(req.body.body);
    const templateVars = sanitizeObject(req.body.templateVars || {});

    const userId = user.id;
    if (bodyUserId && bodyUserId !== userId) {
      console.warn('[API] Follow-up test user mismatch:', bodyUserId, userId);
    }
    if (!toEmail) {
      return res.status(400).json({ error: 'Missing toEmail' });
    }
    if (mode !== 'customer' && mode !== 'owner') {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('tenant_config, widget_config')
      .eq('user_id', userId)
      .maybeSingle();

    const followUp = {
      ...FOLLOWUP_DEFAULTS,
      ...(settings?.widget_config?.followUp || {})
    };

    const companyName = settings?.tenant_config?.companyName || 'Your Team';
    const companyUrl = settings?.tenant_config?.companyUrl || '';

    const vars = {
      customer_name: templateVars.customer_name || 'Alex',
      customer_email: templateVars.customer_email || 'alex@example.com',
      company_name: companyName,
      company_url: companyUrl,
      summary: templateVars.summary || 'Asked about pricing and next available appointment.',
      next_action: templateVars.next_action || 'Suggested: book a consultation this week.',
      priority: templateVars.priority || 'Warm',
      intent: templateVars.intent || 'Pricing + booking'
    };

    const renderedSubject = renderTemplate(subject || (mode === 'customer' ? followUp.customerSubject : followUp.ownerSubject), vars);
    const renderedBody = renderTemplate(body || (mode === 'customer' ? followUp.customerBody : followUp.ownerBody), vars);

    const replyTo = followUp.replyToEmail || undefined;

    if (mode === 'customer') {
      await emailService.sendFollowUpToCustomer(toEmail, vars.customer_name, {
        subject: renderedSubject,
        bodyText: renderedBody,
        companyName,
        replyTo
      });
    } else {
      await emailService.sendFollowUpToOwner(toEmail, {
        customerName: vars.customer_name,
        subject: renderedSubject,
        bodyText: renderedBody,
        companyName,
        replyTo
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Follow-up test error:', error);
    res.status(500).json({ error: error.message || 'Failed to send test email' });
  }
});

// =====================
// Weekly Analytics Report (Cron Job)
// =====================
// Runs every Monday at 9:00 AM
cron.schedule('0 9 * * 1', async () => {
  console.log('[Cron] Starting weekly reports...');
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // 1. Find users who had bookings in the last week
    // Note: returning duplicate user_ids is fine, we'll dedupe in JS
    const { data: activeUsers, error } = await supabaseAdmin
      .from('bookings')
      .select('user_id')
      .gte('created_at', oneWeekAgo.toISOString());

    if (error) throw error;

    const uniqueUserIds = [...new Set(activeUsers.map(u => u.user_id))];
    console.log(`[Cron] Found ${uniqueUserIds.length} active users for reports.`);

    for (const userId of uniqueUserIds) {
      try {
        // 2. Get User Email
        const { data: { user }, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (userErr || !user?.email) continue;

        // 3. Get Stats
        const { count: bookingCount } = await supabaseAdmin
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', oneWeekAgo.toISOString());

        // (Optional) Get Leads count if you have a leads table
        const { count: leadCount } = await supabaseAdmin
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', oneWeekAgo.toISOString());

        // 4. Send Email
        if (bookingCount > 0 || leadCount > 0) {
          await emailService.sendWeeklyReport(user.email, {
            bookings: bookingCount || 0,
            leads: leadCount || 0
          });
        }
      } catch (innerErr) {
        console.error(`[Cron] Failed report for user ${userId}:`, innerErr);
      }
    }
  } catch (err) {
    console.error('[Cron] Weekly report job failed:', err);
  }
});

// Sentry Error Handler
Sentry.setupExpressErrorHandler(app);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Chippy SaaS App running on port ${PORT}`);
});
