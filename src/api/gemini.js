const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// الحل الصحيح لخطأ "Model not found":
// استخدم 'gemini-1.5-flash' وليس 'gemini-1.5-flash-001' أو نسخ قديمة
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

let genAI;

function getClient() {
    if (!genAI) {
        if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY غير موجود في ملف .env');
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    return genAI;
}

async function generateLegalAnalysis(systemPrompt, userContent, options = {}) {
    const client = getClient();
    const model = client.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
            temperature:     options.temperature     ?? 0.2,
            topP:            options.topP            ?? 0.8,
            maxOutputTokens: options.maxOutputTokens ?? 8192,
            responseMimeType: 'application/json',
        },
        systemInstruction: systemPrompt,
    });

    const result = await model.generateContent(userContent);
    const response = result.response;

    if (!response) throw new Error('لم يتم الحصول على استجابة من Gemini API');

    const text = response.text();
    const usageMetadata = response.usageMetadata;

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        // إذا لم تكن الاستجابة JSON نظيفة، استخرجها من الكتلة
        const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } else {
            throw new Error('تعذّر تحليل استجابة Gemini كـ JSON');
        }
    }

    return {
        data:        parsed,
        tokensUsed:  usageMetadata?.totalTokenCount || 0,
        promptTokens: usageMetadata?.promptTokenCount || 0,
    };
}

module.exports = { generateLegalAnalysis };
