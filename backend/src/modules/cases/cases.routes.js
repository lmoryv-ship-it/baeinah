'use strict';
const express = require('express');
const { query } = require('../../config/database');
const { authenticate, requireRole } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/cases
router.get('/', async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.organization_id];
    const conditions = ['c.organization_id = $1'];

    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.title ILIKE $${params.length} OR c.client_name ILIKE $${params.length} OR c.case_number ILIKE $${params.length})`);
    }

    const where = conditions.join(' AND ');
    params.push(limit, offset);

    const { rows } = await query(
      `SELECT c.*, u.name AS created_by_name,
              COUNT(con.id) AS consultation_count
       FROM cases c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN consultations con ON con.case_id = c.id
       WHERE ${where}
       GROUP BY c.id, u.name
       ORDER BY c.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM cases c WHERE ${where}`,
      params.slice(0, params.length - 2)
    );

    res.json({
      cases: rows,
      total: parseInt(countRows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) { next(err); }
});

// GET /api/cases/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.*, u.name AS created_by_name
       FROM cases c
       LEFT JOIN users u ON u.id = c.created_by
       WHERE c.id = $1 AND c.organization_id = $2`,
      [req.params.id, req.user.organization_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'القضية غير موجودة' });

    const { rows: consultations } = await query(
      `SELECT id, analysis_type, title, risk_level, status, created_at
       FROM consultations WHERE case_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json({ case: rows[0], consultations });
  } catch (err) { next(err); }
});

// POST /api/cases
router.post('/', async (req, res, next) => {
  try {
    const { title, description, case_number, client_name, status = 'open' } = req.body;
    if (!title) return res.status(400).json({ error: 'عنوان القضية مطلوب' });

    const { rows } = await query(
      `INSERT INTO cases (organization_id, created_by, title, description, case_number, client_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.organization_id, req.user.id, title, description, case_number, client_name, status]
    );
    res.status(201).json({ case: rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/cases/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { title, description, case_number, client_name, status } = req.body;
    const fields  = [];
    const values  = [];

    if (title !== undefined)       { fields.push(`title = $${values.push(title)}`); }
    if (description !== undefined) { fields.push(`description = $${values.push(description)}`); }
    if (case_number !== undefined) { fields.push(`case_number = $${values.push(case_number)}`); }
    if (client_name !== undefined) { fields.push(`client_name = $${values.push(client_name)}`); }
    if (status !== undefined)      { fields.push(`status = $${values.push(status)}`); }

    if (!fields.length) return res.status(400).json({ error: 'لا توجد حقول للتحديث' });

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id, req.user.organization_id);

    const { rows } = await query(
      `UPDATE cases SET ${fields.join(', ')}
       WHERE id = $${values.length - 1} AND organization_id = $${values.length}
       RETURNING *`,
      values
    );

    if (!rows.length) return res.status(404).json({ error: 'القضية غير موجودة' });
    res.json({ case: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/cases/:id
router.delete('/:id', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM cases WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (!rowCount) return res.status(404).json({ error: 'القضية غير موجودة' });
    res.json({ message: 'تم حذف القضية' });
  } catch (err) { next(err); }
});

module.exports = router;
