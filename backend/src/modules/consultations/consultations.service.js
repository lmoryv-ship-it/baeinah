'use strict';
const fs   = require('fs');
const path = require('path');
const { query, withTransaction } = require('../../config/database');
const { analyzeLegal } = require('../../config/claude');
const { ValidationError, NotFoundError } = require('../../shared/errors');

const MIN_TEXT = 50;
const MAX_TEXT = 40000;

async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const buf = fs.readFileSync(filePath);

  if (ext === '.txt') return buf.toString('utf-8');

  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buf);
    return data.text;
  }

  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const result  = await mammoth.extractRawText({ buffer: buf });
    return result.value;
  }

  throw new ValidationError('نوع الملف غير مدعوم');
}

async function findRelevantLaws(text, analysisType) {
  // Simple keyword-based retrieval (pgvector embeddings can replace this later)
  const keywords = text.substring(0, 500);
  const { rows } = await query(
    `SELECT id, title, law_name, article_number, content
     FROM legal_documents
     WHERE law_name ILIKE $1 OR content ILIKE $2
     ORDER BY created_at DESC
     LIMIT 5`,
    [`%${analysisType}%`, `%${keywords.substring(0, 50)}%`]
  );
  return rows;
}

async function createConsultation({ orgId, userId, analysisType, caseId, title, text, file }) {
  const VALID_TYPES = ['contracts', 'labor', 'companies', 'healthcare', 'general'];
  if (!VALID_TYPES.includes(analysisType)) {
    throw new ValidationError('نوع التحليل غير صالح');
  }

  let inputText = text;
  let fileName  = null;
  let filePath  = null;

  if (file) {
    fileName  = file.originalname;
    filePath  = file.path;
    inputText = await extractText(file.path, file.originalname);
  }

  if (!inputText || inputText.trim().length < MIN_TEXT) {
    throw new ValidationError(`النص يجب أن يكون ${MIN_TEXT} حرفاً على الأقل`);
  }
  if (inputText.length > MAX_TEXT) {
    inputText = inputText.substring(0, MAX_TEXT);
  }

  return withTransaction(async (client) => {
    const { rows: [consultation] } = await client.query(
      `INSERT INTO consultations
         (organization_id, case_id, created_by, analysis_type, title, input_text, file_name, file_path, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing')
       RETURNING id`,
      [orgId, caseId || null, userId, analysisType, title || null, inputText, fileName, filePath]
    );

    const relevantLaws = await findRelevantLaws(inputText, analysisType);
    const { result, tokensUsed } = await (async () => {
      const r = await analyzeLegal(inputText, analysisType, relevantLaws);
      return { result: r, tokensUsed: 0 };
    })();

    const riskLevel = result.risk_level || 'medium';

    await client.query(
      `UPDATE consultations
       SET result = $1, risk_level = $2, status = 'completed', tokens_used = $3
       WHERE id = $4`,
      [JSON.stringify(result), riskLevel, tokensUsed, consultation.id]
    );

    await client.query(
      'UPDATE organizations SET quota_used = quota_used + 1 WHERE id = $1',
      [orgId]
    );

    const { rows: [full] } = await client.query(
      'SELECT * FROM consultations WHERE id = $1',
      [consultation.id]
    );
    return full;
  });
}

async function listConsultations({ orgId, caseId, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const params = [orgId];
  const conditions = ['organization_id = $1'];

  if (caseId) {
    params.push(caseId);
    conditions.push(`case_id = $${params.length}`);
  }

  const where = conditions.join(' AND ');
  params.push(limit, offset);

  const { rows } = await query(
    `SELECT id, analysis_type, title, risk_level, status, file_name, created_at, case_id
     FROM consultations WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*) FROM consultations WHERE ${where}`,
    params.slice(0, params.length - 2)
  );

  return { consultations: rows, total: parseInt(countRows[0].count) };
}

async function getConsultation(id, orgId) {
  const { rows } = await query(
    `SELECT c.*, u.name AS created_by_name, cs.title AS case_title
     FROM consultations c
     LEFT JOIN users u ON u.id = c.created_by
     LEFT JOIN cases cs ON cs.id = c.case_id
     WHERE c.id = $1 AND c.organization_id = $2`,
    [id, orgId]
  );
  if (!rows.length) throw new NotFoundError('الاستشارة');
  return rows[0];
}

module.exports = { createConsultation, listConsultations, getConsultation };
