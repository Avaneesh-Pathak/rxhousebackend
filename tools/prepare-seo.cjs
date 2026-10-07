// Run once after editing templates/assets, then npm run build:seo.
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const sharp = require('sharp');
const root = path.resolve(process.env.FRONTEND_DIR || path.join(__dirname, '../../pharmacies frontnend'));
const site = 'https://pharmacies.doctor';
const privatePages = new Set(['checkout', 'thankyou', 'order-confirmation', 'admin-blog', 'admin-orders', '404']);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  const imageMap = {};
  const imageReport = [];
  const optimized = path.join(root, 'images/optimized');
  fs.mkdirSync(optimized, { recursive: true });
  for (const name of fs.readdirSync(path.join(root, 'images'))) {
    if (!/\.(png|jpe?g|webp)$/i.test(name) || name === 'og-image.jpg') continue;
    const input = path.join(root, 'images', name);
    const output = `images/optimized/${slugify(path.parse(name).name)}.webp`;
    await sharp(input).rotate().resize({ width: name === 'pdlogo.png' ? 420 : 800, withoutEnlargement: true }).webp({ quality: 80, effort: 5 }).toFile(path.join(root, output));
    imageMap[`images/${name}`] = output;
    imageReport.push({ original: name, optimized: output, before: fs.statSync(input).size, after: fs.statSync(path.join(root, output)).size });
  }
  // Keep familiar social-image URL, but encode a real JPEG at the declared size.
  await sharp(path.join(root, 'images/pdlogo.png')).resize(1200, 630, { fit: 'contain', background: '#f0fdfa' }).flatten({ background: '#f0fdfa' }).jpeg({ quality: 83, mozjpeg: true }).toFile(path.join(root, 'images/og-image.jpg'));
  await sharp(path.join(root, 'images/pdlogo.png')).resize(48,48,{fit:'contain',background:'#ffffff'}).png().toFile(path.join(root, 'images/favicon.png'));
  await sharp(path.join(root, 'images/pdlogo.png')).resize(180,180,{fit:'contain',background:'#ffffff'}).png().toFile(path.join(root, 'images/apple-touch-icon.png'));

  // Preserve a local copy of the site's existing hero, avoiding a third-party LCP request.
  const hero = path.join(root, 'images/hero.webp');
  if (!fs.existsSync(hero)) {
    const response = await fetch('https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=80&w=900', { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Hero download: ${response.status}`);
    await sharp(Buffer.from(await response.arrayBuffer())).resize(900,675,{fit:'cover'}).webp({quality:78}).toFile(hero);
  }
  await sharp(hero).resize(480,360).webp({quality:78}).toFile(path.join(root,'images/hero-480.webp'));

  const fontCss = fs.readFileSync(path.join(root,'css/global.min.css'),'utf8').split(':root')[0];
  fs.writeFileSync(path.join(root,'css/fonts.css'),fontCss);
  for (const name of fs.readdirSync(root).filter(x=>x.endsWith('.html'))) {
    const slug = path.basename(name,'.html');
    let html = fs.readFileSync(path.join(root,name),'utf8');
    for (const [oldPath,newPath] of Object.entries(imageMap)) html = html.split(oldPath).join(newPath);
    html = html.replace(/(?<!:)\/\/images\//g,'/images/');
    html = html.replace(/https:\/\/images\.unsplash\.com\/photo-1576091160550-2173dba999ef[^"']*/g,'/images/hero.webp');
    // Preserve styles as heading elements become semantically correct.
    html = html.replace(/\.detail-card h3/g,'.detail-card :is(h2,h3)').replace(/\.footer-col h5/g,'.footer-col :is(h2,h5)').replace(/\.step h4/g,'.step :is(h3,h4)');
    html = html.replaceAll('NABP Digital Pharmacy Verified','Customer Support Available')
      .replaceAll('Verify NABP Accreditation','Customer support information')
      .replaceAll('LegitScript Certified','Secure HTTPS Ordering')
      .replaceAll('Verify LegitScript Certification','Secure website connection')
      .replaceAll('50,000+ Patients Served','Customer Support Available')
      .replaceAll('4.9/5 Patient Rating','Clear Product Information')
      .replaceAll('4.9/5 Stars','Customer Support')
      .replaceAll('State Board Licensed Pharmacy • CA Lic. #RPH-95959','Online Pharmacy Information & Support')
      .replaceAll('STATE BOARD LICENSED PHARMACY','ONLINE PHARMACY INFORMATION & SUPPORT')
      .replaceAll('a state-licensed US pharmaceutical provider','an online pharmacy service')
      .replaceAll('State-Licensed Pharmacy Network:','Pharmacy Service Network:')
      .replaceAll('State-Licensed Pharmacy','Pharmacy Service Information')
      .replaceAll('state-licensed pharmacy','pharmacy service')
      .replaceAll('licensed pharmacy partners','pharmacy service partners')
      .replaceAll('FDA Registered Pharmacy','Pharmacy Service')
      .replaceAll('Hab Pharma (FDA Registered)','Hab Pharma')
      .replaceAll('>FDA Registered<','>Product Information<')
      .replaceAll('State Board Regulated Partner Pharmacy','Fulfillment subject to applicable pharmacy requirements')
      .replaceAll('WHO-GMP · FDA-Registered<br>HIPAA Compliant','Product & Safety Information<br>Prescription Review Where Required')
      .replaceAll('WHO-GMP · FDA-Registered<br/>HIPAA Compliant','Product & Safety Information<br/>Prescription Review Where Required')
      .replaceAll('All Pharmacies Doctor products are sourced exclusively from WHO-GMP certified and FDA-registered manufacturing facilities. Every order is reviewed by a licensed US pharmacist prior to dispatch. Certificate of Analysis (COA) available upon request.','Product pages provide the listed manufacturer, active ingredient, strength, storage and safety information. Fulfillment is reviewed before shipment, and prescription verification is required where applicable.')
      .replaceAll('256-bit SSL • PCI-DSS Secure • HIPAA Compliant','Encrypted HTTPS • No online card payment');
    const $ = cheerio.load(html);
    $('.pill').each((_,el)=>{ if($(el).text().trim().toUpperCase()==='LICENSED') $(el).text('SUPPORT'); });
    $('.img-badge').each((_,el)=>{ if(/WHO-GMP/i.test($(el).text())) $(el).html('<i class="fas fa-certificate" style="margin-right:5px;"></i> Product Information'); });
    if (slug==='about') {
      $('.sec-tag').each((_,el)=>{ if(/State Licensed|RPH-95959/i.test($(el).text())) $(el).text('Company Information • Customer Support'); });
      $('*').contents().filter((_,n)=>n.type==='text'&&/Up to 90% Cost Savings/i.test(n.data||'')).each((_,n)=>{ n.data=(n.data||'').replace(/Up to 90% Cost Savings/ig,'Clear Product Information'); });
    }
    const head = $('head');
    const meta = (key,value,attribute='name') => {
      let el = $(`meta[${attribute}="${key}"]`).first();
      $(`meta[${attribute}="${key}"]`).slice(1).remove();
      if (!el.length) el = $('<meta>').attr(attribute,key).appendTo(head);
      el.attr('content',value);
    };
    $('link[href*="fonts.googleapis.com"],link[href*="fonts.gstatic.com"]').remove();
    $('link[href*="cdnjs.cloudflare.com"][href*="font-awesome"]').attr('href','/css/all.min.css').removeAttr('integrity crossorigin referrerpolicy');
    $('link[href="/css/all.min.css"]').attr({media:'print',onload:"this.media='all'"});
    if (!$('link[href*="global.min.css"],link[href="/css/fonts.css"]').length) head.prepend('<link rel="stylesheet" href="/css/fonts.css">');
    if (!$('link[href^="/css/seo-production.css"]').length) head.append('<link rel="stylesheet" href="/css/seo-production.css?v=20261007-rank">');
    $('link[rel="icon"]').remove();
    head.append('<link rel="icon" type="image/png" href="/images/favicon.png">');
    $('link[rel="apple-touch-icon"]').attr('href','/images/apple-touch-icon.png');
    $('meta[name="viewport"]').attr('content','width=device-width, initial-scale=1');

    // Root-relative URLs also work on /blog/<slug> and error pages.
    $('[src],link[href]').each((_,el)=>{
      const a = $(el).attr('src') !== undefined ? 'src':'href';
      const value = $(el).attr(a);
      if (/^(images|css|js|fonts|webfonts)\//.test(value || '')) $(el).attr(a,'/'+value);
      if (a==='src' && /\/js\/.+\.js(?:\?|$)/.test(value||'')) {
        const version = value.includes('/js/rxhouse-gate-ai.js') ? '20261005-gate' : '20261004';
        $(el).attr('src',$(el).attr('src').split('?')[0]+'?v='+version);
      }
    });
    $('a[href]').each((_,el)=>{
      const a=$(el); let value=a.attr('href');
      if (value.startsWith(site+'/')) value=value.slice(site.length);
      if (/^(?:\/?)[a-z0-9-]+\.html(?:[?#]|$)/i.test(value)) value='/'+value.replace(/^\//,'').replace(/\.html(?=[?#]|$)/,'');
      if (/^\/index(?:[?#]|$)/.test(value)) value=value.replace('/index','/');
      value=value.replace(/^\/shop\?category=(mens-health|sleep-anxiety|pain-relief)$/,'/$1');
      a.attr('href',value);
      if (a.attr('target')==='_blank') a.attr('rel', [...new Set((a.attr('rel')||'').split(' ').concat('noopener','noreferrer'))].filter(Boolean).join(' '));
    });
    $('footer h5').each((_,el)=>{el.tagName='h2'; $(el).addClass('footer-heading');});
    $('.detail-card h3').each((_,el)=>{el.tagName='h2';});
    if (slug==='index') {
      $('.product-name').each((_,el)=>{el.tagName='h3';});
      $('h4').each((_,el)=>{el.tagName='h3'; $(el).addClass('former-h4');});
      $('img[src="/images/hero.webp"]').attr({loading:'eager',fetchpriority:'high',width:'900',height:'675',alt:'Healthcare professional discussing care with a patient',srcset:'/images/hero-480.webp 480w, /images/hero.webp 900w',sizes:'(max-width: 768px) 100vw, 50vw'});
      $('link[rel="preload"][as="image"]').remove();
      head.append('<link rel="preload" as="image" href="/images/hero.webp" imagesrcset="/images/hero-480.webp 480w, /images/hero.webp 900w" imagesizes="(max-width: 768px) 100vw, 50vw" fetchpriority="high">');
    }
    if (slug==='checkout') $('h2').first().each((_,el)=>{el.tagName='h1';});
    // Remove skipped levels while retaining template styling hooks.
    let level=0;
    $('h1,h2,h3,h4,h5,h6').each((_,el)=>{
      const next=Number(el.tagName[1]);
      if (next>level+1 && level>0) {$(el).addClass(`former-h${next}`); el.tagName=`h${level+1}`;}
      level=Number(el.tagName[1]);
    });
    for (const el of $('img').toArray()) {
      const image=$(el); const src=image.attr('src')||'';
      const local=path.join(root,decodeURIComponent(src.replace(/^\//,'').split('?')[0]));
      if (src && !src.startsWith('http') && fs.existsSync(local) && fs.statSync(local).isFile()) {
        const info=await sharp(local).metadata(); image.attr({width:String(info.width),height:String(info.height)});
      }
      if (!image.attr('alt')) image.attr('alt', image.closest('article,.product-card').find('.product-name,h2,h3').first().text().trim() || 'Pharmacies Doctor');
      image.attr('alt',image.attr('alt').replace(/\s*[-—]\s*Buy.*$/i,'').replace(/\s+product information$/i,' packaging'));
      image.attr('decoding','async');
      if (!image.attr('loading')) image.attr('loading', image.hasClass('site-logo-img') ? 'eager':'lazy');
    }
    if (slug==='blog-post') {
      // This source template is never a public indexable article by itself.
      meta('robots','noindex, follow');
      fs.writeFileSync(path.join(root,name),$.html());
      continue;
    }
    const canonical=site+(slug==='index'?'/':'/'+slug);
    let title=$('title').text().trim();
    let description=$('meta[name="description"]').attr('content')||'';
    const dataEl=$('#medicine-data');
    let product;
    if(dataEl.length) {
      product=JSON.parse(dataEl.text());
      title=`${product.name} | Uses & Safety | Pharmacies Doctor`;
      description=`Read ${product.name} product details, uses, side effects and storage information. Explore related medicines and contact Pharmacies Doctor for support.`;
    }
    const pageOverrides={
      index:{title:'Medication Information & Generic Catalog | Pharmacies Doctor',description:'Browse medication information and healthcare categories, compare active ingredients and strengths, and review clear ordering, shipping and support information.'},
      shop:{title:'Medication Catalog & Product Information | Pharmacies Doctor',description:'Browse medication information by category, active ingredient and strength. Review safety, prescription requirements, shipping and order information before fulfillment.'},
      'pain-relief':{title:'Pain Relief Medicines & Safety Information | Pharmacies Doctor',description:'Explore pain relief medication information by active ingredient and strength, including safety, prescription requirements, storage and related guides.'},
      'mens-health':{title:"Men's Health: Sildenafil & Tadalafil | Pharmacies Doctor",description:"Compare men's health medication information including sildenafil and tadalafil products, strengths, safety considerations and prescription requirements."},
      'sleep-anxiety':{title:'Sleep & Anxiety Medicine Information | Pharmacies Doctor',description:'Browse sleep and anxiety medication information, active ingredients, strengths, safety considerations and prescription requirements before fulfillment.'},
      'ordering-guide':{title:'How Ordering Works | Pharmacies Doctor',description:'Learn how Pharmacies Doctor order requests work, including cart, checkout, prescription verification where required, payment at delivery and order confirmation.'},
      'medical-content-standards':{title:'Medical Content Standards | Pharmacies Doctor',description:'Read how Pharmacies Doctor prepares medication information, handles sources, updates content and separates general information from professional medical advice.'}
    };
    if(!product && pageOverrides[slug]) { title=pageOverrides[slug].title; description=pageOverrides[slug].description; }
    if (!description) description=({checkout:'Review your items and enter delivery details for your Pharmacies Doctor order.',thankyou:'Your Pharmacies Doctor order request has been received.', 'order-confirmation':'View your Pharmacies Doctor order confirmation.', 'admin-blog':'Manage Pharmacies Doctor articles.', 'admin-orders':'Manage Pharmacies Doctor orders.'})[slug]||`Read ${title.split('|')[0].trim()} at Pharmacies Doctor.`;
    $('title').text(title);
    meta('description',description);
    $('meta[name="googlebot"],meta[name="bingbot"]').remove();
    meta('robots',privatePages.has(slug)?'noindex, follow':'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    $('link[rel="canonical"]').remove(); head.append($('<link rel="canonical">').attr('href',canonical));
    const og=site+'/images/og-image.jpg';
    for(const [key,value] of Object.entries({type:'website',site_name:'Pharmacies Doctor',title,description,url:canonical,image:og,'image:secure_url':og,'image:type':'image/jpeg','image:width':'1200','image:height':'630','image:alt':'Pharmacies Doctor'})) meta('og:'+key,value,'property');
    for(const [key,value] of Object.entries({card:'summary_large_image',title,description,image:og,'image:alt':'Pharmacies Doctor',url:canonical})) meta('twitter:'+key,value);
    if(process.env.GOOGLE_SITE_VERIFICATION && slug==='index') meta('google-site-verification',process.env.GOOGLE_SITE_VERIFICATION);
    $('script[type="application/ld+json"]').remove();
    if (!privatePages.has(slug)) {
      const graph=[{'@type':'Organization','@id':site+'/#organization',name:'Pharmacies Doctor',url:site+'/',logo:site+'/images/optimized/pdlogo.webp'}, {'@type':'WebSite','@id':site+'/#website',name:'Pharmacies Doctor',url:site+'/',publisher:{'@id':site+'/#organization'}}, {'@type':slug==='about'?'AboutPage':slug==='contact'?'ContactPage':['shop','pain-relief','sleep-anxiety','mens-health','blog'].includes(slug)?'CollectionPage':'WebPage','@id':canonical+'#webpage',url:canonical,name:title,description,inLanguage:'en',isPartOf:{'@id':site+'/#website'}}];
      if(product) {
        if (product.rxRequired !== false) {
          graph.push({'@type':'Drug',name:product.name,description,url:canonical,image:new URL(product.img,site).href,activeIngredient:product.active,prescriptionStatus:'https://schema.org/PrescriptionOnly'});
        } else {
          graph.push({'@type':'Product',name:product.name,description,url:canonical,image:[new URL(product.img,site).href],category:product.cat,additionalProperty:[{'@type':'PropertyValue',name:'Active ingredient',value:product.active}],offers:{'@type':'Offer',url:canonical,priceCurrency:'USD',price:product.tierPrices?.['90']||product.price,availability:'https://schema.org/InStock',seller:{'@id':site+'/#organization'}}});
        }
      }
      if (['shop','pain-relief','mens-health','sleep-anxiety'].includes(slug)) {
        const items=[];
        $('.product-card').each((_,card)=>{
          const link=$(card).find('a[href^="/"]').last();
          const name=$(card).find('.product-name,.p-name,h2,h3').first().text().trim();
          if(link.length&&name) items.push({'@type':'ListItem',position:items.length+1,name,url:new URL(link.attr('href'),site).href});
        });
        if(items.length) graph.push({'@type':'ItemList','@id':canonical+'#items',itemListElement:items});
      }
      if (slug!=='index') {
        const crumbs=[['Home',site+'/']];
        if(product) crumbs.push([product.cat,site+'/'+({'Pain Relief':'pain-relief',"Men's Health":'mens-health','Sleep & Anxiety':'sleep-anxiety'}[product.cat]||'shop')]);
        crumbs.push([$('h1').text().trim(),canonical]);
        graph.push({'@type':'BreadcrumbList',itemListElement:crumbs.map(([name,item],i)=>({'@type':'ListItem',position:i+1,name,item}))});
      }
      head.append($('<script type="application/ld+json" data-seo-schema="page">').text(json({'@context':'https://schema.org','@graph':graph})));
      if (!$('a[href="/site-map"]').length && $('footer .footer-col').length) $('footer .footer-col').first().append('<a href="/site-map">Site map</a>');
    }
    // Remove meta commentary from the public product copy.
    $('.seo-med-intro').each((_,el)=>$(el).text($(el).text().replace('This section summarizes the information already provided on the product page in a clearer, search-friendly format. ','')));
    fs.writeFileSync(path.join(root,name),$.html());
  }
  // Dynamic catalog cards should request the same compressed files.
  for (const name of fs.readdirSync(path.join(root,'js')).filter(x=>x.endsWith('.js'))) {
    const file=path.join(root,'js',name); let code=fs.readFileSync(file,'utf8');
    for (const [oldPath,newPath] of Object.entries(imageMap)) code=code.split(oldPath).join(newPath);
    fs.writeFileSync(file,code);
  }
  fs.writeFileSync(path.join(root,'validation/image-optimization.json'),JSON.stringify(imageReport,null,2));
  console.log(JSON.stringify({images:imageReport.length,originalBytes:imageReport.reduce((a,x)=>a+x.before,0),optimizedBytes:imageReport.reduce((a,x)=>a+x.after,0)}));
}
main().catch(err=>{console.error(err);process.exitCode=1;});
