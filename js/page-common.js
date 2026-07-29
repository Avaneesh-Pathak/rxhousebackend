/* ============================================================
   page-common.js
   Lightweight shared behaviour for standalone pages
   (about.html, contact.html, etc.) that live OUTSIDE the
   index.html single-page-app. Keeps header, mobile nav, cart
   badge and floating social buttons working without pulling in
   the full js/app.js SPA router (which expects .page elements
   that don't exist on these standalone templates).
   ============================================================ */

const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://pd.pharmacies.doctor";

/* ---------- Mobile Nav ---------- */
function openMobileMenu() {
    const menu = document.getElementById('mobileNav');
    const overlay = document.getElementById('overlay');
    const hamburger = document.querySelector('.hamburger');
    if (menu) menu.classList.add('open');
    if (overlay) overlay.classList.add('active');
    if (hamburger) hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
    const menu = document.getElementById('mobileNav');
    const overlay = document.getElementById('overlay');
    const hamburger = document.querySelector('.hamburger');
    if (menu) menu.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
}

/* ---------- Cart badge (reads cart saved by index.html SPA) ---------- */
function updateCartBadge() {
    try {
        const cart = JSON.parse(localStorage.getItem('rxhouse-cart') || '[]');
        const count = cart.reduce((a, b) => a + (b.pillQty || b.qty || 0), 0);
        const el = document.getElementById('cartCount');
        if (el) el.textContent = count;
    } catch (e) {
        console.warn('Could not read cart from storage', e);
    }
}

function goToCart() {
    window.location.href = 'index.html?page=cart';
}

/* ---------- Header search -> hands off to the shop page ---------- */
function navSearch(query) {
    if (!query || !query.trim()) return;
    window.location.href = 'index.html?page=shop&q=' + encodeURIComponent(query.trim());
}

/* ---------- Toast (used by pages that don't ship their own) ---------- */
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    const icon = t.querySelector('i');
    const msgEl = document.getElementById('toast-msg');
    if (msgEl) msgEl.textContent = msg;
    if (icon) {
        icon.className = type === 'warning' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
        icon.style.color = type === 'warning' ? '#f97316' : 'var(--teal-light)';
    }
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- Floating social buttons ---------- */
function trackSocialClick(platform) {
    const clickData = {
        platform,
        date: new Date().toLocaleString(),
        fullDate: new Date().toISOString(),
        page: window.location.pathname,
        device: /Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "Desktop",
        browser: navigator.userAgent
    };
    fetch(`${API_BASE}/api/social-clicks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clickData)
    }).catch(err => console.error('Social click tracking failed:', err));
}

function handleWhatsAppClick() {
    window.open('https://wa.me/message/4M7UY3AQI44UG1', '_blank');
    trackSocialClick('WhatsApp');
}

function handleTelegramClick() {
    window.open('https://t.me/Medsathome01', '_blank');
    trackSocialClick('Telegram');
}

function handleSupportClick() {
    window.open('https://wa.me/message/4M7UY3AQI44UG1', '_blank');
    trackSocialClick('Support Chat');
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', updateCartBadge);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMobileMenu(); });

const overlayEl = document.getElementById('overlay');
if (overlayEl) overlayEl.addEventListener('click', closeMobileMenu);
