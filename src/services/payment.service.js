const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
require('dotenv').config();

const MOYASAR_API = 'https://api.moyasar.com/v1';

// أسعار الخطط بالهللة (100 هللة = 1 ريال)
const PLANS = {
    basic:        { amount: 9900,   credits: 30,  label: 'الخطة الأساسية' },
    professional: { amount: 29900,  credits: 100, label: 'الخطة الاحترافية' },
    enterprise:   { amount: 99900,  credits: 500, label: 'خطة المؤسسات' },
};

async function initPayment(userId, plan, callbackUrl) {
    const planData = PLANS[plan];
    if (!planData) throw new Error(`الخطة "${plan}" غير موجودة`);

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('المستخدم غير موجود');

    const subscriptionId = uuidv4();

    const moyasarPayload = {
        amount:      planData.amount,
        currency:    'SAR',
        description: `بَيِّنة - ${planData.label}`,
        callback_url: callbackUrl || `${process.env.BASE_URL}/api/payments/webhook`,
        source: { type: 'creditcard' },
        metadata: { subscription_id: subscriptionId, user_id: userId, plan },
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
        const err = await response.json();
        throw new Error(`خطأ من ميسر: ${err.message || response.statusText}`);
    }

    const moyasarData = await response.json();

    db.prepare(`
        INSERT INTO subscriptions (id, user_id, plan, moyasar_id, amount, status)
        VALUES (?, ?, ?, ?, ?, 'initiated')
    `).run(subscriptionId, userId, plan, moyasarData.id, planData.amount);

    return {
        subscription_id:  subscriptionId,
        moyasar_id:        moyasarData.id,
        payment_url:       moyasarData.source?.transaction_url,
        amount:            planData.amount / 100,
        currency:          'SAR',
    };
}

async function handleWebhook(payload) {
    const db = getDb();
    const { id: moyasarId, status, metadata } = payload;

    if (!metadata?.subscription_id) return;

    const subscription = db.prepare(
        'SELECT * FROM subscriptions WHERE moyasar_id = ?'
    ).get(moyasarId);
    if (!subscription) return;

    if (status === 'paid') {
        const planData = PLANS[subscription.plan];
        const now      = new Date();
        const expiry   = new Date(now);
        expiry.setMonth(expiry.getMonth() + 1);

        db.prepare(`
            UPDATE subscriptions
            SET status = 'paid', started_at = ?, expires_at = ?
            WHERE moyasar_id = ?
        `).run(now.toISOString(), expiry.toISOString(), moyasarId);

        db.prepare(`
            UPDATE users SET plan = ?, credits = credits + ?
            WHERE id = ?
        `).run(subscription.plan, planData?.credits || 30, subscription.user_id);
    } else if (status === 'failed') {
        db.prepare(`UPDATE subscriptions SET status = 'failed' WHERE moyasar_id = ?`).run(moyasarId);
    }
}

module.exports = { initPayment, handleWebhook };
