const express = require('express');
const router  = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { getDb } = require('../db/database');

router.use(requireAuth, requireRole('admin'));

// GET /api/admin/stats  — إحصائيات عامة
router.get('/stats', (req, res) => {
    const db = getDb();

    const totalUsers   = db.prepare(`SELECT COUNT(*) as n FROM users`).get().n;
    const paidUsers    = db.prepare(`SELECT COUNT(*) as n FROM users WHERE plan != 'free'`).get().n;
    const totalConsult = db.prepare(`SELECT COUNT(*) as n FROM consultations`).get().n;
    const todayConsult = db.prepare(`SELECT COUNT(*) as n FROM consultations WHERE date(created_at) = date('now')`).get().n;
    const activeSubs   = db.prepare(`SELECT COUNT(*) as n FROM subscriptions WHERE status = 'active'`).get().n;
    const revenue      = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM subscriptions WHERE status = 'active'`).get().total;

    const byType = db.prepare(`
        SELECT type, COUNT(*) as count FROM consultations GROUP BY type ORDER BY count DESC
    `).all();

    const byRisk = db.prepare(`
        SELECT risk_level, COUNT(*) as count FROM consultations
        WHERE status = 'completed' AND risk_level IS NOT NULL
        GROUP BY risk_level
    `).all();

    res.json({
        success: true,
        stats: {
            users:        { total: totalUsers, paid: paidUsers, free: totalUsers - paidUsers },
            consultations:{ total: totalConsult, today: todayConsult },
            subscriptions:{ active: activeSubs, monthly_revenue_sar: revenue / 100 },
            by_type:      byType,
            by_risk:      byRisk,
        },
    });
});

// GET /api/admin/users?page=1&q=search
router.get('/users', (req, res) => {
    const db     = getDb();
    const page   = Math.max(1, Number(req.query.page) || 1);
    const limit  = 20;
    const offset = (page - 1) * limit;
    const q      = req.query.q ? `%${req.query.q}%` : '%';

    const users = db.prepare(`
        SELECT id, name, email, role, plan, subscription_status,
               quota_used, quota_limit, created_at
        FROM users
        WHERE name LIKE ? OR email LIKE ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `).all(q, q, limit, offset);

    const total = db.prepare(`SELECT COUNT(*) as n FROM users WHERE name LIKE ? OR email LIKE ?`).get(q, q).n;

    res.json({ success: true, users, total, page, pages: Math.ceil(total / limit) });
});

// PATCH /api/admin/users/:id/plan  — تغيير خطة مستخدم يدوياً
router.patch('/users/:id/plan', (req, res) => {
    const db   = getDb();
    const { plan } = req.body;

    if (!['free','basic','pro'].includes(plan)) {
        return res.status(400).json({ error: 'خطة غير صالحة' });
    }

    const quotaMap = { free: 3, basic: 100, pro: 500 };

    db.prepare(`
        UPDATE users SET plan = ?, quota_limit = ?, updated_at = datetime('now') WHERE id = ?
    `).run(plan, quotaMap[plan], req.params.id);

    res.json({ success: true });
});

// GET /api/admin/consultations?page=1
router.get('/consultations', (req, res) => {
    const db     = getDb();
    const page   = Math.max(1, Number(req.query.page) || 1);
    const limit  = 25;
    const offset = (page - 1) * limit;

    const rows = db.prepare(`
        SELECT c.id, c.type, c.status, c.risk_level, c.tokens_used, c.created_at,
               u.name as user_name, u.email as user_email, u.plan as user_plan
        FROM consultations c
        JOIN users u ON u.id = c.user_id
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare(`SELECT COUNT(*) as n FROM consultations`).get().n;

    res.json({ success: true, consultations: rows, total, page, pages: Math.ceil(total / limit) });
});

// GET /api/admin/subscriptions
router.get('/subscriptions', (req, res) => {
    const db = getDb();
    const rows = db.prepare(`
        SELECT s.*, u.name as user_name, u.email as user_email
        FROM subscriptions s
        JOIN users u ON u.id = s.user_id
        WHERE s.status IN ('active','past_due','cancelled')
        ORDER BY s.created_at DESC
        LIMIT 50
    `).all();

    res.json({ success: true, subscriptions: rows });
});

// PATCH /api/admin/users/:id/role  — تغيير دور المستخدم
router.patch('/users/:id/role', (req, res) => {
    const db     = getDb();
    const { role } = req.body;
    const VALID_ROLES = ['individual', 'startup', 'medical', 'enterprise', 'admin'];

    if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: 'دور غير صالح' });
    }

    const result = db.prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`).run(role, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'المستخدم غير موجود' });

    res.json({ success: true });
});

// DELETE /api/admin/users/:id  — حذف مستخدم
router.delete('/users/:id', (req, res) => {
    const db = getDb();

    // لا تسمح بحذف الأدمن الأخير
    const adminCount = db.prepare(`SELECT COUNT(*) as n FROM users WHERE role = 'admin'`).get().n;
    const target     = db.prepare(`SELECT role FROM users WHERE id = ?`).get(req.params.id);

    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (target.role === 'admin' && adminCount <= 1) {
        return res.status(400).json({ error: 'لا يمكن حذف المدير الأخير' });
    }

    db.prepare(`DELETE FROM users WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
});

// GET /api/admin/users/:id  — تفاصيل مستخدم
router.get('/users/:id', (req, res) => {
    const db   = getDb();
    const user = db.prepare(`
        SELECT u.*, s.plan as sub_plan, s.status as sub_status,
               s.current_period_end, s.moyasar_id
        FROM users u
        LEFT JOIN subscriptions s ON s.id = u.subscription_id
        WHERE u.id = ?
    `).get(req.params.id);

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    delete user.password_hash;
    res.json({ success: true, user });
});

module.exports = router;
