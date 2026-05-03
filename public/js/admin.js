const API_BASE = '/api/admin';

const TYPE_LABELS = { contract_analysis:'تحليل عقد', labor_law:'نظام العمل', medical_law:'أنظمة طبية', company_law:'نظام الشركات', general:'استفسار عام' };
const RISK_LABELS = { low:'منخفض', medium:'متوسط', high:'عالٍ', critical:'حرج' };
const PLAN_LABELS = { free:'مجاني', basic:'الأساسي', pro:'المتقدم' };

let usersPage   = 1;
let consultPage = 1;
let searchTimer;

function getToken() { return localStorage.getItem('baeinah_token'); }
function logout()   { localStorage.clear(); window.location.href = '/'; }

async function api(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.status === 401 || res.status === 403) { logout(); return null; }
    return res.json();
}

// ── تهيئة ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!getToken()) { window.location.href = '/auth.html'; return; }

    // التبويب
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', e => {
            e.preventDefault();
            switchTab(tab.dataset.tab);
        });
    });

    const user = (() => { try { return JSON.parse(localStorage.getItem('baeinah_user')); } catch { return null; } })();
    if (user?.role !== 'admin') { window.location.href = '/dashboard.html'; return; }

    document.getElementById('dashUser').innerHTML =
        `<span>${user.name}</span><button onclick="logout()">خروج</button>`;

    loadStats();
    loadUsers();
    loadConsultations();
    loadSubscriptions();
});

function switchTab(name) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    ['overview','users','consultations','subscriptions'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== name);
    });
}

// ── إحصائيات ──────────────────────────────────────────────
async function loadStats() {
    const data = await api('/stats');
    if (!data?.success) return;
    const s = data.stats;

    document.getElementById('statsCards').innerHTML = `
        <div class="stat-card">
            <div class="stat-card-icon">👥</div>
            <div>
                <div class="stat-card-num">${s.users.total.toLocaleString('ar')}</div>
                <div class="stat-card-label">إجمالي المستخدمين · ${s.users.paid} مدفوع</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon">📋</div>
            <div>
                <div class="stat-card-num">${s.consultations.total.toLocaleString('ar')}</div>
                <div class="stat-card-label">إجمالي الاستشارات · ${s.consultations.today} اليوم</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon">💰</div>
            <div>
                <div class="stat-card-num">${s.subscriptions.monthly_revenue_sar.toLocaleString('ar-SA')} ر.س</div>
                <div class="stat-card-label">الإيرادات الشهرية · ${s.subscriptions.active} اشتراك نشط</div>
            </div>
        </div>
    `;

    renderBarChart('chartByType', s.by_type, r => TYPE_LABELS[r.type] || r.type, r => r.count, false);
    renderBarChart('chartByRisk', s.by_risk, r => RISK_LABELS[r.risk_level] || r.risk_level, r => r.count, true);
}

function renderBarChart(id, rows, labelFn, valueFn, accent) {
    if (!rows?.length) { document.getElementById(id).innerHTML = '<p style="color:#64748b;font-size:.85rem">لا توجد بيانات</p>'; return; }
    const max = Math.max(...rows.map(valueFn));
    document.getElementById(id).innerHTML = rows.map(r => `
        <div class="bar-row">
            <span class="bar-label">${labelFn(r)}</span>
            <div class="bar-track">
                <div class="bar-fill ${accent ? 'accent' : ''}" style="width:${Math.round(valueFn(r)/max*100)}%"></div>
            </div>
            <span class="bar-count">${valueFn(r)}</span>
        </div>
    `).join('');
}

// ── المستخدمون ────────────────────────────────────────────
function searchUsers() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { usersPage = 1; loadUsers(); }, 350);
}

async function loadUsers(page = usersPage) {
    usersPage   = page;
    const q     = encodeURIComponent(document.getElementById('userSearch').value.trim());
    const data  = await api(`/users?page=${page}&q=${q}`);
    if (!data?.success) return;

    document.getElementById('usersBody').innerHTML = data.users.map(u => `
        <tr>
            <td>${u.name}</td>
            <td style="direction:ltr;text-align:right">${u.email}</td>
            <td><span class="plan-pill plan-${u.plan}">${PLAN_LABELS[u.plan] || u.plan}</span></td>
            <td>${u.quota_used} / ${u.quota_limit}</td>
            <td>${new Date(u.created_at).toLocaleDateString('ar-SA')}</td>
            <td>
                <select class="plan-select" onchange="changePlan('${u.id}', this.value)">
                    <option value="free"  ${u.plan==='free'  ? 'selected':''}>مجاني</option>
                    <option value="basic" ${u.plan==='basic' ? 'selected':''}>الأساسي</option>
                    <option value="pro"   ${u.plan==='pro'   ? 'selected':''}>المتقدم</option>
                </select>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:24px">لا توجد نتائج</td></tr>';

    renderPager('usersPager', data.pages, page, loadUsers);
}

async function changePlan(userId, plan) {
    const res = await fetch(`${API_BASE}/users/${userId}/plan`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (!data.success) alert(data.error || 'حدث خطأ');
}

// ── الاستشارات ────────────────────────────────────────────
async function loadConsultations(page = consultPage) {
    consultPage = page;
    const data  = await api(`/consultations?page=${page}`);
    if (!data?.success) return;

    document.getElementById('consultBody').innerHTML = data.consultations.map(c => `
        <tr>
            <td>
                <div style="font-weight:600">${c.user_name}</div>
                <div style="font-size:.75rem;color:#64748b">${c.user_email}</div>
            </td>
            <td>${TYPE_LABELS[c.type] || c.type}</td>
            <td><span class="status-pill status-${c.status}">${c.status}</span></td>
            <td>${c.risk_level ? `<span class="plan-pill plan-${c.risk_level === 'low' ? 'free' : c.risk_level === 'medium' ? 'basic' : 'pro'}">${RISK_LABELS[c.risk_level]}</span>` : '—'}</td>
            <td>${c.tokens_used?.toLocaleString('ar') || '—'}</td>
            <td style="white-space:nowrap">${new Date(c.created_at).toLocaleDateString('ar-SA')}</td>
        </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:24px">لا توجد استشارات</td></tr>';

    renderPager('consultPager', data.pages, page, loadConsultations);
}

// ── الاشتراكات ────────────────────────────────────────────
async function loadSubscriptions() {
    const data = await api('/subscriptions');
    if (!data?.success) return;

    document.getElementById('subsBody').innerHTML = data.subscriptions.map(s => `
        <tr>
            <td>
                <div style="font-weight:600">${s.user_name}</div>
                <div style="font-size:.75rem;color:#64748b">${s.user_email}</div>
            </td>
            <td><span class="plan-pill plan-${s.plan}">${PLAN_LABELS[s.plan] || s.plan}</span></td>
            <td><span class="status-pill status-${s.status}">${s.status}</span></td>
            <td>${(s.amount / 100).toLocaleString('ar-SA')} ر.س</td>
            <td style="white-space:nowrap">${s.current_period_end ? new Date(s.current_period_end).toLocaleDateString('ar-SA') : '—'}</td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:24px">لا توجد اشتراكات</td></tr>';
}

// ── Pagination ─────────────────────────────────────────────
function renderPager(id, pages, current, loadFn) {
    if (pages <= 1) { document.getElementById(id).innerHTML = ''; return; }
    const btns = Array.from({ length: pages }, (_, i) => i + 1).map(p => `
        <button class="page-btn ${p === current ? 'active' : ''}" onclick="${loadFn.name}(${p})">${p}</button>
    `).join('');
    document.getElementById(id).innerHTML = btns;
}
