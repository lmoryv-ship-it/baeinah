const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
require('dotenv').config();

const MOYASAR_API = 'https://api.moyasar.com/v1';

// خطط الاشتراك الشهرية
const PLANS = {
    free: {
        label:        'مجاني',
        amount:       0,
        quota:        3,
        features:     ['3 استشارات شهرياً', 'تحليل العقود الأساسية', 'نتائج JSON'],
    },
    starter: {
        label:        'المبتدئ',
        amount:       4900,   // 49 ريال
        quota:        30,
        features:     ['30 استشارة شهرياً', 'جميع أنواع التحليل', 'رفع PDF و DOCX', 'دعم بريد إلكتروني'],
    },
    professional: {
        label:        'الاحترافي',
        amount:       14900,  // 149 ريال
        quota:        150,
        features:     ['150 استشارة شهرياً', 'تقارير PDF', 'أولوية في المعالجة', 'دعم مباشر'],
    },
    enterprise: {
        label:        'المؤسسات',
        amount:       49900,  // 499 ريال
        quota:        1000,
        features:     ['1000 استشارة شهرياً', 'API للدمج المباشر', 'لوحة تحكم المؤسسة', 'مدير حساب مخصص', 'امتثال CBAHI'],
    },
};

function getPlans() {
    return PLANS;
}

async function createSubscription(userId, plan, callbackUrl) {
    const planData = PLANS[plan];
    if (!planData || plan === 'free') throw Object.assign(new Error('الخطة غير صالحة'), { status: 400 });

    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) throw Object.assign(new Error('المستخدم غير موجود'), { status: 404 });

    const subscriptionId = uuidv4();
    const now            = new Date();
    const periodEnd      = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const moyasarPayload = {
        amount:       planData.amount,
        currency:     'SAR',
        description:  `بَيِّنة — ${planData.label} (شهري)`,
        callback_url: callbackUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/api/subscriptions/webhook`,
        source:       { type: 'creditcard' },
        metadata:     { subscription_id: subscriptionId, user_id: userId, plan },
    };

    const response = await fetch(`${MOYASAR_API}/payments`, {
        method:  'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization:  `Basic ${Buffer.from(process.env.MOYASAR_API_KEY + ':').toString('base64')}`,
        },
        body: JSON.stringify(moyasarPayload),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw Object.assign(new Error(`خطأ من ميسر: ${err.message || response.statusText}`), { status: 502 });
    }

    const moyasarData = await response.json();

    db.prepare(`
        INSERT INTO subscriptions
        (id, user_id, plan, moyasar_id, amount, status, current_period_start, current_period_end)
        VALUES (?, ?, ?, ?, ?, 'initiated', ?, ?)
    `).run(subscriptionId, userId, plan, moyasarData.id, planData.amount,
           now.toISOString(), periodEnd.toISOString());

    return {
        subscription_id: subscriptionId,
        payment_url:     moyasarData.source?.transaction_url,
        amount_sar:      planData.amount / 100,
    };
}

function handleWebhook(payload) {
    const db = getDb();
    const { id: moyasarId, status, metadata } = payload;
    if (!metadata?.subscription_id) return;

    const sub = db.prepare('SELECT * FROM subscriptions WHERE moyasar_id = ?').get(moyasarId);
    if (!sub) return;

    if (status === 'paid') {
        const planData = PLANS[sub.plan];
        const now      = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        db.prepare(`
            UPDATE subscriptions
            SET status = 'active', current_period_start = ?, current_period_end = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(now.toISOString(), periodEnd.toISOString(), sub.id);

        db.prepare(`
            UPDATE users
            SET plan = ?, subscription_id = ?, subscription_status = 'active',
                subscription_ends_at = ?,
                quota_limit = ?, quota_used = 0,
                quota_reset_at = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `).run(sub.plan, sub.id, periodEnd.toISOString(),
               planData?.quota || 30,
               periodEnd.toISOString().split('T')[0],
               sub.user_id);

    } else if (status === 'failed') {
        db.prepare(`UPDATE subscriptions SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(sub.id);
        db.prepare(`UPDATE users SET subscription_status = 'past_due', updated_at = datetime('now') WHERE id = ?`).run(sub.user_id);
    }
}

function cancelSubscription(userId) {
    const db  = getDb();
    const sub = db.prepare(
        `SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
    ).get(userId);

    if (!sub) throw Object.assign(new Error('لا يوجد اشتراك نشط'), { status: 404 });

    db.prepare(`UPDATE subscriptions SET cancel_at_period_end = 1, updated_at = datetime('now') WHERE id = ?`).run(sub.id);
    db.prepare(`UPDATE users SET subscription_status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(userId);

    return { cancelled_at: sub.current_period_end };
}

function getUserSubscription(userId) {
    const db  = getDb();
    const sub = db.prepare(
        `SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
    ).get(userId);
    return sub || null;
}

// إعادة تعيين الحصة الشهرية — يُستدعى من cron أو عند أول طلب بعد تاريخ الإعادة
function resetQuotaIfDue(userId) {
    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    if (user.quota_reset_at && today >= user.quota_reset_at) {
        const nextReset = new Date();
        nextReset.setMonth(nextReset.getMonth() + 1);

        db.prepare(`
            UPDATE users SET quota_used = 0, quota_reset_at = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(nextReset.toISOString().split('T')[0], userId);
    }
}

module.exports = { getPlans, createSubscription, handleWebhook, cancelSubscription, getUserSubscription, resetQuotaIfDue, PLANS };
