import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
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
  max: 100, // 100 requests per minute per IP
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
  max: 30, // 30 AI requests per minute per IP
  message: { error: 'Chat limit reached. Please wait a moment.' },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
});

// Calendar endpoint limiter
const calendarLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 calendar requests per minute
  message: { error: 'Too many calendar requests. Please wait.' },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
});

// Widget config limiter (semi-public endpoint)
const widgetConfigLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute (generous for widget loading)
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

    if (userId) {
      // Fetch user's allowed embed domains from settings
      const { data: settings } = await supabaseAdmin
        .from('settings')
        .select('allowed_embed_domains, tenant_config')
        .eq('user_id', userId)
        .maybeSingle();

      // Get allowed domains - fallback to tenant's website URL, then allow all
      let allowedDomains = settings?.allowed_embed_domains || [];

      // If no explicit domains, try to get from tenant config's website
      if (allowedDomains.length === 0 && settings?.tenant_config?.companyUrl) {
        try {
          const url = new URL(settings.tenant_config.companyUrl);
          allowedDomains = [url.origin];
        } catch (e) {
          // Invalid URL, skip
        }
      }

      // Also fetch from knowledge base if still empty
      if (allowedDomains.length === 0) {
        const { data: knowledge } = await supabaseAdmin
          .from('knowledge_bases')
          .select('content')
          .eq('user_id', userId)
          .maybeSingle();

        if (knowledge?.content?.website) {
          try {
            const url = new URL(knowledge.content.website);
            allowedDomains = [url.origin];
          } catch (e) {
            // Invalid URL, skip
          }
        }
      }

      // Set CSP header if we have allowed domains
      if (allowedDomains.length > 0) {
        // Always include 'self' for preview in dashboard
        const frameAncestors = ["'self'", ...allowedDomains].join(' ');
        res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors}`);
      }
      // If no domains configured, don't set CSP (allow all - for initial setup)
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

// Update allowed embed domains
app.put('/api/embed-domains/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { domains } = req.body;

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
app.all('/api-proxy/*', geminiProxyLimiter, async (req, res) => {
  try {
    const geminiPath = req.params[0]; // e.g., "v1beta/models/gemini-2.0-flash:generateContent"
    const geminiUrl = `https://generativelanguage.googleapis.com/${geminiPath}?key=${process.env.VITE_GEMINI_API_KEY}`;

    console.log(`[API Proxy] Forwarding to: ${geminiPath}`);

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

// =====================
// Web Scraper + Gemini Analysis Endpoint
// =====================
import { scrapeWebsite } from './scraper.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY || '');

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
  "services": ["Specific Service 1", "Specific Service 2", "...list all found services/products"],
  "businessHours": "Operating hours if found (or 'Not specified')",
  "contactInfo": "Email, address, other contact methods (or 'Not specified')",
  "pricing": "Extract ALL pricing information found: plan names, prices (monthly/yearly), features. Format nicely. If none found, say 'No pricing information found.'",
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

IMPORTANT: 
- For pricing, look for "$" amounts, plan tiers (Basic, Pro, Enterprise), monthly/yearly options.
- Be thorough with services - list every distinct offering.
- For LOCATIONS: Look for physical addresses, storefronts, clinics, offices, or branches. This is critical for local businesses where customers need to find the nearest location for booking. If no locations found, return an empty array [].
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
      provider = 'google'
    } = req.body;

    if (!userId || !summary || !startTime || !endTime) {
      return res.status(400).json({
        error: 'Missing required fields: userId, summary, startTime, endTime'
      });
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
          attendees,
          timezone
        }
      );

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Chippy SaaS App running on port ${PORT}`);
});
