const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cheerio=require('cheerio');
const root=path.resolve(process.env.FRONTEND_DIR||path.join(__dirname,'../../pharmacies frontnend'));
const site='https://pharmacies.doctor';
const privateSlugs=new Set(['admin-blog','admin-orders','checkout','thankyou','order-confirmation','404','blog-post']);
const files=fs.readdirSync(root).filter(x=>x.endsWith('.html')).concat(fs.existsSync(path.join(root,'blog'))?fs.readdirSync(path.join(root,'blog')).filter(x=>x.endsWith('.html')).map(x=>'blog/'+x):[]);
const errors=[],pages=[],titles=new Map(),descriptions=new Map();
const sitemap=cheerio.load(fs.readFileSync(path.join(root,'sitemap.xml'),'utf8'),{xmlMode:true});
const urls=sitemap('loc').map((_,e)=>sitemap(e).text()).get();
for(const [index,url] of urls.entries())if(urls.indexOf(url)!==index)errors.push({file:'sitemap.xml',message:'Duplicate sitemap URL: '+url});
const resolve=p=>{const target=path.join(root,decodeURIComponent(p));return fs.existsSync(target)&&fs.statSync(target).isFile()?target:p==='/'?path.join(root,'index.html'):target+'.html';};
for(const file of files){
  const $=cheerio.load(fs.readFileSync(path.join(root,file),'utf8'));
  const slug=file.slice(0,-5),privatePage=privateSlugs.has(slug),url=site+(slug==='index'?'/':'/'+slug);
  const fail=message=>errors.push({file,message});
  if($('h1').length!==1)fail(`Expected one H1, got ${$('h1').length}`);
  let last=0;
  $('h1,h2,h3,h4,h5,h6').each((_,e)=>{const level=+e.tagName[1];if(last&&level>last+1)fail(`Heading jump: ${$(e).text().slice(0,60)}`);last=level;});
  if(file!=='blog-post.html'){
    for(const [selector,map,label] of [['title',titles,'title'],['meta[name="description"]',descriptions,'description']]){
      const value=selector==='title'?$(selector).text():$(selector).attr('content');
      if($(selector).length!==1||!value)fail('Missing/duplicate '+label);
      if(!privatePage&&map.has(value))fail(`Duplicate ${label}: ${map.get(value)}`);
      map.set(value,file);
    }
    if($('link[rel="canonical"]').length!==1||$('link[rel="canonical"]').attr('href')!==url)fail('Incorrect canonical');
    if(!privatePage&&/noindex/i.test($('meta[name="robots"]').attr('content')||''))fail('Public page is noindex');
    if(privatePage&&!/noindex/i.test($('meta[name="robots"]').attr('content')||''))fail('Utility page should be noindex');
    if(!privatePage&&!urls.includes(url))fail('Missing from sitemap');
    if(privatePage&&urls.includes(url))fail('Utility page in sitemap');
  }
  $('img').each((_,e)=>{if($(e).attr('alt')===undefined)fail('Missing image alt');if(!$(e).attr('width')||!$(e).attr('height'))fail('Missing image dimensions: '+$(e).attr('src'));});
  $('script').each((_,e)=>{
    if($(e).attr('src'))return;
    try{if(['application/json','application/ld+json'].includes($(e).attr('type')))JSON.parse($(e).text());else if(!$(e).attr('type')||$(e).attr('type')==='text/javascript')new vm.Script($(e).text());}catch(err){fail('Invalid script/JSON: '+err.message);}
  });
  $('a[href],link[href],img[src],script[src]').each((_,e)=>{
    const attr=$(e).attr('href')!==undefined?'href':'src';const raw=$(e).attr(attr);
    if(!raw||raw==='#'||raw.startsWith('{{')||/^(javascript:|mailto:|tel:|data:)/.test(raw))return;
    let target;try{target=new URL(raw,url);}catch{fail('Invalid URL: '+raw);return;}
    if(target.origin!==site)return;
    const local=resolve(target.pathname);
    if(!fs.existsSync(local)){fail('Broken local link: '+raw);return;}
    if(target.hash&&attr==='href'&&path.extname(local)==='.html'){
      const other=cheerio.load(fs.readFileSync(local,'utf8'));const id=decodeURIComponent(target.hash.slice(1));
      if(!other('[id]').toArray().some(n=>other(n).attr('id')===id))fail('Broken fragment: '+raw);
    }
  });
  pages.push({file,indexable:!privatePage,title:$('title').text()});
}
for(const url of urls){if(!url.startsWith(site+'/')||url.includes('.html')||url.includes('?')||!fs.existsSync(resolve(new URL(url).pathname)))errors.push({file:'sitemap.xml',message:'Invalid sitemap URL: '+url});}
for(const file of fs.readdirSync(path.join(root,'js')).filter(x=>x.endsWith('.js'))){try{new vm.Script(fs.readFileSync(path.join(root,'js',file),'utf8'));}catch(e){errors.push({file:'js/'+file,message:e.message});}}
const result={pages:pages.length,indexablePages:pages.filter(x=>x.indexable).length,sitemapUrls:urls.length,errors};
const validationDir=path.join(root,'validation');
fs.mkdirSync(validationDir,{recursive:true});
fs.writeFileSync(path.join(validationDir,'seo-audit.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
process.exitCode=errors.length?1:0;
