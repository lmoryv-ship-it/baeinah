const { getDb } = require('../db/database');
const { resetQuotaIfDue } = require('../services/subscription.service');

function requireQuota(req, res, next) {
    const db = getDb();

    resetQuotaIfDue(req.user.id);

    const user = db.prepare(
        'SELECT plan, subscription_status, quota_used, quota_limit, quota_reset_at, subscription_ends_at, trial_ends_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const now = new Date();

    // مستخدم في فترة التجربة المجانية
    if (user.plan === 'free' && user.subscription_status === 'trialing') {
        const trialExpired = user.trial_ends_at && new Date(user.trial_ends_at) < now;
        if (trialExpired) {
            db.prepare(`UPDATE users SET subscription_status = 'none', updated_at = datetime('now') WHERE id = ?`).run(req.user.id);
            return res.status(402).json({
                error:       'انتهت فترة التجربة المجانية (3 أيام). اشترك الآن للمتابعة.',
                code:        'TRIAL_EXPIRED',
                upgrade_url: '/#pricing',
            });
        }
    }

    // مستخدم مجاني بعد انتهاء التجربة (لا اشتراك نشط)
    if (user.plan === 'free' && user.subscription_status === 'none') {
        return res.status(402).json({
            error:       'انتهت فترة التجربة المجانية. اشترك الآن للمتابعة.',
            code:        'TRIAL_EXPIRED',
            upgrade_url: '/#pricing',
        });
    }

    // انتهى الاشتراك المدفوع
    if (user.plan !== 'free' && user.subscription_ends_at) {
        if (new Date(user.subscription_ends_at) < now) {
            db.prepare(`
                UPDATE users SET plan = 'free', subscription_status = 'none',
                    quota_limit = 5, updated_at = datetime('now')
                WHERE id = ?
            `).run(req.user.id);
            return res.status(402).json({
                error:       'انتهى اشتراكك. يرجى تجديد الاشتراك للمتابعة.',
                code:        'SUBSCRIPTION_EXPIRED',
                upgrade_url: '/#pricing',
            });
        }
    }

    // تجاوز الحصة
    if (user.quota_used >= user.quota_limit) {
        return res.status(429).json({
            error:       `استنفدت حصتك (${user.quota_limit} استشارة). تُجدَّد في ${user.quota_reset_at}.`,
            code:        'QUOTA_EXCEEDED',
            quota_used:  user.quota_used,
            quota_limit: user.quota_limit,
            reset_at:    user.quota_reset_at,
            upgrade_url: '/#pricing',
        });
    }

    req.quota = {
        used:     user.quota_used,
        limit:    user.quota_limit,
        reset_at: user.quota_reset_at,
    };

    next();
}

module.exports = { requireQuota };
