'use strict';
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { query, withTransaction } = require('../../config/database');
const { ValidationError, UnauthorizedError, NotFoundError } = require('../../shared/errors');

const ACCESS_EXPIRES  = process.env.JWT_EXPIRES_IN         || '7d';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
const REFRESH_MS      = 30 * 24 * 60 * 60 * 1000;

function signAccess(userId, role, orgId) {
  return jwt.sign(
    { sub: userId, role, org: orgId },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

function signRefresh(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
}

async function register({ orgName, orgSlug, userName, email, password }) {
  if (!orgName || !orgSlug || !userName || !email || !password) {
    throw new ValidationError('جميع الحقول مطلوبة');
  }
  if (password.length < 8) throw new ValidationError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');

  return withTransaction(async (client) => {
    const { rows: existing } = await client.query(
      'SELECT id FROM organizations WHERE slug = $1', [orgSlug]
    );
    if (existing.length) throw new ValidationError('معرّف المنظمة مستخدم بالفعل');

    const { rows: [org] } = await client.query(
      `INSERT INTO organizations (name, slug, plan, quota_limit, quota_reset_date)
       VALUES ($1, $2, 'trial', 10, NOW() + INTERVAL '1 month')
       RETURNING id, name, slug, plan, quota_used, quota_limit`,
      [orgName, orgSlug]
    );

    const hash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await client.query(
      `INSERT INTO users (organization_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'owner')
       RETURNING id, name, email, role`,
      [org.id, userName, email.toLowerCase(), hash]
    );

    const accessToken  = signAccess(user.id, user.role, org.id);
    const refreshToken = signRefresh(user.id);
    const tokenHash    = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [user.id, tokenHash]
    );

    return { accessToken, refreshToken, user, org };
  });
}

async function login({ email, password }) {
  if (!email || !password) throw new ValidationError('البريد الإلكتروني وكلمة المرور مطلوبان');

  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.password_hash, u.is_active,
            u.organization_id,
            o.name AS org_name, o.slug, o.plan, o.quota_used, o.quota_limit, o.is_active AS org_active
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE u.email = $1`,
    [email.toLowerCase()]
  );

  if (!rows.length) throw new UnauthorizedError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  const user = rows[0];

  if (!user.is_active)   throw new UnauthorizedError('الحساب معطّل. يرجى التواصل مع المسؤول.');
  if (!user.org_active)  throw new UnauthorizedError('المنظمة معطّلة. يرجى التواصل مع الدعم.');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new UnauthorizedError('البريد الإلكتروني أو كلمة المرور غير صحيحة');

  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const accessToken  = signAccess(user.id, user.role, user.organization_id);
  const refreshToken = signRefresh(user.id);
  const tokenHash    = crypto.createHash('sha256').update(refreshToken).digest('hex');

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
    [user.id, tokenHash]
  );

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      organization_id: user.organization_id,
      org_name: user.org_name, slug: user.slug,
      plan: user.plan, quota_used: user.quota_used, quota_limit: user.quota_limit,
    },
  };
}

async function refreshTokens(token) {
  if (!token) throw new UnauthorizedError('رمز التحديث مطلوب');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new UnauthorizedError('رمز التحديث غير صالح أو منتهي الصلاحية');
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await query(
    `SELECT rt.id, u.id AS user_id, u.role, u.organization_id, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.user_id = $1 AND rt.token_hash = $2 AND rt.expires_at > NOW()`,
    [payload.sub, tokenHash]
  );

  if (!rows.length) throw new UnauthorizedError('رمز التحديث غير صالح');
  if (!rows[0].is_active) throw new UnauthorizedError('الحساب معطّل');

  const { user_id, role, organization_id } = rows[0];

  await query('DELETE FROM refresh_tokens WHERE id = $1', [rows[0].id]);

  const newAccess  = signAccess(user_id, role, organization_id);
  const newRefresh = signRefresh(user_id);
  const newHash    = crypto.createHash('sha256').update(newRefresh).digest('hex');

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
    [user_id, newHash]
  );

  return { accessToken: newAccess, refreshToken: newRefresh };
}

async function logout(token) {
  if (!token) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
}

async function changePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) throw new ValidationError('كلا الحقلين مطلوبان');
  if (newPassword.length < 8) throw new ValidationError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');

  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!rows.length) throw new NotFoundError('المستخدم');

  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) throw new UnauthorizedError('كلمة المرور الحالية غير صحيحة');

  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);

  // Revoke all refresh tokens
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

module.exports = { register, login, refreshTokens, logout, changePassword };
