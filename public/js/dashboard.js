const API_BASE = '/api';

const TYPE_LABELS = {
    contract_analysis: { label: 'تحليل عقد',        icon: '📋' },
    labor_law:         { label: 'نظام العمل',        icon: '👷' },
    medical_law:       { label: 'الأنظمة الطبية',   icon: '🏥' },
    company_law:       { label: 'نظام الشركات',      icon: '🏢' },
    general:           { label: 'استفسار قانوني',    icon: '⚖' },
};
const RISK_LABELS = { low: 'منخفض', medium: 'متوسط', high: 'عالٍ', critical: 'حرج' };
const PLAN_LABELS = { free: 'مجاني', basic: 'الأساسي', pro: 'المتقدم' };

function getToken()  { return localStorage.getItem('baeinah_token'); }
function getUser()   { try { return JSON.parse(localStorage.getItem('baeinah_user')); } catch { return null; } }

function logout() {
    localStorage.clear();
    window.location.href = '/';
}

function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

async function apiFetch(url) {
    const res = await fetch(url, { headers: authHeaders() });
    if (res.status === 401) { logout(); return null; }
    return res;
}

// ── تهيئة ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    if (!getToken()) { window.location.href = '/auth.html'; return; }
    await Promise.all([loadUserInfo(), loadSubscription(), loadConsultations()]);
});

async function loadUserInfo() {
    const res  = await apiFetch(`${API_BASE}/auth/me`);
    if (!res) return;
    const data = await res.json();
    if (!data.success) return;

    const u = data.user;
    localStorage.setItem('baeinah_user', JSON.stringify(u));

    // إحصائيات
    document.getElementById('statUsed').textContent  = u.quota_used ?? '—';
    document.getElementById('statLimit').textContent = u.quota_limit ?? '—';
    document.getElementById('statReset').textContent = u.quota_reset_at
        ? new Date(u.quota_reset_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })
        : '—';
    document.getElementById('statPlan').textContent  = PLAN_LABELS[u.plan] || u.plan;

    // شريط الحصة
    const pct = u.quota_limit ? Math.min(100, Math.round((u.quota_used / u.quota_limit) * 100)) : 0;
    const fill = document.getElementById('quotaFill');
    fill.style.width = pct + '%';
    if (pct >= 80) fill.classList.add('near-limit');
    document.getElementById('quotaText').textContent = `${u.quota_used} / ${u.quota_limit}`;

    // زر المستخدم
    document.getElementById('dashUser').innerHTML = `
        <span>${u.name.split(' ')[0]}</span>
        <button onclick="logout()">خروج</button>
    `;
}

async function loadSubscription() {
    const res  = await apiFetch(`${API_BASE}/subscriptions/me`);
    if (!res) return;
    const data = await res.json();
    const sub  = data.subscription;
    const user = getUser();

    const details = document.getElementById('subDetails');
    const actions = document.getElementById('subActions');

    if (!sub || sub.status === 'initiated' || !user || user.plan === 'free') {
        details.textContent = 'أنت على الخطة المجانية (3 استشارات شهرياً)';
        actions.innerHTML   = `<a href="/#pricing" class="btn btn-accent">ترقية الخطة</a>`;
        return;
    }

    const endDate = sub.current_period_end
        ? new Date(sub.current_period_end).toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' })
        : '—';

    const statusMap = { active: '✅ نشط', cancelled: '⚠️ ملغى', past_due: '🔴 متأخر', expired: '❌ منتهٍ' };
    details.innerHTML = `
        <strong>${PLAN_LABELS[sub.plan] || sub.plan}</strong> ·
        ${statusMap[sub.status] || sub.status} ·
        ${sub.cancel_at_period_end ? 'ينتهي' : 'يُجدَّد'} بتاريخ ${endDate}
    `;

    if (sub.status === 'active' && !sub.cancel_at_period_end) {
        actions.innerHTML = `
            <a href="/#pricing" class="btn btn-outline">تغيير الخطة</a>
            <button class="btn btn-ghost" onclick="cancelSub()">إلغاء الاشتراك</button>
        `;
    } else {
        actions.innerHTML = `<a href="/#pricing" class="btn btn-accent">تجديد الاشتراك</a>`;
    }
}

async function cancelSub() {
    if (!confirm('هل أنت متأكد؟ سيستمر اشتراكك حتى نهاية الدورة الحالية.')) return;
    const res  = await fetch(`${API_BASE}/subscriptions/me`, { method: 'DELETE', headers: authHeaders() });
    const data = await res.json();
    if (data.success) {
        alert(`تم الإلغاء. اشتراكك نشط حتى ${new Date(data.cancelled_at).toLocaleDateString('ar-SA')}`);
        loadSubscription();
    } else {
        alert(data.error || 'حدث خطأ');
    }
}

async function loadConsultations() {
    const res  = await apiFetch(`${API_BASE}/consultations?limit=10`);
    if (!res) return;
    const data = await res.json();
    const list = document.getElementById('consultationsList');

    if (!data.consultations?.length) {
        list.innerHTML = `
            <div class="empty-state">
                <p>لا توجد استشارات بعد</p>
                <a href="/app.html" class="btn btn-accent">ابدأ استشارتك الأولى</a>
            </div>`;
        return;
    }

    list.innerHTML = data.consultations.map(c => {
        const meta     = TYPE_LABELS[c.type] || { label: c.type, icon: '📄' };
        const dateStr  = new Date(c.created_at).toLocaleDateString('ar-SA', { year:'numeric', month:'short', day:'numeric' });
        const riskClass = c.risk_level ? `risk-${c.risk_level}` : 'con-status-failed';
        const riskText  = c.status === 'failed' ? 'فشل' : (RISK_LABELS[c.risk_level] || '—');

        return `
        <div class="consultation-row" onclick="window.location='/app.html?id=${c.id}'">
            <span class="con-type-icon">${meta.icon}</span>
            <div class="con-info">
                <div class="con-title">${meta.label}${c.input_file_path ? ` · ${c.input_file_path}` : ''}</div>
                <div class="con-date">${dateStr}</div>
            </div>
            <span class="con-risk ${riskClass}">${riskText}</span>
        </div>`;
    }).join('');
}
