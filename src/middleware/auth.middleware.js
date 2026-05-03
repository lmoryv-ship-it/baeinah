const { verifyAccessToken } = require('../services/auth.service');

function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    }

    try {
        const payload = verifyAccessToken(header.slice(7));
        req.user = { id: payload.sub, email: payload.email, role: payload.role, plan: payload.plan };
        next();
    } catch (err) {
        res.status(err.status || 401).json({ error: err.message });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user?.role)) {
            return res.status(403).json({ error: 'ليس لديك صلاحية للوصول إلى هذا المورد' });
        }
        next();
    };
}

module.exports = { requireAuth, requireRole };
