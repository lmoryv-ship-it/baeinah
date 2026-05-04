'use strict';
const express  = require('express');
const service  = require('./auth.service');
const { authenticate } = require('../../middleware/auth');
const { query } = require('../../config/database');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { orgName, orgSlug, name, email, password } = req.body;
    const data = await service.register({ orgName, orgSlug, userName: name, email, password });
    res.status(201).json({
      message: 'تم إنشاء الحساب بنجاح',
      access_token:  data.accessToken,
      refresh_token: data.refreshToken,
      user: data.user,
      org:  data.org,
    });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const data = await service.login({ email, password });
    res.json({
      access_token:  data.accessToken,
      refresh_token: data.refreshToken,
      user: data.user,
    });
  } catch (err) { next(err); }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.body.refresh_token;
    const data  = await service.refreshTokens(token);
    res.json({ access_token: data.accessToken, refresh_token: data.refreshToken });
  } catch (err) { next(err); }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const token = req.body.refresh_token;
    await service.logout(token);
    res.json({ message: 'تم تسجيل الخروج' });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.role, u.last_login, u.created_at,
              u.organization_id,
              o.name AS org_name, o.slug, o.plan, o.quota_used, o.quota_limit,
              o.quota_reset_date
       FROM users u JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'الاسم يجب أن يكون حرفين على الأقل' });
    }
    const { rows } = await query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, role',
      [name.trim(), req.user.id]
    );
    res.json({ message: 'تم تحديث الملف الشخصي', user: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    await service.changePassword(req.user.id, current_password, new_password);
    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) { next(err); }
});

module.exports = router;
