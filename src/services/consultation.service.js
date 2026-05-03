const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { generateLegalAnalysis } = require('../api/gemini');
const { SYSTEM_PROMPT_CONTRACT } = require('../prompts/contract.prompt');
const { SYSTEM_PROMPT_LABOR }    = require('../prompts/labor.prompt');
const { SYSTEM_PROMPT_MEDICAL }  = require('../prompts/medical.prompt');
const { SYSTEM_PROMPT_COMPANY }  = require('../prompts/company.prompt');

const PROMPTS = {
    contract_analysis: SYSTEM_PROMPT_CONTRACT,
    labor_law:         SYSTEM_PROMPT_LABOR,
    medical_law:       SYSTEM_PROMPT_MEDICAL,
    company_law:       SYSTEM_PROMPT_COMPANY,
};

const CREDIT_COSTS = {
    contract_analysis: 2,
    labor_law:         1,
    medical_law:       2,
    company_law:       1,
    general:           1,
};

async function createConsultation(userId, type, inputText, fileMetadata = null) {
    const db = getDb();

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('المستخدم غير موجود');

    const cost = CREDIT_COSTS[type] || 1;
    if (user.plan === 'free' && user.credits < cost) {
        throw new Error('رصيد الاستشارات غير كافٍ. يرجى الترقية إلى خطة مدفوعة.');
    }

    const consultationId = uuidv4();
    const inputFilePath  = fileMetadata ? fileMetadata.originalName : null;

    db.prepare(`
        INSERT INTO consultations (id, user_id, type, status, input_text, input_file_path, cost_credits)
        VALUES (?, ?, ?, 'processing', ?, ?, ?)
    `).run(consultationId, userId, type, inputText, inputFilePath, cost);

    try {
        const systemPrompt = PROMPTS[type] || PROMPTS.contract_analysis;
        const userMessage  = buildUserMessage(type, inputText);

        const { data, tokensUsed } = await generateLegalAnalysis(systemPrompt, userMessage);

        db.prepare(`
            UPDATE consultations
            SET status = 'completed', result_json = ?, risk_level = ?,
                tokens_used = ?, completed_at = datetime('now')
            WHERE id = ?
        `).run(JSON.stringify(data), data.risk_level || 'medium', tokensUsed, consultationId);

        if (user.plan === 'free') {
            db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(cost, userId);
        }

        if (type === 'contract_analysis' && data) {
            db.prepare(`
                INSERT INTO contract_analyses
                (id, consultation_id, contract_type, parties, obligations, risks,
                 violations, recommendations, summary_ar, legal_references)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                uuidv4(), consultationId,
                data.contract_type  || '',
                JSON.stringify(data.parties        || []),
                JSON.stringify(data.obligations    || []),
                JSON.stringify(data.risks          || []),
                JSON.stringify(data.violations     || []),
                JSON.stringify(data.recommendations || []),
                data.summary_ar    || '',
                JSON.stringify(data.legal_references || []),
            );
        }

        return { consultationId, result: data, tokensUsed };

    } catch (err) {
        db.prepare(`UPDATE consultations SET status = 'failed' WHERE id = ?`).run(consultationId);
        throw err;
    }
}

function buildUserMessage(type, inputText) {
    const labels = {
        contract_analysis: 'العقد التالي',
        labor_law:         'عقد العمل أو المسألة العمالية التالية',
        medical_law:       'الوثيقة الطبية أو المسألة الصحية التالية',
        company_law:       'وثيقة الشركة أو المسألة التجارية التالية',
        general:           'الاستفسار القانوني التالي',
    };
    const label = labels[type] || 'الوثيقة التالية';
    return `يرجى تحليل ${label} وفق الأنظمة السعودية المعمول بها:\n\n${inputText}`;
}

function getConsultation(consultationId, userId) {
    const db = getDb();
    const consultation = db.prepare(
        'SELECT * FROM consultations WHERE id = ? AND user_id = ?'
    ).get(consultationId, userId);

    if (!consultation) throw new Error('الاستشارة غير موجودة أو غير مصرّح بالوصول إليها');

    if (consultation.result_json) {
        consultation.result = JSON.parse(consultation.result_json);
        delete consultation.result_json;
    }
    return consultation;
}

function getUserConsultations(userId, limit = 20, offset = 0) {
    const db = getDb();
    return db.prepare(`
        SELECT id, type, status, risk_level, cost_credits, created_at, completed_at
        FROM consultations
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `).all(userId, limit, offset);
}

module.exports = { createConsultation, getConsultation, getUserConsultations };
