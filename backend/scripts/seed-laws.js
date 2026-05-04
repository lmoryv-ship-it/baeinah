'use strict';
/**
 * Seed legal documents into the legal_documents table.
 *
 * Usage:
 *   node scripts/seed-laws.js [path/to/laws.json]
 *
 * JSON format:
 *   [
 *     {
 *       "title": "عقوبة الإخلال بشروط العقد",
 *       "law_name": "نظام المعاملات المدنية 1444هـ",
 *       "article_number": "المادة 123",
 *       "content": "نص المادة القانونية كاملاً...",
 *       "metadata": { "category": "contracts" }
 *     }
 *   ]
 *
 * Note: embedding generation requires a dedicated embeddings API.
 * Set VOYAGE_API_KEY or use OpenAI's text-embedding-3-small and update
 * this script accordingly before seeding production data.
 */
'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { query, pool } = require('../src/config/database');

async function seed(filePath) {
  const resolved = filePath
    ? path.resolve(filePath)
    : path.join(__dirname, '../data/laws.json');

  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    console.error('Create a laws.json file or pass a path as argument.');
    process.exit(1);
  }

  const laws = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  console.log(`Seeding ${laws.length} legal document(s)...`);

  let inserted = 0;
  for (const law of laws) {
    const { title, law_name, article_number, content, metadata } = law;
    if (!title || !law_name || !content) {
      console.warn(`Skipping entry missing required fields: ${JSON.stringify(law).slice(0, 80)}`);
      continue;
    }
    await query(
      `INSERT INTO legal_documents (title, law_name, article_number, content, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [title, law_name, article_number || null, content, metadata ? JSON.stringify(metadata) : null]
    );
    inserted++;
  }

  console.log(`✅ Seeded ${inserted} document(s).`);
  await pool.end();
}

seed(process.argv[2]).catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
