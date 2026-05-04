'use strict';
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_TYPES = {
  contracts:   { name: 'تحليل العقود',     law: 'نظام المعاملات المدنية 1444هـ' },
  labor:       { name: 'قانون العمل',       law: 'نظام العمل م/51' },
  companies:   { name: 'قانون الشركات',     law: 'نظام الشركات 1443هـ' },
  healthcare:  { name: 'الرعاية الصحية',   law: 'CBAHI + PDPL' },
  general:     { name: 'استشارة قانونية',  law: 'الأنظمة السعودية' },
};

async function analyzeLegal(text, analysisType, relevantLaws = []) {
  const typeInfo = ANALYSIS_TYPES[analysisType] || ANALYSIS_TYPES.contracts;

  const lawsContext = relevantLaws.length > 0
    ? `\n\nمواد قانونية ذات صلة:\n${relevantLaws.map(l =>
        `- ${l.law_name} المادة ${l.article_number}: ${l.content}`
      ).join('\n')}`
    : '';

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `أنت محامٍ سعودي متخصص في ${typeInfo.name} وفق ${typeInfo.law}.
حلل النص القانوني التالي وأعد JSON فقط بدون أي نص إضافي.
${lawsContext}

النص:
"""
${text.substring(0, 10000)}
"""

أعد JSON بهذا الهيكل:
{
  "executive_summary": "ملخص في 3-5 جمل",
  "risk_level": "critical|high|medium|low",
  "risk_explanation": "شرح المخاطر",
  "compliance_score": 75,
  "document_type": "نوع الوثيقة",
  "key_parties": [],
  "problematic_clauses": [
    { "clause": "", "issue": "", "severity": "high", "recommendation": "" }
  ],
  "legal_recommendations": [
    { "title": "", "description": "", "priority": "urgent|important|advisory" }
  ],
  "legislative_references": [
    { "law": "", "article": "", "relevance": "" }
  ]
}`,
    }],
  });

  const content = message.content[0].text;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude لم يُعد JSON صحيحاً');
  return JSON.parse(jsonMatch[0]);
}

module.exports = { analyzeLegal, ANALYSIS_TYPES };
