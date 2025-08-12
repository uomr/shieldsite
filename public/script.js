document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('scanForm');
    const scanBtn = document.getElementById('scanBtn');
    const btnText = document.querySelector('.btn-text');
    const btnLoading = document.querySelector('.btn-loading');
    const resultsContainer = document.getElementById('results');
    const errorContainer = document.getElementById('error');
    const retryBtn = document.getElementById('retryBtn');
    const getFullReportBtn = document.getElementById('getFullReport');

    // Priority mapping for Arabic
    const priorityMap = {
        'error': { level: 'high', text: 'عالية', class: 'priority-high' },
        'warning': { level: 'medium', text: 'متوسطة', class: 'priority-medium' },
        'notice': { level: 'low', text: 'منخفضة', class: 'priority-low' }
    };

    // WCAG rule descriptions in Arabic
    const ruleDescriptions = {
        'color-contrast': 'تباين الألوان غير كافي',
        'image-alt': 'الصور تفتقر للنص البديل',
        'label': 'حقول الإدخال بدون تسميات',
        'link-name': 'الروابط بدون أسماء وصفية',
        'heading-order': 'ترتيب العناوين غير صحيح',
        'landmark-one-main': 'المعالم الرئيسية مفقودة',
        'page-has-heading-one': 'الصفحة تفتقر للعنوان الرئيسي',
        'region': 'المحتوى خارج المناطق المحددة'
    };

    form.addEventListener('submit', handleScan);
    retryBtn.addEventListener('click', handleRetry);
    getFullReportBtn.addEventListener('click', handleFullReport);

    async function handleScan(e) {
        e.preventDefault();
        
        const url = document.getElementById('url').value.trim();
        const email = document.getElementById('email').value.trim();

        if (!url) {
            showError('يرجى إدخال رابط صحيح');
            return;
        }

        showLoading(true);
        hideResults();
        hideError();

        try {
            const response = await fetch('/api/scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url, email })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'فشل في إجراء الفحص');
            }

            displayResults(url, data);
            
        } catch (error) {
            console.error('Scan error:', error);
            showError(error.message || 'حدث خطأ غير متوقع أثناء الفحص');
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
            alert('يرجى إدخال بريدك الإلكتروني للحصول على التقرير الكامل');
            return;
        }

        // Here you would typically send a request to generate PDF report
        alert('سيتم إرسال التقرير الكامل إلى بريدك الإلكتروني قريباً');
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

        // Set URL and time
        scannedUrlEl.textContent = scannedUrl;
        scanTimeEl.textContent = `تم الفحص: ${new Date().toLocaleString('ar-SA')}`;

        // Process results
        const issues = data.top || [];
        const totalIssues = data.raw?.results?.length || 0;

        // Create summary
        const summaryHtml = createSummary(issues, totalIssues);
        
        // Create issues list
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
                        <div class="stat-label">إجمالي المشاكل</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number" style="color: #dc2626">${priorities.high}</div>
                        <div class="stat-label">عالية الأولوية</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number" style="color: #d97706">${priorities.medium}</div>
                        <div class="stat-label">متوسطة الأولوية</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number" style="color: #059669">${priorities.low}</div>
                        <div class="stat-label">منخفضة الأولوية</div>
                    </div>
                </div>
            </div>
        `;
    }

    function createIssueCard(issue, index) {
        const priority = priorityMap[issue.type] || { level: 'medium', text: 'متوسطة', class: 'priority-medium' };
        const ruleTitle = ruleDescriptions[issue.code] || issue.code;
        
        return `
            <div class="issue-card">
                <div class="issue-header">
                    <div class="issue-priority ${priority.class}">
                        أولوية ${priority.text}
                    </div>
                    <div class="issue-title">
                        <h3>${index}. ${ruleTitle}</h3>
                        <div class="issue-code">كود القاعدة: ${issue.code}</div>
                    </div>
                </div>
                <div class="issue-details">
                    <div class="issue-message">
                        <strong>وصف المشكلة:</strong> ${issue.message || 'لا يوجد وصف متاح'}
                    </div>
                    ${issue.context ? `
                        <div class="issue-context">${escapeHtml(issue.context)}</div>
                    ` : ''}
                    ${issue.selector ? `
                        <div class="issue-selector">
                            <strong>العنصر المتأثر:</strong> ${issue.selector}
                        </div>
                    ` : ''}
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