const API_BASE = '/api';

function switchTab(tab) {
    document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
    document.getElementById('loginTab').classList.toggle('active', tab === 'login');
    document.getElementById('registerTab').classList.toggle('active', tab === 'register');
}

async function handleLogin(e) {
    e.preventDefault();
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    setLoading('login', true);
    clearError('loginError');

    try {
        const res  = await fetch(`${API_BASE}/auth/login`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        saveSession(data);
        window.location.href = data.user?.role === 'admin' ? '/admin.html' : '/dashboard.html';
    } catch (err) {
        showError('loginError', err.message);
    } finally {
        setLoading('login', false);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name     = document.getElementById('regName').value.trim();
    const email    = document.getElementById('regEmail').value.trim();
    const phone    = document.getElementById('regPhone').value.trim();
    const role     = document.getElementById('regRole').value;
    const password = document.getElementById('regPassword').value;

    setLoading('register', true);
    clearError('registerError');

    try {
        const res  = await fetch(`${API_BASE}/auth/register`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ name, email, phone, password, role }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        saveSession(data);
        window.location.href = '/dashboard.html';
    } catch (err) {
        showError('registerError', err.message);
    } finally {
        setLoading('register', false);
    }
}

function saveSession({ accessToken, refreshToken, user }) {
    localStorage.setItem('baeinah_token',   accessToken);
    localStorage.setItem('baeinah_refresh',  refreshToken);
    localStorage.setItem('baeinah_user',     JSON.stringify(user));
}

// Auto-switch to register tab if URL hash is #register
if (window.location.hash === '#register') {
    switchTab('register');
}

function togglePassword(id) {
    const input = document.getElementById(id);
    input.type  = input.type === 'password' ? 'text' : 'password';
}

function setLoading(form, state) {
    const btn    = document.getElementById(`${form}Btn`);
    const text   = document.getElementById(`${form}BtnText`);
    const loader = document.getElementById(`${form}Loader`);
    btn.disabled = state;
    text.textContent = state ? 'جارٍ التحقق…' : (form === 'login' ? 'دخول' : 'إنشاء الحساب');
    loader.classList.toggle('hidden', !state);
}

function showError(id, msg)  { const el = document.getElementById(id); el.textContent = msg; el.classList.remove('hidden'); }
function clearError(id)      { const el = document.getElementById(id); el.textContent = ''; el.classList.add('hidden'); }
