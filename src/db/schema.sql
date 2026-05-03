-- =============================================
-- بَيِّنة - مخطط قاعدة البيانات
-- =============================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- جدول المستخدمين
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    phone       TEXT,
    password_hash TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'individual'
                    CHECK(role IN ('individual','startup','medical','enterprise','admin')),
    plan        TEXT NOT NULL DEFAULT 'free'
                    CHECK(plan IN ('free','basic','professional','enterprise')),
    credits     INTEGER NOT NULL DEFAULT 3,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- جدول الاستشارات
CREATE TABLE IF NOT EXISTS consultations (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            TEXT NOT NULL
                        CHECK(type IN ('contract_analysis','labor_law','company_law','medical_law','general')),
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','processing','completed','failed')),
    input_text      TEXT,
    input_file_path TEXT,
    result_json     TEXT,
    risk_level      TEXT CHECK(risk_level IN ('low','medium','high','critical')),
    tokens_used     INTEGER DEFAULT 0,
    cost_credits    INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT
);

-- جدول تحليلات العقود
CREATE TABLE IF NOT EXISTS contract_analyses (
    id                  TEXT PRIMARY KEY,
    consultation_id     TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    contract_type       TEXT,
    parties             TEXT,        -- JSON: [{name, role}]
    obligations         TEXT,        -- JSON: [{party, obligation, deadline}]
    risks               TEXT,        -- JSON: [{description, severity, article}]
    violations          TEXT,        -- JSON: [{article, description, penalty}]
    recommendations     TEXT,        -- JSON: [string]
    summary_ar          TEXT,
    legal_references    TEXT,        -- JSON: [{law, article, text}]
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- جدول الاشتراكات والمدفوعات
CREATE TABLE IF NOT EXISTS subscriptions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan            TEXT NOT NULL,
    moyasar_id      TEXT UNIQUE,
    amount          INTEGER NOT NULL,    -- بالهللة (أصغر وحدة للريال)
    currency        TEXT NOT NULL DEFAULT 'SAR',
    status          TEXT NOT NULL DEFAULT 'initiated'
                        CHECK(status IN ('initiated','paid','failed','refunded','expired')),
    started_at      TEXT,
    expires_at      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- جدول المؤسسات (للبيع للشركات الطبية)
CREATE TABLE IF NOT EXISTS organizations (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK(type IN ('hospital','clinic','startup','company')),
    cr_number       TEXT UNIQUE,        -- رقم السجل التجاري
    contact_email   TEXT NOT NULL,
    contact_phone   TEXT,
    plan            TEXT NOT NULL DEFAULT 'enterprise',
    api_key         TEXT UNIQUE,        -- مفتاح API للدمج المباشر
    monthly_limit   INTEGER DEFAULT 1000,
    used_this_month INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- جدول أعضاء المؤسسة
CREATE TABLE IF NOT EXISTS org_members (
    org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member','viewer')),
    PRIMARY KEY (org_id, user_id)
);

-- فهارس الأداء
CREATE INDEX IF NOT EXISTS idx_consultations_user    ON consultations(user_id);
CREATE INDEX IF NOT EXISTS idx_consultations_type    ON consultations(type);
CREATE INDEX IF NOT EXISTS idx_consultations_status  ON consultations(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user    ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user      ON org_members(user_id);
