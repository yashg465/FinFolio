const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtemp,rm}=require('node:fs/promises');
const os=require('node:os');const path=require('node:path');const net=require('node:net');
test('uploads, download isolation, limits, and persistence',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'finfolio-test-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 let child;async function start(){child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:dir}});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));});}
 async function stop(){if(child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
 const base='http://127.0.0.1:'+port;let cookie='';async function request(url,method='GET',data,auth=true){return fetch(base+url,{method,headers:{'Content-Type':'application/json',...(auth?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});}
 try{await start();let response=await request('/api/projects','POST',{},false);assert.equal(response.status,401);
 response=await request('/api/demo-signup','POST',{name:'Upload Tester',mobileCode:'123456',emailCode:'123456'});cookie=response.headers.get('set-cookie').split(';')[0];assert.equal(response.status,201);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=','base64');
 const input={title:'Uploaded research',description:'Full article with supporting files',category:'Equity research',files:[{name:'photo.png',data:png.toString('base64')},{name:'report.pdf',data:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')},{name:'notes.html',data:Buffer.from('<script>alert(1)</script>').toString('base64')}]};
 response=await request('/api/projects','POST',input);assert.equal(response.status,201);const {project}=await response.json();assert.equal(project.resources.length,3);
 response=await request('/resources/'+project.resources[0].id);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
 response=await request('/resources/'+project.resources[2].id);assert.equal(response.headers.get('content-type'),'application/octet-stream');assert.match(response.headers.get('content-disposition'),/^attachment/);assert.match(response.headers.get('content-security-policy'),/sandbox/);
 response=await request('/resources/'+project.resources[1].id+'?download=1');assert.match(response.headers.get('content-disposition'),/^attachment/);
 for(const files of [Array(6).fill(input.files[0]),[{name:'bad.bin',data:'not-base64!'}],[{name:'huge.bin',data:Buffer.alloc(8*1024*1024+1).toString('base64')}]]){response=await request('/api/projects','POST',{...input,files});assert.equal(response.status,400);}
 response=await request('/resources/00000000-0000-0000-0000-000000000000');assert.equal(response.status,404);
 await stop();await start();response=await request('/api/state');const state=await response.json();assert.equal(state.projects[0].resources.length,3);response=await request('/resources/'+project.resources[0].id);assert.equal(response.status,200);
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
