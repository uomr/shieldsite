const pa11y = require('pa11y');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const rawResults = await pa11y(url, { reporter: 'json', timeout: 30000 });
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
