// api/scan.js
import pa11y from 'pa11y';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // السماح فقط بـ POST
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ error: 'Method not allowed. Use POST.' });
  }

  const { url } = req.body || {};

  // التحقق من صحة الرابط
  if (!url || !url.startsWith('http')) {
    return res
      .status(400)
      .json({ error: 'يرجى إدخال رابط صحيح يبدأ بـ http أو https' });
  }

  try {
    // التحقق أن الرابط يمكن الوصول إليه
    const headResp = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!headResp.ok) {
      return res.status(400).json({
        error: `تعذر الوصول إلى الرابط - حالة HTTP ${headResp.status}`,
      });
    }

    // تنفيذ فحص pa11y بمحرك axe-core فقط
    const results = await pa11y(url, {
      runners: ['axe'],
      browser: false,
      standard: 'WCAG2AA',
      timeout: 60000,
    });

    const issues = (results.issues || []).slice(0, 5).map((i) => ({
      code: i.code,
      message: i.message,
      selector: i.selector,
      context: i.context,
      type: i.type,
      runner: i.runner,
    }));

    return res.status(200).json({
      url,
      totalIssues: results.issues?.length || 0,
      issues,
      scanTime: new Date().toISOString(),
      summary: {
        errors:
          results.issues?.filter((i) => i.type === 'error').length || 0,
        warnings:
          results.issues?.filter((i) => i.type === 'warning').length || 0,
        notices:
          results.issues?.filter((i) => i.type === 'notice').length || 0,
      },
    });
  } catch (err) {
    console.error('Scan error:', err);
    return res.status(500).json({
      error: 'فشل في إجراء الفحص',
      message: err.message || 'Unexpected error',
    });
  }
}
