// Export published posts and discovery files to the static Apache/LiteSpeed site.
// Re-run after publishing/editing/unpublishing articles and deploy the whole output.
const fs=require('node:fs');
const path=require('node:path');
const cheerio=require('cheerio');
const {renderBlog,validSlug,text}=require('../seo-renderer.cjs');
const root=path.resolve(process.env.FRONTEND_DIR||path.join(__dirname,'../../pharmacies frontnend'));
const site='https://pharmacies.doctor';
const api=process.env.SEO_API_URL||'https://pd.pharmacies.doctor';
const excluded=new Set(['admin-blog','admin-orders','checkout','order-confirmation','thankyou','blog-post','404']);
const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
async function get(route){const r=await fetch(api+route,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`${route}: HTTP ${r.status}`);return r.json();}
function shell(title,description,slug,content,noindex=false){
  const canonical=`${site}/${slug}`;
  const schema=JSON.stringify({"@context":"https://schema.org","@graph":[
    {"@type":"Organization","@id":`${site}/#organization`,"name":"Pharmacies Doctor","url":`${site}/`,"logo":`${site}/images/optimized/pdlogo.webp`},
    {"@type":"WebSite","@id":`${site}/#website`,"name":"Pharmacies Doctor","url":`${site}/`,"publisher":{"@id":`${site}/#organization`}},
    {"@type":slug==='404'?'WebPage':'CollectionPage',"@id":`${canonical}#webpage`,"url":canonical,"name":`${title} | Pharmacies Doctor`,"description":description,"inLanguage":"en","isPartOf":{"@id":`${site}/#website`}}
  ]});
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} | Pharmacies Doctor</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${noindex?'noindex, follow':'index, follow, max-image-preview:large'}"><link rel="canonical" href="${canonical}"><link rel="stylesheet" href="/css/global.min.css"><link rel="stylesheet" href="/css/seo-production.css?v=20261007-rank"><link rel="stylesheet" href="/css/rxhouse-gate-ai.css?v=20261006"><script src="/js/rxhouse-gate-ai.js?v=20261006" defer></script><link rel="icon" href="/images/favicon.png"><meta property="og:title" content="${escape(title)} | Pharmacies Doctor"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${site}/images/og-image.jpg"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Pharmacies Doctor"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)} | Pharmacies Doctor"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${site}/images/og-image.jpg"><meta name="twitter:image:alt" content="Pharmacies Doctor"><script type="application/ld+json" data-seo-schema="page">${schema}</script></head><body><header class="container" style="padding-top:24px"><a href="/" style="color:#0f766e;font-weight:bold">Pharmacies Doctor</a><nav aria-label="Main navigation" style="display:flex;gap:20px;flex-wrap:wrap;margin-top:16px"><a href="/shop">Shop</a><a href="/blog">Blog</a><a href="/about">About</a><a href="/contact">Contact</a></nav></header><main class="container" style="padding-top:48px;padding-bottom:64px"><h1 style="font-size:36px;margin-bottom:24px">${escape(title)}</h1>${content}</main><footer class="container" style="padding:24px 16px"><a href="/privacy-policy">Privacy policy</a> · <a href="/terms">Terms</a> · <a href="/site-map">Site map</a></footer></body></html>`;
}
async function main(){
  // Fetch everything before changing output; an unavailable API must fail the build.
  const list=await get('/api/blogs');
  if(!Array.isArray(list))throw Error('Blog API did not return an array');
  const published=[...new Map(list.filter(entry=>entry&&validSlug(entry.slug)).map(entry=>[entry.slug,entry])).values()];
  const posts=[];
  for(let i=0;i<published.length;i+=4){
    posts.push(...await Promise.all(published.slice(i,i+4).map(async entry=>{
      if(!validSlug(entry.slug))throw Error('Invalid published slug: '+entry.slug);
      return get('/api/blogs/'+entry.slug);
    })));
  }
  const template=fs.readFileSync(path.join(root,'blog-post.html'),'utf8');
  const outputs=posts.map(blog=>({blog,html:renderBlog(template,blog,{siteUrl:site,backendUrl:api}).replaceAll(`src="${site}/`,`src="/`).replaceAll(`href="${site}/css/`,'href="/css/')}));
  const blogDir=path.join(root,'blog'); fs.mkdirSync(blogDir,{recursive:true});
  // Only delete files listed in our previous export manifest and confined to /blog.
  const manifestPath=path.join(root,'validation/blog-export.json');
  const previous=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')).slugs:[];
  for(const slug of previous||[]) if(validSlug(slug)&&!posts.some(p=>p.slug===slug)){
    const target=path.resolve(blogDir,slug+'.html');
    if(path.dirname(target)!==blogDir)throw Error('Unsafe export path');
    if(fs.existsSync(target))fs.unlinkSync(target);
  }
  for(const {blog,html} of outputs)fs.writeFileSync(path.join(blogDir,blog.slug+'.html'),html);
  const $=cheerio.load(fs.readFileSync(path.join(root,'blog.html'),'utf8'));
  $('#blog-posts-grid').attr('data-rendered','true').html(posts.map((blog,i)=>{
    const image=/^https?:\/\//.test(blog.featured_image||'')&&!/youtu/.test(blog.featured_image)?blog.featured_image:blog.featured_image&&!/youtu/.test(blog.featured_image)?new URL(blog.featured_image,api+'/').href:'/images/blog-fallback.webp';
    return `<article class="blog-card"><a class="card-image" href="/blog/${blog.slug}" aria-label="${escape(blog.title)}"><img class="is-loaded" src="${escape(image)}" alt="${escape(blog.title)}" width="600" height="375" loading="${i===0?'eager':'lazy'}" decoding="async"></a><div class="card-content"><span class="category">${escape(blog.category||'General')}</span><h2 class="post-title"><a href="/blog/${blog.slug}">${escape(blog.title)}</a></h2><p class="post-excerpt">${escape(text(blog.excerpt||blog.content).slice(0,150))}</p><p class="post-meta">By ${escape(blog.author||'Pharmacies Doctor')}</p></div></article>`;
  }).join('\n'));
  fs.writeFileSync(path.join(root,'blog.html'),$.html());
  const pages=fs.readdirSync(root).filter(x=>x.endsWith('.html')&&!excluded.has(x.slice(0,-5))&&x!=='site-map.html').map(name=>{
    const page=cheerio.load(fs.readFileSync(path.join(root,name),'utf8'));return{path:name==='index.html'?'/':'/'+name.slice(0,-5),title:page('h1').text().trim()||page('title').text().trim()};
  });
  const mapContent='<h2 style="margin-bottom:20px">Pages and medicine information</h2><ul class="site-map-links">'+pages.map(p=>`<li><a href="${p.path}">${escape(p.title)}</a></li>`).join('')+'</ul><h2 style="margin:40px 0 20px">Articles</h2><ul class="site-map-links">'+posts.map(p=>`<li><a href="/blog/${p.slug}">${escape(p.title)}</a></li>`).join('')+'</ul>';
  fs.writeFileSync(path.join(root,'site-map.html'),shell('Site Map','Find Pharmacies Doctor pages, medicine categories, product information, articles and support.','site-map',mapContent));
  fs.writeFileSync(path.join(root,'404.html'),shell('Page not found','This page could not be found. Browse our site map or contact Pharmacies Doctor for help.','404','<p>The address may have changed or the page may no longer be available.</p><p style="margin-top:24px"><a href="/site-map">Browse the site map</a> or <a href="/contact">contact us</a>.</p>',true));
  pages.push({path:'/site-map',title:'Site Map'});
  const urls=pages.map(p=>`  <url><loc>${site}${p.path}</loc></url>`);
  for(const blog of posts){const date=new Date(blog.updated_at||blog.created_at);urls.push(`  <url><loc>${site}/blog/${blog.slug}</loc>${Number.isNaN(+date)?'':`<lastmod>${date.toISOString()}</lastmod>`}</url>`);}
  fs.writeFileSync(path.join(root,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.join('\n')+'\n</urlset>\n');
  fs.writeFileSync(path.join(root,'robots.txt'),`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /node_modules/\nDisallow: /.git/\nDisallow: /.env\nDisallow: /validation/\n\n# Utility pages use noindex in HTML/headers and remain crawlable to read it.\nSitemap: ${site}/sitemap.xml\n`);
  fs.writeFileSync(path.join(root,'llms.txt'),`# Pharmacies Doctor\n\n> Public medicine information, product categories, articles and customer support at ${site}.\n\nMedicine content is general information and does not replace the product label or advice from a qualified healthcare professional.\n\n## Main pages\n\n- [Home](${site}/): Website overview.\n- [Shop](${site}/shop): Product directory.\n- [Pain relief](${site}/pain-relief): Category and medicine information.\n- [Men's health](${site}/mens-health): Category and medicine information.\n- [Sleep and anxiety](${site}/sleep-anxiety): Category and medicine information.\n- [Blog](${site}/blog): Published articles.\n- [About](${site}/about): Service information.\n- [Contact](${site}/contact): Customer support.\n\n## Policies and discovery\n\n- [Privacy policy](${site}/privacy-policy)\n- [Terms](${site}/terms)\n- [Shipping policy](${site}/shipping-policy)\n- [Returns and refunds](${site}/return-refund)\n- [Site map](${site}/site-map): All public pages and published articles.\n- [XML sitemap](${site}/sitemap.xml)\n`);
  fs.writeFileSync(manifestPath,JSON.stringify({source:api,slugs:posts.map(p=>p.slug),publicPageCount:urls.length,generatedAt:new Date().toISOString()},null,2));
  fs.copyFileSync(path.join(root,'blog-post.html'),path.join(__dirname,'../blog-post.html'));
  require('./cleanup-legacy-seo.cjs');
  console.log(JSON.stringify({publicPages:urls.length,articles:posts.length,output:root}));
}
main().catch(err=>{console.error(err);process.exitCode=1;});
