const form = document.getElementById("scanForm");
const result = document.getElementById("result");
const loading = document.getElementById("loading");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = form.url.value.trim();
  if (!url) return;

  result.innerHTML = "";
  loading.classList.remove("hidden");
  submitBtn.disabled = true;

  try {
    const response = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    const data = await response.json();
    loading.classList.add("hidden");

    if (response.ok) {
      result.classList.remove("hidden");
      const summaryCard = document.createElement("div");
      summaryCard.className = "result-card success";
      summaryCard.innerHTML = `
        ✅ تم فحص <b>${data.url}</b><br>
        📊 عدد المشكلات: ${data.totalIssues || 0}<br>
        ⏰ وقت الفحص: ${new Date(data.scanTime).toLocaleString("ar-SA")}
      `;
      result.appendChild(summaryCard);

      if (data.issues?.length > 0) {
        data.issues.slice(0, 5).forEach(issue => {
          const card = document.createElement("div");
          card.className = `result-card ${issue.type}`;
          card.innerHTML = `
            <strong>${issue.message}</strong><br>
            📍 العنصر: ${issue.selector || "—"}<br>
            📝 السياق: ${issue.context || "—"}<br>
            🏷️ النوع: ${issue.type}<br>
            ⚙️ المحرك: ${issue.runner}
          `;
          result.appendChild(card);
        });
      }
    } else {
      const errorCard = document.createElement("div");
      errorCard.className = "result-card error";
      errorCard.innerHTML = `❌ خطأ: ${data.error || "حدث خطأ غير معروف"}`;
      result.appendChild(errorCard);
    }

  } catch (err) {
    loading.classList.add("hidden");
    const errorCard = document.createElement("div");
    errorCard.className = "result-card error";
    errorCard.innerHTML = `💥 فشل الاتصال: ${err.message}`;
    result.appendChild(errorCard);
  } finally {
    submitBtn.disabled = false;
  }
});
