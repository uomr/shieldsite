const { exec } = require('child_process');

// إضافة timeout أطول + معالجة أخطاء محسنة
export default async function handler(req, res) {
  // دعم CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = (req.body && req.body.url) || req.query.url;
  
  if (!url) {
    return res.status(400).json({ 
      error: 'url_required',
      message: 'يرجى إدخال رابط الموقع'
    });
  }

  // تنظيف الرابط
  const cleanUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
  
  try {
    // pa11y مع إعدادات محسنة
    const cmd = `npx pa11y "${cleanUrl}" --reporter json --timeout 30000 --wait 3000`;
    
    console.log(`فحص الموقع: ${cleanUrl}`);
    
    const scanPromise = new Promise((resolve, reject) => {
      exec(cmd, { 
        timeout: 45000, // 45 ثانية
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      }, (err, stdout, stderr) => {
        
        if (stderr) {
          console.log('تحذيرات pa11y:', stderr);
        }
        
        // حتى لو كان فيه error، نحاول نقرأ النتائج
        if (stdout) {
          try {
            const report = JSON.parse(stdout);
            resolve(report);
          } catch (parseError) {
            console.log('فشل في تحليل JSON:', parseError.message);
            console.log('النتائج الخام:', stdout);
            reject(new Error('فشل في تحليل نتائج الفحص'));
          }
        } else {
          reject(new Error(err?.message || 'فشل في تشغيل الفحص'));
        }
      });
    });

    const report = await scanPromise;
    
    // تحويل النتائج لصيغة أبسط
    const results = report.issues || report.results || [];
    const top5 = results.slice(0, 5).map((issue, index) => ({
      id: index + 1,
      code: issue.code,
      message: issue.message,
      selector: issue.selector,
      context: issue.context || 'لا يوجد سياق إضافي',
      type: issue.type,
      priority: getPriority(issue.code)
    }));

    return res.json({
      success: true,
      url: cleanUrl,
      timestamp: new Date().toISOString(),
      total_issues: results.length,
      top_issues: top5,
      summary: {
        high: top5.filter(i => i.priority === 'عالية').length,
        medium: top5.filter(i => i.priority === 'متوسطة').length,
        low: top5.filter(i => i.priority === 'منخفضة').length
      }
    });

  } catch (error) {
    console.error('خطأ في الفحص:', error.message);
    
    return res.status(500).json({
      success: false,
      error: 'scan_failed',
      message: 'فشل في فحص الموقع. يرجى المحاولة مرة أخرى.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// تحديد أولوية المشكلة
function getPriority(code) {
  const highPriority = ['WCAG2AA.Principle1', 'WCAG2AA.Principle2', 'color-contrast'];
  const mediumPriority = ['WCAG2AA.Principle3', 'WCAG2AA.Principle4'];
  
  if (highPriority.some(p => code.includes(p))) return 'عالية';
  if (mediumPriority.some(p => code.includes(p))) return 'متوسطة';
  return 'منخفضة';
}