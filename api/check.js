// api/check.js
export default function handler(req, res) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const envLoaded = !!process.env.API_KEY;

  // لا تكتب قيمة المفتاح في اللوج - فقط حالة التحميل
  console.log('CHECK `/api/check` request — hasAuthHeader=', !!authHeader, 'envLoaded=', envLoaded);

  if (!authHeader || authHeader !== `Bearer ${process.env.API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.status(200).json({ ok: true, msg: 'API_KEY present and valid' });
}
