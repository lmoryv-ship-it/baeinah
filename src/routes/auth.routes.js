const express = require('express');
const router  = express.Router();
const { register, login, refreshToken } = require('../services/auth.service');
const { requireAuth } = require('../middleware/auth.middleware');
const { getDb } = require('../db/database');

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
    try {
        const { name, email, phone, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'الحقول المطلوبة: name, email, password' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة' });
        }

        const result = await register({ name, email, phone, password, role });
        res.status(201).json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
        }

        const result = await login({ email, password });
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res, next) => {
    try {
        const { refreshToken: token } = req.body;
        if (!token) return res.status(400).json({ error: 'refreshToken مطلوب' });

        const tokens = refreshToken(token);
        res.json({ success: true, ...tokens });
    } catch (err) {
        next(err);
    }
});

// GET /api/auth/me  — بيانات المستخدم الحالي
router.get('/me', requireAuth, (req, res) => {
    const db   = getDb();
    const user = db.prepare(
        `SELECT id, name, email, phone, role, plan,
                quota_used, quota_limit, quota_reset_at,
                subscription_status, subscription_ends_at, created_at
         FROM users WHERE id = ?`
    ).get(req.user.id);

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ success: true, user });
});

module.exports = router;
