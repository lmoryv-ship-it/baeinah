'use strict';
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active,
              u.organization_id,
              o.name AS org_name, o.slug AS org_slug,
              o.plan, o.quota_used, o.quota_limit, o.is_active AS org_active
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = $1`,
      [payload.sub]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ error: 'الحساب غير موجود أو معطّل' });
    }
    if (!rows[0].org_active) {
      return res.status(403).json({ error: 'المنظمة معطّلة. يرجى التواصل مع الدعم.' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.' });
    }
    return res.status(401).json({ error: 'رمز المصادقة غير صالح' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لهذا الإجراء' });
    }
    next();
  };
}

function requirePlatformAdmin(req, res, next) {
  if (req.user?.role !== 'platform_admin') {
    return res.status(403).json({ error: 'هذه المنطقة مخصصة لمدراء المنصة فقط' });
  }
  next();
}

module.exports = { authenticate, requireRole, requirePlatformAdmin };
