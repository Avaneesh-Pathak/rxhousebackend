const cheerio = require('cheerio');
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const text = value => cheerio.load(String(value || ''), null, false).text().replace(/\s+/g, ' ').trim();
const validSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 240;

function renderBlog(template, blog, { siteUrl, backendUrl }) {
  if (!validSlug(blog.slug)) throw new Error('Invalid blog slug');
  siteUrl = siteUrl.replace(/\/+$/, '');
  backendUrl = backendUrl.replace(/\/+$/, '');
  const canonical = `${siteUrl}/blog/${blog.slug}`;
  const title = `${text(blog.title)} | Pharmacies Doctor`;
  let description = text(blog.excerpt || blog.description || blog.content).slice(0,160);
  description=description
    .replace(/Pharmacies Doctor provides affordable FDA-approved generic medicines[^.]*\.?/gi,'Pharmacies Doctor provides medication information, ordering guidance and customer support.')
    .replace(/licensed pharmacist support/gi,'customer support');
  const published = new Date(blog.created_at);
  const modified = new Date(blog.updated_at || blog.created_at);
  const $ = cheerio.load(template);
  const head = $('head');
  const meta = (key,value,attribute='name') => {
    let el = $(`meta[${attribute}="${key}"]`).first();
    $(`meta[${attribute}="${key}"]`).slice(1).remove();
    if (!el.length) el = $('<meta>').attr(attribute,key).appendTo(head);
    el.attr('content',value);
  };
  function mediaUrl(value) {
    if (!value) return '';
    try {
      const url=new URL(value,backendUrl+'/');
      return ['https:','http:'].includes(url.protocol)?url.href:'';
    } catch { return ''; }
  }
  const youtube=String(blog.featured_image||'').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})(?:[?&#]|$)/);
  const image=youtube?`https://img.youtube.com/vi/${youtube[1]}/hqdefault.jpg`:mediaUrl(blog.featured_image)||siteUrl+'/images/og-image.jpg';
  $('title').text(title);
  meta('description',description);
  meta('robots','index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
  meta('author', text(blog.author || 'Pharmacies Doctor'));
  if (!Number.isNaN(+published)) {
    meta('article:published_time', published.toISOString(), 'property');
  }
  if (!Number.isNaN(+modified)) {
    meta('article:modified_time', modified.toISOString(), 'property');
  }
  if (blog.category) meta('article:section', text(blog.category), 'property');
  $('link[rel="canonical"]').remove();
  head.append($('<link rel="canonical">').attr('href',canonical));
  for(const [key,value] of Object.entries({title,description,type:'article',url:canonical,image,'image:secure_url':image,'image:alt':text(blog.title)})) meta('og:'+key,value,'property');
  // Uploaded images have unknown dimensions; never declare invented dimensions.
  $('meta[property="og:image:width"],meta[property="og:image:height"],meta[property="og:image:type"]').remove();
  for(const [key,value] of Object.entries({card:'summary_large_image',title,description,url:canonical,image,'image:alt':text(blog.title)})) meta('twitter:'+key,value);
  $('#post-title').text(blog.title);
  $('#post-category').text(blog.category||'General');
  $('#post-author').text(`By ${blog.author || 'Pharmacies Doctor'}`);
  $('#post-date').text(Number.isNaN(+published)?'':published.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}));
  const safeBlogContent=String(blog.content||'')
    .replaceAll('At Pharmacies Doctor, we make prescription delivery straightforward by offering FDA-approved generic medicines, secure ordering, discreet packaging and reliable delivery across the USA.','At Pharmacies Doctor, we explain the order-request, prescription-review, packaging and shipping process so customers know what to expect before fulfillment.')
    .replaceAll('At Pharmacies Doctor, we are committed to helping patients receive FDA-approved generic medications with confidence. Whether you need ongoing prescriptions or short-term treatments, our prescription delivery service offers a safe, convenient and reliable solution delivered directly to your doorstep.','At Pharmacies Doctor, we provide medication information and customer support to help people understand product details, prescription requirements and delivery expectations. Fulfillment depends on applicable pharmacy and prescription requirements.');
  $('#post-content').html(safeBlogContent);
  // Defense in depth for exports from a remote API as well as DB-rendered posts.
  $('#post-content').find('script,style,object,embed,form,input,button,meta,link,base,svg,math').remove();
  $('#post-content *').each((_,el)=>{
    for(const [key,value] of Object.entries({...el.attribs})) {
      if (/^on/i.test(key)||key==='srcdoc'||(['href','src','xlink:href'].includes(key)&&/^\s*(javascript|data|vbscript):/i.test(value))) $(el).removeAttr(key);
    }
  });
  let level=1;
  $('#post-content h1,#post-content h2,#post-content h3,#post-content h4,#post-content h5,#post-content h6').each((_,el)=>{
    const next=Math.max(2,Math.min(Number(el.tagName[1]),level+1)); el.tagName=`h${next}`; level=next;
  });
  $('#post-content img').each((i,el)=>{
    const img=$(el); img.attr('src',mediaUrl(img.attr('src'))).attr('loading','lazy').attr('decoding','async');
    if(!img.attr('alt')) img.attr('alt', `${text(blog.title)} — illustration ${i+1}`);
  });
  $('#post-content iframe').each((_,el)=>{
    const frame=$(el),src=mediaUrl(frame.attr('src'));
    if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com\/embed\/[\w-]{11}/.test(src)) {frame.remove();return;}
    frame.attr({src,title:frame.attr('title')||blog.title,loading:'lazy',width:'560',height:'315'});
    if(!frame.parent().hasClass('video-container')) frame.wrap('<div class="video-container"></div>');
  });
  $('#post-content a[href]').each((_,el)=>{
    const a=$(el),href=a.attr('href');
    if(href.startsWith(siteUrl+'/')) a.attr('href',href.slice(siteUrl.length).replace(/\.html(?=[?#]|$)/,''));
    if(a.attr('target')==='_blank') a.attr('rel','noopener noreferrer');
  });
  const media=$('#post-image-container').empty();
  if(blog.featured_image) {
    media.removeAttr('style');
    if(youtube) media.addClass('video-container').append($('<iframe loading="lazy" width="560" height="315" allowfullscreen>').attr({src:`https://www.youtube-nocookie.com/embed/${youtube[1]}`,title:blog.title}));
    else media.addClass('featured-media-container').append($('<img id="post-featured-image" loading="eager" fetchpriority="high" decoding="async" width="1200" height="675">').attr({src:image,alt:blog.title,style:'width:100%;height:100%;object-fit:contain'}));
  }
  $('script[type="application/ld+json"]').remove();
  const article={'@type':'BlogPosting',headline:text(blog.title),description,mainEntityOfPage:{'@type':'WebPage','@id':canonical},image:[image],author:{'@type':!blog.author||blog.author==='Pharmacies Doctor'?'Organization':'Person',name:blog.author||'Pharmacies Doctor'},publisher:{'@type':'Organization',name:'Pharmacies Doctor',url:siteUrl,logo:{'@type':'ImageObject',url:siteUrl+'/images/optimized/pdlogo.webp'}}};
  if(!Number.isNaN(+published)) article.datePublished=published.toISOString();
  if(!Number.isNaN(+modified)) article.dateModified=modified.toISOString();
  const crumbs={'@type':'BreadcrumbList',itemListElement:[['Home',siteUrl+'/'],['Blog',siteUrl+'/blog'],[text(blog.title),canonical]].map(([name,item],i)=>({'@type':'ListItem',position:i+1,name,item}))};
  head.append($('<script type="application/ld+json" id="blog-jsonld">').text(json({'@context':'https://schema.org','@graph':[article,crumbs]})));
  $('body').attr('data-blog-rendered','true');
  // The raw template contains fallback JS for old deployments. Fully rendered pages
  // do not refetch or replace their content/metadata after load.
  $('script:not([src]):not([type="application/ld+json"])').each((_,el)=>{
    let source=$(el).html()||'';
    if(source.includes('fetchBlogPost(slug);')) source=source.replace('fetchBlogPost(slug);','setupShareButton({ title: document.getElementById("post-title").textContent });');
    $(el).text(source);
  });
  $('[src],link[href]').each((_,el)=>{
    const key=$(el).attr('src')!==undefined?'src':'href';const value=$(el).attr(key)||'';
    if(/^(?:\/)?(?:css|js|images|fonts|webfonts)\//.test(value)) $(el).attr(key,new URL(value,siteUrl+'/').href);
  });
  return $.html();
}
module.exports={renderBlog,validSlug,text,json};
