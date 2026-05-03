const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const {
    createConsultation,
    getConsultation,
    getUserConsultations,
} = require('../services/consultation.service');

// جميع مسارات الاستشارات تتطلب تسجيل دخول
router.use(requireAuth);

// POST /api/consultations
router.post('/', async (req, res, next) => {
    try {
        const { type, text } = req.body;

        if (!type || !text) {
            return res.status(400).json({ error: 'الحقول المطلوبة: type, text' });
        }

        const VALID_TYPES = ['contract_analysis','labor_law','medical_law','company_law','general'];
        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({ error: `نوع الاستشارة غير صالح. الأنواع المتاحة: ${VALID_TYPES.join(', ')}` });
        }

        const result = await createConsultation(req.user.id, type, text);
        res.status(201).json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
});

// GET /api/consultations
router.get('/', async (req, res, next) => {
    try {
        const { limit = 20, offset = 0 } = req.query;
        const list = getUserConsultations(req.user.id, Number(limit), Number(offset));
        res.json({ success: true, consultations: list });
    } catch (err) {
        next(err);
    }
});

// GET /api/consultations/:id
router.get('/:id', async (req, res, next) => {
    try {
        const consultation = getConsultation(req.params.id, req.user.id);
        res.json({ success: true, consultation });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
