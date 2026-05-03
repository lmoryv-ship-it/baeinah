const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const {
    getPlans,
    createSubscription,
    handleWebhook,
    cancelSubscription,
    getUserSubscription,
} = require('../services/subscription.service');

function verifyMoyasarSignature(req) {
    const secret = process.env.MOYASAR_SECRET_KEY;
    if (!secret) return true; // تجاوز التحقق في بيئة التطوير
    const signature = req.headers['x-moyasar-signature'] || req.headers['x-signature'];
    if (!signature) return false;
    const body = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// GET /api/subscriptions/plans  — عام (لا يتطلب تسجيل دخول)
router.get('/plans', (_req, res) => {
    res.json({ success: true, plans: getPlans() });
});

// POST /api/subscriptions  — بدء اشتراك جديد
router.post('/', requireAuth, async (req, res, next) => {
    try {
        const { plan, callback_url } = req.body;
        if (!plan) return res.status(400).json({ error: 'plan مطلوب' });

        const result = await createSubscription(req.user.id, plan, callback_url);
        res.status(201).json({ success: true, ...result });
    } catch (err) { next(err); }
});

// GET /api/subscriptions/me  — اشتراك المستخدم الحالي
router.get('/me', requireAuth, (req, res) => {
    const sub = getUserSubscription(req.user.id);
    res.json({ success: true, subscription: sub });
});

// DELETE /api/subscriptions/me  — إلغاء الاشتراك (يستمر حتى نهاية الدورة)
router.delete('/me', requireAuth, (req, res, next) => {
    try {
        const result = cancelSubscription(req.user.id);
        res.json({ success: true, message: 'سيُلغى اشتراكك في نهاية الدورة الحالية', ...result });
    } catch (err) { next(err); }
});

// POST /api/subscriptions/webhook  — استقبال إشعارات ميسر
router.post('/webhook', (req, res, next) => {
    try {
        if (!verifyMoyasarSignature(req)) {
            return res.status(401).json({ error: 'توقيع غير صالح' });
        }
        handleWebhook(req.body);
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;
