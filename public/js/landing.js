// تحميل خطط الاشتراك من الـ API وعرضها ديناميكياً
async function loadPricing() {
    try {
        const res   = await fetch('/api/subscriptions/plans');
        const data  = await res.json();
        const plans = data.plans;
        const token = localStorage.getItem('baeinah_token');

        const grid     = document.getElementById('pricingGrid');
        const order    = ['free', 'basic', 'pro'];
        const featured = 'basic';

        grid.innerHTML = order.map(key => {
            const p          = plans[key];
            const isFeatured = key === featured;
            const price      = p.amount === 0 ? '0' : (p.amount / 100).toLocaleString('ar-SA');

            let ctaHref, ctaText, ctaClass;
            if (key === 'free') {
                ctaHref  = token ? '/dashboard.html' : '/auth.html';
                ctaText  = token ? 'لوحة التحكم' : 'ابدأ مجاناً';
                ctaClass = 'btn btn-outline plan-cta';
            } else {
                ctaHref  = token ? `/pricing.html` : `/auth.html#register`;
                ctaText  = 'اشترك الآن';
                ctaClass = 'btn btn-accent plan-cta';
            }

            return `
            <div class="plan-card ${isFeatured ? 'featured' : ''}">
                ${isFeatured ? '<div class="plan-badge">الأكثر طلباً</div>' : ''}
                <div class="plan-name">${p.label}</div>
                <div class="plan-price">${price} <span>ريال</span></div>
                <div class="plan-period">${key === 'free' ? 'مجاناً دائماً' : 'شهرياً · يُجدَّد تلقائياً'}</div>
                <ul class="plan-features">
                    ${p.features.map(f => `<li>${f}</li>`).join('')}
                </ul>
                <a href="${ctaHref}" class="${ctaClass}">${ctaText}</a>
            </div>`;
        }).join('');

    } catch {
        document.getElementById('pricingGrid').innerHTML =
            '<p style="text-align:center;color:#64748b;grid-column:1/-1">تعذّر تحميل الأسعار. يرجى إعادة تحميل الصفحة.</p>';
    }
}

// تحديث شريط التنقل للمستخدمين المسجّلين
function updateNavForAuthState() {
    const token = localStorage.getItem('baeinah_token');
    const user  = (() => { try { return JSON.parse(localStorage.getItem('baeinah_user')); } catch { return null; } })();
    const cta   = document.querySelector('.nav-cta');
    if (!cta) return;

    if (token && user) {
        cta.innerHTML = `
            <a href="/dashboard.html" class="btn btn-ghost">لوحة التحكم</a>
            <a href="/app.html" class="btn btn-accent">استشارة جديدة</a>
        `;
    }
    // تحديث زر Hero أيضاً
    const heroActions = document.querySelector('.hero-actions');
    if (heroActions && token) {
        heroActions.innerHTML = `
            <a href="/app.html" class="btn btn-accent btn-xl">استشارة جديدة ←</a>
            <a href="/dashboard.html" class="btn btn-outline btn-xl">لوحة التحكم</a>
        `;
    }
}

// Navbar scroll effect
window.addEventListener('scroll', () => {
    document.getElementById('navbar').style.boxShadow =
        window.scrollY > 20 ? '0 4px 24px rgba(0,0,0,0.25)' : 'none';
});

updateNavForAuthState();
loadPricing();
