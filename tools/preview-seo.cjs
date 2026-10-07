// Local-only preview. Real HTTPS/Apache rules must also be checked after deployment.
const express=require('express');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(process.env.FRONTEND_DIR||path.join(__dirname,'../../pharmacies frontnend'));
const app=express();
app.use((req,res,next)=>{
  if(req.path.startsWith('/validation/')||/^\/\./.test(req.path))return res.sendStatus(403);
  if(req.path==='/index'||req.path==='/index.html')return res.redirect(301,'/');
  if(/^\/blog-post(?:\.html)?$/.test(req.path))return res.redirect(301,req.query.slug?'/blog/'+encodeURIComponent(req.query.slug):'/blog');
  if(/^\/shop(?:\.html)?$/.test(req.path)&&['pain-relief','mens-health','sleep-anxiety'].includes(req.query.category))return res.redirect(301,'/'+req.query.category);
  if(req.path.endsWith('.html')&&!/^\/google[a-z0-9]+\.html$/i.test(req.path))return res.redirect(301,req.path.slice(0,-5));
  if(req.path.length>1&&req.path.endsWith('/'))return res.redirect(301,req.path.slice(0,-1));
  const target=path.resolve(root,'.'+req.path+'.html');
  if(target.startsWith(root+path.sep)&&fs.existsSync(target))return res.sendFile(target);
  next();
});
app.use(express.static(root,{redirect:false}));
app.use((req,res)=>res.status(404).sendFile(path.join(root,'404.html')));
app.listen(5500,'127.0.0.1',()=>console.log('SEO preview: http://127.0.0.1:5500'));
