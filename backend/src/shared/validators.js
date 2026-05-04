'use strict';
const { ValidationError } = require('./errors');

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE   = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

function assertRequired(fields, body) {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      throw new ValidationError(`الحقل "${f}" مطلوب`);
    }
  }
}

function assertEmail(value, field = 'email') {
  if (!EMAIL_RE.test(value)) throw new ValidationError(`${field} غير صالح`);
}

function assertMinLength(value, min, field) {
  if (String(value).length < min) {
    throw new ValidationError(`${field} يجب أن يكون ${min} حرفاً على الأقل`);
  }
}

function assertMaxLength(value, max, field) {
  if (String(value).length > max) {
    throw new ValidationError(`${field} يجب ألا يتجاوز ${max} حرفاً`);
  }
}

function assertSlug(value) {
  if (!SLUG_RE.test(value)) {
    throw new ValidationError('المعرّف يجب أن يحتوي على أحرف صغيرة وأرقام وشرطات فقط (3-63 حرف)');
  }
}

function assertOneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`قيمة غير صالحة لـ ${field}. القيم المسموحة: ${allowed.join(', ')}`);
  }
}

module.exports = { assertRequired, assertEmail, assertMinLength, assertMaxLength, assertSlug, assertOneOf };
