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
    // نستخدم فقط axe كـ runner لتجنب Chromium
    const results = await pa11y(url, { runners: ['axe'] });

    const topIssues = (results.issues || []).slice(0, 5).map(i => ({
      code: i.code,
      message: i.message,
      selector: i.selector,
      context: i.context,
      type: i.type,
      runner: i.runner
    }));

    res.status(200).json({ url, topIssues, raw: results });
  } catch (error) {
    console.error('pa11y error:', error);
    res.status(500).json({ error: error.message || 'Pa11y scan failed' });
  }
}
