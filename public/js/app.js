const API_BASE = '/api';

const TYPE_META = {
    contract_analysis: { label: 'تحليل عقد',        icon: '📋' },
    labor_law:         { label: 'نظام العمل',        icon: '👷' },
    medical_law:       { label: 'الأنظمة الطبية',   icon: '🏥' },
    company_law:       { label: 'نظام الشركات',      icon: '🏢' },
    general:           { label: 'استفسار قانوني',    icon: '⚖'  },
};

const RISK_CONFIG = {
    low:      { label: 'مخاطر منخفضة',  color: '#16a34a', width: '20%' },
    medium:   { label: 'مخاطر متوسطة', color: '#d97706', width: '50%' },
    high:     { label: 'مخاطر عالية',   color: '#dc2626', width: '78%' },
    critical: { label: 'مخاطر حرجة',   color: '#7c3aed', width: '100%' },
};

const FILE_ICONS = { pdf: '📕', docx: '📘', doc: '📘', txt: '📄' };

let selectedFile       = null;
let inputMode          = 'text';
let lastConsultationId = null;
let progressInterval   = null;

// ── المصادقة ──────────────────────────────────────────────
function getToken()  { return localStorage.getItem('baeinah_token'); }
function getUser()   { try { return JSON.parse(localStorage.getItem('baeinah_user')); } catch { return null; } }
function logout()    { localStorage.clear(); window.location.href = '/'; }

function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
    if (res.status === 401) {
        const ok = await tryRefresh();
        if (!ok) { logout(); return null; }
        return apiFetch(url, options);
    }
    return res;
}

async function tryRefresh() {
    const token = localStorage.getItem('baeinah_refresh');
    if (!token) return false;
    try {
        const res  = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) });
        const data = await res.json();
        if (!res.ok) return false;
        localStorage.setItem('baeinah_token',  data.accessToken);
        localStorage.setItem('baeinah_refresh', data.refreshToken);
        return true;
    } catch { return false; }
}

// ── تهيئة ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!getToken()) { window.location.href = '/auth.html'; return; }
    renderUserBar();
    loadQuotaInfo();
    const id = new URLSearchParams(location.search).get('id');
    if (id) loadExistingConsultation(id);
});

function renderUserBar() {
    const user = getUser();
    const el   = document.getElementById('dashUser');
    if (!el || !user) return;
    el.innerHTML = `<span>${user.name.split(' ')[0]}</span><button onclick="logout()">خروج</button>`;
}

async function loadQuotaInfo() {
    const res  = await apiFetch(`${API_BASE}/auth/me`);
    if (!res) return;
    const data = await res.json();
    if (!data.success) return;
    const u  = data.user;
    const el = document.getElementById('quotaInfo');
    if (!el) return;

    const remaining  = (u.quota_limit || 0) - (u.quota_used || 0);
    const isTrialing = u.subscription_status === 'trialing';

    if (isTrialing && u.trial_ends_at) {
        const daysLeft = Math.max(0, Math.ceil((new Date(u.trial_ends_at) - new Date()) / 86400000));
        el.innerHTML = `تجربة مجانية · <strong>${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}</strong> متبقية · ${remaining} استشارة متبقية`;
        if (daysLeft <= 1 || remaining <= 1) el.classList.add('warning');
    } else {
        el.textContent = `الحصة المتبقية: ${remaining} من ${u.quota_limit} استشارة · تُجدَّد ${u.quota_reset_at || ''}`;
        if (remaining <= 2) el.classList.add('warning');
    }
}

// ── إدارة الإدخال ─────────────────────────────────────────
function switchInput(mode) {
    inputMode = mode;
    document.getElementById('textInput').classList.toggle('hidden', mode !== 'text');
    document.getElementById('fileInput').classList.toggle('hidden', mode !== 'file');
    document.getElementById('tabText').classList.toggle('active', mode === 'text');
    document.getElementById('tabFile').classList.toggle('active', mode === 'file');
}

function onDragOver(e)  { e.preventDefault(); document.getElementById('dropZone').classList.add('drag-over'); }
function onDragLeave()  { document.getElementById('dropZone').classList.remove('drag-over'); }
function onDrop(e)      { e.preventDefault(); onDragLeave(); const f = e.dataTransfer.files[0]; if (f) onFileSelected(f); }

function onFileSelected(file) {
    if (!file) return;
    selectedFile = file;
    const ext = file.name.split('.').pop().toLowerCase();
    document.getElementById('fileIcon').textContent = FILE_ICONS[ext] || '📄';
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatBytes(file.size);
    document.getElementById('dropZone').classList.add('hidden');
    document.getElementById('filePreview').classList.remove('hidden');
}

function clearFile() {
    selectedFile = null;
    document.getElementById('filePickerInput').value = '';
    document.getElementById('dropZone').classList.remove('hidden');
    document.getElementById('filePreview').classList.add('hidden');
}

function formatBytes(b) {
    if (b < 1024)    return `${b} B`;
    if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1048576).toFixed(1)} MB`;
}

// ── التحليل ───────────────────────────────────────────────
async function analyzeContract() {
    const type = document.getElementById('consultationType').value;
    setLoading(true);
    hideError();
    showLoadingState();

    try {
        let res;

        if (inputMode === 'file') {
            if (!selectedFile) { showError('يرجى اختيار ملف أولاً.'); setLoading(false); hideLoadingState(); return; }
            const form = new FormData();
            form.append('file', selectedFile);
            form.append('type', type);
            res = await fetch(`${API_BASE}/consultations/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}` },
                body: form,
            });
            if (res.status === 401) { logout(); return; }
        } else {
            const text = document.getElementById('contractText').value.trim();
            if (!text) { showError('يرجى إدخال النص أو السؤال القانوني.'); setLoading(false); hideLoadingState(); return; }
            res = await apiFetch(`${API_BASE}/consultations`, { method: 'POST', body: JSON.stringify({ type, text }) });
            if (!res) return;
        }

        const data = await res.json();

        if (res.status === 402) {
            hideLoadingState();
            showError(`${data.error} — <a href="/pricing.html" style="color:inherit;text-decoration:underline;font-weight:700">اشترك الآن</a>`);
            setLoading(false);
            return;
        }
        if (res.status === 429) { hideLoadingState(); showError(data.error); setLoading(false); return; }
        if (!res.ok || !data.success) throw new Error(data.error || 'حدث خطأ أثناء التحليل');

        lastConsultationId = data.consultationId;
        renderResult(data.result, type);
        loadQuotaInfo();

    } catch (err) {
        hideLoadingState();
        showError(err.message);
    } finally {
        setLoading(false);
    }
}

// ── عرض النتائج ───────────────────────────────────────────
function renderResult(result, type) {
    clearProgressInterval();
    hideLoadingState();

    document.getElementById('resultEmpty').classList.add('hidden');
    const content = document.getElementById('resultContent');
    content.classList.remove('hidden');

    // إعادة تعيين البطاقات الاختيارية
    ['partiesCard','obligationsCard','violationsCard','optionsCard'].forEach(id =>
        document.getElementById(id).classList.add('hidden'));

    const meta = TYPE_META[type || result.analysis_type] || TYPE_META.general;
    document.getElementById('resultTypeBadge').textContent = `${meta.icon} ${meta.label}`;

    // شارة الخطورة
    const risk  = result.risk_level || 'medium';
    const cfg   = RISK_CONFIG[risk] || RISK_CONFIG.medium;
    const badge = document.getElementById('riskBadge');
    badge.textContent = cfg.label;
    badge.className   = `risk-badge ${risk}`;

    // مقياس الخطورة
    const fill = document.getElementById('riskMeterFill');
    fill.style.width      = cfg.width;
    fill.style.background = cfg.color;

    // الملخص
    document.getElementById('summaryText').textContent = result.summary_ar || '—';

    // المخاطر
    renderRisks(result);

    // الأطراف (للعقود)
    if (result.parties?.length) {
        document.getElementById('partiesCard').classList.remove('hidden');
        document.getElementById('partiesList').innerHTML = result.parties.map(p => `
            <div class="party-chip">
                <span class="party-name">${p.name || '—'}</span>
                <span class="party-role">${p.role || ''}</span>
            </div>`).join('');
    }

    // الالتزامات
    if (result.obligations?.length) {
        document.getElementById('obligationsCard').classList.remove('hidden');
        document.getElementById('obligationsList').innerHTML = result.obligations.map(o => `
            <div class="obligation-row">
                <span class="ob-party">${o.party || '—'}</span>
                <span class="ob-text">${o.obligation || ''}${o.deadline ? ` <em>(${o.deadline})</em>` : ''}</span>
            </div>`).join('');
    }

    // الانتهاكات
    const violations = result.violations || [];
    if (violations.length) {
        document.getElementById('violationsCard').classList.remove('hidden');
        document.getElementById('violationsCount').textContent = violations.length;
        document.getElementById('violationsList').innerHTML = violations.map(v => `
            <div class="violation-row">
                <span class="violation-article">${v.article || ''}</span>
                <div class="violation-body">
                    <p class="violation-desc">${v.description || v.issue || ''}</p>
                    ${v.penalty ? `<p class="violation-penalty">العقوبة: ${v.penalty}</p>` : ''}
                </div>
            </div>`).join('');
    }

    // الخيارات (الاستشارة العامة)
    const options = result.options || [];
    if (options.length) {
        document.getElementById('optionsCard').classList.remove('hidden');
        document.getElementById('optionsList').innerHTML = options.map(o => `
            <div class="option-row ${o.recommended ? 'option-recommended' : ''}">
                ${o.recommended ? '<span class="option-badge">موصى به</span>' : ''}
                <p class="option-title">${o.option || ''}</p>
                ${o.pros ? `<p class="option-pro">✓ ${o.pros}</p>` : ''}
                ${o.cons ? `<p class="option-con">✗ ${o.cons}</p>` : ''}
            </div>`).join('');
    }

    // التوصيات
    const recs = result.recommendations || [];
    document.getElementById('recsList').innerHTML =
        recs.length ? recs.map((r,i) => `<li><span class="rec-num">${i+1}</span>${r}</li>`).join('') : '<li>—</li>';

    // المراجع
    const refs = result.legal_references || result.legal_basis || [];
    document.getElementById('refsList').innerHTML = refs.length
        ? refs.map(r => `
            <div class="ref-row">
                <div class="ref-header">
                    <span class="ref-law">${r.law || ''}</span>
                    <span class="ref-article">م. ${r.article || ''}</span>
                </div>
                ${r.text || r.relevance ? `<p class="ref-text">${r.text || r.relevance}</p>` : ''}
            </div>`).join('')
        : '<p class="no-refs">لم تُذكر مراجع محددة</p>';

    // JSON
    document.getElementById('rawJson').textContent = JSON.stringify(result, null, 2);

    // زر PDF للمشتركين المدفوعين
    const user = getUser();
    if (user?.plan !== 'free') document.getElementById('exportPdfBtn').classList.remove('hidden');

    content.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderRisks(result) {
    const risks = result.risks || result.contract_issues || result.liability_risks || result.governance_issues || [];
    document.getElementById('risksCount').textContent = risks.length || '0';

    if (!risks.length) {
        document.getElementById('risksList').innerHTML =
            '<div class="no-risks">✓ لم يتم رصد مخاطر جوهرية</div>';
        return;
    }
    document.getElementById('risksList').innerHTML = risks.map(r => {
        const sev = r.severity || 'medium';
        const desc = r.description || r.issue || r.type || '';
        const art  = r.article || '';
        const rec  = r.recommendation || r.fix || r.mitigation || '';
        return `
        <div class="risk-row risk-row-${sev}">
            <div class="risk-row-top">
                <span class="sev-badge sev-${sev}">${severityLabel(sev)}</span>
                <span class="risk-desc">${desc}${art ? ` <em class="risk-article">(${art})</em>` : ''}</span>
            </div>
            ${rec ? `<p class="risk-rec">💡 ${rec}</p>` : ''}
        </div>`;
    }).join('');
}

function severityLabel(s) {
    return { low: 'منخفض', medium: 'متوسط', high: 'عالٍ', critical: 'حرج' }[s] || s;
}

// ── حالة التحميل ──────────────────────────────────────────
function showLoadingState() {
    document.getElementById('resultEmpty').classList.add('hidden');
    document.getElementById('resultContent').classList.add('hidden');
    document.getElementById('resultLoading').classList.remove('hidden');

    const steps = ['ps1','ps2','ps3','ps4'];
    let current = 0;
    steps.forEach(id => document.getElementById(id).classList.remove('active','done'));
    document.getElementById('ps1').classList.add('active');

    progressInterval = setInterval(() => {
        if (current < steps.length - 1) {
            document.getElementById(steps[current]).classList.replace('active','done');
            current++;
            document.getElementById(steps[current]).classList.add('active');
        }
    }, 6000);
}

function hideLoadingState() {
    clearProgressInterval();
    document.getElementById('resultLoading').classList.add('hidden');
}

function clearProgressInterval() {
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
}

// ── تصدير PDF ─────────────────────────────────────────────
async function exportPdf() {
    if (!lastConsultationId) return;
    const btn = document.getElementById('exportPdfBtn');
    btn.disabled    = true;
    btn.textContent = '⏳ جارٍ التصدير…';
    try {
        const res = await fetch(`${API_BASE}/consultations/${lastConsultationId}/pdf`, {
            headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.status === 403) { const d = await res.json(); alert(d.error); return; }
        if (!res.ok) throw new Error('فشل تصدير التقرير');
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `baeinah-${lastConsultationId.slice(0,8)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); }
    finally { btn.disabled = false; btn.textContent = '⬇ تقرير PDF'; }
}

// ── تحميل استشارة موجودة ──────────────────────────────────
async function loadExistingConsultation(id) {
    const res  = await apiFetch(`${API_BASE}/consultations/${id}`);
    if (!res) return;
    const data = await res.json();
    if (data.success && data.consultation?.result) {
        lastConsultationId = id;
        renderResult(data.consultation.result, data.consultation.type);
    }
}

// ── Raw JSON ──────────────────────────────────────────────
function toggleRaw() {
    const pre    = document.getElementById('rawJson');
    const hidden = pre.classList.toggle('hidden');
    document.getElementById('rawBtnText').textContent =
        hidden ? 'عرض البيانات الكاملة' : 'إخفاء البيانات';
}

// ── مساعدات ───────────────────────────────────────────────
function setLoading(state) {
    const btn  = document.getElementById('analyzeBtn');
    const text = document.getElementById('btnText');
    const ldr  = document.getElementById('btnLoader');
    btn.disabled     = state;
    text.textContent = state ? 'جارٍ التحليل…' : 'تحليل الوثيقة';
    ldr.classList.toggle('hidden', !state);
}

function showError(msg) {
    const el = document.getElementById('errorSection');
    el.innerHTML = msg;
    el.classList.remove('hidden');
}
function hideError() {
    const el = document.getElementById('errorSection');
    el.textContent = '';
    el.classList.add('hidden');
}
