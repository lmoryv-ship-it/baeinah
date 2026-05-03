const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './data/baeinah.db';

let db;

function getDb() {
    if (db) return db;

    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);

    // migration: أضف trial_ends_at إن لم يكن موجوداً
    const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    if (!cols.includes('trial_ends_at')) {
        db.exec(`ALTER TABLE users ADD COLUMN trial_ends_at TEXT NOT NULL DEFAULT (datetime('now','+3 days'))`);
    }

    return db;
}

function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = { getDb, closeDb };
