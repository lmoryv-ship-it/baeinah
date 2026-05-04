'use strict';
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const UPLOAD_DIR   = process.env.UPLOAD_DIR || './uploads';
const MAX_SIZE_MB   = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const ALLOWED_TYPES = ['.pdf', '.docx', '.txt'];
const ALLOWED_MIME  = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext  = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;
  if (ALLOWED_TYPES.includes(ext) && ALLOWED_MIME.includes(mime)) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error('نوع الملف غير مدعوم. يُسمح بـ PDF وDOCX وTXT فقط'), { status: 400 }));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

module.exports = { upload };
