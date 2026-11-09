const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, 'public');
const dataDir = process.env.DATA_DIR || path.join(__dirname, '.data');
const file = path.join(dataDir, 'database.json');
let db;
let writes = Promise.resolve();
function persist() { const snapshot=JSON.stringify(db); writes=writes.then(async()=>{await fs.writeFile(file+'.tmp',snapshot,{mode:0o600});await fs.rename(file+'.tmp',file);});return writes; }
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req,limit=20000){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(Error('Request too large'),{status:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(Error('Invalid JSON'),{status:400});}}
function field(value,max){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw Object.assign(Error('Please complete the required fields within the length limits.'),{status:400});return value.trim();}
function publicUser(u){return {id:u.id,name:u.name,role:u.role};}
function decorate(p){const u=db.users.find(u=>u.id===p.userId);return {...p,name:u.name,role:u.role,initials:u.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(),likes:p.likedBy.length,likedBy:undefined};}
const attempts=new Map();
const uploadsDir=path.join(dataDir,'uploads');
function uploadError(message){return Object.assign(Error(message),{status:400});}
function parseUploads(files){
 if(files===undefined)return [];
 if(!Array.isArray(files)||files.length>5)throw uploadError('Attach up to 5 files per project.');
 return files.map(f=>{
  if(!f||typeof f!=='object')throw uploadError('Invalid attachment.');
  const name=field(f.name,180).replace(/[\\/\x00-\x1f]/g,'_');
  if(typeof f.data!=='string'||!f.data.length||f.data.length>12*1024*1024||(f.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(f.data)))throw uploadError('Invalid file encoding.');
  const bytes=Buffer.from(f.data,'base64');if(bytes.length>8*1024*1024)throw uploadError('Each file must be 8 MB or smaller.');
  let type='application/octet-stream';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))type='image/png';
  else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)type='image/jpeg';
  else if(['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()))type='image/gif';
  else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')type='image/webp';
  else if(bytes.subarray(0,5).toString()==='%PDF-')type='application/pdf';
  return {id:crypto.randomUUID(),name,size:bytes.length,type,bytes};
 });
}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');const pathname=url.pathname;
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('finfolio_session='));
 const token=cookie?.slice('finfolio_session='.length);const session=db.sessions.find(x=>x.tokenHash===crypto.createHash('sha256').update(token||'').digest('hex')&&x.expires>Date.now());const user=session&&db.users.find(x=>x.id===session.userId);
 const resourceMatch=pathname.match(/^\/resources\/([a-f0-9-]{36})$/);
 if(resourceMatch&&req.method==='GET'){
  const attachment=db.projects.flatMap(p=>p.resources||[]).find(f=>f.id===resourceMatch[1]);
  if(!attachment){res.writeHead(404);return res.end('File not found');}
  const bytes=await fs.readFile(path.join(uploadsDir,attachment.id));
  const inline=url.searchParams.get('download')!=='1'&&(attachment.type.startsWith('image/')||attachment.type==='application/pdf');
  res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'; frame-ancestors 'self'");
  res.setHeader('Content-Disposition',`${inline?'inline':'attachment'}; filename="download"; filename*=UTF-8''${encodeURIComponent(attachment.name).replace(/'/g,'%27')}`);
  res.writeHead(200,{'Content-Type':attachment.type,'Content-Length':bytes.length});return res.end(bytes);
 }
 if(pathname.startsWith('/api/')){
  if(req.method!=='GET'){
   const origin=req.headers.origin;if(origin&&origin!==`${req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}`)return json(res,403,{error:'Cross-origin request rejected'});
   if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'JSON required'});
  }
  if(pathname==='/api/state'&&req.method==='GET')return json(res,200,{user:user?publicUser(user):null,projects:db.projects.map(decorate),likes:user?db.projects.filter(p=>p.likedBy.includes(user.id)).map(p=>p.id):[]});
  if(pathname==='/api/demo-signup'&&req.method==='POST'){
   const key=req.socket.remoteAddress;const a=attempts.get(key)||{count:0,until:Date.now()+3600000};if(a.until<Date.now()){a.count=0;a.until=Date.now()+3600000;}if(++a.count>30)return json(res,429,{error:'Too many demo accounts. Try again later.'});attempts.set(key,a);
   const input=await body(req);if(input.mobileCode!=='123456'||input.emailCode!=='123456')return json(res,400,{error:'Use demo code 123456 in both fields.'});
   const u={id:crypto.randomUUID(),name:field(input.name,70),role:'Finance professional'};db.users.push(u);const secret=crypto.randomBytes(32).toString('hex');db.sessions.push({tokenHash:crypto.createHash('sha256').update(secret).digest('hex'),userId:u.id,expires:Date.now()+7*86400000});await persist();res.setHeader('Set-Cookie',`finfolio_session=${secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`);return json(res,201,{user:publicUser(u)});
  }
  if(pathname.startsWith('/api/profiles/')&&req.method==='GET'){const u=db.users.find(x=>x.id===pathname.split('/')[3]);return u?json(res,200,{user:publicUser(u),projects:db.projects.filter(p=>p.userId===u.id).map(decorate)}):json(res,404,{error:'Profile not found'});}
  if(!user)return json(res,401,{error:'Create a demo profile to continue.'});
  if(pathname==='/api/profile'&&req.method==='PATCH'){const input=await body(req);const name=field(input.name,70),role=field(input.role,120);Object.assign(user,{name,role});await persist();return json(res,200,{user:publicUser(user)});}
  if(pathname==='/api/projects'&&req.method==='POST'){
   const input=await body(req,58*1024*1024);const styles={'Equity research':'equity','Financial models':'model','Presentations':'slides','Perspectives':'insight'};if(!Object.hasOwn(styles,input.category))return json(res,400,{error:'Select a category'});
   const resource=typeof input.url==='string'?input.url.trim():'';if(resource){try{if(!['http:','https:'].includes(new URL(resource).protocol)||resource.length>2000)throw Error();}catch{return json(res,400,{error:'Use an HTTP or HTTPS resource link'});}}
   const uploaded=parseUploads(input.files);const title=field(input.title,110),description=field(input.description,4000);
   const used=db.projects.flatMap(p=>p.resources||[]).reduce((sum,f)=>sum+f.size,0);if(used+uploaded.reduce((sum,f)=>sum+f.size,0)>250*1024*1024)return json(res,507,{error:'Demo file storage is full.'});
   const resources=uploaded.map(({bytes,...metadata})=>metadata);
   const project={resources,id:crypto.randomUUID(),userId:user.id,title,description,category:input.category,style:styles[input.category],url:resource,format:resources.length?`${resources.length} FILE${resources.length===1?'':'S'} · Attached`:resource?'LINK · Resource':'NOTE · Original',likedBy:[]};for(const f of uploaded)await fs.writeFile(path.join(uploadsDir,f.id),f.bytes,{flag:'wx',mode:0o600});db.projects.unshift(project);await persist();return json(res,201,{project:decorate(project)});
  }
  const match=pathname.match(/^\/api\/projects\/([^/]+)\/like$/);if(match&&req.method==='POST'){const p=db.projects.find(p=>p.id===match[1]);if(!p)return json(res,404,{error:'Project not found'});p.likedBy=p.likedBy.includes(user.id)?p.likedBy.filter(id=>id!==user.id):[...p.likedBy,user.id];await persist();return json(res,200,{project:decorate(p),liked:p.likedBy.includes(user.id)});}
  return json(res,404,{error:'Endpoint not found'});
 }
 const name=pathname==='/'?'index.html':pathname.slice(1);if(!['index.html','app.js','style.css'].includes(name)){res.writeHead(404);return res.end('Not found');}const content=await fs.readFile(path.join(root,name));res.writeHead(200,{'Content-Type':name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'});res.end(content);
}catch(e){console.error(e.message);json(res,e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});}});
(async()=>{await fs.mkdir(uploadsDir,{recursive:true});try{db=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;db={users:[],projects:[],sessions:[]};await persist();}server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('FinFolio frontend and API listening on '+(process.env.PORT||3000)));})();
