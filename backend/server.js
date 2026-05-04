'use strict';
require('dotenv').config();
const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const isTest = process.env.NODE_ENV === 'test';

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  credentials: true,
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

const mkLimiter = (max) => isTest
  ? (_req, _res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max,
      message: { error: 'طلبات كثيرة، حاول لاحقاً' },
    });

app.use('/api/auth',          mkLimiter(20),  require('./src/modules/auth/auth.routes'));
app.use('/api/organizations', mkLimiter(100), require('./src/modules/organizations/organizations.routes'));
app.use('/api/cases',         mkLimiter(100), require('./src/modules/cases/cases.routes'));
app.use('/api/consultations', mkLimiter(50),  require('./src/modules/consultations/consultations.routes'));
app.use('/api/admin',         mkLimiter(100), require('./src/modules/admin/admin.routes'));

app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'بَيِّنة', version: '2.0.0' });
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  } else {
    res.status(404).json({ error: 'المسار غير موجود' });
  }
});

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  console.error(`[ERROR] ${status} — ${err.message}`);
  res.status(status).json({ error: err.message || 'حدث خطأ داخلي في الخادم' });
});

if (!isTest) {
  const { testConnection } = require('./src/config/database');
  (async () => {
    await testConnection();
    app.listen(PORT, () => console.log(`🚀 بَيِّنة running on port ${PORT}`));
  })();
}

module.exports = app;
