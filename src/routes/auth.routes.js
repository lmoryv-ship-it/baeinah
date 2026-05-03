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
        'SELECT id, name, email, phone, role, plan, quota_used, quota_limit, quota_reset_at, subscription_status, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ success: true, user });
});

// PUT /api/auth/profile  — تحديث الاسم والجوال
router.put('/profile', requireAuth, async (req, res, next) => {
    try {
        const { name, phone } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'الاسم مطلوب' });
        }
        if (name.trim().length < 2) {
            return res.status(400).json({ error: 'الاسم يجب أن يكون حرفين على الأقل' });
        }

        const db = getDb();
        db.prepare(`
            UPDATE users SET name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?
        `).run(name.trim(), phone?.trim() || null, req.user.id);

        const user = db.prepare(
            'SELECT id, name, email, phone, role, plan, quota_used, quota_limit, quota_reset_at, subscription_status FROM users WHERE id = ?'
        ).get(req.user.id);

        res.json({ success: true, user });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/change-password  — تغيير كلمة المرور
router.post('/change-password', requireAuth, async (req, res, next) => {
    try {
        const bcrypt = require('bcryptjs');
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'كلمة المرور الحالية والجديدة مطلوبتان' });
        }
        if (new_password.length < 8) {
            return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' });
        }

        const db   = getDb();
        const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

        const valid = await bcrypt.compare(current_password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });

        const hash = await bcrypt.hash(new_password, 12);
        db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, req.user.id);

        res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
