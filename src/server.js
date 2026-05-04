const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const rateLimit = require('express-rate-limit');
const path    = require('path');
require('dotenv').config();

const authRoutes         = require('./routes/auth.routes');
const consultationRoutes = require('./routes/consultation.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const paymentRoutes      = require('./routes/payment.routes');
const adminRoutes        = require('./routes/admin.routes');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting — مُعطَّل في بيئة الاختبار
const isTest = process.env.NODE_ENV === 'test';

const apiLimiter = isTest ? (_req, _res, next) => next() : rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'تجاوزت الحد المسموح به من الطلبات. يرجى الانتظار 15 دقيقة.' },
});
const authLimiter = isTest ? (_req, _res, next) => next() : rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'محاولات كثيرة جداً. يرجى الانتظار 15 دقيقة.' },
});

app.use('/api/auth',          authLimiter, authRoutes);
app.use('/api/consultations', apiLimiter,  consultationRoutes);
app.use('/api/subscriptions', apiLimiter,  subscriptionRoutes);
app.use('/api/payments',      apiLimiter,  paymentRoutes);
app.use('/api/admin',         apiLimiter,  adminRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'بَيِّنة', version: '1.0.0' }));

app.use((err, _req, res, _next) => {
    console.error(err.message);
    res.status(err.status || 500).json({ error: err.message || 'حدث خطأ داخلي في الخادم' });
});

// لا نبدأ الاستماع عند تشغيل الاختبارات (NODE_ENV=test) حتى تتحكم بالمنفذ بنفسها
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`✅ بَيِّنة تعمل على المنفذ ${PORT}`);
    });
}

module.exports = app;
