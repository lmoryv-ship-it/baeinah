'use strict';
require('dotenv').config();
const bcrypt   = require('bcryptjs');
const readline = require('readline');
const { query, pool } = require('../src/config/database');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
  console.log('\n── بَيِّنة — إنشاء مدير منصة ──\n');

  const orgName  = await ask('اسم المنظمة (مثال: فريق الإدارة): ');
  const orgSlug  = await ask('معرّف المنظمة (حروف صغيرة وشرطات): ');
  const name     = await ask('اسم المدير: ');
  const email    = await ask('البريد الإلكتروني: ');
  const password = await ask('كلمة المرور (8 أحرف على الأقل): ');

  if (!orgName || !orgSlug || !name || !email || !password) {
    console.error('جميع الحقول مطلوبة');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('كلمة المرور قصيرة');
    process.exit(1);
  }

  try {
    // Check if org slug exists
    const { rows: existing } = await query('SELECT id FROM organizations WHERE slug = $1', [orgSlug]);
    if (existing.length) {
      console.error('معرّف المنظمة مستخدم بالفعل');
      process.exit(1);
    }

    const { rows: [org] } = await query(
      `INSERT INTO organizations (name, slug, plan, quota_limit)
       VALUES ($1, $2, 'enterprise', 99999) RETURNING id, name, slug`,
      [orgName, orgSlug]
    );

    const hash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await query(
      `INSERT INTO users (organization_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'platform_admin') RETURNING id, name, email, role`,
      [org.id, name, email.toLowerCase(), hash]
    );

    console.log('\n✅ تم إنشاء مدير المنصة بنجاح');
    console.log(`   المنظمة: ${org.name} (${org.slug})`);
    console.log(`   المستخدم: ${user.name} <${user.email}>`);
    console.log(`   الدور: ${user.role}`);
  } catch (err) {
    if (err.code === '23505') console.error('البريد الإلكتروني مستخدم بالفعل');
    else console.error('خطأ:', err.message);
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

main();
