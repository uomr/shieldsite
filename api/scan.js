// api/scan.js
import pa11y from 'pa11y';
import fetch from 'node-fetch'; // لنتأكد من أن الرابط يعمل قبل الفحص

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, email } = req.body || {};

  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'يرجى إدخال رابط صحيح يبدأ بـ http أو https' });
  }

  try {
    // تحقق أولاً أن الرابط يرد برد HTTP 200-399
    const headResp = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!headResp.ok) {
      return res.status(400).json({ 
        error: `تعذر الوصول إلى الرابط - حالة HTTP ${headResp.status}` 
      });
    }

    // تشغيل فحص pa11y باستخدام axe فقط وبدون متصفح كامل
    const results = await pa11y(url, {
      runners: ['axe'],    // استخدام محرك axe-core
      browser: false,      // تعطيل puppeteer/chromium
      standard: 'WCAG2AA', // معيار الفحص
      timeout: 60000       // مهلة 60 ثانية
    });

    const topIssues = (results.issues || []).slice(0, 5).map(issue => ({
      code: issue.code,
      message: issue.message,
      selector: issue.selector,
      context: issue.context,
      type: issue.type,
      runner: issue.runner
    }));

    return res.status(200).json({
      url,
      totalIssues: results.issues?.length || 0,
      issues: topIssues,
      scanTime: new Date().toISOString(),
      summary: {
        errors: results.issues?.filter(i => i.type === 'error').length || 0,
        warnings: results.issues?.filter(i => i.type === 'warning').length || 0,
        notices: results.issues?.filter(i => i.type === 'notice').length || 0
      }
    });

  } catch (err) {
    console.error('Scan error:', err);
    return res.status(500).json({
      error: 'فشل في إجراء الفحص الفعلي',
      message: err.message || 'Unexpected error'
    });
  }
}
