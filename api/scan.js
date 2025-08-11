const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

// تكوين مخصص لـ pa11y
const pa11y = require('pa11y');
const pa11yWithChrome = pa11y.defaults({
    browser: puppeteer,
    chromeLaunchConfig: {
        executablePath: process.env.CHROME_EXECUTABLE_PATH || chromium.executablePath,
        args: chromium.args,
        headless: true,
        ignoreHTTPSErrors: true
    }
});

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

    try {
        // استخدام pa11y مع التكوين المخصص
        const rawResults = await pa11yWithChrome(url, {
            reporter: 'json',
            timeout: 30000,
            ignore: [
                'notice',
                'warning'
            ],
            wait: 1000,
            actions: [
                'wait for element #content to be visible'
            ]
        });
        const cleanedIssues = rawResults.issues.map(issue => ({
            code: issue.code,
            message: issue.message,
            selector: issue.selector
        }));
        res.status(200).json({ url: rawResults.pageUrl, issues: cleanedIssues });
    } catch (error) {
        console.error('Error details:', error);
        res.status(500).json({ 
            error: error.message,
            stack: error.stack,
            details: 'Error occurred while running accessibility check'
        });
    }
};
