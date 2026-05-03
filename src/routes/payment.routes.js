const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const { initPayment, handleWebhook } = require('../services/payment.service');

// POST /api/payments/initiate  — يتطلب تسجيل دخول
router.post('/initiate', requireAuth, async (req, res, next) => {
    try {
        const { plan, callback_url } = req.body;
        if (!plan) return res.status(400).json({ error: 'plan مطلوب' });

        const payment = await initPayment(req.user.id, plan, callback_url);
        res.json({ success: true, payment });
    } catch (err) {
        next(err);
    }
});

// POST /api/payments/webhook  — يُستدعى من ميسر (بدون JWT)
router.post('/webhook', async (req, res, next) => {
    try {
        await handleWebhook(req.body);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
