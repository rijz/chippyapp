import puppeteer from 'puppeteer';

/**
 * Scrapes a website and extracts text content from key pages.
 * Features: retry logic, sitemap parsing, parallel fetching, improved JS rendering.
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

    // Key paths to check (including location-related pages for local businesses)
    const defaultPaths = [
        '', // Homepage
        '/pricing',
        '/plans',
        '/services',
        '/about',
        '/about-us',
        '/contact',
        '/contact-us',
        '/faq',
        '/terms',
        '/cancellation-policy',
        '/locations',
        '/find-us',
        '/stores',
        '/branches',
        '/clinics',
        '/offices',
        '/our-locations',
        '/store-locator'
    ];

    // Try to get additional pages from sitemap
    let sitemapUrls = [];
    try {
        sitemapUrls = await parseSitemap(baseUrl, browser);
        console.log(`[Scraper] Found ${sitemapUrls.length} URLs in sitemap`);
    } catch (err) {
        console.log(`[Scraper] No sitemap found or error parsing: ${err.message}`);
    }

    // Combine default paths with sitemap URLs, deduplicate
    const allUrls = new Set();
    defaultPaths.forEach(path => allUrls.add(new URL(path, baseUrl).href));
    sitemapUrls.forEach(url => {
        if (url.startsWith(baseUrl)) { // Only same-domain URLs
            allUrls.add(url);
        }
    });

    const urlsToScrape = Array.from(allUrls).slice(0, 30); // Limit to 30 pages max
    console.log(`[Scraper] Will process ${urlsToScrape.length} pages`);

    // Process pages in parallel batches of 3
    const BATCH_SIZE = 3;
    for (let i = 0; i < urlsToScrape.length; i += BATCH_SIZE) {
        const batch = urlsToScrape.slice(i, i + BATCH_SIZE);
        console.log(`[Scraper] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(urlsToScrape.length / BATCH_SIZE)}`);

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
 * Scrape a single page with retry logic and exponential backoff
 */
async function scrapePageWithRetry(browser, fullUrl, visitedUrls, maxRetries = 3) {
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

            // Use networkidle2 for better JS rendering, with fallback timeout
            const response = await page.goto(fullUrl, {
                waitUntil: 'networkidle2',
                timeout: 20000
            });

            // Skip if 404 or other error
            if (!response || response.status() >= 400) {
                console.log(`[Scraper] Skipping ${fullUrl} (status: ${response?.status()})`);
                await page.close();
                return null;
            }

            // Wait a bit more for dynamic content
            await page.waitForTimeout(500);

            // Extract page title
            const title = await page.title();

            // Extract main text content (excluding scripts, styles, nav, footer)
            const text = await page.evaluate(() => {
                // Remove non-content elements
                const removeSelectors = ['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript', 'iframe', '.cookie-banner', '#cookie-notice', '[role="navigation"]'];
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

            await page.close();

            if (text.length > 100) { // Only include pages with meaningful content
                console.log(`[Scraper] Captured ${text.length} chars from ${fullUrl}`);
                return {
                    url: fullUrl,
                    title: title,
                    text: text
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
