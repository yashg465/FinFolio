const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtemp,rm,writeFile}=require('node:fs/promises');
const os=require('node:os');const path=require('node:path');const net=require('node:net');
test('email signup, username uniqueness/search/migration, uploads, and persistence',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'finfolio-test-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 let child;async function start(){child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:dir}});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));});}
 async function stop(){if(child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
 const base='http://127.0.0.1:'+port;let cookie='';async function request(url,method='GET',data,auth=true){return fetch(base+url,{method,headers:{'Content-Type':'application/json',...(auth?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});}
 try{await writeFile(path.join(dir,'database.json'),JSON.stringify({users:[{id:'legacy-one',name:'Same Name',role:'Analyst'},{id:'legacy-two',name:'Same Name',role:'Analyst'}],projects:[],sessions:[]}));await start();
 let migrated=await request('/api/profiles?username=same_name').then(r=>r.json());assert.deepEqual(migrated.profiles.map(p=>p.username),['same_name','same_name_1']);
let response=await request('/api/projects','POST',{},false);assert.equal(response.status,401);
 response=await request('/api/signup/start','POST',{email:'invalid'});assert.equal(response.status,400);
 const challenge=await request('/api/signup/start','POST',{email:'demo@example.com'}).then(r=>r.json());
 response=await request('/api/demo-signup','POST',{name:'Upload Tester',username:'upload_tester',challengeId:challenge.challengeId});assert.equal(response.status,400);
 response=await request('/api/signup/verify','POST',{challengeId:challenge.challengeId,emailCode:'000000'});assert.equal(response.status,400);
 response=await request('/api/signup/verify','POST',{challengeId:challenge.challengeId,emailCode:'123456'});assert.equal(response.status,200);
 response=await request('/api/demo-signup','POST',{name:'Upload Tester',username:'Upload_Tester',challengeId:challenge.challengeId});cookie=response.headers.get('set-cookie').split(';')[0];assert.equal(response.status,201);
 const profile=await request('/api/profiles?username=%40UPLOAD_TESTER').then(r=>r.json());assert.equal(profile.profiles[0].username,'upload_tester');assert.equal(profile.profiles[0].email,undefined);
 const id=profile.profiles[0].id;response=await request('/api/profiles/upload_tester');assert.equal(response.status,200);response=await request('/api/profiles/'+id);assert.equal(response.status,200);
 const second=await request('/api/signup/start','POST',{email:'second@example.com'}).then(r=>r.json());await request('/api/signup/verify','POST',{challengeId:second.challengeId,emailCode:'123456'});
 response=await request('/api/demo-signup','POST',{name:'Second',username:'UPLOAD_TESTER',challengeId:second.challengeId});assert.equal(response.status,409);
 response=await request('/api/demo-signup','POST',{name:'Second',username:'x!',challengeId:second.challengeId});assert.equal(response.status,400);
 response=await request('/api/demo-signup','POST',{name:'Second',username:'second_user',challengeId:second.challengeId});assert.equal(response.status,201);
 response=await request('/api/demo-signup','POST',{name:'Replay',username:'replay_user',challengeId:second.challengeId});assert.equal(response.status,400);
 const noProjects=await request('/api/profiles?username=second_user').then(r=>r.json());assert.equal(noProjects.profiles.length,1);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=','base64');
 const input={title:'Uploaded research',description:'Full article with supporting files',category:'Equity research',files:[{name:'photo.png',data:png.toString('base64')},{name:'report.pdf',data:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')},{name:'notes.html',data:Buffer.from('<script>alert(1)</script>').toString('base64')}]};
 response=await request('/api/projects','POST',input);assert.equal(response.status,201);const {project}=await response.json();assert.equal(project.resources.length,3);
 response=await request('/resources/'+project.resources[0].id);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
 response=await request('/resources/'+project.resources[2].id);assert.equal(response.headers.get('content-type'),'application/octet-stream');assert.match(response.headers.get('content-disposition'),/^attachment/);assert.match(response.headers.get('content-security-policy'),/sandbox/);
 response=await request('/resources/'+project.resources[1].id+'?download=1');assert.match(response.headers.get('content-disposition'),/^attachment/);
 for(const files of [Array(6).fill(input.files[0]),[{name:'bad.bin',data:'not-base64!'}],[{name:'huge.bin',data:Buffer.alloc(8*1024*1024+1).toString('base64')}]]){response=await request('/api/projects','POST',{...input,files});assert.equal(response.status,400);}
 response=await request('/resources/00000000-0000-0000-0000-000000000000');assert.equal(response.status,404);
 await stop();await start();response=await request('/api/state');const state=await response.json();assert.equal(state.projects[0].resources.length,3);response=await request('/resources/'+project.resources[0].id);assert.equal(response.status,200);
 const oldCookie=cookie;response=await request('/api/logout','POST',{});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 response=await request('/api/state');assert.equal((await response.json()).user,null);
 response=await request('/api/profile','PATCH',{name:'Unauthorized',role:'Test'});assert.equal(response.status,401);
 response=await request('/api/profiles/upload_tester');assert.equal(response.status,200);assert.equal((await response.json()).projects.length,1);
 const third=await request('/api/signup/start','POST',{email:'third@example.com'}).then(r=>r.json());await request('/api/signup/verify','POST',{challengeId:third.challengeId,emailCode:'123456'});
 response=await request('/api/demo-signup','POST',{challengeId:third.challengeId,name:'Third tester',username:'third_user'});assert.equal(response.status,201);cookie=response.headers.get('set-cookie').split(';')[0];
 response=await request('/api/state');assert.equal((await response.json()).user.username,'third_user');
 cookie=oldCookie;await stop();await start();response=await request('/api/state');assert.equal((await response.json()).user,null);
 response=await request('/api/logout','POST',{});assert.equal(response.status,200);
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
