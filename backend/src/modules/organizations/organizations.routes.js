'use strict';
const express = require('express');
const { query } = require('../../config/database');
const { authenticate, requireRole } = require('../../middleware/auth');

const router = express.Router();

// All routes require auth
router.use(authenticate);

// GET /api/organizations/me — current org details
router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.*, COUNT(u.id) AS member_count
       FROM organizations o
       LEFT JOIN users u ON u.organization_id = o.id AND u.is_active = true
       WHERE o.id = $1
       GROUP BY o.id`,
      [req.user.organization_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'المنظمة غير موجودة' });
    res.json({ org: rows[0] });
  } catch (err) { next(err); }
});

// GET /api/organizations/members
router.get('/members', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, email, role, is_active, last_login, created_at
       FROM users WHERE organization_id = $1 ORDER BY created_at`,
      [req.user.organization_id]
    );
    res.json({ members: rows });
  } catch (err) { next(err); }
});

// POST /api/organizations/members — invite new member
router.post('/members', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const bcrypt = require('bcryptjs');
    const { name, email, role = 'lawyer', password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'الاسم والبريد الإلكتروني وكلمة المرور مطلوبة' });
    }

    const allowedRoles = ['admin', 'lawyer', 'viewer'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'دور غير صالح' });
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (organization_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, created_at`,
      [req.user.organization_id, name, email.toLowerCase(), hash, role]
    );

    res.status(201).json({ message: 'تم إضافة العضو بنجاح', member: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
    next(err);
  }
});

// PATCH /api/organizations/members/:id
router.patch('/members/:id', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { role, is_active } = req.body;
    const updates = [];
    const values  = [];

    if (role !== undefined) {
      const allowed = ['admin', 'lawyer', 'viewer'];
      if (!allowed.includes(role)) return res.status(400).json({ error: 'دور غير صالح' });
      updates.push(`role = $${values.push(role)}`);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${values.push(is_active)}`);
    }
    if (!updates.length) return res.status(400).json({ error: 'لا توجد حقول للتحديث' });

    values.push(req.params.id, req.user.organization_id);
    const { rows } = await query(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND organization_id = $${values.length}
       RETURNING id, name, email, role, is_active`,
      values
    );

    if (!rows.length) return res.status(404).json({ error: 'العضو غير موجود' });
    res.json({ member: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/organizations/members/:id
router.delete('/members/:id', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص' });
    }
    const { rowCount } = await query(
      'DELETE FROM users WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (!rowCount) return res.status(404).json({ error: 'العضو غير موجود' });
    res.json({ message: 'تم حذف العضو' });
  } catch (err) { next(err); }
});

module.exports = router;
