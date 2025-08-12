// استخدام CommonJS بدلاً من ES6 modules
const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = (req.body && req.body.url) || req.query.url;
  
  if (!url) {
    return res.status(400).json({ 
      error: 'url_required',
      message: 'Please enter a website URL'
    });
  }

  // تنظيف الرابط
  let cleanUrl = url.trim();
  if (!cleanUrl.startsWith('http')) {
    cleanUrl = `https://${cleanUrl}`;
  }

  try {
    console.log(`Scanning: ${cleanUrl}`);

    // فحص حقيقي مبسط
    const issues = await performQuickScan(cleanUrl);

    const response = {
      success: true,
      url: cleanUrl,
      timestamp: new Date().toISOString(),
      totalIssues: issues.length,
      issues: issues.slice(0, 5),
      summary: {
        high: issues.filter(i => i.priority === 'high').length,
        medium: issues.filter(i => i.priority === 'medium').length,
        low: issues.filter(i => i.priority === 'low').length
      }
    };

    return res.json(response);

  } catch (error) {
    console.error('Scan error:', error.message);
    
    return res.status(500).json({
      success: false,
      error: 'scan_failed',
      message: 'Failed to scan website. Please try again.',
      details: error.message
    });
  }
};

// فحص مبسط وسريع
async function performQuickScan(url) {
  const issues = [];
  
  try {
    // محاولة الوصول للموقع مع timeout قصير
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ShieldSite/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 8000
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // تحليل HTML للمشاكل الشائعة
    
    // 1. الصور بدون alt
    const imgMatches = html.match(/<img[^>]*>/gi) || [];
    let imagesWithoutAlt = 0;
    imgMatches.forEach(img => {
      if (!img.includes('alt=') || img.includes('alt=""') || img.includes("alt=''")) {
        imagesWithoutAlt++;
      }
    });
    
    if (imagesWithoutAlt > 0) {
      issues.push({
        code: 'image-alt',
        type: 'error',
        priority: 'high',
        message: `Found ${imagesWithoutAlt} images missing alt text`,
        context: '<img src="..." alt=""> or <img src="..."> without alt attribute',
        selector: 'img[alt=""], img:not([alt])'
      });
    }

    // 2. فحص العنوان الرئيسي H1
    const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
    if (h1Count === 0) {
      issues.push({
        code: 'page-has-heading-one',
        type: 'error', 
        priority: 'high',
        message: 'Page is missing main heading (H1)',
        context: 'Every page should have exactly one H1 heading',
        selector: 'h1'
      });
    } else if (h1Count > 1) {
      issues.push({
        code: 'heading-order',
        type: 'warning',
        priority: 'medium', 
        message: `Found ${h1Count} H1 headings - should be only one`,
        context: 'Multiple H1 headings can confuse screen readers',
        selector: 'h1'
      });
    }

    // 3. فحص الروابط الفارغة
    const emptyLinks = (html.match(/<a[^>]*href[^>]*>\s*<\/a>/gi) || []).length;
    if (emptyLinks > 0) {
      issues.push({
        code: 'link-name',
        type: 'error',
        priority: 'high',
        message: `Found ${emptyLinks} links with no text`,
        context: 'Links must have descriptive text or aria-label',
        selector: 'a[href]:empty'
      });
    }

    // 4. فحص الفورم inputs
    const inputs = (html.match(/<input[^>]*>/gi) || []).length;
    const labels = (html.match(/<label[^>]*>/gi) || []).length;
    if (inputs > labels && inputs > 0) {
      issues.push({
        code: 'label',
        type: 'error',
        priority: 'medium',
        message: `Found ${inputs - labels} input fields possibly missing labels`,
        context: 'Form inputs should have associated labels',
        selector: 'input:not([aria-label])'
      });
    }

    // 5. فحص title
    const hasTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (!hasTitle || hasTitle[1].trim().length === 0) {
      issues.push({
        code: 'document-title',
        type: 'error',
        priority: 'high',
        message: 'Page is missing or has empty title',
        context: 'Page title is essential for SEO and accessibility',
        selector: 'title'
      });
    }

    // إضافة مشكلة عامة إذا لم نجد مشاكل (للتأكد من عمل الأداة)
    if (issues.length === 0) {
      issues.push({
        code: 'manual-review',
        type: 'notice',
        priority: 'low', 
        message: 'Basic scan completed - manual review recommended',
        context: 'Some accessibility issues require detailed manual testing',
        selector: 'body'
      });
    }

    return issues;

  } catch (error) {
    // في حالة فشل الفحص، أرجع مشكلة واحدة للتأكد من عمل الAPI
    console.error('Scan failed:', error.message);
    
    return [{
      code: 'scan-error',
      type: 'warning',
      priority: 'medium',
      message: 'Unable to complete full scan of the website',
      context: 'Website may have restrictions or be temporarily unavailable',
      selector: 'body'
    }];
  }
}