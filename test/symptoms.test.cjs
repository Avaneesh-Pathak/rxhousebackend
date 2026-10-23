const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const guide = require('../assistant-symptom-guide.js');
const { CATALOG } = require('../catalog-pricing.js');
const catalog = Object.entries(CATALOG).map(([id, item]) => ({ id: Number(id), name: item.name, rxRequired: true }));
const respond = message => guide.respond(message, catalog);

test('ordinary pain gets educational nonprescription options, not prescription items', () => {
  const response = respond('pain');
  assert.equal(response.intent, 'symptom');
  assert.equal(response.category, 'pain');
  assert.deepEqual(response.products, []);
  assert.ok(response.otcOptions.some(x => /acetaminophen/i.test(x.name)));
  assert.equal(response.requiresClinicalReview, true);
  assert.equal(response.resources[0].url, '/pain-relief');
});

test('headache, fever, dental pain, allergy and mild back pain have appropriate OTC education', () => {
  for (const symptom of ['headache','fever','toothache','allergies','I have back pain']) {
    const response = respond(symptom);
    assert.equal(response.intent, 'symptom', symptom);
    assert.ok(response.otcOptions.length > 0, symptom);
    assert.equal(response.products.length, 0, symptom);
    assert.ok(response.otcOptions.every(option=>option.name && option.use && option.caution));
  }
});

test('nerve pain, insomnia and ED do not cause automatic prescription recommendations', () => {
  for (const message of ['my legs have nerve pain',"I can't sleep",'erectile dysfunction','I am anxious']) {
    const response = respond(message);
    assert.equal(response.intent, 'symptom');
    assert.deepEqual(response.products, []);
    assert.deepEqual(response.otcOptions, []);
  }
});

test('urgent symptoms suppress medicine cards and OTC options', () => {
  for (const message of ['chest pain', 'pain in my chest', "I can't breathe", 'worst headache of my life', 'I overdosed', 'severe abdominal pain', 'slurred speech']) {
    const response = respond(message);
    assert.equal(response.intent, 'urgent', message);
    assert.deepEqual(response.products, []);
    assert.deepEqual(response.otcOptions, []);
    assert.match(response.reply, /emergency/i);
  }
});

test('pregnancy, kids, medicine interactions and dose questions are routed to clinicians', () => {
  for (const message of ['my son has a fever','I am pregnant and have a headache','what dose for back pain','can i take tramadol for pain?', 'can I combine with oxycodone for pain?', 'I take blood thinners and have joint pain']) {
    const response=respond(message);
    assert.equal(response.intent,'safety',message);
    assert.deepEqual(response.products, []);
    assert.deepEqual(response.otcOptions, []);
  }
});

test('future catalog entries require explicit verified OTC status before showing a product card', () => {
  const fake=[{id:999,name:'Ibuprofen generic',activeIngredient:'Ibuprofen',rxRequired:false,verifiedOtc:true},
              {id:1000,name:'Oxycodone 80 mg',activeIngredient:'Oxycodone',rxRequired:true,verifiedOtc:true},
              {id:1001,name:'Ibuprofen unverified',activeIngredient:'Ibuprofen',rxRequired:false}];
  const response=guide.respond('back pain',fake);
  assert.deepEqual(response.products.map(x=>x.id),[999]);
});

test('named medicine prices and checkout remain catalog lookups, not symptom triage',()=>{
  for(const message of ['Price of Viagra 100mg','How do I order?','Check order status','Show all available medicines','Tramadol Pink 100mg'])assert.equal(guide.classify(message),null,message);
});

test('server and storefront ship the same deterministic safety policy', () => {
  const browser = fs.readFileSync(path.join(__dirname,'../../pharmaciesfrontend/js/rxhouse-gate-ai.js'),'utf8');
  const moduleText = fs.readFileSync(path.join(__dirname,'../assistant-symptom-guide.js'),'utf8');
  assert.ok(browser.startsWith(moduleText));
  assert.match(browser,/renderOtcOptions/);
  assert.match(browser,/renderResourceLinks/);
  assert.match(browser,/const informationalOnly =/);
  assert.match(browser,/prices\.length && !informationalOnly/);
  const html = fs.readFileSync(path.join(__dirname,'../../pharmaciesfrontend/index.html'),'utf8');
  assert.match(html,/rxh-ai-otc-list/);
  assert.match(html,/verifiedOtc/);
});
