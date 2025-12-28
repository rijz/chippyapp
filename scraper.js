import puppeteer from 'puppeteer';

/**
 * Scrapes a website and extracts text content from key pages.
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

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const results = [];

    // Key pages to check (including location-related pages for local businesses)
    const pathsToTry = [
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
        // Location-related pages for local businesses
        '/locations',
        '/find-us',
        '/stores',
        '/branches',
        '/clinics',
        '/offices',
        '/our-locations',
        '/store-locator'
    ];

    for (const path of pathsToTry) {
        const fullUrl = new URL(path, baseUrl).href;
        try {
            console.log(`[Scraper] Fetching: ${fullUrl}`);
            const response = await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // Skip if 404 or other error
            if (!response || response.status() >= 400) {
                console.log(`[Scraper] Skipping ${fullUrl} (status: ${response?.status()})`);
                continue;
            }

            // Extract page title
            const title = await page.title();

            // Extract main text content (excluding scripts, styles, nav, footer)
            const text = await page.evaluate(() => {
                // Remove non-content elements
                const removeSelectors = ['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript', 'iframe'];
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

            if (text.length > 100) { // Only include pages with meaningful content
                results.push({
                    url: fullUrl,
                    title: title,
                    text: text
                });
                console.log(`[Scraper] Captured ${text.length} chars from ${fullUrl}`);
            }
        } catch (error) {
            console.log(`[Scraper] Error fetching ${fullUrl}: ${error.message}`);
        }
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
