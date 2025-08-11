import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(req.body.url || 'https://example.com', { waitUntil: 'networkidle2' });

    const title = await page.title();

    await browser.close();

    res.status(200).json({ title });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
