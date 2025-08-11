const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
    // تحقق من طريقة الطلب
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // تحقق من وجود هيدر Authorization
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer ${process.env.API_KEY}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    let browser;
    try {
        // تهيئة المتصفح باستخدام chrome-aws-lambda
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless || true,
        });

        const page = await browser.newPage();
        
        // الانتقال إلى الصفحة وانتظار اكتمال التحميل
        await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // تحليل إمكانية الوصول
        const accessibilityIssues = await page.evaluate(() => {
            const issues = [];
            const elements = document.querySelectorAll('*');
            
            elements.forEach(el => {
                // التحقق من alt للصور
                if (el.tagName === 'IMG' && !el.hasAttribute('alt')) {
                    issues.push({
                        code: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
                        message: 'Image has no alt attribute',
                        selector: getSelector(el)
                    });
                }
                
                // التحقق من العناوين
                if (['H1','H2','H3','H4','H5','H6'].includes(el.tagName) && !el.textContent.trim()) {
                    issues.push({
                        code: 'WCAG2AA.Principle1.Guideline1_3.1_3_1.H42.2',
                        message: 'Empty heading found',
                        selector: getSelector(el)
                    });
                }

                // التحقق من التباين (مبسط)
                if (window.getComputedStyle(el).color === 'rgb(255, 255, 255)' && 
                    window.getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)') {
                    issues.push({
                        code: 'WCAG2AA.Principle1.Guideline1_4.1_4_3.G18',
                        message: 'Insufficient contrast between text and background colors',
                        selector: getSelector(el)
                    });
                }
            });

            function getSelector(el) {
                if (el.id) return '#' + el.id;
                if (el.className) return '.' + el.className.split(' ')[0];
                return el.tagName.toLowerCase();
            }

            return issues;
        });

        await browser.close();
        res.status(200).json({ 
            url: url,
            issues: accessibilityIssues
        });

    } catch (error) {
        console.error('Error details:', error);
        res.status(500).json({ 
            error: error.message,
            stack: error.stack,
            details: 'Error occurred during accessibility check'
        });
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error('Error closing browser:', e);
            }
        }
    }
};
