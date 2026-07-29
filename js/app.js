const API_BASE = window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://pd.pharmacies.doctor";

let medicines = [
    // =========================
    // PAIN MEDS
    // =========================
    { id: 1, name: "ASPADOL 100mg", price: 249, cat: "Pain Meds", badge: "Best Seller", img: "images/aspadol-100.webp", usage: "Used to treat moderate to severe acute pain.", sideEffects: "Common: nausea, dizziness, drowsiness. Consult your pharmacist if side effects persist.", storage: "Store at 68°F—77°F. Keep away from moisture and direct sunlight.", manufacturer: "Signature Pharmaceutical", active: "Tapentadol HCl (100 mg)", rxRequired: true },
    { id: 2, name: "Tramadol Pink 100mg", price: 249, cat: "Pain Meds", badge: "Popular", img: "images/trakem-100-mg-tramadol-tablet--218.jpg", usage: "Used for moderate pain relief.", sideEffects: "Dizziness, drowsiness, headache. Avoid driving until you know effects.", storage: "Store at room temperature 59°F—86°F.", manufacturer: "Hab Pharma", active: "Tramadol HCl (100 mg)", rxRequired: true },
    { id: 3, name: "Somadol 350mg", price: 219, cat: "Pain Meds", badge: "Value", img: "images/somadol-350-carisoprodol-350-mg.jpg", usage: "Muscle relaxant for musculoskeletal pain.", sideEffects: "Drowsiness, dizziness. Do not operate machinery.", storage: "Store between 68°F—77°F.", manufacturer: "Hab Pharma (FDA Registered)", active: "Carisoprodol (350 mg)", rxRequired: true },
    { id: 10, name: "Gabapentine 800mg", price: 349, cat: "Pain Meds", badge: "Neuropathic Pain", img: "images/gabasign 800.jpeg", usage: "Used for neuropathic pain and seizure management.", sideEffects: "Dizziness, fatigue, coordination problems.", storage: "Store at room temperature.", manufacturer: "Signature Pharma", active: "Gabapentin (800 mg)", rxRequired: true },
    { id: 13, name: "Pregablin 600mg", price: 349, cat: "Pain Meds", badge: "Neuropathic", img: "images/pregabalin-methylcobalamin-capsules-ip.jpg", usage: "High-dose pregabalin for severe neuropathic pain.", sideEffects: "Dizziness, weight gain, swelling.", storage: "Store at room temperature 59°F—86°F.", manufacturer: "Signature Pharma Ltd.", active: "Pregabalin (600 mg)", rxRequired: true },
    { id: 25, name: "Nervigesic 150mg", price: 279, cat: "Pain Meds", badge: "Neuropathic Pain", img: "images/Nervigesic 150mg.jpg", usage: "Used for neuropathic pain and nerve disorders.", sideEffects: "Sleepiness, dizziness, dry mouth.", storage: "Store below 25°C.", manufacturer: "Signature Pharma", active: "Pregabalin (150 mg)", rxRequired: true },
    { id: 26, name: "Nervigesic 75mg", price: 229, cat: "Pain Meds", badge: "Pain Relief", img: "images/Nervigesic 75mg.jpeg", usage: "Used for nerve pain management.", sideEffects: "Drowsiness, blurred vision.", storage: "Store at room temperature.", manufacturer: "Signature Pharma", active: "Pregabalin (75 mg)", rxRequired: true },
    { id: 27, name: "Nervigesic 300mg", price: 349, cat: "Pain Meds", badge: "High Strength", img: "images/Nervigesic 300mg.jpeg", usage: "Used for severe neuropathic pain.", sideEffects: "Dizziness, fatigue, swelling.", storage: "Store below 30°C.", manufacturer: "Signature Pharma", active: "Pregabalin (300 mg)", rxRequired: true },
    { id: 28, name: "Tapaday 100mg", price: 249, cat: "Pain Meds", badge: "Best Seller", img: "images/Tapaday 100mg.jpg", usage: "Used to treat moderate to severe acute pain.", sideEffects: "Nausea, dizziness, drowsiness, constipation.", storage: "Store at room temperature below 30°C.", manufacturer: "Signature Pharma", active: "Tapentadol (100 mg)", rxRequired: true },
    { id: 29, name: "Tapaday 200mg", price: 349, cat: "Pain Meds", badge: "High Strength", img: "images/Tapaday 200mg.jpg", usage: "Used for severe acute and chronic pain management.", sideEffects: "Sleepiness, dizziness, nausea.", storage: "Store in cool dry place.", manufacturer: "Signature Pharma", active: "Tapentadol (200 mg)", rxRequired: true },
    { id: 30, name: "Topcynta 100mg", price: 279, cat: "Pain Meds", badge: "Popular", img: "images/Topcynta-100-New.jpg", usage: "Effective for moderate to severe pain relief.", sideEffects: "Drowsiness, headache, nausea.", storage: "Store below 25°C.", manufacturer: "Topcynta Pharma", active: "Tapentadol (100 mg)", rxRequired: true },
    { id: 31, name: "Aspadol 200mg", price: 349, cat: "Pain Meds", badge: "Strong Formula", img: "images/Aspadol 200mg.jpg", usage: "Used to manage severe pain conditions.", sideEffects: "Dizziness, constipation, drowsiness.", storage: "Store at room temperature.", manufacturer: "Signature Pharmaceutical", active: "Tapentadol HCl (200 mg)", rxRequired: true },
    { id: 33, name: "Citra 100mg", price: 299, cat: "Men's Health", badge: "Best Seller", img: "images/citra100.jpeg", usage: "Used to treat erectile dysfunction.", sideEffects: "Headache, flushing, nasal congestion, dizziness.", storage: "Store below 30°C in a dry place away from direct sunlight.", manufacturer: "Laboratorios Citra", active: "Sildenafil Citrate (100 mg)", rxRequired: false },
    { id: 34, name: "Oxycodon (OxyContin) 80mg", price: 349, cat: "Pain Meds", badge: "Strong Relief", img: "images/oxcy.jpeg", usage: "Used to manage severe ongoing pain requiring around-the-clock opioid treatment.", sideEffects: "Nausea, vomiting, constipation, lightheadedness, dizziness, drowsiness.", storage: "Store at room temperature away from light and moisture.", manufacturer: "Generic Manufacturer", active: "Oxycodone HCl Extended-Release (80 mg)", rxRequired: true },

    // =========================
    // SLEEP & ANXIETY
    // =========================
    { id: 4, name: "Xanax (Alprazolam) 1mg", price: 349, cat: "Sleep & Anxiety", badge: "Anxiety Relief", img: "images/xanax-alprazolam-1mg--016.jpg", usage: "Used to treat anxiety and panic disorders.", sideEffects: "Drowsiness, dizziness, sedation. Avoid alcohol.", storage: "Store at 59°F—86°F. Keep away from children.", manufacturer: "Signature Pharmaceutical", active: "Alprazolam (1 mg)", rxRequired: true },
    { id: 5, name: "Belbian 10mg", price: 549, cat: "Sleep & Anxiety", badge: "Premium", img: "images/belbian.png", usage: "Used for anxiety and sleep disorders.", sideEffects: "Drowsiness, coordination issues. Use with caution.", storage: "Store in a cool, dry place.", manufacturer: "Fab Pharma", active: "Benzodiazepine (10 mg)", rxRequired: true },
    { id: 6, name: "Revotril 2mg", price: 549, cat: "Sleep & Anxiety", badge: "New", img: "images/rivotril 2mg.jpeg", usage: "Used for anxiety and seizure disorders.", sideEffects: "Sedation, dizziness. Avoid driving.", storage: "Store at room temperature.", manufacturer: "Signature Pharma", active: "Clonazepam (2 mg)", rxRequired: true },
    { id: 7, name: "Ambian 10mg", price: 399, cat: "Sleep & Anxiety", badge: "Focus & Energy", img: "images/ambien.jpg", usage: "Used for short-term treatment of insomnia.", sideEffects: "Drowsiness next day. Avoid alcohol.", storage: "Store below 77°F.", manufacturer: "Hab Pharma", active: "Zolpidem (10 mg)", rxRequired: true },
    { id: 8, name: "Ativan 2mg", price: 399, cat: "Sleep & Anxiety", badge: "Popular", img: "images/Activian 200.jpeg", usage: "Used for anxiety disorder and insomnia.", sideEffects: "Sedation, drowsiness. Avoid concurrent use with CNS depressants.", storage: "Store at room temperature.", manufacturer: "Pharmaceutical Labs", active: "Lorazepam (2 mg)", rxRequired: true },
    { id: 9, name: "Bensedin 10mg", price: 549, cat: "Sleep & Anxiety", badge: "Value Pack", img: "images/bendin.jpeg", usage: "Benzodiazepine for anxiety and muscle spasms.", sideEffects: "Drowsiness, dizziness. May cause dependence.", storage: "Store in cool, dry place.", manufacturer: "Fab Pharma", active: "Diazepam (10 mg)", rxRequired: true },
    { id: 32, name: "Adderall 30mg", price: 399, cat: "Sleep & Anxiety", badge: "Focus & Energy", img: "images/Adderall.jpeg", usage: "Used to treat attention deficit hyperactivity disorder (ADHD) and narcolepsy.", sideEffects: "Loss of appetite, dry mouth, sleep problems, headache, weight loss.", storage: "Store at 68°F—77°F. Keep in a safe, secure location.", manufacturer: "Generic Manufacturer", active: "Dextroamphetamine / Amphetamine (30 mg)", rxRequired: true },

    // =========================
    // MEN'S HEALTH
    // =========================
    { id: 11, name: "Viagra 100mg", price: 249, cat: "Men's Health", badge: "Popular", img: "images/viagra 100 mg.jpeg", usage: "Used to treat erectile dysfunction.", sideEffects: "Headache, flushing, indigestion. Avoid with nitrates.", storage: "Store at room temperature.", manufacturer: "Pfizer Generic", active: "Sildenafil Citrate (100 mg)", rxRequired: false },
    { id: 12, name: "Viagra 200mg", price: 249, cat: "Men's Health", badge: "High Dose", img: "images/viagra 200.jpg", usage: "Higher dose sildenafil for ED treatment.", sideEffects: "Headache, flushing, vision changes.", storage: "Store below 86°F.", manufacturer: "Signature Pharma", active: "Sildenafil Citrate (200 mg)", rxRequired: false },
    { id: 14, name: "Aurogra 100mg", price: 249, cat: "Men's Health", badge: "Popular", img: "images/aurogra_100mg_4x3.jpg", usage: "Used to treat erectile dysfunction.", sideEffects: "Headache, flushing, dizziness.", storage: "Store below 86°F.", manufacturer: "Aurochem", active: "Sildenafil Citrate (100 mg)", rxRequired: false },
    { id: 15, name: "Cenforce 200mg", price: 299, cat: "Men's Health", badge: "High Dose", img: "images/cenforce 200.jpg", usage: "Used for erectile dysfunction treatment.", sideEffects: "Headache, nasal congestion, flushing.", storage: "Store at room temperature.", manufacturer: "Centurion Laboratories", active: "Sildenafil Citrate (200 mg)", rxRequired: false },
    { id: 16, name: "Cenforce Professional", price: 329, cat: "Men's Health", badge: "Professional", img: "images/cenforce-professional-100mg-500x500.webp", usage: "Sublingual ED medication for faster action.", sideEffects: "Dizziness, headache, flushing.", storage: "Store in cool dry place.", manufacturer: "Centurion Laboratories", active: "Sildenafil Citrate", rxRequired: false },
    { id: 17, name: "Malegra 200mg", price: 289, cat: "Men's Health", badge: "Strong Formula", img: "images/malegra-sildenafil-200mg-tablets.jpg", usage: "Used to improve erectile function.", sideEffects: "Upset stomach, headache, flushing.", storage: "Store below 30°C.", manufacturer: "Sunrise Remedies", active: "Sildenafil Citrate (200 mg)", rxRequired: false },
    { id: 18, name: "Cenforce 100mg", price: 249, cat: "Men's Health", badge: "Best Seller", img: "images/cenforce100.jpg", usage: "Used to treat erectile dysfunction.", sideEffects: "Headache, dizziness, flushing.", storage: "Store at room temperature.", manufacturer: "Centurion Laboratories", active: "Sildenafil Citrate (100 mg)", rxRequired: false },
    { id: 19, name: "Cenforce 150mg", price: 279, cat: "Men's Health", badge: "Popular", img: "images/cenforce-150mg-sildenafil-150-mg-500x500.webp", usage: "Used for erectile dysfunction support.", sideEffects: "Flushing, dizziness, nausea.", storage: "Store below 86°F.", manufacturer: "Centurion Laboratories", active: "Sildenafil Citrate (150 mg)", rxRequired: false },
    { id: 20, name: "Vidalista 20mg", price: 259, cat: "Men's Health", badge: "Long Lasting", img: "images/vidalista 20.jpg", usage: "Used to treat erectile dysfunction.", sideEffects: "Back pain, headache, muscle aches.", storage: "Store at room temperature.", manufacturer: "Centurion Laboratories", active: "Tadalafil (20 mg)", rxRequired: false },
    { id: 21, name: "Tadalista Super Active", price: 349, cat: "Men's Health", badge: "Premium", img: "images/Tadalista Super Active.jpg", usage: "Fast acting tadalafil softgel for ED.", sideEffects: "Headache, flushing, nasal congestion.", storage: "Store in dry place.", manufacturer: "Fortune Healthcare", active: "Tadalafil", rxRequired: false },
    { id: 22, name: "Vidalista 40mg", price: 299, cat: "Men's Health", badge: "Extra Strength", img: "images/Vidalista 40mg.jpg", usage: "Long-lasting erectile dysfunction medication.", sideEffects: "Back pain, dizziness, flushing.", storage: "Store below 30°C.", manufacturer: "Centurion Laboratories", active: "Tadalafil (40 mg)", rxRequired: false },
    { id: 23, name: "Vidalista 60mg", price: 349, cat: "Men's Health", badge: "Maximum Strength", img: "images/Vidalista 60mg.jpg", usage: "High strength tadalafil for ED.", sideEffects: "Muscle pain, headache, indigestion.", storage: "Store at room temperature.", manufacturer: "Centurion Laboratories", active: "Tadalafil (60 mg)", rxRequired: false },
    { id: 24, name: "Vidalista Professional", price: 329, cat: "Men's Health", badge: "Professional", img: "images/Vidalista Professional.jpeg", usage: "Sublingual tadalafil for faster response.", sideEffects: "Headache, dizziness, flushing.", storage: "Store in cool place.", manufacturer: "Centurion Laboratories", active: "Tadalafil", rxRequired: false }
];

let cart = JSON.parse(localStorage.getItem('rxhouse-cart') || '[]');
let currentMedId = null;

function openMobileMenu() {
    document.getElementById('mobileNav').classList.add('open');
    document.getElementById('overlay').classList.add('active');
}

function closeMobileMenu() {
    document.getElementById('mobileNav').classList.remove('open');
    document.getElementById('overlay').classList.remove('active');
}

function nav(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-links [data-page], .mobile-nav [data-page]')
        .forEach(item => item.classList.remove('active-nav'));

    document.querySelectorAll(`.nav-links [data-page="${pageId}"], .mobile-nav [data-page="${pageId}"]`)
        .forEach(item => item.classList.add('active-nav'));

    const el = document.getElementById(pageId + '-page');
    if (el) {
        el.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    history.replaceState(null, "", window.location.pathname);

    if (pageId === 'cart') renderCart();
    if (pageId === 'checkout') updateCheckoutSummary();
}

function handleInitialHash() {
    try {
        const raw = (location.hash || '').replace('#', '').trim();
        if (!raw) return;
        if (document.getElementById(raw + '-page')) {
            nav(raw);
            return;
        }
        const el = document.getElementById(raw);
        if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 120);
    } catch (e) {
        console.warn('handleInitialHash error', e);
    }
}

function navSearch(query) {
    if (!query.trim()) return;
    nav('shop');
    setTimeout(() => {
        document.getElementById('medicine-search').value = query;
        searchMedicines(query);
        document.getElementById('medicine-search').focus();
    }, 100);
}

function goToCart() {
    if (cart.length === 0) {
        showToast('Your cart is empty', 'warning');
        return;
    }
    nav('cart');
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    const icon = t.querySelector('i');
    document.getElementById('toast-msg').textContent = msg;
    icon.className = type === 'warning' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
    icon.style.color = type === 'warning' ? '#f97316' : 'var(--teal-light)';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3200);
}

function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function renderCard(med) {
    const pageUrl = slug(med.name) + '.html';
    const price = typeof med.price === 'string' ? parseFloat(med.price) : med.price;
    return `
        <div class="product-card" onclick="window.location.href='${pageUrl}'">
            <div class="product-img">
                <img src="${med.img}" alt="${med.name}" width="400" height="300" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=400'">
                <span class="product-cat">${med.cat}</span>
                ${med.badge ? `<span class="product-badge">${med.badge}</span>` : ''}
            </div>
            <div class="product-body">
                <div class="product-brand">${med.manufacturer}</div>
                <div class="product-name">${med.name}</div>
                <div class="product-desc">${med.active} &mdash; <span style="color:var(--accent);font-weight:700;">with free rx online</span></div>
                <div class="product-footer">
                    <div class="product-price">$${(price).toFixed(2)}<br><span>/pack</span></div>
                    <div class="product-actions">
                        <a href="${pageUrl}" class="btn-view" onclick="event.stopPropagation()">
                            <i class="fas fa-eye" style="margin-right:5px;"></i>View
                        </a>
                        <button class="btn-add" style="background:var(--navy);" onclick="event.stopPropagation(); openQtyModal(${med.id})">
                            <i class="fas fa-cart-plus" style="margin-right:5px;"></i>Add to Cart
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
}

function initGrids() {
    const homeEl = document.getElementById('home-products');
    const fullEl = document.getElementById('full-shop-grid');
    const painEl = document.getElementById('pain-meds-grid');

    if (homeEl) homeEl.innerHTML = medicines.slice(0, 4).map(renderCard).join('');
    if (fullEl) fullEl.innerHTML = medicines.map(renderCard).join('');
    if (painEl) painEl.innerHTML = medicines.filter(m => m.cat === 'Pain Meds').map(renderCard).join('');
}

function filterShop(el, cat) {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    const catMap = { 'mens': "Men's Health" };
    const actualCat = catMap[cat] || cat;
    const filtered = cat === 'all' ? medicines : medicines.filter(m => m.cat === actualCat);
    const grid = document.getElementById('full-shop-grid');
    grid.style.opacity = '0';
    setTimeout(() => {
        grid.innerHTML = filtered.length ? filtered.map(renderCard).join('') : `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--slate);">No products found.</div>`;
        grid.style.opacity = '1';
        grid.style.transition = 'opacity 0.3s ease';
    }, 200);
}

function searchMedicines(query) {
    const resultCountEl = document.getElementById('search-result-count');
    const grid = document.getElementById('full-shop-grid');

    if (!query.trim()) {
        resultCountEl.style.display = 'none';
        resultCountEl.textContent = '';
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.filter-tab')[0].classList.add('active');
        filterShop(document.querySelectorAll('.filter-tab')[0], 'all');
        return;
    }

    const searchTerm = query.toLowerCase().trim();
    const filtered = medicines.filter(med => {
        const fields = [
            med.name,
            med.active,
            med.manufacturer,
            med.cat,
            searchTerm.length >= 3 ? med.usage : ""
        ];
        return fields.some(field => 
            field.toLowerCase().split(/[^a-z0-9]+/).some(word => word.startsWith(searchTerm))
        );
    });

    resultCountEl.style.display = 'block';
    resultCountEl.textContent = `Found ${filtered.length} medicine${filtered.length !== 1 ? 's' : ''} matching "${query}"`;

    grid.style.opacity = '0';
    setTimeout(() => {
        grid.innerHTML = filtered.length ? filtered.map(renderCard).join('') : `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--slate);"><i class="fas fa-search" style="font-size:48px;display:block;margin-bottom:20px;opacity:0.2;"></i>No medicines found matching "${query}". <br><span style="font-size:13px;opacity:0.7;">Try searching by condition or active ingredient.</span></div>`;
        grid.style.opacity = '1';
        grid.style.transition = 'opacity 0.3s ease';
    }, 200);
}

function openQtyModal(medId) {
    const med = medicines.find(m => m.id === medId);
    currentMedId = medId;

    document.getElementById('qm-name').textContent = med.name;
    document.getElementById('qm-price').textContent = '$' + med.price.toFixed(2);
    document.getElementById('qm-qty-input').value = 90;

    document.querySelectorAll('.qty-preset-btn').forEach(b => b.classList.remove('selected'));
    updateQtyTotal();

    document.getElementById('qty-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeQtyModal() {
    document.getElementById('qty-modal').classList.remove('open');
    document.body.style.overflow = '';
    currentMedId = null;
}

function selectPreset(btn, qty) {
    document.querySelectorAll('.qty-preset-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('qm-qty-input').value = qty;
    updateQtyTotal();
}

function adjustQty(delta) {
    const input = document.getElementById('qm-qty-input');
    const newVal = Math.max(1, parseInt(input.value || 1) + delta);
    input.value = newVal;
    document.querySelectorAll('.qty-preset-btn').forEach(b => {
        b.classList.toggle('selected', parseInt(b.querySelector('.pills-num').textContent) === newVal);
    });
    updateQtyTotal();
}

function onQtyInput() {
    const input = document.getElementById('qm-qty-input');
    const val = parseInt(input.value) || 1;
    document.querySelectorAll('.qty-preset-btn').forEach(b => {
        b.classList.toggle('selected', parseInt(b.querySelector('.pills-num').textContent) === val);
    });
    updateQtyTotal();
}

function calculatePrice(qty, medId = currentMedId || window.currentMedId) {

    if (!medId) return 0;

    const med = medicines.find(m => m.id === medId);
    if (!med) return 0;

    // Custom pricing for medicines that have special quantity discounts
    const rateTable = {
        1:  {90:249,180:449,250:599,300:699},
        4:  {90:349,180:599,250:799,300:899},
        5:  {90:549,180:999,250:1299,300:1499},
        7:  {90:399,180:699,250:899,300:1099},
        8:  {90:399,180:699,250:899,300:1099},
        9:  {90:549,180:999,250:1299,300:1499},
        14: {90:249,180:449,250:599,300:699},
        18: {90:249,180:449,250:599,300:699},
        31: {90:349,180:649,250:849,300:899},
        32: {90:399,180:649,250:849,300:949},
        33: {90:299,180:449,250:579,300:669},
        34: {90:349,180:549,250:719,300:819}
    };

    const config = rateTable[medId];

    // Special pricing medicines
    if (config) {

        if (config[qty] !== undefined)
            return config[qty];

        const pricePerPill = config[90] / 90;
        return +(pricePerPill * qty).toFixed(2);
    }

    // Default pricing for ALL other medicines
    const pricePerPill = med.price / 90;

    if (qty === 90) return med.price;
    if (qty === 180) return +(pricePerPill * 180).toFixed(2);
    if (qty === 250) return +(pricePerPill * 250).toFixed(2);
    if (qty === 300) return +(pricePerPill * 300).toFixed(2);

    return +(pricePerPill * qty).toFixed(2);
}

function updateQtyTotal() {
    console.log("currentMedId =", currentMedId);

    const qty = parseInt(document.getElementById("qm-qty-input").value) || 90;

    console.log("qty =", qty);

    const total = calculatePrice(qty);

    console.log("total =", total);

    document.getElementById("qm-total").textContent = "$" + total.toFixed(2);
}

function confirmAddToCart() {
    if (!currentMedId) return;
    const qty = parseInt(document.getElementById('qm-qty-input').value);

    if (!qty || qty < 1) {
        showToast('Please select a valid quantity.', 'warning');
        return;
    }

    const med = medicines.find(m => m.id === currentMedId);
    if (!med) return;

    const linePrice = parseFloat(calculatePrice(qty).toFixed(2));
    const existing = cart.find(i => i.id === currentMedId);

    if (existing) {
        existing.pillQty = (existing.pillQty || 0) + qty;
        existing.linePrice = parseFloat((existing.linePrice + linePrice).toFixed(2));
    } else {
        cart.push({ ...med, qty: 1, pillQty: qty, linePrice });
    }

    saveCart();
    renderCart();
    closeQtyModal();
    showToast(`${med.name} \u2014 ${qty} pills added to your bag!`);
}

function buyNow(medId) {
    const med = medicines.find(m => m.id === medId);
    if (!med) return;
    const pillQty = 90;
    const linePrice = parseFloat(calculatePrice(pillQty, med.id).toFixed(2));

    cart = [{ ...med, qty: 1, pillQty, linePrice }];
    saveCart();
    nav('checkout');
    updateCheckoutSummary();
    setTimeout(() => { const el = document.getElementById('co-firstname'); if (el) el.focus(); }, 250);
}

function saveCart() {
    localStorage.setItem('rxhouse-cart', JSON.stringify(cart));
    const cartCountEl = document.getElementById('cartCount');
    if (cartCountEl) {
        cartCountEl.textContent = cart.reduce((a, b) => a + (b.pillQty || b.qty || 0), 0);
    }
}

function removePills(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;

    const currentQty = item.pillQty || item.qty;
    const newQty = currentQty + delta;

    if (newQty < 1) {
        removeCartItem(id);
    } else {
        item.pillQty = newQty;
        item.linePrice = parseFloat(calculatePrice(newQty, item.id).toFixed(2));
        saveCart();
        renderCart();
    }
}

function removeCartItem(id) {
    cart = cart.filter(i => i.id !== id);
    saveCart();
    renderCart();
}

function renderCart() {
    const wrap = document.getElementById('cart-inner');
    if (!wrap) return;
    if (cart.length === 0) {
        wrap.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:80px 20px;color:var(--slate);">
                <i class="fas fa-bag-shopping" style="font-size:48px;display:block;margin-bottom:20px;opacity:0.2;"></i>
                <p style="font-size:16px;margin-bottom:24px;">Your bag is empty.</p>
                <button class="btn btn-primary" onclick="nav('shop')">Browse Medications <i class="fas fa-arrow-right"></i></button>
            </div>`;
        return;
    }

    let subtotal = cart.reduce((s, i) => s + (i.linePrice || i.price), 0);
    let shipping = subtotal >= 150 ? 0 : 9.99;
    let tax = subtotal * 0.0825;
    let total = subtotal + shipping + tax;

    wrap.innerHTML = `
        <div class="cart-items-wrap">
            ${cart.map(item => `
                <div class="cart-item">
                    <img src="${item.img}" alt="${item.name}" width="72" height="72" onerror="this.src='https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=100'">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-sub">${item.active} &nbsp;&mdash;&nbsp; ${item.pillQty || item.qty} pills</div>
                    </div>
                    <div class="qty-controls">
                        <button class="qty-btn" onclick="removePills(${item.id}, -1)">&minus;</button>
                        <span class="qty-val">${item.pillQty || item.qty}</span>
                        <button class="qty-btn" onclick="removePills(${item.id}, 1)">+</button>
                    </div>
                    <div class="cart-item-price">$${(item.linePrice || item.price).toFixed(2)}</div>
                    <button onclick="removeCartItem(${item.id})" style="background:none;border:none;cursor:pointer;color:var(--slate);font-size:14px;padding:6px;border-radius:8px;transition:color 0.2s;" title="Remove"><i class="fas fa-trash-can"></i></button>
                </div>`).join('')}
        </div>
        <div class="cart-summary">
            <h3>Order Summary</h3>
            <div class="summary-row"><span>Subtotal (${cart.length} item${cart.length > 1 ? 's' : ''})</span><span>$${subtotal.toFixed(2)}</span></div>
            <div class="summary-row"><span>Shipping</span><span style="color:#16a34a;">${shipping === 0 ? 'FREE' : '$' + shipping.toFixed(2)}</span></div>
            <div class="summary-row"><span>Tax (est. 8.25%)</span><span>$${tax.toFixed(2)}</span></div>
            <div class="summary-row total"><span>Total</span><span>$${total.toFixed(2)}</span></div>
            <button class="btn-full" style="margin-top:20px;" onclick="nav('checkout')"><i class="fas fa-lock" style="margin-right:8px;"></i>Proceed to Checkout</button>
            <p style="text-align:center;font-size:11px;color:var(--slate);margin-top:14px;"><i class="fas fa-shield-halved" style="color:var(--teal);margin-right:6px;"></i>256-bit SSL • PCI-DSS Secure</p>
        </div>`;
}

function updateCheckoutSummary() {
    let sub = cart.reduce((s, i) => s + (i.linePrice || i.price), 0);
    let shipping = sub >= 150 ? 0 : 9.99;
    let tax = sub * 0.0825;
    let total = sub + shipping + tax;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('co-subtotal', '$' + sub.toFixed(2));
    set('co-shipping', shipping === 0 ? 'FREE' : '$' + shipping.toFixed(2));
    set('co-tax', '$' + tax.toFixed(2));
    set('co-total', '$' + total.toFixed(2));
}

async function completeOrder(e) {
    e.preventDefault();

    const billing = {
        firstName: document.getElementById('co-firstname').value,
        company: document.getElementById('co-company').value,
        county: document.getElementById('co-county').value,
        street: document.getElementById('co-street').value,
        city: document.getElementById('co-city').value,
        state: document.getElementById('co-state').value,
        zip: document.getElementById('co-zip').value,
        phone: document.getElementById('co-phone').value,
        email: document.getElementById('co-email').value
    };

    let sub = cart.reduce((s, i) => s + (i.linePrice || i.price), 0);
    let shipping = sub >= 150 ? 0 : 9.99;
    let tax = sub * 0.0825;
    let total = sub + shipping + tax;

    const order = {
        id: Date.now().toString(),
        billing,
        items: cart.map(i => ({
            name: i.name,
            pillQty: i.pillQty || i.qty,
            linePrice: i.linePrice || i.price
        })),
        itemCount: cart.length,
        subtotal: sub,
        shipping,
        tax,
        total,
        date: new Date().toISOString(),
        synced: false
    };

    let existingOrders = JSON.parse(localStorage.getItem('rxhouse-orders') || '[]');
    existingOrders.push(order);
    localStorage.setItem('rxhouse-orders', JSON.stringify(existingOrders));

    try {
        const response = await fetch(`${API_BASE}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(order)
        });

        if (!response.ok) throw new Error('Server rejected order');
        const result = await response.json();
        const idx = existingOrders.findIndex(o => o.id === order.id);

        if (idx !== -1) {
            existingOrders[idx].synced = true;
            localStorage.setItem('rxhouse-orders', JSON.stringify(existingOrders));
        }

        cart = [];
        saveCart();
        document.getElementById('checkout-form').reset();
        showToast('Order submitted successfully!');
        
        setTimeout(() => {
            window.location.href = 'thankyou.html';
        }, 1000);

    } catch (error) {
        console.error(error);
        showToast('Unable to submit order. Please try again.', 'warning');
    }
}

const ADMIN_PASS = '19piyush95';

function validateAdminPass() {
    const pass = document.getElementById('admin-pass-input').value;
    if (pass === ADMIN_PASS) {
        document.getElementById('admin-login-wrap').style.display = 'none';
        document.getElementById('admin-dashboard-wrap').style.display = 'block';
        renderAdminDashboard();
    } else {
        showToast('Invalid password. Please try again.', 'warning');
        document.getElementById('admin-pass-input').value = '';
    }
}

function logoutAdmin() {
    document.getElementById('admin-pass-input').value = '';
    document.getElementById('admin-login-wrap').style.display = 'flex';
    document.getElementById('admin-dashboard-wrap').style.display = 'none';
    nav('home');
}

async function renderAdminDashboard() {
    try {
        const response = await fetch(`${API_BASE}/api/orders`);
        const orders = await response.json();
        const tbody = document.getElementById('orders-table-body');
        if (!tbody) return;

        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
        const avgOrder = totalOrders ? totalRevenue / totalOrders : 0;

        document.getElementById('total-orders').innerText = totalOrders;
        document.getElementById('total-revenue').innerText = '$' + totalRevenue.toFixed(2);
        document.getElementById('avg-order').innerText = '$' + avgOrder.toFixed(2);
        document.getElementById('order-count-label').innerText = totalOrders + ' orders';

        if (!orders.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:#64748b;">No orders found</td></tr>`;
            loadSocialStats();
            return;
        }

        tbody.innerHTML = orders.map(order => {
            const billing = order.billing || {};
            const items = (order.items || []).map(item =>
                `${item.name} (${item.pillqty || item.pillQty || 1} pills)`
            ).join('<br>');

            return `
                <tr>
                    <td>#${String(order.id).slice(-6)}</td>
                    <td>${billing.firstName || ''}<br>${billing.email || ''}<br>${billing.phone || ''}</td>
                    <td>${billing.street || ''} ${billing.city || ''} ${billing.state || ''} ${billing.zip || ''}</td>
                    <td>${items}</td>
                    <td>$${Number(order.total).toFixed(2)}</td>
                    <td>${new Date(order.date).toLocaleString()}</td>
                </tr>`;
        }).join('');

        loadSocialStats();

    } catch (err) {
        console.error('Failed to load orders', err);
        showToast('Failed to load orders', 'warning');
    }
}

function showDetails(id) {
    const med = medicines.find(m => m.id === id);
    document.getElementById('modal-content').innerHTML = `
        <div class="modal-grid">
            <div>
                <img src="${med.img}" alt="${med.name}" width="600" height="450" class="modal-img" onerror="this.src='https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=400'">
                <div class="modal-info-row" style="margin-top:16px;">
                    <div class="modal-info-chip"><label>Active Ingredient</label><p>${med.active}</p></div>
                    <div class="modal-info-chip"><label>Manufacturer</label><p>${med.manufacturer}</p></div>
                    <div class="modal-info-chip"><label>Category</label><p>${med.cat}</p></div>
                    <div class="modal-info-chip"><label>Prescription</label><p>with free rx online</p></div>
                </div>
            </div>
            <div>
                <span style="display:inline-block;background:var(--teal-pale);color:var(--teal);font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:4px 14px;border-radius:100px;margin-bottom:12px;">${med.cat}</span>
                <h2 style="font-size:32px;color:var(--navy);letter-spacing:-0.03em;margin-bottom:24px;">${med.name}</h2>
                <div class="modal-section-title">Indications & Usage</div>
                <div class="modal-section-body">${med.usage}</div>
                <div class="modal-section-title">Potential Side Effects</div>
                <div class="modal-section-body">${med.sideEffects}</div>
                <div class="modal-section-title">Storage Instructions</div>
                <div class="modal-section-body">${med.storage}</div>
                <div style="padding-top:20px;border-top:1px solid var(--light);display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
                    <div>
                        <div style="font-size:11px;color:var(--slate);font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Starting price</div>
                        <div style="font-family:'Syne',sans-serif;font-size:34px;font-weight:800;color:var(--navy);">$${med.price.toFixed(2)}</div>
                    </div>
                    <button class="btn btn-primary" onclick="closeModal(); openQtyModal(${med.id});">Select Qty <i class="fas fa-bag-shopping"></i></button>
                </div>
            </div>
        </div>`;
    document.getElementById('modal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('modal').classList.remove('open');
    document.body.style.overflow = '';
}

const modal = document.getElementById("modal");

if (modal) {
    modal.addEventListener("click", function (e) {
        if (e.target === this) closeModal();
    });
}

const qtyModal = document.getElementById("qty-modal");

if (qtyModal) {
    qtyModal.addEventListener("click", function (e) {
        if (e.target === this) closeQtyModal();
    });
}



async function trackSocialClick(platform) {
    const clickData = {
        platform,
        date: new Date().toLocaleString(),
        fullDate: new Date().toISOString(),
        page: window.location.pathname,
        device: /Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "Desktop",
        browser: navigator.userAgent
    };

    try {
        await fetch(`${API_BASE}/api/social-clicks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clickData)
        });
    } catch (err) {
        console.error('Social click tracking failed:', err);
    }
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

function loadSocialStats() {
    fetch(`${API_BASE}/api/social-clicks`)
        .then(response => {
            if (!response.ok) throw new Error('Network response not ok');
            return response.json();
        })
        .then(serverData => {
            _renderSocialStats(serverData || []);
        })
        .catch(err => {
            console.error('Failed to load social stats:', err);
        });

    function _renderSocialStats(socialData) {
        const whatsappClicks = socialData.filter(item => item.platform === 'WhatsApp').length;
        const telegramClicks = socialData.filter(item => item.platform === 'Telegram').length;
        const supportClicks = socialData.filter(item => item.platform === 'Support Chat').length;

        const waEl = document.getElementById('waClicks');
        const tgEl = document.getElementById('tgClicks');
        const spEl = document.getElementById('supportClicks');

        if (waEl) waEl.innerText = whatsappClicks;
        if (tgEl) tgEl.innerText = telegramClicks;
        if (spEl) spEl.innerText = supportClicks;

        const activityBox = document.getElementById('socialActivity');
        if (!activityBox) return;

        activityBox.innerHTML = '';
        const latest = (socialData.slice().reverse()).slice(0, 10);
        latest.forEach(item => {
            activityBox.innerHTML += `
                <div style="padding:14px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;background:white;">
                    <div style="font-weight:700;color:#0a1628;margin-bottom:6px;">${item.platform}</div>
                    <div style="font-size:13px;color:#64748b;line-height:1.6;">${item.date}<br>Device: ${item.device}</div>
                </div>`;
        });
    }
}

function initializeApp() {
    initGrids();
    saveCart();

    if (typeof syncPendingOrders === 'function') syncPendingOrders();
    if (typeof syncPendingSocialClicks === 'function') syncPendingSocialClicks();

    loadSocialStats();

    // Only run SPA navigation on index.html
    if (document.getElementById("home-page")) {

        const urlParams = new URLSearchParams(window.location.search);
        const page = urlParams.get("page");

        if (page && document.getElementById(page + "-page")) {
            nav(page);
        } else if (location.hash) {
            handleInitialHash();
        } else {
            nav("home");
        }
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeQtyModal(); } });


function goToCart() {
    window.location.href = 'checkout.html';
}

// Make sure clicks on .cart-btn directly navigate if no modal exists
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.cart-btn').forEach(btn => {
        if (btn.tagName !== 'A') {
            btn.addEventListener('click', (e) => {
                window.location.href = 'checkout.html';
            });
        }
    });
});