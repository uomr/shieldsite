const express = require('express');
const bodyParser = require('body-parser');
const pa11y = require('pa11y');

const app = express();
app.use(bodyParser.json());

app.post('/scan', async (req, res) => {
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
        res.json({ url: rawResults.pageUrl, issues: cleanedIssues });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
