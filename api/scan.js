const pa11y = require('pa11y');
const chromium = require('chrome-aws-lambda');

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
        const rawResults = await pa11y(url, { 
            reporter: 'json', 
            timeout: 30000,
            browser: await chromium.puppeteer.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath,
                headless: chromium.headless,
            })
        });
        const cleanedIssues = rawResults.issues.map(issue => ({
            code: issue.code,
            message: issue.message,
            selector: issue.selector
        }));
        res.status(200).json({ url: rawResults.pageUrl, issues: cleanedIssues });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
