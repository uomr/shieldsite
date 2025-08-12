// api/scan.js - WORKING VERSION

module.exports = async (req, res) => {
  console.log('API called:', req.method, req.url);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ message: 'OK' });
  }

  const startTime = Date.now();
  let url, email;

  try {
    // Parse request data
    if (req.method === 'POST') {
      url = req.body?.url;
      email = req.body?.email;
    } else {
      url = req.query?.url;
      email = req.query?.email;
    }

    console.log('Request data:', { url, email, method: req.method });

    // Validate URL
    if (!url) {
      console.log('No URL provided');
      return res.status(400).json({ 
        error: 'url_required',
        message: 'يرجى تقديم رابط صحيح للفحص'
      });
    }

    if (!url.startsWith('http')) {
      console.log('Invalid URL format:', url);
      return res.status(400).json({ 
        error: 'invalid_url',
        message: 'الرابط يجب أن يبدأ بـ http:// أو https://'
      });
    }

    console.log('Starting scan for:', url);

    // Run the scan
    const scanResults = await performAccessibilityScan(url);
    const endTime = Date.now();
    
    console.log('Scan completed:', scanResults.length, 'issues found');

    // Format response
    const response = {
      url: url,
      email: email || null,
      timestamp: new Date().toISOString(),
      duration: `${endTime - startTime}ms`,
      summary: {
        totalIssues: scanResults.length,
        errors: scanResults.filter(i => i.type === 'error').length,
        warnings: scanResults.filter(i => i.type === 'warning').length,
        notices: scanResults.filter(i => i.type === 'notice').length
      },
      top: scanResults.slice(0, 5),
      raw: {
        results: scanResults,
        documentTitle: 'فحص تلقائي',
        pageUrl: url
      }
    };

    console.log('Sending response:', response.summary);
    return res.status(200).json(response);

  } catch (error) {
    console.error('Scan failed:', error);
    
    return res.status(500).json({
      error: 'scan_failed',
      message: 'فشل في إجراء فحص الموقع: ' + error.message,
      details: error.toString(),
      url: url || 'unknown',
      timestamp: new Date().toISOString()
    });
  }
};

// Main scanning function
async function performAccessibilityScan(url) {
  try {
    console.log('Fetching HTML for:', url);
    const html = await fetchWebPage(url);
    
    console.log('HTML fetched, analyzing...');
    const issues = analyzeHTML(html, url);
    
    return issues;
  } catch (error) {
    console.error('Scan error:', error);
    throw new Error('فشل في فحص الموقع: ' + error.message);
  }
}

// Fetch webpage content
async function fetchWebPage(url) {
  const https = require('https');
  const http = require('http');
  
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Connection': 'close'
        },
        timeout: 20000
      };

      console.log('Making request to:', options.hostname);

      const req = client.request(options, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk.toString();
          // Prevent huge pages
          if (data.length > 500000) { // 500KB limit
            req.destroy();
            reject(new Error('الصفحة كبيرة جداً'));
          }
        });

        response.on('end', () => {
          console.log('Response received, status:', response.statusCode);
          
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(data);
          } else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            // Handle redirect
            console.log('Redirect to:', response.headers.location);
            const redirectUrl = response.headers.location.startsWith('http') 
              ? response.headers.location 
              : new URL(response.headers.location, url).href;
            fetchWebPage(redirectUrl).then(resolve).catch(reject);
          } else {
            reject(new Error(`HTTP Error ${response.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('Request error:', error);
        reject(new Error('خطأ في الاتصال: ' + error.message));
      });

      req.on('timeout', () => {
        console.log('Request timeout');
        req.destroy();
        reject(new Error('انتهت مهلة الاتصال'));
      });

      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Analyze HTML content
function analyzeHTML(html, url) {
  const issues = [];
  
  try {
    console.log('Starting HTML analysis...');
    
    // 1. Check images without alt
    const imgMatches = html.match(/<img[^>]*>/gi) || [];
    console.log('Found', imgMatches.length, 'images');
    
    imgMatches.slice(0, 10).forEach((img, index) => {
      if (!img.includes('alt=') || /alt=["']?\s*["']?/.test(img)) {
        issues.push({
          code: 'image-alt',
          type: 'error',
          message: 'صورة تفتقر للنص البديل (alt text) اللازم لقارئات الشاشة',
          selector: `img:nth-of-type(${index + 1})`,
          context: img.substring(0, 100) + '...'
        });
      }
    });

    // 2. Check page title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (!titleMatch || !titleMatch[1] || titleMatch[1].trim() === '') {
      issues.push({
        code: 'document-title',
        type: 'error',
        message: 'الصفحة تفتقر لعنوان وصفي',
        selector: 'head > title',
        context: 'لا يوجد عنوان أو العنوان فارغ'
      });
    }

    // 3. Check H1 headings
    const h1Matches = html.match(/<h1[^>]*>/gi) || [];
    if (h1Matches.length === 0) {
      issues.push({
        code: 'page-has-heading-one',
        type: 'error',
        message: 'الصفحة تفتقر للعنوان الرئيسي H1',
        selector: 'body',
        context: 'لا يوجد عنوان رئيسي في الصفحة'
      });
    } else if (h1Matches.length > 1) {
      issues.push({
        code: 'heading-order',
        type: 'warning',
        message: `يوجد ${h1Matches.length} عناوين H1، يجب أن يكون واحد فقط`,
        selector: 'h1',
        context: 'عناوين متعددة H1'
      });
    }

    // 4. Check lang attribute
    if (!html.toLowerCase().includes('<html') || !html.toLowerCase().includes('lang=')) {
      issues.push({
        code: 'html-has-lang',
        type: 'error',
        message: 'عنصر HTML يفتقر لتحديد اللغة (lang attribute)',
        selector: 'html',
        context: 'لا يوجد تحديد للغة'
      });
    }

    // 5. Check form inputs (basic)
    const inputMatches = html.match(/<input[^>]*type=["']?(text|email|password)["']?[^>]*>/gi) || [];
    inputMatches.slice(0, 5).forEach((input, index) => {
      if (!input.includes('aria-label') && !input.includes('placeholder')) {
        issues.push({
          code: 'label',
          type: 'warning',
          message: 'حقل إدخال قد يفتقر للتسمية الوصفية',
          selector: `input:nth-of-type(${index + 1})`,
          context: input.substring(0, 80) + '...'
        });
      }
    });

    // 6. Check links
    const linkMatches = html.match(/<a[^>]*href[^>]*>(.*?)<\/a>/gi) || [];
    linkMatches.slice(0, 5).forEach((link, index) => {
      const linkText = link.replace(/<[^>]*>/g, '').trim().toLowerCase();
      if (!linkText || linkText.length < 2) {
        issues.push({
          code: 'link-name',
          type: 'warning',
          message: 'رابط بدون نص وصفي كافي',
          selector: `a:nth-of-type(${index + 1})`,
          context: link.substring(0, 80) + '...'
        });
      }
    });

    // Add a summary notice
    issues.push({
      code: 'scan-complete',
      type: 'notice',
      message: `تم إجراء فحص أساسي للصفحة - فُحصت ${imgMatches.length} صورة و ${linkMatches.length} رابط`,
      selector: 'document',
      context: 'ملخص الفحص'
    });

    console.log('Analysis complete:', issues.length, 'issues found');
    return issues;

  } catch (error) {
    console.error('Analysis error:', error);
    return [{
      code: 'analysis-error',
      type: 'error',
      message: 'خطأ في تحليل محتوى الصفحة: ' + error.message,
      selector: 'document',
      context: 'خطأ في المحلل'
    }];
  }
}