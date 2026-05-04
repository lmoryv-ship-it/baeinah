'use strict';

class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
    this.name = 'AppError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'العنصر') {
    super(`${resource} غير موجود`, 404);
    this.name = 'NotFoundError';
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'غير مصرح') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'ليس لديك صلاحية') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

module.exports = { AppError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError };
