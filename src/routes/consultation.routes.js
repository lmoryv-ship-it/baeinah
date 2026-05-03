const express = require('express');
const router  = express.Router();
const {
    createConsultation,
    getConsultation,
    getUserConsultations,
} = require('../services/consultation.service');

// POST /api/consultations  — إنشاء استشارة جديدة
router.post('/', async (req, res, next) => {
    try {
        const { user_id, type, text } = req.body;

        if (!user_id || !type || !text) {
            return res.status(400).json({ error: 'الحقول المطلوبة: user_id, type, text' });
        }

        const VALID_TYPES = ['contract_analysis','labor_law','medical_law','company_law','general'];
        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({ error: `نوع الاستشارة غير صالح. الأنواع المتاحة: ${VALID_TYPES.join(', ')}` });
        }

        const result = await createConsultation(user_id, type, text);
        res.status(201).json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
});

// GET /api/consultations/:id  — جلب استشارة محددة
router.get('/:id', async (req, res, next) => {
    try {
        const { user_id } = req.query;
        if (!user_id) return res.status(400).json({ error: 'user_id مطلوب' });

        const consultation = getConsultation(req.params.id, user_id);
        res.json({ success: true, consultation });
    } catch (err) {
        next(err);
    }
});

// GET /api/consultations?user_id=x  — قائمة استشارات المستخدم
router.get('/', async (req, res, next) => {
    try {
        const { user_id, limit = 20, offset = 0 } = req.query;
        if (!user_id) return res.status(400).json({ error: 'user_id مطلوب' });

        const list = getUserConsultations(user_id, Number(limit), Number(offset));
        res.json({ success: true, consultations: list });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
