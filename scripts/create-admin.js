#!/usr/bin/env node
/**
 * بَيِّنة — إنشاء حساب مدير
 * الاستخدام: node scripts/create-admin.js
 */

require('dotenv').config();
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const readline = require('readline');
const { getDb } = require('../src/db/database');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
    console.log('\n🔐 بَيِّنة — إنشاء حساب مدير\n');

    const name     = (await ask('الاسم الكامل: ')).trim();
    const email    = (await ask('البريد الإلكتروني: ')).trim().toLowerCase();
    const password = (await ask('كلمة المرور (8 أحرف على الأقل): ')).trim();

    rl.close();

    if (!name || !email || !password) {
        console.error('❌ جميع الحقول مطلوبة.'); process.exit(1);
    }
    if (password.length < 8) {
        console.error('❌ كلمة المرور قصيرة جداً.'); process.exit(1);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        console.error('❌ صيغة البريد غير صحيحة.'); process.exit(1);
    }

    const db = getDb();

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
        // ارفع صلاحية حساب موجود
        db.prepare(`UPDATE users SET role = 'admin', updated_at = datetime('now') WHERE email = ?`).run(email);
        console.log(`\n✅ تم ترقية ${email} إلى مدير.\n`);
        process.exit(0);
    }

    const hash   = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, plan, quota_limit)
        VALUES (?, ?, ?, ?, 'admin', 'pro', 9999)
    `).run(userId, name, email, hash);

    console.log(`\n✅ تم إنشاء حساب المدير بنجاح!`);
    console.log(`   البريد: ${email}`);
    console.log(`   الرابط: /admin.html\n`);
    process.exit(0);
}

main().catch(err => { console.error('خطأ:', err.message); process.exit(1); });
