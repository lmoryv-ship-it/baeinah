const { getDb } = require('../db/database');
const { resetQuotaIfDue } = require('../services/subscription.service');

function requireQuota(req, res, next) {
    const db = getDb();

    // أعِد تعيين الحصة إذا جاء الطلب بعد تاريخ الإعادة
    resetQuotaIfDue(req.user.id);

    const user = db.prepare(
        'SELECT plan, subscription_status, quota_used, quota_limit, quota_reset_at, subscription_ends_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    // تحقق من انتهاء الاشتراك المدفوع
    if (user.plan !== 'free' && user.subscription_ends_at) {
        const expired = new Date(user.subscription_ends_at) < new Date();
        if (expired) {
            // رجّع المستخدم للخطة المجانية تلقائياً
            db.prepare(`
                UPDATE users SET plan = 'free', subscription_status = 'none',
                    quota_limit = 3, updated_at = datetime('now')
                WHERE id = ?
            `).run(req.user.id);

            return res.status(402).json({
                error:   'انتهى اشتراكك. يرجى تجديد الاشتراك للمتابعة.',
                code:    'SUBSCRIPTION_EXPIRED',
                upgrade_url: '/#pricing',
            });
        }
    }

    if (user.quota_used >= user.quota_limit) {
        return res.status(429).json({
            error:       `استنفدت حصتك الشهرية (${user.quota_limit} استشارة). تُجدَّد في ${user.quota_reset_at}.`,
            code:        'QUOTA_EXCEEDED',
            quota_used:  user.quota_used,
            quota_limit: user.quota_limit,
            reset_at:    user.quota_reset_at,
            upgrade_url: '/#pricing',
        });
    }

    // أرفق بيانات الحصة للـ service
    req.quota = {
        used:     user.quota_used,
        limit:    user.quota_limit,
        reset_at: user.quota_reset_at,
    };

    next();
}

module.exports = { requireQuota };
