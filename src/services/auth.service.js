const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

const JWT_SECRET          = process.env.JWT_SECRET          || 'change_this_secret';
const JWT_EXPIRES_IN      = process.env.JWT_EXPIRES_IN      || '7d';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '30d';
const BCRYPT_ROUNDS       = 12;

async function register({ name, email, phone, password, role = 'individual' }) {
    const db = getDb();

    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
        throw Object.assign(new Error('البريد الإلكتروني مسجّل مسبقاً'), { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = uuidv4();

    db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, plan)
        VALUES (?, ?, ?, ?, ?, ?, 'free')
    `).run(userId, name, email, phone || null, passwordHash, role);

    const user = db.prepare('SELECT id, name, email, role, plan, quota_used, quota_limit FROM users WHERE id = ?').get(userId);
    const tokens = generateTokens(user);
    return { user, ...tokens };
}

async function login({ email, password }) {
    const db = getDb();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) throw Object.assign(new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة'), { status: 401 });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw Object.assign(new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة'), { status: 401 });

    db.prepare(`UPDATE users SET updated_at = datetime('now') WHERE id = ?`).run(user.id);

    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan, credits: user.credits };
    const tokens = generateTokens(safeUser);
    return { user: safeUser, ...tokens };
}

function refreshToken(token) {
    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET, { ignoreExpiration: false });
    } catch {
        throw Object.assign(new Error('رمز التحديث غير صالح أو منتهي الصلاحية'), { status: 401 });
    }

    if (payload.type !== 'refresh') {
        throw Object.assign(new Error('نوع الرمز غير صحيح'), { status: 401 });
    }

    const db   = getDb();
    const user = db.prepare('SELECT id, name, email, role, plan, credits FROM users WHERE id = ?').get(payload.sub);
    if (!user) throw Object.assign(new Error('المستخدم غير موجود'), { status: 401 });

    return generateTokens(user);
}

function generateTokens(user) {
    const base = { sub: user.id, email: user.email, role: user.role, plan: user.plan };

    const accessToken = jwt.sign(
        { ...base, type: 'access' },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshTokenStr = jwt.sign(
        { ...base, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRES }
    );

    return { accessToken, refreshToken: refreshTokenStr };
}

function verifyAccessToken(token) {
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.type !== 'access') throw new Error('نوع الرمز غير صحيح');
        return payload;
    } catch (err) {
        throw Object.assign(new Error('الجلسة منتهية — يرجى تسجيل الدخول مجدداً'), { status: 401 });
    }
}

module.exports = { register, login, refreshToken, verifyAccessToken };
