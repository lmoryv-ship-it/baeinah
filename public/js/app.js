const API_BASE = '/api';

const RISK_LABELS = { low: 'مخاطر منخفضة', medium: 'مخاطر متوسطة', high: 'مخاطر عالية', critical: 'مخاطر حرجة' };
const FILE_ICONS  = { pdf: '📕', docx: '📘', doc: '📘', txt: '📄' };

let selectedFile       = null;
let inputMode          = 'text';
let lastConsultationId = null;

// ── المصادقة ──────────────────────────────────────────────
function getToken()  { return localStorage.getItem('baeinah_token'); }
function getUser()   { try { return JSON.parse(localStorage.getItem('baeinah_user')); } catch { return null; } }

function logout() { localStorage.clear(); window.location.href = '/'; }

function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
    if (res.status === 401) {
        const refreshed = await tryRefresh();
        if (!refreshed) { logout(); return null; }
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
        localStorage.setItem('baeinah_token',   data.accessToken);
        localStorage.setItem('baeinah_refresh',  data.refreshToken);
        return true;
    } catch { return false; }
}

// ── تهيئة ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!getToken()) { window.location.href = '/auth.html'; return; }
    renderUserBar();
    loadQuotaInfo();

    // عرض نتيجة سابقة إذا كان هناك ?id=
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

    const remaining = (u.quota_limit || 0) - (u.quota_used || 0);
    el.textContent  = `الحصة المتبقية: ${remaining} من ${u.quota_limit} استشارة · تُجدَّد ${u.quota_reset_at || ''}`;
    if (remaining <= 2) el.classList.add('warning');
}

// ── إدارة واجهة الإدخال ───────────────────────────────────
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
    document.getElementById('fileIcon').textContent  = FILE_ICONS[ext] || '📄';
    document.getElementById('fileName').textContent  = file.name;
    document.getElementById('fileSize').textContent  = formatBytes(file.size);
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
    if (b < 1024)      return `${b} B`;
    if (b < 1024**2)   return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1024**2).toFixed(1)} MB`;
}

// ── التحليل ───────────────────────────────────────────────
async function analyzeContract() {
    const type = document.getElementById('consultationType').value;
    setLoading(true);
    hideError();

    try {
        let res;

        if (inputMode === 'file') {
            if (!selectedFile) { showError('يرجى اختيار ملف أولاً.'); setLoading(false); return; }
            const form = new FormData();
            form.append('file', selectedFile);
            form.append('type', type);
            res = await fetch(`${API_BASE}/consultations/upload`, {
                method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: form,
            });
            if (res.status === 401) { logout(); return; }
        } else {
            const text = document.getElementById('contractText').value.trim();
            if (!text) { showError('يرجى إدخال نص الوثيقة.'); setLoading(false); return; }
            res = await apiFetch(`${API_BASE}/consultations`, { method: 'POST', body: JSON.stringify({ type, text }) });
            if (!res) return;
        }

        const data = await res.json();
        if (res.status === 429 || res.status === 402) {
            showError(`${data.error}${data.upgrade_url ? ' <a href="/#pricing" style="color:var(--accent);font-weight:700">ترقية الخطة ←</a>' : ''}`);
            setLoading(false);
            return;
        }
        if (!res.ok || !data.success) throw new Error(data.error || 'حدث خطأ أثناء التحليل');

        lastConsultationId = data.consultationId;
        renderResult(data.result);
        loadQuotaInfo();
    } catch (err) {
        showError(err.message);
    } finally {
        setLoading(false);
    }
}

function renderResult(result) {
    document.getElementById('resultEmpty').classList.add('hidden');
    const content = document.getElementById('resultContent');
    content.classList.remove('hidden');

    const badge = document.getElementById('riskBadge');
    badge.textContent = RISK_LABELS[result.risk_level] || result.risk_level || '—';
    badge.className   = `risk-badge ${result.risk_level || ''}`;

    document.getElementById('summaryText').textContent = result.summary_ar || '—';

    const risksList = document.getElementById('risksList');
    risksList.innerHTML = '';
    const risks = result.risks || result.contract_issues || result.liability_risks || result.key_findings || [];
    risks.forEach(r => {
        const li = document.createElement('li');
        li.className = `risk-item-${r.severity || r.priority || 'medium'}`;
        const desc = r.description || r.issue || r.finding || r.type || '';
        const art  = r.article ? ` <em style="font-size:.8em;color:var(--muted)">(${r.article})</em>` : '';
        const rec  = r.recommendation || r.fix || r.mitigation || '';
        li.innerHTML = `${desc}${art}${rec ? `<br><span style="color:#047857;font-size:.8em">↳ ${rec}</span>` : ''}`;
        risksList.appendChild(li);
    });
    if (!risks.length) risksList.innerHTML = '<li>لم يتم رصد مخاطر جوهرية</li>';

    const recsList = document.getElementById('recsList');
    recsList.innerHTML = (result.recommendations || []).map(r => `<li>${r}</li>`).join('') || '<li>—</li>';

    const refsList = document.getElementById('refsList');
    const refs = result.legal_references || result.applicable_laws || [];
    refsList.innerHTML = refs.map(r => {
        const law  = r.law  || r.name || '';
        const art  = r.article ? ` — المادة ${r.article}` : '';
        const note = r.text || r.relevance || '';
        return `<li><strong>${law}${art}</strong>${note ? `<br><span style="color:var(--muted);font-size:.8em">${note}</span>` : ''}</li>`;
    }).join('') || '<li>—</li>';

    document.getElementById('rawJson').textContent = JSON.stringify(result, null, 2);

    // أظهر زر PDF للمشتركين فقط
    const user = getUser();
    if (user && user.plan !== 'free') {
        document.getElementById('exportPdfBtn').classList.remove('hidden');
    }

    content.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function exportPdf() {
    const id = lastConsultationId;
    if (!id) return;

    const btn = document.getElementById('exportPdfBtn');
    btn.disabled     = true;
    btn.textContent  = '⏳ جارٍ التصدير…';

    try {
        const res = await fetch(`${API_BASE}/consultations/${id}/pdf`, {
            headers: { Authorization: `Bearer ${getToken()}` },
        });

        if (res.status === 403) {
            const data = await res.json();
            alert(data.error);
            return;
        }
        if (!res.ok) throw new Error('فشل تصدير التقرير');

        const blob     = await res.blob();
        const url      = URL.createObjectURL(blob);
        const anchor   = document.createElement('a');
        anchor.href     = url;
        anchor.download = `baeinah-report-${id.slice(0,8)}.pdf`;
        anchor.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled    = false;
        btn.textContent = '⬇ تصدير PDF';
    }
}

async function loadExistingConsultation(id) {
    const res  = await apiFetch(`${API_BASE}/consultations/${id}`);
    if (!res) return;
    const data = await res.json();
    if (data.success && data.consultation?.result) renderResult(data.consultation.result);
}

function toggleRaw()   { document.getElementById('rawJson').classList.toggle('hidden'); }
function showError(msg){ const el = document.getElementById('errorSection'); el.innerHTML = msg; el.classList.remove('hidden'); }
function hideError()   { document.getElementById('errorSection').classList.add('hidden'); }

function setLoading(state) {
    const btn    = document.getElementById('analyzeBtn');
    const text   = document.getElementById('btnText');
    const loader = document.getElementById('btnLoader');
    btn.disabled = state;
    text.textContent = state ? 'جارٍ التحليل…' : 'تحليل الوثيقة';
    loader.classList.toggle('hidden', !state);
}
