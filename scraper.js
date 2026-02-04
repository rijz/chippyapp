import puppeteer from 'puppeteer';

/**
 * Scrapes a website and extracts text content from key pages.
 * Features: retry logic, parallel fetching, improved JS rendering.
 * OPTIMIZED: Reduced pages and timeouts for faster initial scans.
 * @param {string} baseUrl - The root URL of the website.
 * @returns {Promise<{pages: {url: string, title: string, text: string}[], combinedText: string}>}
 */
export async function scrapeWebsite(baseUrl) {
    console.log(`[Scraper] Starting scrape for: ${baseUrl}`);

    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const results = [];
    const visitedUrls = new Set();

    // OPTIMIZED: Focus on essential pages only for faster scans
    // These are the most important pages for understanding a business
    const essentialPaths = [
        '', // Homepage (most important)
        '/pricing',
        '/services',
        '/about',
        '/contact',
        '/faq',
    ];

    // Additional paths to try if we have time (will be limited)
    const secondaryPaths = [
        '/plans',
        '/about-us',
        '/contact-us',
        '/locations',
        '/terms',
        '/cancellation-policy',
    ];

    // Combine paths, prioritizing essential ones
    const allPaths = [...essentialPaths, ...secondaryPaths];

    // Build initial URL list
    const urlsToScrape = allPaths.map(path => {
        try {
            return new URL(path, baseUrl).href;
        } catch {
            return null;
        }
    }).filter(Boolean);

    // Try sitemap for additional important URLs
    try {
        const sitemapUrls = await parseSitemap(baseUrl, browser);
        sitemapUrls.forEach(u => urlsToScrape.push(u));
    } catch (e) {
        console.log('[Scraper] Sitemap not available or failed to parse');
    }

    // Try to discover key links from homepage (services, pricing, booking, etc.)
    try {
        const homeLinks = await extractKeyLinksFromHomepage(baseUrl, browser);
        homeLinks.forEach(u => urlsToScrape.push(u));
    } catch (e) {
        console.log('[Scraper] Homepage link discovery failed');
    }

    // Deduplicate and cap to keep scans fast
    const uniqueUrls = Array.from(new Set(urlsToScrape)).slice(0, 14);

    console.log(`[Scraper] Will process ${uniqueUrls.length} pages (optimized for speed)`);

    // Process pages in parallel batches of 4 (was 3)
    const BATCH_SIZE = 4;
    for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
        const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
        console.log(`[Scraper] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uniqueUrls.length / BATCH_SIZE)}`);

        const batchResults = await Promise.allSettled(
            batch.map(url => scrapePageWithRetry(browser, url, visitedUrls))
        );

        batchResults.forEach((result, idx) => {
            if (result.status === 'fulfilled' && result.value) {
                results.push(result.value);
            } else if (result.status === 'rejected') {
                console.log(`[Scraper] Failed to scrape ${batch[idx]}: ${result.reason?.message || 'Unknown error'}`);
            }
        });
    }

    await browser.close();

    // Combine all page content
    const combinedText = results.map(r =>
        `--- PAGE: ${r.title} (${r.url}) ---\n${r.text}`
    ).join('\n\n');

    console.log(`[Scraper] Completed. Scraped ${results.length} pages, ${combinedText.length} total chars.`);

    return {
        pages: results,
        combinedText: combinedText.substring(0, 50000) // Limit total to 50k chars for Gemini
    };
}

/**
 * Parse sitemap.xml to discover additional pages
 */
async function parseSitemap(baseUrl, browser) {
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).href;
    console.log(`[Scraper] Checking sitemap: ${sitemapUrl}`);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (compatible; ChippyBot/1.0)');

    try {
        const response = await page.goto(sitemapUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

        if (!response || response.status() >= 400) {
            await page.close();
            return [];
        }

        const content = await page.content();
        await page.close();

        // Extract URLs from sitemap XML
        const urls = [];
        const locMatches = content.matchAll(/<loc>([^<]+)<\/loc>/g);
        for (const match of locMatches) {
            const url = match[1].trim();
            // Filter out media files and other non-HTML content
            if (!url.match(/\.(jpg|jpeg|png|gif|svg|pdf|zip|mp4|mp3|css|js)$/i)) {
                urls.push(url);
            }
        }

        return urls.slice(0, 20); // Limit sitemap URLs to 20
    } catch (error) {
        await page.close();
        throw error;
    }
}

/**
 * Extract key internal links from homepage (services, pricing, booking, etc.)
 */
async function extractKeyLinksFromHomepage(baseUrl, browser) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (compatible; ChippyBot/1.0)');

    try {
        const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
        if (!response || response.status() >= 400) {
            await page.close();
            return [];
        }

        const origin = new URL(baseUrl).origin;
        const keywords = [
            'services', 'service', 'pricing', 'prices', 'rates', 'menu',
            'book', 'booking', 'appointments', 'schedule', 'contact', 'about',
            'locations', 'faq', 'policies', 'terms'
        ];

        const links = await page.evaluate((origin, keywords) => {
            const anchors = Array.from(document.querySelectorAll('a'));
            const urls = anchors
                .map(a => a.getAttribute('href') || '')
                .filter(href => href && !href.startsWith('mailto:') && !href.startsWith('tel:'))
                .map(href => {
                    try { return new URL(href, origin).href; } catch { return null; }
                })
                .filter(Boolean)
                .filter(u => u.startsWith(origin));

            const keywordLinks = urls.filter(u => keywords.some(k => u.toLowerCase().includes(k)));
            return Array.from(new Set(keywordLinks));
        }, origin, keywords);

        await page.close();
        return links.slice(0, 10);
    } catch (e) {
        await page.close();
        return [];
    }
}

/**
 * Scrape a single page with retry logic and exponential backoff
 * OPTIMIZED: Reduced timeout and retries for faster scanning
 */
async function scrapePageWithRetry(browser, fullUrl, visitedUrls, maxRetries = 2) {
    // Skip if already visited
    if (visitedUrls.has(fullUrl)) {
        return null;
    }
    visitedUrls.add(fullUrl);

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        try {
            console.log(`[Scraper] Fetching: ${fullUrl}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);

            // OPTIMIZED: Reduced timeout from 20s to 12s, use domcontentloaded for speed
            const response = await page.goto(fullUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 12000
            });

            // Skip if 404 or other error
            if (!response || response.status() >= 400) {
                console.log(`[Scraper] Skipping ${fullUrl} (status: ${response?.status()})`);
                await page.close();
                return null;
            }

            // Extract page title
            const title = await page.title();

            // Extract structured data + contact info (JSON-LD, tel/mailto, meta)
            const extractedInfo = await page.evaluate(() => {
                const textOrEmpty = (value) => (typeof value === 'string' ? value.trim() : '');
                const toArray = (value) => Array.isArray(value) ? value : (value ? [value] : []);

                const safeJsonParse = (raw) => {
                    try { return JSON.parse(raw); } catch { return null; }
                };

                const jsonLd = [];
                const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
                scripts.forEach(script => {
                    const parsed = safeJsonParse(script.textContent || '');
                    if (!parsed) return;
                    if (Array.isArray(parsed)) jsonLd.push(...parsed);
                    else if (parsed['@graph'] && Array.isArray(parsed['@graph'])) jsonLd.push(...parsed['@graph']);
                    else jsonLd.push(parsed);
                });

                const orgTypes = new Set([
                    'Organization', 'LocalBusiness', 'MedicalBusiness', 'ProfessionalService',
                    'Restaurant', 'Store', 'RealEstateAgent', 'Dentist', 'Physician',
                    'BeautySalon', 'Plumber', 'Electrician', 'AutoRepair', 'InsuranceAgency'
                ]);

                const structured = [];
                jsonLd.forEach(entry => {
                    const types = toArray(entry['@type']);
                    const isOrg = types.some(t => orgTypes.has(t));
                    if (!isOrg) return;

                    const name = textOrEmpty(entry.name);
                    const telephone = textOrEmpty(entry.telephone);
                    const email = textOrEmpty(entry.email);
                    const url = textOrEmpty(entry.url);
                    const priceRange = textOrEmpty(entry.priceRange);
                    const openingHours = toArray(entry.openingHours).join(', ');

                    let address = '';
                    if (entry.address) {
                        const addr = entry.address;
                        const parts = [
                            addr.streetAddress,
                            addr.addressLocality,
                            addr.addressRegion,
                            addr.postalCode
                        ].filter(Boolean);
                        address = parts.join(', ');
                    }

                    structured.push({
                        name, telephone, email, url, priceRange, openingHours, address
                    });
                });

                const phones = Array.from(document.querySelectorAll('a[href^="tel:"]'))
                    .map(a => (a.getAttribute('href') || '').replace('tel:', '').trim())
                    .filter(Boolean);

                const emails = Array.from(document.querySelectorAll('a[href^="mailto:"]'))
                    .map(a => (a.getAttribute('href') || '').replace('mailto:', '').trim())
                    .filter(Boolean);

                const metaDesc = textOrEmpty(document.querySelector('meta[name="description"]')?.getAttribute('content'))
                    || textOrEmpty(document.querySelector('meta[property="og:description"]')?.getAttribute('content'));

                const siteName = textOrEmpty(document.querySelector('meta[property="og:site_name"]')?.getAttribute('content'))
                    || textOrEmpty(document.querySelector('meta[name="application-name"]')?.getAttribute('content'));

                const h1 = textOrEmpty(document.querySelector('h1')?.innerText);

                return { structured, phones, emails, metaDesc, siteName, h1 };
            });

            // Extract main text content (excluding scripts, styles, nav)
            const text = await page.evaluate(() => {
                // Remove non-content elements
                const removeSelectors = ['script', 'style', 'nav', 'header', 'aside', 'noscript', 'iframe', '.cookie-banner', '#cookie-notice', '[role="navigation"]'];
                removeSelectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => el.remove());
                });

                // Get visible text
                const body = document.body;
                if (!body) return '';

                // Clean up whitespace
                return body.innerText
                    .replace(/\s+/g, ' ')
                    .replace(/\n\s*\n/g, '\n')
                    .trim()
                    .substring(0, 15000); // Limit per page
            });

            // If very little text, wait briefly for client-side render and retry
            let finalText = text;
            if (finalText.length < 200) {
                await page.waitForTimeout(1500);
                finalText = await page.evaluate(() => {
                    const body = document.body;
                    if (!body) return '';
                    return body.innerText
                        .replace(/\s+/g, ' ')
                        .replace(/\n\s*\n/g, '\n')
                        .trim()
                        .substring(0, 15000);
                });
            }

            await page.close();

            // Append extracted structured info for better business context
            const extraLines = [];
            if (extractedInfo?.siteName) extraLines.push(`Site Name: ${extractedInfo.siteName}`);
            if (extractedInfo?.h1) extraLines.push(`Page Heading: ${extractedInfo.h1}`);
            if (extractedInfo?.metaDesc) extraLines.push(`Meta Description: ${extractedInfo.metaDesc}`);
            if (extractedInfo?.phones?.length) extraLines.push(`Phones: ${Array.from(new Set(extractedInfo.phones)).join(', ')}`);
            if (extractedInfo?.emails?.length) extraLines.push(`Emails: ${Array.from(new Set(extractedInfo.emails)).join(', ')}`);

            if (extractedInfo?.structured?.length) {
                const structuredSummaries = extractedInfo.structured.map(s => {
                    const bits = [];
                    if (s.name) bits.push(`Name: ${s.name}`);
                    if (s.telephone) bits.push(`Phone: ${s.telephone}`);
                    if (s.email) bits.push(`Email: ${s.email}`);
                    if (s.url) bits.push(`URL: ${s.url}`);
                    if (s.address) bits.push(`Address: ${s.address}`);
                    if (s.openingHours) bits.push(`Hours: ${s.openingHours}`);
                    if (s.priceRange) bits.push(`Price Range: ${s.priceRange}`);
                    return bits.join(' | ');
                }).filter(Boolean);

                if (structuredSummaries.length) {
                    extraLines.push(`Structured Data: ${structuredSummaries.join(' || ')}`);
                }
            }

            if (extraLines.length) {
                const extraText = `\\n\\n--- Extracted Info ---\\n${extraLines.join('\\n')}`.substring(0, 2000);
                finalText = `${finalText}${extraText}`;
            }

            if (finalText.length > 100) { // Only include pages with meaningful content
                console.log(`[Scraper] Captured ${finalText.length} chars from ${fullUrl}`);
                return {
                    url: fullUrl,
                    title: title,
                    text: finalText
                };
            }

            return null;

        } catch (error) {
            lastError = error;
            await page.close();

            if (attempt < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s
                const backoffMs = Math.pow(2, attempt - 1) * 1000;
                console.log(`[Scraper] Retry ${attempt}/${maxRetries} for ${fullUrl} in ${backoffMs}ms`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }
    }

    console.log(`[Scraper] Error fetching ${fullUrl} after ${maxRetries} attempts: ${lastError?.message}`);
    return null;
}
