const express = require('express');
const router  = express.Router();
const { initPayment, handleWebhook } = require('../services/payment.service');

// POST /api/payments/initiate  — بدء عملية الدفع عبر ميسر
router.post('/initiate', async (req, res, next) => {
    try {
        const { user_id, plan, callback_url } = req.body;
        if (!user_id || !plan) return res.status(400).json({ error: 'user_id و plan مطلوبان' });

        const payment = await initPayment(user_id, plan, callback_url);
        res.json({ success: true, payment });
    } catch (err) {
        next(err);
    }
});

// POST /api/payments/webhook  — استقبال إشعارات ميسر
router.post('/webhook', async (req, res, next) => {
    try {
        await handleWebhook(req.body);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
