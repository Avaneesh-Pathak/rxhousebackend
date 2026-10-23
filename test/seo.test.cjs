const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cheerio=require('cheerio');
const {renderBlog,validSlug}=require('../seo-renderer.cjs');
test('blog renderer returns readable content, safe metadata and a single H1 without JavaScript',()=>{
  const template=fs.readFileSync(path.join(__dirname,'../blog-post.html'),'utf8');
  const html=renderBlog(template,{slug:'safe-article',title:'A "quoted" title',content:'<h1>Body heading</h1><h4>Skipped heading</h4><p>Readable article.</p><script>alert(1)</script><img src="/images/test.webp" onerror="alert(1)"><a href="javascript:alert(1)">Bad</a>',created_at:'2026-10-01T10:00:00Z'},{siteUrl:'https://pharmacies.doctor',backendUrl:'https://pd.pharmacies.doctor'});
  const $=cheerio.load(html);
  assert.equal($('h1').length,1);
  assert.equal($('#post-content h2').length,1);
  assert.equal($('#post-content h3').length,1);
  assert.match($('#post-content').text(),/Readable article/);
  assert.equal($('#post-content script,#post-content [onerror]').length,0);
  assert.equal($('#post-content a').attr('href'),undefined);
  assert.equal($('link[rel="canonical"]').attr('href'),'https://pharmacies.doctor/blog/safe-article');
  assert.equal($('meta[name="robots"]').attr('content'),'index, follow, max-image-preview:large');
  assert.doesNotMatch(html,/\{\{BLOG_/);
  const data=JSON.parse($('#blog-jsonld').text());
  assert.equal(data['@graph'][0].headline,'A "quoted" title');
  assert.equal(data['@graph'][0].datePublished,'2026-10-01T10:00:00.000Z');
  assert.equal($('body').attr('data-blog-rendered'),'true');
});
test('export slugs cannot escape the blog directory',()=>{
  for(const value of ['../outside','a/b','a?b','a#b','UPPER','-edge','a--b',''])assert.equal(validSlug(value),false);
  assert.equal(validSlug('article-2026'),true);
});
