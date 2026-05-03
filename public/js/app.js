const API_BASE = '/api';

const RISK_LABELS = {
    low:      'مخاطر منخفضة',
    medium:   'مخاطر متوسطة',
    high:     'مخاطر عالية',
    critical: 'مخاطر حرجة',
};

async function analyzeContract() {
    const userId = document.getElementById('userId').value.trim();
    const type   = document.getElementById('consultationType').value;
    const text   = document.getElementById('contractText').value.trim();

    if (!userId || !text) {
        showError('يرجى إدخال معرّف المستخدم ونص الوثيقة.');
        return;
    }

    setLoading(true);
    hideAll();

    try {
        const res = await fetch(`${API_BASE}/consultations`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ user_id: userId, type, text }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.error || 'حدث خطأ أثناء التحليل');
        }

        renderResult(data.result);
    } catch (err) {
        showError(err.message);
    } finally {
        setLoading(false);
    }
}

function renderResult(result) {
    const section = document.getElementById('resultSection');

    // مستوى المخاطرة
    const badge = document.getElementById('riskBadge');
    badge.textContent = RISK_LABELS[result.risk_level] || result.risk_level;
    badge.className   = `risk-badge ${result.risk_level}`;

    // الملخص
    document.getElementById('summaryText').textContent = result.summary_ar || '—';

    // المخاطر
    const risksList = document.getElementById('risksList');
    risksList.innerHTML = '';
    const risks = result.risks || result.contract_issues || result.liability_risks || [];
    risks.forEach(r => {
        const li = document.createElement('li');
        li.className = `risk-item-${r.severity || 'medium'}`;
        const desc = r.description || r.issue || r.type || '';
        const art  = r.article ? ` (${r.article})` : '';
        li.textContent = `${desc}${art}`;
        risksList.appendChild(li);
    });
    if (!risks.length) risksList.innerHTML = '<li>لم يتم رصد مخاطر جوهرية</li>';

    // التوصيات
    const recsList = document.getElementById('recsList');
    recsList.innerHTML = '';
    (result.recommendations || []).forEach(r => {
        const li = document.createElement('li');
        li.textContent = r;
        recsList.appendChild(li);
    });

    // المراجع القانونية
    const refsList = document.getElementById('refsList');
    refsList.innerHTML = '';
    (result.legal_references || []).forEach(ref => {
        const li = document.createElement('li');
        li.textContent = `${ref.law} — المادة ${ref.article}`;
        refsList.appendChild(li);
    });
    if (!(result.legal_references || []).length) {
        refsList.innerHTML = '<li>—</li>';
    }

    // JSON الكامل
    document.getElementById('rawJson').textContent = JSON.stringify(result, null, 2);

    section.classList.remove('hidden');
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleRaw() {
    document.getElementById('rawJson').classList.toggle('hidden');
}

async function initiatePayment(plan) {
    const userId = document.getElementById('userId').value.trim() || 'user_demo_001';
    try {
        const res = await fetch(`${API_BASE}/payments/initiate`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ user_id: userId, plan }),
        });
        const data = await res.json();
        if (data.payment?.payment_url) {
            window.location.href = data.payment.payment_url;
        } else {
            alert('جارٍ تجهيز صفحة الدفع…');
        }
    } catch {
        alert('حدث خطأ في الاتصال ببوابة الدفع. يرجى المحاولة لاحقاً.');
    }
}

function setLoading(state) {
    const btn    = document.getElementById('analyzeBtn');
    const text   = document.getElementById('btnText');
    const loader = document.getElementById('btnLoader');
    btn.disabled  = state;
    text.textContent = state ? 'جارٍ التحليل…' : 'تحليل الوثيقة';
    loader.classList.toggle('hidden', !state);
}

function showError(msg) {
    const sec = document.getElementById('errorSection');
    document.getElementById('errorText').textContent = msg;
    sec.classList.remove('hidden');
}

function hideAll() {
    document.getElementById('resultSection').classList.add('hidden');
    document.getElementById('errorSection').classList.add('hidden');
}
