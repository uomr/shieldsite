import pa11y from 'pa11y';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = req.body?.url;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Valid URL required' });
  }

  try {
    /**
     * ملاحظات مهمة:
     * - نستخدم only runner: axe لتجنب محاولة تشغيل Chromium
     * - نوقف أي إعدادات تنتج محاولات fetch من Puppeteer
     */
    const results = await pa11y(url, {
      runners: ['axe'],
      browser: false // هذا يمنع pa11y من محاولة تشغيل متصفح
    });

    const issues = (results.issues || []).slice(0, 5).map(issue => ({
      code: issue.code,
      message: issue.message,
      selector: issue.selector,
      context: issue.context,
      type: issue.type,
      runner: issue.runner
    }));

    res.status(200).json({ url, issues });
  } catch (error) {
    console.error('pa11y error:', error);
    res.status(500).json({ error: error.message || 'Pa11y scan failed' });
  }
}
