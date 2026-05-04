'use strict';
const express = require('express');
const { query } = require('../../config/database');
const { authenticate, requirePlatformAdmin } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate, requirePlatformAdmin);

// GET /api/admin/stats
router.get('/stats', async (req, res, next) => {
  try {
    const [orgs, users, consultations, revenue] = await Promise.all([
      query('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active FROM organizations'),
      query('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active FROM users'),
      query(`SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'completed') AS completed,
               COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS this_month
             FROM consultations`),
      query(`SELECT COALESCE(SUM(amount), 0) AS total_sar FROM subscriptions WHERE status = 'active'`),
    ]);

    res.json({
      stats: {
        organizations: orgs.rows[0],
        users:         users.rows[0],
        consultations: consultations.rows[0],
        revenue:       revenue.rows[0],
      },
    });
  } catch (err) { next(err); }
});

// GET /api/admin/organizations
router.get('/organizations', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = '';

    if (search) {
      params.push(`%${search}%`);
      where = `WHERE o.name ILIKE $1 OR o.slug ILIKE $1`;
    }

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT o.*, COUNT(u.id) AS member_count
       FROM organizations o
       LEFT JOIN users u ON u.organization_id = o.id
       ${where}
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ organizations: rows });
  } catch (err) { next(err); }
});

// GET /api/admin/organizations/:id
router.get('/organizations/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.*, COUNT(u.id) AS member_count
       FROM organizations o
       LEFT JOIN users u ON u.organization_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'المنظمة غير موجودة' });

    const { rows: members } = await query(
      'SELECT id, name, email, role, is_active, last_login FROM users WHERE organization_id = $1',
      [req.params.id]
    );

    res.json({ org: rows[0], members });
  } catch (err) { next(err); }
});

// PATCH /api/admin/organizations/:id
router.patch('/organizations/:id', async (req, res, next) => {
  try {
    const { plan, quota_limit, is_active } = req.body;
    const fields = [];
    const values = [];

    if (plan        !== undefined) fields.push(`plan = $${values.push(plan)}`);
    if (quota_limit !== undefined) fields.push(`quota_limit = $${values.push(quota_limit)}`);
    if (is_active   !== undefined) fields.push(`is_active = $${values.push(is_active)}`);

    if (!fields.length) return res.status(400).json({ error: 'لا توجد حقول للتحديث' });

    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE organizations SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'المنظمة غير موجودة' });
    res.json({ org: rows[0] });
  } catch (err) { next(err); }
});

// GET /api/admin/users
router.get('/users', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.last_login,
              o.name AS org_name, o.slug AS org_slug
       FROM users u JOIN organizations o ON o.id = u.organization_id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ users: rows });
  } catch (err) { next(err); }
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', async (req, res, next) => {
  try {
    const { role, is_active } = req.body;
    const fields = [];
    const values = [];

    if (role      !== undefined) fields.push(`role = $${values.push(role)}`);
    if (is_active !== undefined) fields.push(`is_active = $${values.push(is_active)}`);

    if (!fields.length) return res.status(400).json({ error: 'لا توجد حقول للتحديث' });

    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING id, name, email, role, is_active`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

// GET /api/admin/consultations
router.get('/consultations', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const { rows } = await query(
      `SELECT c.id, c.analysis_type, c.risk_level, c.status, c.created_at,
              o.name AS org_name, u.name AS created_by_name
       FROM consultations c
       JOIN organizations o ON o.id = c.organization_id
       LEFT JOIN users u ON u.id = c.created_by
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ consultations: rows });
  } catch (err) { next(err); }
});

module.exports = router;
