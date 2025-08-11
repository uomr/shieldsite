// api/scan.js
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  // السماح فقط بـ POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // التحقق من الـ API-Key
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // التحقق من وجود URL
  const targetUrl = req.body?.url;
  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Valid URL required' });
  }

  let browser = null;
  try {
    // تشغيل Chromium مع Puppeteer في بيئة Vercel Serverless
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // ضبط المهلة لتجنب الانتظار الطويل
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // استخرج عنوان الصفحة أو أي بيانات أولية
    const title = await page.title();

    res.status(200).json({
      success: true,
      url: targetUrl,
      title
    });

  } catch (error) {
    console.error('Scan Error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
