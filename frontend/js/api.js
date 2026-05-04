'use strict';

const API_BASE = '/api';

function getToken() { return localStorage.getItem('access_token'); }
function getRefreshToken() { return localStorage.getItem('refresh_token'); }
function saveTokens(access, refresh) {
  localStorage.setItem('access_token', access);
  if (refresh) localStorage.setItem('refresh_token', refresh);
}
function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
}
function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}
function saveUser(user) { localStorage.setItem('user', JSON.stringify(user)); }

async function request(method, path, body, isMultipart = false) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isMultipart) headers['Content-Type'] = 'application/json';

  const opts = { method, headers };
  if (body) opts.body = isMultipart ? body : JSON.stringify(body);

  let res = await fetch(`${API_BASE}${path}`, opts);

  // Auto-refresh on 401
  if (res.status === 401 && getRefreshToken()) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: getRefreshToken() }),
    });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      saveTokens(data.access_token, data.refresh_token);
      headers['Authorization'] = `Bearer ${data.access_token}`;
      opts.headers = headers;
      res = await fetch(`${API_BASE}${path}`, opts);
    } else {
      clearTokens();
      window.location.href = '/auth.html';
      return;
    }
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || 'حدث خطأ'), { status: res.status, data: json });
  return json;
}

const api = {
  get:    (path)           => request('GET',    path),
  post:   (path, body)     => request('POST',   path, body),
  put:    (path, body)     => request('PUT',    path, body),
  patch:  (path, body)     => request('PATCH',  path, body),
  delete: (path)           => request('DELETE', path),
  upload: (path, formData) => request('POST',   path, formData, true),

  // Auth
  auth: {
    register: (d) => api.post('/auth/register', d),
    login:    (d) => api.post('/auth/login', d),
    logout:   ()  => api.post('/auth/logout', { refresh_token: getRefreshToken() }),
    me:       ()  => api.get('/auth/me'),
    profile:  (d) => api.put('/auth/profile', d),
    changePassword: (d) => api.post('/auth/change-password', d),
  },

  // Organizations
  orgs: {
    me:             ()    => api.get('/organizations/me'),
    members:        ()    => api.get('/organizations/members'),
    addMember:      (d)   => api.post('/organizations/members', d),
    updateMember:   (id, d) => api.patch(`/organizations/members/${id}`, d),
    deleteMember:   (id)  => api.delete(`/organizations/members/${id}`),
  },

  // Cases
  cases: {
    list:   (params = {}) => api.get('/cases?' + new URLSearchParams(params)),
    get:    (id)          => api.get(`/cases/${id}`),
    create: (d)           => api.post('/cases', d),
    update: (id, d)       => api.put(`/cases/${id}`, d),
    delete: (id)          => api.delete(`/cases/${id}`),
  },

  // Consultations
  consultations: {
    list:   (params = {}) => api.get('/consultations?' + new URLSearchParams(params)),
    get:    (id)          => api.get(`/consultations/${id}`),
    create: (d)           => api.post('/consultations', d),
    upload: (formData)    => api.upload('/consultations/upload', formData),
    pdfUrl: (id)          => `${API_BASE}/consultations/${id}/pdf`,
  },

  // Admin
  admin: {
    stats:          ()       => api.get('/admin/stats'),
    orgs:           (p = {}) => api.get('/admin/organizations?' + new URLSearchParams(p)),
    getOrg:         (id)     => api.get(`/admin/organizations/${id}`),
    updateOrg:      (id, d)  => api.patch(`/admin/organizations/${id}`, d),
    users:          (p = {}) => api.get('/admin/users?' + new URLSearchParams(p)),
    updateUser:     (id, d)  => api.patch(`/admin/users/${id}`, d),
    consultations:  (p = {}) => api.get('/admin/consultations?' + new URLSearchParams(p)),
  },
};

// Auth guards
function requireAuth() {
  if (!getToken()) { window.location.href = '/auth.html'; return false; }
  return true;
}
function redirectIfAuth() {
  if (getToken()) { window.location.href = '/dashboard.html'; }
}

async function logout() {
  try { await api.auth.logout(); } catch {}
  clearTokens();
  window.location.href = '/auth.html';
}

// Expose globally
window.api       = api;
window.getUser   = getUser;
window.saveUser  = saveUser;
window.saveTokens = saveTokens;
window.clearTokens = clearTokens;
window.requireAuth = requireAuth;
window.redirectIfAuth = redirectIfAuth;
window.logout    = logout;
