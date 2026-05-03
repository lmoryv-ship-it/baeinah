const API_BASE = '/api';

const RISK_LABELS = {
    low:      'مخاطر منخفضة',
    medium:   'مخاطر متوسطة',
    high:     'مخاطر عالية',
    critical: 'مخاطر حرجة',
};

const FILE_ICONS = { pdf: '📕', docx: '📘', doc: '📘', txt: '📄' };

// ── إدارة واجهة الإدخال ───────────────────────────────────

let selectedFile = null;
let inputMode    = 'text'; // 'text' | 'file'

function switchInput(mode) {
    inputMode = mode;
    document.getElementById('textInput').classList.toggle('hidden', mode !== 'text');
    document.getElementById('fileInput').classList.toggle('hidden', mode !== 'file');
    document.getElementById('tabText').classList.toggle('active', mode === 'text');
    document.getElementById('tabFile').classList.toggle('active', mode === 'file');
}

// Drag & Drop
function onDragOver(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.add('drag-over');
}
function onDragLeave() {
    document.getElementById('dropZone').classList.remove('drag-over');
}
function onDrop(e) {
    e.preventDefault();
    onDragLeave();
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
}
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
function formatBytes(bytes) {
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ── المصادقة ──────────────────────────────────────────────

function getToken()    { return localStorage.getItem('baeinah_token'); }
function getUser()     { try { return JSON.parse(localStorage.getItem('baeinah_user')); } catch { return null; } }
function isLoggedIn()  { return !!getToken(); }

function logout() {
    localStorage.removeItem('baeinah_token');
    localStorage.removeItem('baeinah_refresh');
    localStorage.removeItem('baeinah_user');
    window.location.href = '/auth.html';
}

function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });

    if (res.status === 401) {
        // حاول تجديد الرمز
        const refreshed = await tryRefresh();
        if (!refreshed) { logout(); return null; }
        return apiFetch(url, options);
    }
    return res;
}

async function tryRefresh() {
    const refreshToken = localStorage.getItem('baeinah_refresh');
    if (!refreshToken) return false;
    try {
        const res  = await fetch(`${API_BASE}/auth/refresh`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ refreshToken }),
        });
        const data = await res.json();
        if (!res.ok) return false;
        localStorage.setItem('baeinah_token',   data.accessToken);
        localStorage.setItem('baeinah_refresh',  data.refreshToken);
        return true;
    } catch { return false; }
}

// ── تهيئة الصفحة ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    if (!isLoggedIn()) {
        window.location.href = '/auth.html';
        return;
    }
    renderUserBar();
});

function renderUserBar() {
    const user = getUser();
    if (!user) return;

    const nav = document.querySelector('.nav');
    const bar = document.createElement('div');
    bar.className = 'user-bar';
    bar.innerHTML = `
        <span>مرحباً، ${user.name.split(' ')[0]}</span>
        <span class="credits-badge">${user.credits} استشارة</span>
        <button class="logout-btn" onclick="logout()">خروج</button>
    `;
    nav.replaceWith(bar);
}

// ── التحليل القانوني ──────────────────────────────────────

async function analyzeContract() {
    const type = document.getElementById('consultationType').value;

    setLoading(true);
    hideAll();

    try {
        let res;

        if (inputMode === 'file') {
            if (!selectedFile) { showError('يرجى اختيار ملف أولاً.'); setLoading(false); return; }

            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('type', type);

            res = await fetch(`${API_BASE}/consultations/upload`, {
                method:  'POST',
                headers: { Authorization: `Bearer ${getToken()}` },
                body:    formData,
            });
            if (res.status === 401) { logout(); return; }
        } else {
            const text = document.getElementById('contractText').value.trim();
            if (!text) { showError('يرجى إدخال نص الوثيقة.'); setLoading(false); return; }

            res = await apiFetch(`${API_BASE}/consultations`, {
                method: 'POST',
                body:   JSON.stringify({ type, text }),
            });
            if (!res) return;
        }

        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'حدث خطأ أثناء التحليل');

        // تحديث رصيد الاستشارات في الـ localStorage
        const user = getUser();
        if (user && user.plan === 'free') {
            user.credits = Math.max(0, user.credits - 1);
            localStorage.setItem('baeinah_user', JSON.stringify(user));
            renderUserBar();
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

    const badge = document.getElementById('riskBadge');
    badge.textContent = RISK_LABELS[result.risk_level] || result.risk_level;
    badge.className   = `risk-badge ${result.risk_level}`;

    document.getElementById('summaryText').textContent = result.summary_ar || '—';

    const risksList = document.getElementById('risksList');
    risksList.innerHTML = '';
    const risks = result.risks || result.contract_issues || result.liability_risks || [];
    risks.forEach(r => {
        const li = document.createElement('li');
        li.className = `risk-item-${r.severity || 'medium'}`;
        const desc = r.description || r.issue || r.type || '';
        li.textContent = `${desc}${r.article ? ` (${r.article})` : ''}`;
        risksList.appendChild(li);
    });
    if (!risks.length) risksList.innerHTML = '<li>لم يتم رصد مخاطر جوهرية</li>';

    const recsList = document.getElementById('recsList');
    recsList.innerHTML = '';
    (result.recommendations || []).forEach(r => {
        const li = document.createElement('li');
        li.textContent = r;
        recsList.appendChild(li);
    });

    const refsList = document.getElementById('refsList');
    refsList.innerHTML = '';
    (result.legal_references || []).forEach(ref => {
        const li = document.createElement('li');
        li.textContent = `${ref.law} — المادة ${ref.article}`;
        refsList.appendChild(li);
    });
    if (!(result.legal_references || []).length) refsList.innerHTML = '<li>—</li>';

    document.getElementById('rawJson').textContent = JSON.stringify(result, null, 2);
    section.classList.remove('hidden');
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleRaw() {
    document.getElementById('rawJson').classList.toggle('hidden');
}

async function initiatePayment(plan) {
    try {
        const res = await apiFetch(`${API_BASE}/payments/initiate`, {
            method: 'POST',
            body:   JSON.stringify({ plan }),
        });
        if (!res) return;
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
    const btn  = document.getElementById('analyzeBtn');
    const text = document.getElementById('btnText');
    const loader = document.getElementById('btnLoader');
    btn.disabled = state;
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
