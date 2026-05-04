'use strict';
const { query } = require('../config/database');

async function checkQuota(req, res, next) {
  try {
    const orgId = req.user.organization_id;

    const { rows } = await query(
      `SELECT quota_used, quota_limit, quota_reset_date, plan
       FROM organizations WHERE id = $1 FOR UPDATE`,
      [orgId]
    );

    if (!rows.length) return res.status(404).json({ error: 'المنظمة غير موجودة' });

    const org = rows[0];

    // Lazy monthly reset
    if (org.quota_reset_date && new Date() >= new Date(org.quota_reset_date)) {
      await query(
        `UPDATE organizations
         SET quota_used = 0,
             quota_reset_date = NOW() + INTERVAL '1 month'
         WHERE id = $1`,
        [orgId]
      );
      org.quota_used = 0;
    }

    if (org.quota_used >= org.quota_limit) {
      return res.status(429).json({
        error: 'استنفدت حصتك الشهرية من الاستشارات',
        quota_used: org.quota_used,
        quota_limit: org.quota_limit,
        plan: org.plan,
        upgrade_url: '/pricing',
      });
    }

    req.org = org;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { checkQuota };
