const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const { initPayment, handleWebhook } = require('../services/payment.service');

function verifyMoyasarSignature(req) {
    const secret = process.env.MOYASAR_SECRET_KEY;
    if (!secret) return true;
    const signature = req.headers['x-moyasar-signature'] || req.headers['x-signature'];
    if (!signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

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
        if (!verifyMoyasarSignature(req)) {
            return res.status(401).json({ error: 'توقيع غير صالح' });
        }
        await handleWebhook(req.body);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
