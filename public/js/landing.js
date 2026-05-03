// تحميل خطط الاشتراك من الـ API وعرضها ديناميكياً
async function loadPricing() {
    try {
        const res   = await fetch('/api/subscriptions/plans');
        const data  = await res.json();
        const plans = data.plans;

        const grid  = document.getElementById('pricingGrid');
        const order = ['free', 'starter', 'professional', 'enterprise'];
        const featured = 'professional';

        grid.innerHTML = order.map(key => {
            const p = plans[key];
            const isFeatured = key === featured;
            const price = p.amount === 0 ? '0' : (p.amount / 100).toLocaleString('ar-SA');
            const cta   = key === 'free'
                ? `<a href="/auth.html" class="btn btn-outline plan-cta">ابدأ مجاناً</a>`
                : key === 'enterprise'
                ? `<a href="mailto:sales@baeinah.sa" class="btn btn-outline plan-cta">تواصل معنا</a>`
                : `<a href="/auth.html" class="btn btn-accent plan-cta" data-plan="${key}">اشترك الآن</a>`;

            return `
            <div class="plan-card ${isFeatured ? 'featured' : ''}">
                ${isFeatured ? '<div class="plan-badge">الأكثر طلباً</div>' : ''}
                <div class="plan-name">${p.label}</div>
                <div class="plan-price">${price} <span>ريال</span></div>
                <div class="plan-period">${key === 'free' ? 'مجاناً دائماً' : 'شهرياً · يُجدَّد تلقائياً'}</div>
                <ul class="plan-features">
                    ${p.features.map(f => `<li>${f}</li>`).join('')}
                </ul>
                ${cta}
            </div>`;
        }).join('');

    } catch {
        document.getElementById('pricingGrid').innerHTML =
            '<p style="text-align:center;color:#64748b;grid-column:1/-1">تعذّر تحميل الأسعار. يرجى إعادة تحميل الصفحة.</p>';
    }
}

// Navbar scroll effect
window.addEventListener('scroll', () => {
    document.getElementById('navbar').style.boxShadow =
        window.scrollY > 20 ? '0 4px 24px rgba(0,0,0,0.25)' : 'none';
});

loadPricing();
