// حل بديل كامل باستخدام axe-core + jsdom بدلاً من pa11y
const axeCore = require('axe-core');
const jsdom = require('jsdom');
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

    // إنشاء DOM وتشغيل axe
    const { JSDOM } = jsdom;
    const dom = new JSDOM(html, {
      url: url,
      pretendToBeVisual: true,
      resources: "usable"
    });

    const { window } = dom;
    global.window = window;
    global.document = window.document;

    // تشغيل axe-core
    const results = await new Promise((resolve, reject) => {
      try {
        const axeConfig = {
          rules: {},
          tags: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']
        };

        // تشغيل axe مع timeout
        const timeoutId = setTimeout(() => {
          reject(new Error('Axe scan timeout after 20 seconds'));
        }, 20000);

        axeCore.run(window.document, axeConfig, (err, results) => {
          clearTimeout(timeoutId);
          if (err) {
            reject(err);
          } else {
            resolve(results);
          }
        });
      } catch (error) {
        reject(error);
      }
    });

    console.log(`Scan completed. Found ${results.violations.length} violations`);

    // تنسيق النتائج لتطابق تنسيق pa11y
    const issues = results.violations.flatMap(violation => 
      violation.nodes.map(node => ({
        code: violation.id,
        message: violation.description,
        selector: node.target.join(', '),
        context: node.html || '',
        type: 'error',
        runner: 'axe',
        impact: node.impact || 'unknown',
        help: violation.help,
        helpUrl: violation.helpUrl
      }))
    ).slice(0, 10); // أخذ أول 10 مشاكل

    // إضافة التحذيرات إذا وجدت
    const warnings = results.incomplete.flatMap(incomplete =>
      incomplete.nodes.map(node => ({
        code: incomplete.id,
        message: incomplete.description,
        selector: node.target.join(', '),
        context: node.html || '',
        type: 'warning',
        runner: 'axe',
        impact: node.impact || 'unknown',
        help: incomplete.help,
        helpUrl: incomplete.helpUrl
      }))
    ).slice(0, 5);

    const allIssues = [...issues, ...warnings].slice(0, 5);

    const response = {
      url: url,
      issues: allIssues,
      totalIssues: results.violations.length,
      scanTime: new Date().toISOString(),
      summary: {
        violations: results.violations.length,
        incomplete: results.incomplete.length,
        passes: results.passes.length
      }
    };

    // تنظيف الذاكرة
    dom.window.close();
    delete global.window;
    delete global.document;

    return res.status(200).json(response);

  } catch (error) {
    console.error('Scan error:', error.message);

    // تنظيف الذاكرة في حالة الخطأ
    if (global.window) {
      try {
        global.window.close();
        delete global.window;
        delete global.document;
      } catch (e) {
        // ignore cleanup errors
      }
    }

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

    if (error.message.includes('Invalid URL') || error.message.includes('parse')) {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'The provided URL is not valid or accessible'
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
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'close'
      },
      timeout: 15000
    };

    const req = client.request(options, (res) => {
      let data = '';

      // التعامل مع encoding
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // متابعة الـ redirect
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