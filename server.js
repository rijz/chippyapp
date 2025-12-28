import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

// Initialize Supabase Admin (Service Role)
import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
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

// Regular JSON body for other routes
app.use(express.json());

// Serve static files from 'dist' if it exists (standard build)
// Fallback to serving the root directory (for runtime-transpilation environments)
const distPath = path.join(__dirname, 'dist');
const servePath = path.join(__dirname);

app.use(express.static(distPath));
app.use(express.static(servePath));

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
app.all('/api-proxy/*', async (req, res) => {
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
