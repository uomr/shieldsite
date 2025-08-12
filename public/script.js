document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('scanForm');
    const scanBtn = document.getElementById('scanBtn');
    const btnText = document.querySelector('.btn-text');
    const btnLoading = document.querySelector('.btn-loading');
    const resultsContainer = document.getElementById('results');
    const errorContainer = document.getElementById('error');
    const retryBtn = document.getElementById('retryBtn');
    const getFullReportBtn = document.getElementById('getFullReport');

    const priorityMap = {
        'error': { level: 'high', text: 'High', class: 'priority-high' },
        'warning': { level: 'medium', text: 'Medium', class: 'priority-medium' },
        'notice': { level: 'low', text: 'Low', class: 'priority-low' }
    };

    const ruleDescriptions = {
        'color-contrast': 'Insufficient color contrast',
        'image-alt': 'Images missing alternative text',
        'label': 'Input fields without labels',
        'link-name': 'Links missing descriptive names',
        'heading-order': 'Incorrect heading order',
        'landmark-one-main': 'Main landmarks missing',
        'page-has-heading-one': 'Page missing main heading',
        'region': 'Content outside specified regions'
    };

    form.addEventListener('submit', handleScan);
    retryBtn.addEventListener('click', handleRetry);
    getFullReportBtn.addEventListener('click', handleFullReport);

    async function handleScan(e) {
        e.preventDefault();

        const url = document.getElementById('url').value.trim();
        const email = document.getElementById('email').value.trim();

        if (!url) {
            showError('Please enter a valid URL');
            return;
        }

        showLoading(true);
        hideResults();
        hideError();

        try {
            const response = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, email })
            });

            const text = await response.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(`Server response is not valid JSON:\n${text}`);
            }

            if (!response.ok) {
                throw new Error(data.error || 'Scan failed');
            }

            displayResults(url, data);
        } catch (error) {
            console.error('Scan error:', error);
            showError(error.message || 'Unexpected error during scanning');
        } finally {
            showLoading(false);
        }
    }

    function handleRetry() {
        hideError();
        const url = document.getElementById('url').value;
        if (url) {
            form.dispatchEvent(new Event('submit'));
        }
    }

    function handleFullReport() {
        const email = document.getElementById('email').value;
        const url = document.getElementById('url').value;

        if (!email) {
            document.getElementById('email').focus();
            alert('Please enter your email to receive the full report');
            return;
        }

        alert('The full report will be sent to your email shortly');
    }

    function showLoading(show) {
        scanBtn.disabled = show;
        btnText.style.display = show ? 'none' : 'inline';
        btnLoading.style.display = show ? 'inline' : 'none';
    }

    function displayResults(scannedUrl, data) {
        const scannedUrlEl = document.getElementById('scannedUrl');
        const scanTimeEl = document.getElementById('scanTime');
        const issuesListEl = document.getElementById('issuesList');

        scannedUrlEl.textContent = scannedUrl;
        scanTimeEl.textContent = `Scanned at: ${new Date().toLocaleString()}`;

        const issues = data.issues || [];
        const totalIssues = data.totalIssues || 0;

        const summaryHtml = createSummary(issues, totalIssues);
        const issuesHtml = issues.map((issue, index) => createIssueCard(issue, index + 1)).join('');

        issuesListEl.innerHTML = summaryHtml + issuesHtml;
        showResults();
    }

    function createSummary(issues, totalIssues) {
        const priorities = {
            high: issues.filter(i => priorityMap[i.type]?.level === 'high').length,
            medium: issues.filter(i => priorityMap[i.type]?.level === 'medium').length,
            low: issues.filter(i => priorityMap[i.type]?.level === 'low').length
        };

        return `
            <div class="scan-summary">
                <div class="summary-stats">
                    <div class="stat-item">
                        <div class="stat-number">${totalIssues}</div>
                        <div class="stat-label">Total Issues</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number" style="color: #dc2626">${priorities.high}</div>
                        <div class="stat-label">High Priority</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number" style="color: #d97706">${priorities.medium}</div>
                        <div class="stat-label">Medium Priority</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number" style="color: #059669">${priorities.low}</div>
                        <div class="stat-label">Low Priority</div>
                    </div>
                </div>
            </div>
        `;
    }

    function createIssueCard(issue, index) {
        const priority = priorityMap[issue.type] || { level: 'medium', text: 'Medium', class: 'priority-medium' };
        const ruleTitle = ruleDescriptions[issue.code] || issue.code;

        return `
            <div class="issue-card">
                <div class="issue-header">
                    <div class="issue-priority ${priority.class}">
                        Priority: ${priority.text}
                    </div>
                    <div class="issue-title">
                        <h3>${index}. ${ruleTitle}</h3>
                        <div class="issue-code">Rule Code: ${issue.code}</div>
                    </div>
                </div>
                <div class="issue-details">
                    <div class="issue-message">
                        <strong>Issue Description:</strong> ${issue.message || 'No description available'}
                    </div>
                    ${issue.context ? `<div class="issue-context">${escapeHtml(issue.context)}</div>` : ''}
                    ${issue.selector ? `<div class="issue-selector"><strong>Affected Element:</strong> ${issue.selector}</div>` : ''}
                </div>
            </div>
        `;
    }

    function showResults() {
        resultsContainer.style.display = 'block';
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function hideResults() {
        resultsContainer.style.display = 'none';
    }

    function showError(message) {
        document.getElementById('errorText').textContent = message;
        errorContainer.style.display = 'block';
        errorContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function hideError() {
        errorContainer.style.display = 'none';
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
});
