// api/scan.js
// CommonJS Compatible for Vercel + node-fetch v2
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // ==== CORS Headers ====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==== Input Validation ====
  const inputUrl = (req.body && req.body.url) || req.query.url;
  if (!inputUrl) {
    return sendJSON(res, 400, {
      success: false,
      error: 'url_required',
      message: 'Please provide a website URL (http or https)',
    });
  }

  // Normalize URL
  let cleanUrl = inputUrl.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = `https://${cleanUrl}`;
  }

  console.log(`[SCAN] Starting scan for: ${cleanUrl}`);

  try {
    const issues = await performQuickScan(cleanUrl);

    return sendJSON(res, 200, {
      success: true,
      url: cleanUrl,
      timestamp: new Date().toISOString(),
      totalIssues: issues.length,
      issues: issues.slice(0, 5), // Top 5 issues
      summary: {
        high: issues.filter(i => i.priority === 'high').length,
        medium: issues.filter(i => i.priority === 'medium').length,
        low: issues.filter(i => i.priority === 'low').length,
      },
    });

  } catch (err) {
    console.error(`[SCAN ERROR] ${cleanUrl}:`, err);

    return sendJSON(res, 500, {
      success: false,
      error: 'scan_failed',
      message: 'Failed to complete website scan',
      details: err.message || 'Unknown error',
    });
  }
};


/**
 * Perform a lightweight HTML accessibility scan
 */
async function performQuickScan(url) {
  const issues = [];

  try {
    // Timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ShieldSite/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      size: 2_000_000 // Limit download to ~2MB
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // --- Accessibility checks ---
    // 1. Images without alt
    const imgTags = html.match(/<img[^>]*>/gi) || [];
    let imagesWithoutAlt = 0;
    imgTags.forEach(img => {
      if (!/alt=/i.test(img) || /alt\s*=\s*(""\s*|'')/i.test(img)) {
        imagesWithoutAlt++;
      }
    });
    if (imagesWithoutAlt > 0) {
      issues.push({
        code: 'image-alt',
        type: 'error',
        priority: 'high',
        message: `Found ${imagesWithoutAlt} images missing alt text`,
        context: '<img> without meaningful alt',
        selector: 'img[alt=""], img:not([alt])'
      });
    }

    // 2. H1 existence
    const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
    if (h1Count === 0) {
      issues.push({
        code: 'page-has-heading-one',
        type: 'error',
        priority: 'high',
        message: 'Page missing main H1 heading',
        context: 'Every page should have exactly one H1 heading',
        selector: 'h1'
      });
    } else if (h1Count > 1) {
      issues.push({
        code: 'heading-order',
        type: 'warning',
        priority: 'medium',
        message: `Found ${h1Count} H1 headings — should be only one`,
        context: 'Multiple H1 elements may confuse users',
        selector: 'h1'
      });
    }

    // 3. Empty links
    const emptyLinks = (html.match(/<a[^>]*href[^>]*>\s*<\/a>/gi) || []).length;
    if (emptyLinks > 0) {
      issues.push({
        code: 'link-name',
        type: 'error',
        priority: 'high',
        message: `Found ${emptyLinks} links with no visible text`,
        context: 'Links must have descriptive text or aria-label',
        selector: 'a[href]:empty'
      });
    }

    // 4. Label check for inputs
    const inputs = (html.match(/<input[^>]*>/gi) || []).length;
    const labels = (html.match(/<label[^>]*>/gi) || []).length;
    if (inputs > labels && inputs > 0) {
      issues.push({
        code: 'label',
        type: 'error',
        priority: 'medium',
        message: `${inputs - labels} input fields may be missing labels`,
        context: 'Form inputs should have associated labels',
        selector: 'input:not([aria-label])'
      });
    }

    // 5. Title tag
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (!titleMatch || titleMatch[1].trim().length === 0) {
      issues.push({
        code: 'document-title',
        type: 'error',
        priority: 'high',
        message: 'Page is missing or has empty <title>',
        context: 'Page title is essential for accessibility & SEO',
        selector: 'title'
      });
    }

    // If no issues found
    if (issues.length === 0) {
      issues.push({
        code: 'manual-review',
        type: 'notice',
        priority: 'low',
        message: 'Basic scan completed — manual review recommended',
        context: 'Some issues require manual testing',
        selector: 'body'
      });
    }

    return issues;

  } catch (err) {
    console.error('[performQuickScan] Error:', err.message);
    return [{
      code: 'scan-error',
      type: 'warning',
      priority: 'medium',
      message: `Unable to scan: ${err.message}`,
      context: 'Site may be down or blocking requests',
      selector: 'body'
    }];
  }
}

/**
 * Helper: Ensures JSON response formatting
 */
function sendJSON(res, status, obj) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}
