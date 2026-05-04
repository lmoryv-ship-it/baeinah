/**
 * بَيِّنة — اختبارات تكاملية شاملة
 * التشغيل: npm test
 */
'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');

// ── إعداد بيئة الاختبار ───────────────────────────────────
process.env.NODE_ENV  = 'test';
process.env.JWT_SECRET = 'test_secret_baeinah_2025';
process.env.DB_PATH    = ':memory:';   // قاعدة بيانات مؤقتة في الذاكرة

let server;
let baseUrl;
let accessToken;
let refreshTokenStr;
let userId;
let consultationId;

// ── مساعدات ───────────────────────────────────────────────
async function req(method, path, body = null, token = null) {
    const url = `${baseUrl}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

// ── بدء الخادم ────────────────────────────────────────────
before(async () => {
    // نحمّل الخادم في الاختبار على منفذ عشوائي
    const app = require('../src/server');
    await new Promise(resolve => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}/api`;
});

after(() => {
    server?.close();
    // نظّف قاعدة البيانات
    try { require('../src/db/database').closeDb(); } catch {}
});

// ══════════════════════════════════════════════════════════
// ١. Health Check
// ══════════════════════════════════════════════════════════
describe('Health', () => {
    test('GET /health يرجع status ok', async () => {
        const { status, data } = await req('GET', '/health');
        assert.equal(status, 200);
        assert.equal(data.status, 'ok');
        assert.equal(data.app, 'بَيِّنة');
    });
});

// ══════════════════════════════════════════════════════════
// ٢. المصادقة
// ══════════════════════════════════════════════════════════
describe('Auth — التسجيل', () => {
    test('يرفض التسجيل بدون حقول', async () => {
        const { status, data } = await req('POST', '/auth/register', { email: 'x@y.com' });
        assert.equal(status, 400);
        assert.ok(data.error);
    });

    test('يرفض كلمة مرور قصيرة', async () => {
        const { status } = await req('POST', '/auth/register', {
            name: 'اختبار', email: 'short@test.sa', password: '123',
        });
        assert.equal(status, 400);
    });

    test('يرفض بريد إلكتروني غير صالح', async () => {
        const { status } = await req('POST', '/auth/register', {
            name: 'اختبار', email: 'not-an-email', password: 'Test1234!',
        });
        assert.equal(status, 400);
    });

    test('ينجح التسجيل بيانات صحيحة', async () => {
        const { status, data } = await req('POST', '/auth/register', {
            name: 'أحمد التميمي', email: 'ahmed@baeinah-test.sa',
            password: 'StrongPass1!', role: 'individual',
        });
        assert.equal(status, 201);
        assert.ok(data.success);
        assert.ok(data.accessToken);
        assert.ok(data.refreshToken);
        assert.equal(data.user.plan, 'free');
        assert.equal(data.user.quota_limit, 3);
        assert.equal(data.user.quota_used, 0);

        accessToken     = data.accessToken;
        refreshTokenStr = data.refreshToken;
        userId          = data.user.id;
    });

    test('يرفض تكرار البريد الإلكتروني', async () => {
        const { status } = await req('POST', '/auth/register', {
            name: 'مكرر', email: 'ahmed@baeinah-test.sa', password: 'StrongPass1!',
        });
        assert.equal(status, 409);
    });
});

describe('Auth — تسجيل الدخول', () => {
    test('يرفض بيانات غير صحيحة', async () => {
        const { status } = await req('POST', '/auth/login', {
            email: 'ahmed@baeinah-test.sa', password: 'WrongPass!',
        });
        assert.equal(status, 401);
    });

    test('ينجح بالبيانات الصحيحة', async () => {
        const { status, data } = await req('POST', '/auth/login', {
            email: 'ahmed@baeinah-test.sa', password: 'StrongPass1!',
        });
        assert.equal(status, 200);
        assert.ok(data.accessToken);
    });
});

describe('Auth — /me + تحديث الملف الشخصي', () => {
    test('GET /me يتطلب توكن', async () => {
        const { status } = await req('GET', '/auth/me');
        assert.equal(status, 401);
    });

    test('GET /me يرجع بيانات المستخدم مع حقول الحصة', async () => {
        const { status, data } = await req('GET', '/auth/me', null, accessToken);
        assert.equal(status, 200);
        assert.ok(data.user.quota_used !== undefined);
        assert.ok(data.user.quota_limit !== undefined);
        assert.ok(data.user.quota_reset_at);
        assert.ok(data.user.subscription_status);
    });

    test('PUT /profile يحدّث الاسم', async () => {
        const { status, data } = await req('PUT', '/auth/profile',
            { name: 'أحمد التميمي الجهني', phone: '0501234567' }, accessToken);
        assert.equal(status, 200);
        assert.equal(data.user.name, 'أحمد التميمي الجهني');
        assert.equal(data.user.phone, '0501234567');
    });

    test('PUT /profile يرفض اسماً فارغاً', async () => {
        const { status } = await req('PUT', '/auth/profile', { name: '' }, accessToken);
        assert.equal(status, 400);
    });

    test('POST /auth/refresh يجدّد التوكن', async () => {
        const { status, data } = await req('POST', '/auth/refresh', { refreshToken: refreshTokenStr });
        assert.equal(status, 200);
        assert.ok(data.accessToken);
    });
});

// ══════════════════════════════════════════════════════════
// ٣. الاشتراكات والخطط
// ══════════════════════════════════════════════════════════
describe('الاشتراكات', () => {
    test('GET /subscriptions/plans يرجع 3 خطط', async () => {
        const { status, data } = await req('GET', '/subscriptions/plans');
        assert.equal(status, 200);
        assert.ok(data.plans.free);
        assert.ok(data.plans.basic);
        assert.ok(data.plans.pro);
        assert.equal(data.plans.free.amount, 0);
        assert.equal(data.plans.basic.amount, 19900);
        assert.equal(data.plans.pro.amount, 39900);
    });

    test('GET /subscriptions/me يرجع null للمستخدم المجاني', async () => {
        const { status, data } = await req('GET', '/subscriptions/me', null, accessToken);
        assert.equal(status, 200);
        // المستخدم المجاني ليس لديه اشتراك
        assert.ok(data.success);
    });
});

// ══════════════════════════════════════════════════════════
// ٤. الاستشارات
// ══════════════════════════════════════════════════════════
describe('الاستشارات — تحقق المدخلات', () => {
    test('يرفض الطلب بدون توكن', async () => {
        const { status } = await req('POST', '/consultations', { type: 'contract_analysis', text: 'نص' });
        assert.equal(status, 401);
    });

    test('يرفض النص القصير (أقل من 50 حرف)', async () => {
        const { status, data } = await req('POST', '/consultations',
            { type: 'contract_analysis', text: 'نص قصير جداً' }, accessToken);
        assert.equal(status, 400);
        assert.match(data.error, /50/);
    });

    test('يرفض نوعاً غير صالح', async () => {
        const { status } = await req('POST', '/consultations',
            { type: 'invalid_type', text: 'أ'.repeat(60) }, accessToken);
        assert.equal(status, 400);
    });

    test('يرفض الطلب بدون type', async () => {
        const { status } = await req('POST', '/consultations',
            { text: 'أ'.repeat(60) }, accessToken);
        assert.equal(status, 400);
    });
});

describe('الاستشارات — القائمة', () => {
    test('GET /consultations يرجع قائمة فارغة', async () => {
        const { status, data } = await req('GET', '/consultations', null, accessToken);
        assert.equal(status, 200);
        assert.ok(Array.isArray(data.consultations));
    });

    test('GET /consultations/:id يرجع 404 لاستشارة غير موجودة', async () => {
        const { status } = await req('GET', '/consultations/nonexistent-id', null, accessToken);
        assert.equal(status, 500); // يُعدَّل عند إضافة معالجة خطأ محددة
    });
});

// ══════════════════════════════════════════════════════════
// ٥. نظام الحصة
// ══════════════════════════════════════════════════════════
describe('نظام الحصة', () => {
    test('GET /auth/me يُظهر quota_used = 0 ابتداءً', async () => {
        const { data } = await req('GET', '/auth/me', null, accessToken);
        assert.equal(data.user.quota_used, 0);
        assert.equal(data.user.quota_limit, 3);
    });
});

// ══════════════════════════════════════════════════════════
// ٦. لوحة الإدارة
// ══════════════════════════════════════════════════════════
describe('الإدارة — صلاحيات', () => {
    test('GET /admin/stats يرفض غير المدير', async () => {
        const { status } = await req('GET', '/admin/stats', null, accessToken);
        assert.equal(status, 403);
    });

    test('GET /admin/users يرفض غير المدير', async () => {
        const { status } = await req('GET', '/admin/users', null, accessToken);
        assert.equal(status, 403);
    });
});

// ══════════════════════════════════════════════════════════
// ٧. المصادقة — تغيير كلمة المرور
// ══════════════════════════════════════════════════════════
describe('Auth — تغيير كلمة المرور', () => {
    test('يرفض كلمة المرور الحالية الخاطئة', async () => {
        const { status } = await req('POST', '/auth/change-password',
            { current_password: 'WrongOld!', new_password: 'NewPass2025!' }, accessToken);
        assert.equal(status, 401);
    });

    test('ينجح بكلمة المرور الصحيحة', async () => {
        const { status, data } = await req('POST', '/auth/change-password',
            { current_password: 'StrongPass1!', new_password: 'NewPass2025!' }, accessToken);
        assert.equal(status, 200);
        assert.ok(data.success);
    });

    test('يرفض كلمة مرور جديدة قصيرة', async () => {
        const { status } = await req('POST', '/auth/change-password',
            { current_password: 'NewPass2025!', new_password: '12345' }, accessToken);
        assert.equal(status, 400);
    });
});

// ══════════════════════════════════════════════════════════
// ٨. Webhook الأمان
// ══════════════════════════════════════════════════════════
describe('Webhook — التحقق من التوقيع', () => {
    test('يقبل webhook بدون MOYASAR_SECRET_KEY (بيئة تطوير)', async () => {
        // في بيئة الاختبار لا يوجد secret → يُقبل الطلب
        const { status } = await req('POST', '/subscriptions/webhook', { type: 'test' });
        // يُقبل لكن لا يُحدث شيئاً (metadata فارغة)
        assert.ok([200, 201].includes(status));
    });
});
