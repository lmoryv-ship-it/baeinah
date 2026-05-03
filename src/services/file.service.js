const fs   = require('fs');
const path = require('path');

const MIN_TEXT_LENGTH = 50;
const MAX_TEXT_LENGTH = 40000; // ~10k tokens لـ Gemini

async function extractText(filePath, mimetype) {
    const ext = path.extname(filePath).toLowerCase();

    let text;
    if (mimetype === 'application/pdf' || ext === '.pdf') {
        text = await extractFromPdf(filePath);
    } else if (
        mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        ext === '.docx'
    ) {
        text = await extractFromDocx(filePath);
    } else if (mimetype === 'application/msword' || ext === '.doc') {
        throw Object.assign(
            new Error('ملفات .doc القديمة غير مدعومة. يرجى تحويل الملف إلى .docx أو PDF.'),
            { status: 415 }
        );
    } else {
        // TXT
        text = fs.readFileSync(filePath, 'utf8');
    }

    text = text.trim();

    if (text.length < MIN_TEXT_LENGTH) {
        throw Object.assign(
            new Error('الملف لا يحتوي على نص كافٍ للتحليل. قد يكون الملف صورة أو محمياً.'),
            { status: 422 }
        );
    }

    // اقتطع النص إذا تجاوز الحد لتفادي رفض Gemini
    if (text.length > MAX_TEXT_LENGTH) {
        text = text.slice(0, MAX_TEXT_LENGTH) + '\n\n[... تم اقتطاع النص لتجاوزه الحد الأقصى المسموح به ...]';
    }

    return text;
}

async function extractFromPdf(filePath) {
    // pdf-parse يُحمَّل بشكل lazy لتفادي تحذيرات الـ test file عند الاستيراد
    const pdfParse = require('pdf-parse');
    const buffer   = fs.readFileSync(filePath);
    const data     = await pdfParse(buffer);
    return data.text;
}

async function extractFromDocx(filePath) {
    const mammoth = require('mammoth');
    const result  = await mammoth.extractRawText({ path: filePath });
    if (result.messages?.length) {
        const warnings = result.messages.filter(m => m.type === 'warning');
        if (warnings.length) console.warn('تحذيرات mammoth:', warnings.map(w => w.message).join(', '));
    }
    return result.value;
}

function deleteFile(filePath) {
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
        console.error(`تعذّر حذف الملف المؤقت ${filePath}:`, err.message);
    }
}

function getFileMetadata(file) {
    return {
        originalName: file.originalname,
        size:         file.size,
        mimetype:     file.mimetype,
        storedName:   file.filename,
    };
}

module.exports = { extractText, deleteFile, getFileMetadata };
