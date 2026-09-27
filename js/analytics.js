/* ============================================================
   Pharmacies Doctor — GA4 + GTM conversion tracking
   Measurement: G-8ZC6ZKH2S9
   Replace GTM_CONTAINER_ID with the real GTM-XXXXXXX container ID.
   ============================================================ */
(function (window, document) {
  'use strict';

  const MEASUREMENT_ID = 'G-8ZC6ZKH2S9';
  const GTM_CONTAINER_ID = ''; // REQUIRED for GTM: e.g. GTM-XXXXXXX
  const CURRENCY = 'USD';
  const dataLayer = window.dataLayer = window.dataLayer || [];

  function pushDataLayer(name, params) {
    dataLayer.push(Object.assign({ event: name }, params || {}));
  }

  // Load GTM only when a real container ID is configured.
  if (GTM_CONTAINER_ID && /^GTM-[A-Z0-9]+$/i.test(GTM_CONTAINER_ID) && !window.__pharmGTMLoaded) {
    window.__pharmGTMLoaded = true;
    dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    const gtm = document.createElement('script');
    gtm.async = true;
    gtm.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_CONTAINER_ID);
    document.head.appendChild(gtm);
  }

  // Direct GA4 fallback. GTM can consume the same dataLayer events when enabled.
  if (!window.__pharmGA4Loaded) {
    window.__pharmGA4Loaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    document.head.appendChild(s);
    window.gtag = window.gtag || function(){ dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, {
      send_page_view: false,
      cookie_flags: 'SameSite=None;Secure'
    });
  }

  function event(name, params) {
    const payload = params || {};
    try { pushDataLayer(name, payload); } catch (_) {}
    try { window.gtag('event', name, payload); } catch (_) {}
  }

  function pagePath() { return window.location.pathname || '/'; }
  function pageName() { return document.title || pagePath(); }
  function slugFromPath() {
    const parts = pagePath().split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1].replace(/\.html$/i, '') : 'home';
  }

  function attribution() {
    const p = new URLSearchParams(window.location.search);
    const get = k => p.get(k) || sessionStorage.getItem('pharm_' + k) || '';
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(k => {
      const v = p.get(k);
      if (v) sessionStorage.setItem('pharm_' + k, v);
    });
    return {
      source: get('utm_source') || 'direct',
      medium: get('utm_medium') || '(none)',
      campaign: get('utm_campaign') || '(none)',
      term: get('utm_term'),
      content: get('utm_content')
    };
  }

  function once(key) {
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, '1');
      return true;
    } catch (_) { return true; }
  }

  window.pharmAnalytics = {
    event,
    attribution,
    lead: function(type, params){
      event(type, Object.assign({
        page_location: location.href,
        page_path: pagePath(),
        page_title: pageName(),
        ...attribution()
      }, params || {}));
    },
    viewItem: function(item){
      event('view_item', {
        currency: CURRENCY,
        value: Number(item.price || 0),
        items: [item]
      });
    },
    addToCart: function(item){
      event('add_to_cart', {
        currency: CURRENCY,
        value: Number(item.price || item.linePrice || 0),
        items: [item]
      });
    },
    beginCheckout: function(items, value){
      if (!once('pharm_begin_checkout')) return;
      event('begin_checkout', {
        currency: CURRENCY,
        value: Number(value || 0),
        items: items || []
      });
    },
    purchase: function(order){
      const transactionId = String(order.id || '');
      if (!transactionId || !once('pharm_purchase_' + transactionId)) return;
      event('purchase', {
        transaction_id: transactionId,
        currency: CURRENCY,
        value: Number(order.total || 0),
        shipping: Number(order.shipping || 0),
        tax: Number(order.tax || 0),
        items: (order.items || []).map(function(i, index){
          return {
            item_id: String(i.id || i.itemId || index + 1),
            item_name: i.name || '',
            item_category: i.category || '',
            item_variant: String(i.pillQty || i.pillqty || ''),
            quantity: Number(i.qty || 1),
            price: Number(i.linePrice || i.price || 0)
          };
        })
      });
    }
  };

  document.addEventListener('DOMContentLoaded', function(){
    // Persist UTM attribution before sending the page event.
    const attr = attribution();
    event('page_view', {
      page_title: pageName(),
      page_location: location.href,
      page_path: pagePath(),
      ...attr
    });

    // Product detail -> view_item. Prefer Product JSON-LD already rendered on the page.
    const productSchema = document.querySelector('script[type="application/ld+json"]');
    if (productSchema) {
      try {
        const data = JSON.parse(productSchema.textContent);
        const product = Array.isArray(data)
          ? data.find(x => x && x['@type'] === 'Product')
          : (data && data['@type'] === 'Product' ? data : null);
        if (product) {
          const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
          window.__pharmProduct = {
            item_id: slugFromPath(),
            item_name: product.name || pageName(),
            item_category: product.category || '',
            price: Number(offer && offer.price || 0),
            quantity: 1
          };
          window.pharmAnalytics.viewItem(window.__pharmProduct);
        }
      } catch (_) {}
    }

    // Standalone checkout page.
    if (/\/checkout(?:\.html)?\/?$/i.test(pagePath())) {
      try {
        const cart = JSON.parse(localStorage.getItem('rxhouse-cart') || '[]');
        const items = cart.map(function(i){
          return {
            item_id: String(i.id),
            item_name: i.name,
            item_category: i.cat || '',
            price: Number(i.linePrice || i.price || 0),
            quantity: Number(i.qty || 1)
          };
        });
        const value = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        if (items.length) window.pharmAnalytics.beginCheckout(items, value);
      } catch (_) {}
    }

    document.addEventListener('click', function(e){
      const a = e.target.closest('a,button');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      const text = (a.textContent || '').trim().toLowerCase();

      if (href.indexOf('tel:') === 0) {
        window.pharmAnalytics.lead('phone_click', { link: href });
      }
      if (href.indexOf('mailto:') === 0) {
        window.pharmAnalytics.lead('email_click', { link: href });
      }
      if (/^\/?shop(?:\.html)?(?:[?#]|$)/i.test(href) ||
          /^https:\/\/pharmacies\.doctor\/shop(?:\.html)?(?:[?#]|$)/i.test(href) ||
          /\b(shop|browse medications|view products)\b/.test(text)) {
        event('shop_click', { link_text: text.slice(0,100), link_url: href, page_path: pagePath() });
      }
      if (/contact support|contact us|get support|support/.test(text)) {
        window.pharmAnalytics.lead('support_cta_click', { link_text: text.slice(0,100), link_url: href });
      }
    }, true);
  });
})(window, document);
