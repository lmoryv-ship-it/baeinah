const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const {
    getPlans,
    createSubscription,
    handleWebhook,
    cancelSubscription,
    getUserSubscription,
} = require('../services/subscription.service');

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
        handleWebhook(req.body);
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;
