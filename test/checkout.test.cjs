'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeOrderItems, calculateCatalogPrice, CATALOG } = require('../catalog-pricing.js');

const frontend = path.resolve(__dirname, '../../pharmaciesfrontend');
const index = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
const match = index.match(/<script data-inlined-src="\/js\/app\.js">([\s\S]*?)<\/script>/);
assert.ok(match, 'The live frontend must include the checkout JS');
const liveJavascript = match[1];

function checkoutContext(response) {
    let payload;
    let toast = '';
    let navigation = '';
    let preventDefaultCount = 0;
    const saved = new Map();
    const submitButton = { disabled: false, innerHTML: '<i>Submit</i>', textContent: '' };
    const values = {
        'co-firstname':'Test Customer', 'co-property':'Building 1', 'co-county':'County',
        'co-street':'123 Example St', 'co-city':'Demo City', 'co-state':'Example State',
        'co-zip':'10001', 'co-delivery-notes':'Front desk', 'co-phone':'5551234567',
        'co-email':'sample@example.test'
    };
    const document = {
        addEventListener() {},
        querySelector() { return { value:'Hotel' }; },
        querySelectorAll() { return []; },
        getElementById(id) {
            if (id === 'checkout-form') return { reportValidity:()=>true, querySelector:()=>submitButton, reset() {} };
            if (id === 'co-rx-acknowledgement') return { checked:true };
            return id in values ? { value:values[id] } : null;
        },
    };
    const sandbox = vm.createContext({
        window: { location: { hostname:'localhost' }, addEventListener() {} },
        document,
        sessionStorage: { setItem(key, value) { saved.set(key, value); }, getItem(key) { return saved.get(key); } },
        localStorage: { setItem() {}, getItem:()=>null },
        console, setTimeout:()=>{}, clearTimeout:()=>{},
        fetch:async (url, options) => {
            assert.match(url, /\/api\/orders$/);
            assert.equal(options.method, 'POST');
            payload = JSON.parse(options.body);
            assert.equal(payload.items.length, 1);
            const items = normalizeOrderItems(payload.items);
            assert.equal(items[0].linePrice, 249);
            return { ok:response.ok, status:response.status, json:async()=>response.body };
        },
    });
    vm.runInContext(liveJavascript, sandbox, { filename:'index.html embedded app.js' });
    vm.runInContext(`cart = [{id:1,name:'ASPADOL 100mg',pillQty:90,qty:1,linePrice:249}];\nshowToast = (value) => {globalToast(value)};nav = (value) => {globalNav(value)};`, sandbox);
    sandbox.globalToast = value => { toast = value; };
    sandbox.globalNav = value => { navigation = value; };
    return {
        submit:async()=>{ await sandbox.completeOrder({ preventDefault(){ preventDefaultCount++; } }); return { payload, toast, navigation, saved, submitButton, preventDefaultCount, cartCount:vm.runInContext('cart.length',sandbox) }; },
    };
}

test('live index.html checkout submits catalog ID and stores database reference on success', async () => {
    const ref = 'f30a53b1-1c7f-4b7a-bc0d-db559ccf1fa2';
    const ctx = checkoutContext({ok:true, status:201, body:{success:true,id:ref,totals:{subtotal:249,shipping:0,tax:20.54,total:269.54}}});
    const result = await ctx.submit();
    assert.equal(result.payload.items[0].id, 1);
    assert.equal(result.payload.items[0].pillQty, 90);
    assert.equal(result.payload.rxAcknowledgement, true);
    assert.equal(result.navigation, 'confirmation');
    assert.equal(result.cartCount, 0);
    assert.equal(JSON.parse(result.saved.get('rxhouse-last-order')).id, ref);
    assert.equal(result.submitButton.disabled, false);
    assert.equal(result.preventDefaultCount, 1);
});

test('HTTP 400 error is displayed and checkout keeps cart instead of losing customer data', async () => {
    const ctx = checkoutContext({ok:false,status:400,body:{success:false,error:'Catalog item mismatch. Please clear the cart and add the product again.'}});
    const result = await ctx.submit();
    assert.match(result.toast, /Catalog item mismatch/);
    assert.equal(result.cartCount, 1);
    assert.equal(result.navigation, '');
    assert.equal(result.submitButton.disabled, false);
});

test('pricing accepts catalog IDs and rejects invalid or tampered entries', () => {
    assert.ok(Object.keys(CATALOG).length >= 34);
    assert.equal(calculateCatalogPrice(1,90),249);
    assert.equal(normalizeOrderItems([{id:1,name:'ASPADOL 100mg',pillQty:180,qty:1}])[0].linePrice,449);
    assert.throws(()=>normalizeOrderItems([{name:'ASPADOL 100mg',pillQty:90,qty:1}]),/Unknown catalog item/);
    assert.throws(()=>normalizeOrderItems([{id:1,name:'ASPADOL 100mg',pillQty:999,qty:1}]),/Invalid pill quantity/);
});
