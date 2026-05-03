const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR    = process.env.UPLOAD_DIR || './uploads';
const MAX_SIZE_MB   = 10;
const ALLOWED_TYPES = {
    'application/pdf':                                                  'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword':                                               'doc',
    'text/plain':                                                       'txt',
};

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename:    (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uuidv4()}${ext}`);
    },
});

function fileFilter(_req, file, cb) {
    if (ALLOWED_TYPES[file.mimetype]) {
        cb(null, true);
    } else {
        cb(Object.assign(
            new Error('نوع الملف غير مدعوم. الأنواع المقبولة: PDF, DOCX, DOC, TXT'),
            { status: 415 }
        ));
    }
}

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

module.exports = { upload, UPLOAD_DIR, ALLOWED_TYPES };
