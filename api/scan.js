// استخدام require بدلاً من import للتوافق مع Vercel
const pa11y = require('pa11y');

export default async function handler(req, res) {
  // إعداد CORS headers أولاً
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // معالجة OPTIONS request
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

  const url = req.body?.url;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Valid URL required' });
  }

  try {
    console.log(`Starting scan for: ${url}`);
    
    // إعدادات pa11y المحسنة لـ Vercel
    const options = {
      // تعطيل المتصفح تماماً
      browser: false,
      
      // استخدام محرك axe فقط
      runners: ['axe'],
      
      // تعطيل إعدادات Puppeteer تماماً
      chromeLaunchConfig: {
        executablePath: null
      },
      
      // إعدادات الشبكة
      timeout: 15000,
      wait: 500,
      
      // تجاهل بعض القواعد لتسريع العملية
      ignore: [
        'color-contrast' // يمكن حذف هذا السطر إذا كنت تريد فحص التباين
      ],
      
      // إعدادات axe
      standard: 'WCAG2AA',
      
      // إعدادات إضافية لتجنب مشاكل المتصفح
      allowedStandards: ['WCAG2A', 'WCAG2AA'],
      
      // تعطيل screenshot
      screenCapture: false
    };

    // محاولة تشغيل pa11y مع معالجة أفضل للأخطاء
    const results = await pa11y(url, options);
    
    console.log(`Scan completed for ${url}. Found ${results.issues?.length || 0} issues`);

    // تنسيق النتائج
    const issues = (results.issues || []).slice(0, 5).map(issue => ({
      code: issue.code || 'unknown',
      message: issue.message || 'No message',
      selector: issue.selector || 'Unknown selector',
      context: issue.context || '',
      type: issue.type || 'error',
      runner: issue.runner || 'axe'
    }));

    return res.status(200).json({ 
      url, 
      issues,
      totalIssues: results.issues?.length || 0,
      scanTime: new Date().toISOString()
    });

  } catch (error) {
    console.error('pa11y error:', error.message);
    
    // معالجة أخطاء محددة
    if (error.message.includes('Chrome') || error.message.includes('puppeteer')) {
      // هذا يعني أن pa11y ما زالت تحاول استخدام المتصفح
      return res.status(500).json({ 
        error: 'Browser configuration error',
        message: 'Unable to run scan without browser. This is a server configuration issue.',
        details: 'PA11Y_BROWSER_ERROR'
      });
    }
    
    if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
      return res.status(408).json({ 
        error: 'Request timeout',
        message: 'The website took too long to respond'
      });
    }
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('network')) {
      return res.status(400).json({ 
        error: 'Network error',
        message: 'Unable to reach the specified URL'
      });
    }

    return res.status(500).json({ 
      error: error.message || 'Pa11y scan failed',
      timestamp: new Date().toISOString()
    });
  }
}