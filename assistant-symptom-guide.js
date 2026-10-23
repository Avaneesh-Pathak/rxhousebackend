/**
 * Conservative symptom information for the public pharmacy assistant.
 * This is NOT triage by a clinician, a prescribing tool or an inventory service.
 * Any OTC examples are ingredient-level educational options, NEVER product
 * listings or offers; prescription/controlled drugs are not recommended based
 * on symptoms. Keep this text at the top of the browser assistant bundle.
 */
(function (root, factory) {
  const guide = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = guide;
  if (root) root.RxhouseSymptomGuide = guide;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const check = (q, list) => list.some(re => re.test(q));
  const urgent = [
    /\b(?:chest pain|chest pressure|chest tightness|crushing chest|heart attack|stroke|slurred speech|face droop|one sided weakness|sudden paralysis)\b/,
    /\b(?:pain|pressure|tightness) (?:in|around|across) (?:my |the |your )?chest\b/,
    /\b(?:can t breathe|cannot breathe|difficulty breathing|trouble breathing|shortness of breath|breathless|struggling to breathe|difficulty to breathe|stopped breathing)\b/,
    /\b(?:worst headache|thunderclap headache|sudden severe headache|sudden worst headache)\b/,
    /\b(?:seizure right now|having a seizure|unconscious|passed out|loss of consciousness|fainting with chest pain)\b/,
    /\b(?:throat closing|throat swelling|swollen throat|tongue swelling|swollen tongue|anaphylaxis|severe allergic reaction)\b/,
    /\b(?:overdose|overdosed|poisoning|suicidal|kill myself|end my life|self harm)\b/,
    /\b(?:vomiting blood|coughing blood|heavy bleeding|severe abdominal pain|severe stomach pain|black tarry stools)\b/
  ];
  const sensitivity = /\b(?:pregnant|pregnancy|breastfeeding|breast feeding|nursing baby|infant|newborn|toddler|child|my kid|my son|my daughter|kidney disease|kidney failure|liver disease|liver failure|blood thinners|warfarin|allergic to|allergy to|on medication|other medications)\b/;
  const doseRequests = /\b(?:how many pills|what dose|which dose|dosage|increase my dose|mix with|combine with|is it safe to take|can i take (?:tramadol|oxycodone|xanax|adderall|tapentadol|alprazolam|pregabalin|gabapentin)|should i take (?:tramadol|oxycodone|xanax|adderall|tapentadol|alprazolam|pregabalin|gabapentin))\b/;
  const drugNames = /\b(?:tramadol|oxycodone|oxycontin|tapentadol|aspadol|tapaday|topcynta|somadol|carisoprodol|xanax|alprazolam|ativan|lorazepam|clonazepam|rivotril|revotril|bensedin|zolpidem|ambien|ambian|adderall|pregabalin|nervigesic|gabapentin|gabapentine|viagra|sildenafil|tadalafil|vidalista)\b/;
  const patterns = [
    ['headache',/\b(?:headache|migraine|head pain|head hurts|my head hurts)\b/],
    ['fever',/\b(?:fever|high temperature|feeling feverish)\b/],
    ['stomach',/\b(?:stomach ache|stomach pain|stomach hurts|abdominal pain|tummy ache)\b/],
    ['tooth',/\b(?:toothache|tooth pain|tooth hurts|dental pain)\b/],
    ['allergy',/\b(?:hay fever|allergies|seasonal allergy|sneezing|itchy eyes|runny nose)\b/],
    ['cough',/\b(?:cough|sore throat|common cold|congestion|blocked nose|stuffy nose|flu symptoms|cold symptoms)\b/],
    ['reflux',/\b(?:heartburn|acid reflux|indigestion)\b/],
    ['diarrhea',/\b(?:diarrhea|diarrhoea|loose motions)\b/],
    ['nausea',/\b(?:nausea|vomiting)\b/],
    ['nerve',/\b(?:nerve pain|neuropathic pain|sciatica|shooting pain|tingling|neuropathy|burning nerves)\b/],
    ['ed',/\b(?:erectile dysfunction|erection problems?|impotence|trouble getting an erection|unable to get an erection)\b/],
    ['sleep',/\b(?:insomnia|can t sleep|cannot sleep|trouble sleeping|sleep problems?|sleep issues|anxiety|anxious|panic attacks)\b/],
    ['pain',/\b(?:pain|painful|aches?|aching|hurts?|hurting|sore muscles|muscle soreness|backache|back pain|joint pain|body aches|painkillers?|pain relief)\b/]
  ];
  const otc = {
    pain: [
      {name:'Acetaminophen (paracetamol)',use:'A common nonprescription option for some mild aches and pains.',caution:'Too much can seriously harm the liver; check combination cold products and ask a pharmacist if you have liver disease.'},
      {name:'Ibuprofen',use:'An NSAID sometimes used for short-term muscle or joint pain.',caution:'Not appropriate for everyone, including some people with ulcers, kidney disease, blood-thinner use or pregnancy.'}
    ],
    headache: [{name:'Acetaminophen (paracetamol)',use:'Sometimes used for a mild, familiar headache.',caution:'Avoid duplicate ingredients in combination products; seek urgent care for sudden or unusually severe headache.'},
      {name:'Ibuprofen',use:'Another OTC option for some mild headaches.',caution:'Ask a pharmacist first if pregnant or you have ulcers, kidney problems or take blood thinners.'}],
    fever: [{name:'Acetaminophen (paracetamol)',use:'A common OTC fever-reducing ingredient.',caution:'Never exceed the package directions; ask a professional about persistent fever and any child dosing.'}],
    allergy: [{name:'Loratadine or cetirizine',use:'Nonprescription antihistamines sometimes used for seasonal allergy symptoms.',caution:'Can cause adverse effects or interactions; a pharmacist can check suitability.'}],
    cough: [{name:'Saline nasal spray',use:'A non-medicated option for a blocked or runny nose.',caution:'Different cold and cough products contain different ingredients. Check with a pharmacist before using combinations.'}],
    diarrhea: [{name:'Oral rehydration solution (ORS)',use:'Can help replace lost fluids during diarrhea.',caution:'Persistent diarrhea, dehydration, blood in stool or significant pain needs medical review.'}],
    reflux: [{name:'Calcium carbonate antacid',use:'An OTC option sometimes used for occasional uncomplicated heartburn.',caution:'Frequent heartburn, severe chest discomfort or difficulty swallowing needs clinical evaluation; check interactions with other medicines.'}],
    tooth: [{name:'Acetaminophen (paracetamol)',use:'May temporarily relieve mild dental pain while you arrange a dental visit.',caution:'Painkillers cannot treat an infection or damaged tooth. Facial swelling or fever warrants prompt assessment.'}]
  };
  const descriptions = {
    pain:'Pain has many causes. For mild, uncomplicated aches, a pharmacist may discuss common nonprescription options. Strong opioid and muscle-relaxant products are NOT suitable first-line recommendations from a symptom message.',
    headache:'For a mild, familiar headache, there are commonly used nonprescription ingredients to ask a pharmacist about. A severe, sudden or unusual headache needs assessment.',
    fever:'Fever can result from many conditions. Fluids and rest may help; ask a pharmacist about fever-reducing medicine if suitable.',
    tooth:'Dental pain often needs a dentist to address the cause, even if temporary pain relief helps.',
    allergy:'For seasonal allergy-like symptoms, a pharmacist can discuss nonprescription antihistamines. Severe allergic symptoms require urgent help.',
    cough:'Many coughs and colds improve with supportive care. Prescription pain medicines and sedatives are not appropriate treatments for these complaints.',
    reflux:'Heartburn has several causes. An occasional mild episode may be managed with lifestyle measures; ask a pharmacist if an OTC antacid is appropriate.',
    diarrhea:'For uncomplicated diarrhea, staying hydrated is important. Severe pain, dehydration or blood in stool needs prompt evaluation.',
    nausea:'Nausea can have many causes. Avoid choosing a medicine from this symptom alone; a pharmacist or clinician can help review the cause.',
    nerve:'Tingling, burning or shooting pain may have several causes. Pregabalin and gabapentin require clinician review and are not recommended automatically.',
    ed:'Erection difficulties should be discussed with a licensed clinician. Sildenafil/tadalafil can interact dangerously with nitrates and may be unsafe with certain heart problems.',
    sleep:'For sleep or anxiety symptoms, start by discussing the cause and safer first-line options with a clinician. Benzodiazepines and prescription sleeping pills have significant sedation, interaction and dependence risks.'
  };
  const catalogPath = {pain:'/pain-relief',nerve:'/pain-relief',headache:'/pain-relief',fever:'/shop',tooth:'/pain-relief',allergy:'/shop',cough:'/shop',reflux:'/shop',diarrhea:'/shop',nausea:'/shop',ed:'/mens-health',sleep:'/sleep-anxiety'};
  const special = 'Because you mentioned a child, pregnancy, breastfeeding, a medical condition, allergy or other medication, avoid self-selecting a medicine and check with a clinician or pharmacist first.';
  function classify(message) {
    const q=normalize(message);
    if(!q) return null;
    if(check(q,urgent)) return 'urgent';
    if(doseRequests.test(q)) return 'suitability';
    const hit=patterns.find(([,re])=>re.test(q));
    if(hit && sensitivity.test(q)) return 'suitability';
    // A named prescription medicine plus a personal symptom is NOT a catalog query.
    if(hit && drugNames.test(q) && /\b(?:can|should|take|taking|using|for my|for the|safe)\b/.test(q)) return 'suitability';
    return hit?.[0] || null;
  }
  function respond(message,catalog) {
    const type=classify(message);
    if(!type)return null;
    const q=normalize(message);
    const base={products:[],requiresClinicalReview:true,otcOptions:[],resources:[],medicalAdvice:false};
    if(type==='urgent')return {...base,intent:'urgent',reply:'These symptoms could be an emergency. Call your local emergency number now or seek emergency care. Do not delay care to look for medication online.'};
    if(type==='suitability')return {...base,intent:'safety',reply:`${sensitivity.test(q)?special+' ':''}I cannot determine whether a specific medicine is safe, choose a dose, or assess medicine combinations. Please speak with a licensed clinician or pharmacist who can review your symptoms, age, medical history, medications and allergies. Seek urgent care for severe or worsening symptoms.`};
    const options=otc[type] || [];
    // Educational ingredients only. The supplied catalog is not evidence of OTC status.
    // Allow ONLY explicit, separately verified OTC records in future catalogs.
    const safeCatalog=(Array.isArray(catalog)?catalog:[]).filter(p=>p && p.verifiedOtc===true && p.rxRequired===false && options.some(o=>normalize(p.activeIngredient||'').includes(normalize(o.name.split(' (')[0]))));
    const prefix=descriptions[type];
    const suffix=options.length?'The options below are general educational examples, not personalized instructions and NOT confirmed products in this store. Always check the package label and ask a pharmacist about interactions.':'No medicine can be selected safely for this issue from the symptom alone.';
    const needsDoctor = /\b(?:severe|worse|worsening|persistent|for weeks|for months|repeated|high fever)\b/.test(q);
    return {...base,intent:'symptom',category:type,
      reply:`${prefix}\n\n${suffix}${needsDoctor?' Persistent, severe or worsening symptoms should be assessed promptly.':''}\n\nThe current prescription-heavy catalog is available for independent product-information browsing; its products are not treatment recommendations.`,
      otcOptions:options, products:safeCatalog.slice(0,4), resources:[{label:'Browse related medication information',url:catalogPath[type]}]};
  }
  return {normalize,classify,respond};
});
