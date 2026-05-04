'use strict';
const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { checkQuota }   = require('../../middleware/quota');
const { upload }       = require('../../middleware/upload');
const service          = require('./consultations.service');
const { buildConsultationPdf } = require('../../shared/pdf.service');

const router = express.Router();
router.use(authenticate);

// GET /api/consultations
router.get('/', async (req, res, next) => {
  try {
    const { case_id, page, limit } = req.query;
    const data = await service.listConsultations({
      orgId:  req.user.organization_id,
      caseId: case_id,
      page:   page ? parseInt(page) : 1,
      limit:  limit ? parseInt(limit) : 20,
    });
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/consultations/:id
router.get('/:id', async (req, res, next) => {
  try {
    const consultation = await service.getConsultation(req.params.id, req.user.organization_id);
    res.json({ consultation });
  } catch (err) { next(err); }
});

// GET /api/consultations/:id/pdf
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const consultation = await service.getConsultation(req.params.id, req.user.organization_id);
    if (consultation.status !== 'completed') {
      return res.status(400).json({ error: 'الاستشارة لم تكتمل بعد' });
    }
    buildConsultationPdf(consultation, res);
  } catch (err) { next(err); }
});

// POST /api/consultations — text analysis
router.post('/', checkQuota, async (req, res, next) => {
  try {
    const { analysis_type, text, case_id, title } = req.body;
    const consultation = await service.createConsultation({
      orgId:        req.user.organization_id,
      userId:       req.user.id,
      analysisType: analysis_type,
      caseId:       case_id,
      title,
      text,
    });
    res.status(201).json({ consultation });
  } catch (err) { next(err); }
});

// POST /api/consultations/upload — file analysis
router.post('/upload', checkQuota, upload.single('file'), async (req, res, next) => {
  try {
    const { analysis_type, case_id, title } = req.body;
    if (!req.file) return res.status(400).json({ error: 'الملف مطلوب' });

    const consultation = await service.createConsultation({
      orgId:        req.user.organization_id,
      userId:       req.user.id,
      analysisType: analysis_type,
      caseId:       case_id,
      title,
      file:         req.file,
    });
    res.status(201).json({ consultation });
  } catch (err) { next(err); }
});

module.exports = router;
