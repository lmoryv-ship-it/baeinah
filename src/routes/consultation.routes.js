const express = require('express');
const router  = express.Router();
const path    = require('path');
const { requireAuth }  = require('../middleware/auth.middleware');
const { requireQuota } = require('../middleware/quota.middleware');
const { upload }       = require('../middleware/upload.middleware');
const { extractText, deleteFile, getFileMetadata } = require('../services/file.service');
const {
    createConsultation,
    getConsultation,
    getUserConsultations,
} = require('../services/consultation.service');

router.use(requireAuth);

const VALID_TYPES = ['contract_analysis','labor_law','medical_law','company_law','general'];

// POST /api/consultations  — نص مباشر
router.post('/', requireQuota, async (req, res, next) => {
    try {
        const { type, text } = req.body;
        if (!type || !text) return res.status(400).json({ error: 'الحقول المطلوبة: type, text' });
        if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'نوع الاستشارة غير صالح' });

        const result = await createConsultation(req.user.id, type, text);
        res.status(201).json({ success: true, ...result });
    } catch (err) { next(err); }
});

// POST /api/consultations/upload  — رفع ملف
router.post('/upload', requireQuota, upload.single('file'), async (req, res, next) => {
    const filePath = req.file?.path;

    try {
        if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });

        const { type } = req.body;
        if (!type) return res.status(400).json({ error: 'حقل type مطلوب' });
        if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'نوع الاستشارة غير صالح' });

        const text     = await extractText(filePath, req.file.mimetype);
        const metadata = getFileMetadata(req.file);
        const result   = await createConsultation(req.user.id, type, text, metadata);

        res.status(201).json({
            success: true,
            file:    { name: metadata.originalName, size: metadata.size, pages_extracted: true },
            ...result,
        });
    } catch (err) {
        next(err);
    } finally {
        // احذف الملف المؤقت بعد المعالجة
        if (filePath) deleteFile(filePath);
    }
});

// معالجة خطأ Multer (حجم الملف، نوع غير مدعوم)
router.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'حجم الملف يتجاوز الحد الأقصى المسموح به (10 ميغابايت)' });
    }
    next(err);
});

// GET /api/consultations
router.get('/', async (req, res, next) => {
    try {
        const { limit = 20, offset = 0 } = req.query;
        const list = getUserConsultations(req.user.id, Number(limit), Number(offset));
        res.json({ success: true, consultations: list });
    } catch (err) { next(err); }
});

// GET /api/consultations/:id
router.get('/:id', async (req, res, next) => {
    try {
        const consultation = getConsultation(req.params.id, req.user.id);
        res.json({ success: true, consultation });
    } catch (err) { next(err); }
});

module.exports = router;
