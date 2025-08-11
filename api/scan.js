import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let browser = null;
  try {
    // إطلاق متصفح الكروميوم في بيئة Vercel Serverless بشكل متوافق
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless, // مهم في Vercel
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.goto(req.body.url || 'https://example.com', { waitUntil: 'networkidle2' });

    const title = await page.title();
    res.status(200).json({ title });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser !== null) await browser.close();
  }
}
