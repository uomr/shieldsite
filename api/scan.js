const https = require('https');
const http = require('http');

export default async function handler(req, res) {
  // إعداد CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // التحقق من API Key
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { url } = req.body;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Valid URL required' });
  }

  try {
    console.log(`Starting accessibility scan for: ${url}`);

    // جلب محتوى الصفحة
    const html = await fetchHTML(url);
    console.log(`HTML fetched successfully, length: ${html.length}`);

    // تحليل HTML باستخدام regex وstring parsing
    const issues = analyzeHTMLSimple(html, url);
    console.log(`Scan completed. Found ${issues.length} potential issues`);

    const response = {
      url: url,
      issues: issues.slice(0, 5), // أول 5 مشاكل
      totalIssues: issues.length,
      scanTime: new Date().toISOString(),
      summary: {
        errors: issues.filter(i => i.type === 'error').length,
        warnings: issues.filter(i => i.type === 'warning').length,
        notices: issues.filter(i => i.type === 'notice').length
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Scan error:', error.message);

    if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
      return res.status(408).json({
        error: 'Request timeout',
        message: 'The scan took too long to complete'
      });
    }

    if (error.message.includes('ENOTFOUND') || error.message.includes('network')) {
      return res.status(400).json({
        error: 'Network error',
        message: 'Unable to reach the specified URL'
      });
    }

    return res.status(500).json({
      error: 'Scan failed',
      message: error.message || 'An error occurred during the accessibility scan'
    });
  }
}

// دالة لجلب محتوى HTML
async function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'ShieldSite-Scanner/1.0 (Accessibility Scanner)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'close'
      },
      timeout: 15000
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchHTML(res.headers.location).then(resolve).catch(reject);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Network error: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// تحليل HTML بطريقة بسيطة باستخدام regex
function analyzeHTMLSimple(html, url) {
  const issues = [];
  
  try {
    // تحويل HTML للأحرف الصغيرة للبحث
    const htmlLower = html.toLowerCase();

    // 1. فحص الصور بدون alt text
    const imgRegex = /<img[^>]*>/gi;
    const images = html.match(imgRegex) || [];
    let imgCount = 0;
    
    images.forEach(img => {
      imgCount++;
      if (!img.includes('alt=') || img.includes('alt=""') || img.includes("alt=''")) {
        issues.push({
          code: 'img-alt-missing',
          message: 'Image missing alternative text (alt attribute)',
          selector: `img[${imgCount}]`,
          context: img.substring(0, 100) + '...',
          type: 'error',
          runner: 'simple-scanner'
        });
      }
    });

    // 2. فحص العناوين
    const h1Regex = /<h1[^>]*>/gi;
    const h1Count = (html.match(h1Regex) || []).length;
    
    if (h1Count === 0) {
      issues.push({
        code: 'no-h1',
        message: 'Page missing H1 heading for proper document structure',
        selector: 'document',
        context: 'Document structure analysis',
        type: 'warning',
        runner: 'simple-scanner'
      });
    } else if (h1Count > 1) {
      issues.push({
        code: 'multiple-h1',
        message: `Multiple H1 headings found (${h1Count}). Should have only one H1 per page`,
        selector: 'h1',
        context: 'Document structure analysis',
        type: 'warning',
        runner: 'simple-scanner'
      });
    }

    // 3. فحص النماذج
    const inputRegex = /<input[^>]*type=["']?(text|email|password|search|tel|url)["']?[^>]*>/gi;
    const inputs = html.match(inputRegex) || [];
    let inputCount = 0;

    inputs.forEach(input => {
      inputCount++;
      const hasLabel = input.includes('aria-label=') || 
                      input.includes('aria-labelledby=') ||
                      html.includes(`<label[^>]*for=["']?${input.match(/id=["']?([^"'\s>]+)/)?.[1] || 'no-id'}["']?`);
      
      if (!hasLabel) {
        issues.push({
          code: 'input-missing-label',
          message: 'Form input missing accessible label',
          selector: `input[${inputCount}]`,
          context: input.substring(0, 100) + '...',
          type: 'error',
          runner: 'simple-scanner'
        });
      }
    });

    // 4. فحص textarea
    const textareaRegex = /<textarea[^>]*>/gi;
    const textareas = html.match(textareaRegex) || [];
    let textareaCount = 0;

    textareas.forEach(textarea => {
      textareaCount++;
      if (!textarea.includes('aria-label=') && !textarea.includes('aria-labelledby=')) {
        issues.push({
          code: 'textarea-missing-label',
          message: 'Textarea missing accessible label',
          selector: `textarea[${textareaCount}]`,
          context: textarea.substring(0, 100) + '...',
          type: 'error',
          runner: 'simple-scanner'
        });
      }
    });

    // 5. فحص البنية الأساسية
    if (!htmlLower.includes('<html') || (!htmlLower.includes('lang=') && !htmlLower.includes('<html lang'))) {
      issues.push({
        code: 'html-lang-missing',
        message: 'HTML element missing lang attribute for screen readers',
        selector: 'html',
        context: '<html> tag analysis',
        type: 'error',
        runner: 'simple-scanner'
      });
    }

    // 6. فحص العنوان
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (!titleMatch || !titleMatch[1] || titleMatch[1].trim() === '') {
      issues.push({
        code: 'title-missing',
        message: 'Document missing title or title is empty',
        selector: 'head > title',
        context: 'Document head analysis',
        type: 'error',
        runner: 'simple-scanner'
      });
    }

    // 7. فحص الروابط
    const linkRegex = /<a[^>]*href[^>]*>(.*?)<\/a>/gi;
    const links = html.match(linkRegex) || [];
    let linkCount = 0;

    links.forEach(link => {
      linkCount++;
      const linkText = link.replace(/<[^>]*>/g, '').trim().toLowerCase();
      if (!linkText || 
          linkText === 'click here' || 
          linkText === 'read more' || 
          linkText === 'more' || 
          linkText === 'here' ||
          linkText === 'link') {
        issues.push({
          code: 'link-unclear-purpose',
          message: 'Link text is not descriptive ("' + linkText + '")',
          selector: `a[${linkCount}]`,
          context: link.substring(0, 100) + '...',
          type: 'warning',
          runner: 'simple-scanner'
        });
      }
    });

    // 8. فحص الأزرار
    const buttonRegex = /<button[^>]*>(.*?)<\/button>/gi;
    const buttons = html.match(buttonRegex) || [];
    let buttonCount = 0;

    buttons.forEach(button => {
      buttonCount++;
      const buttonText = button.replace(/<[^>]*>/g, '').trim();
      if (!buttonText && !button.includes('aria-label=') && !button.includes('aria-labelledby=')) {
        issues.push({
          code: 'button-missing-text',
          message: 'Button missing accessible text or label',
          selector: `button[${buttonCount}]`,
          context: button.substring(0, 100) + '...',
          type: 'error',
          runner: 'simple-scanner'
        });
      }
    });

    // 9. إضافة ملاحظة عن فحص محدود
    issues.push({
      code: 'scan-scope-notice',
      message: 'This is a basic accessibility scan. Consider professional audit for comprehensive compliance',
      selector: 'document',
      context: 'Scan completed with simple HTML analysis',
      type: 'notice',
      runner: 'simple-scanner'
    });

    return issues;

  } catch (error) {
    console.error('HTML analysis error:', error);
    return [{
      code: 'analysis-error',
      message: 'Error during HTML analysis: ' + error.message,
      selector: 'unknown',
      context: 'Scanner error',
      type: 'error',
      runner: 'simple-scanner'
    }];
  }
}