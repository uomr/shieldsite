// حل بسيط ومضمون باستخدام HTML_CodeSniffer + jsdom
const { JSDOM } = require('jsdom');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

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

    // تحليل HTML باستخدام قواعد بسيطة
    const issues = await analyzeHTML(html, url);
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

// تحليل HTML للبحث عن مشاكل الوصول
async function analyzeHTML(html, url) {
  const issues = [];
  const { JSDOM } = require('jsdom');
  
  try {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;

    // فحص الصور بدون alt text
    const images = document.querySelectorAll('img');
    images.forEach((img, index) => {
      if (!img.hasAttribute('alt') || img.getAttribute('alt').trim() === '') {
        issues.push({
          code: 'img-alt-missing',
          message: 'Image missing alternative text',
          selector: img.tagName.toLowerCase() + (img.id ? `#${img.id}` : '') + (img.className ? `.${img.className.split(' ')[0]}` : `[${index}]`),
          context: img.outerHTML.substring(0, 100),
          type: 'error',
          runner: 'custom'
        });
      }
    });

    // فحص العناوين (heading structure)
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let hasH1 = false;
    headings.forEach(heading => {
      if (heading.tagName === 'H1') {
        if (hasH1) {
          issues.push({
            code: 'multiple-h1',
            message: 'Multiple H1 headings found on page',
            selector: heading.tagName.toLowerCase(),
            context: heading.outerHTML.substring(0, 100),
            type: 'warning',
            runner: 'custom'
          });
        }
        hasH1 = true;
      }
    });

    if (!hasH1) {
      issues.push({
        code: 'no-h1',
        message: 'Page missing H1 heading',
        selector: 'html',
        context: 'Document structure',
        type: 'warning',
        runner: 'custom'
      });
    }

    // فحص النماذج
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], textarea');
    inputs.forEach((input, index) => {
      const hasLabel = input.hasAttribute('aria-label') || 
                      input.hasAttribute('aria-labelledby') ||
                      document.querySelector(`label[for="${input.id}"]`) ||
                      input.closest('label');
      
      if (!hasLabel) {
        issues.push({
          code: 'input-missing-label',
          message: 'Form input missing accessible label',
          selector: input.tagName.toLowerCase() + (input.id ? `#${input.id}` : `[${index}]`),
          context: input.outerHTML.substring(0, 100),
          type: 'error',
          runner: 'custom'
        });
      }
    });

    // فحص الروابط
    const links = document.querySelectorAll('a[href]');
    links.forEach((link, index) => {
      const text = link.textContent.trim();
      if (!text || text.toLowerCase().match(/^(click here|read more|more|here|link)$/)) {
        issues.push({
          code: 'link-unclear-purpose',
          message: 'Link text is not descriptive',
          selector: 'a' + (link.id ? `#${link.id}` : `[${index}]`),
          context: link.outerHTML.substring(0, 100),
          type: 'warning',
          runner: 'custom'
        });
      }
    });

    // فحص البنية الأساسية
    if (!document.querySelector('html[lang]')) {
      issues.push({
        code: 'html-lang-missing',
        message: 'HTML element missing lang attribute',
        selector: 'html',
        context: '<html>',
        type: 'error',
        runner: 'custom'
      });
    }

    if (!document.title || document.title.trim() === '') {
      issues.push({
        code: 'title-missing',
        message: 'Document missing title',
        selector: 'head',
        context: '<title>',
        type: 'error',
        runner: 'custom'
      });
    }

    // فحص التباين (تحليل مبسط)
    const elementsWithText = document.querySelectorAll('p, div, span, a, button, h1, h2, h3, h4, h5, h6');
    let colorIssues = 0;
    elementsWithText.forEach(el => {
      const style = el.style;
      if ((style.color && style.backgroundColor) || 
          (style.color && style.color.includes('#fff')) ||
          (style.backgroundColor && style.backgroundColor.includes('#fff'))) {
        colorIssues++;
      }
    });

    if (colorIssues > 0) {
      issues.push({
        code: 'color-contrast-potential',
        message: `Potential color contrast issues detected on ${colorIssues} elements`,
        selector: 'various',
        context: 'Color combinations may not meet contrast requirements',
        type: 'notice',
        runner: 'custom'
      });
    }

    dom.window.close();
    return issues;

  } catch (error) {
    console.error('HTML analysis error:', error);
    return [{
      code: 'analysis-error',
      message: 'Error during HTML analysis',
      selector: 'unknown',
      context: error.message,
      type: 'error',
      runner: 'custom'
    }];
  }
}