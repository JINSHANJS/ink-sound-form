import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const profile=mkdtempSync(path.join(process.env.BROWSER_TEST_DIR||tmpdir(),'ink-form-'));
const downloads=path.join(profile,'downloads');mkdirSync(downloads);
const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1','--directory','web'],{stdio:'ignore'});
const chrome=spawn(process.env.CHROME_BIN||'google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=9346','--user-data-dir='+profile,'--no-first-run','about:blank'],{stdio:'ignore'});
let ws;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const timeout=setTimeout(()=>{console.error('Browser check timed out');chrome.kill();server.kill();process.exit(1)},180000);
try {
 let tab;
 for(let i=0;i<100;i++){
  try{tab=(await(await fetch('http://127.0.0.1:9346/json/list')).json()).find(t=>t.type==='page'&&!t.url.startsWith('chrome:'));if(tab)break}catch{}
  await wait(200);
 }
 assert(tab,'Chrome did not start');
 ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const requests=new Map(),errors=[];
 ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){requests.get(message.id)?.(message);requests.delete(message.id)}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails)};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const current=++id;requests.set(current,message=>message.error?reject(Error(message.error.message)):resolve(message.result));ws.send(JSON.stringify({id:current,method,params}))});
 const run=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value};
 async function until(expression){for(let i=0;i<100;i++){if(await run(expression))return;await wait(200)}throw Error('Condition timed out: '+expression)}
 await call('Runtime.enable');await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
 await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
 await call('Page.navigate',{url:process.env.ARTWORK_URL||'http://127.0.0.1:8765/my_work/object_3d/ink_sound_form/'+encodeURIComponent('字-音-像.html')});
 await until('typeof window.analyzeScrollImage==="function" && typeof characterStudy!=="undefined"');
 const uploaded=await run('(async()=>{const blob=await(await fetch("../../prints/2026-10-25_scroll.jpg")).blob();await sendImage(blob);return {notes:canonNotes.length,source:photo.src,ready:!playBtn.disabled}})()');
 assert(uploaded.notes>100&&uploaded.source.startsWith('blob:')&&uploaded.ready,'Static image upload failed');
 await run('studyElement("select-character").click();characterStudy.crop={x:865,y:40,width:95,height:108};studyElement("open-character").disabled=false;studyElement("open-character").click()');
 await until('characterStudy.mode==="ready"');
 assert(await run('characterStudy.referenceAvailable'),'Character opening failed');
 await run('studyElement("show-order").click();solidBtn.click()');await until('solid&&phase==="done"');
 await run('musicBtn.click()');assert(await run('audio.state==="running"'),'Audio failed');
 await run('stop();phase="idle";exportBtn.click()');await until('!exporting&&nowEl.textContent==="Mesh downloaded"');
 const mesh=await run('(async()=>{const response=await window.requestPrintableMesh({chains:[[[0,0,0,.04],[.16,0,0,.04]]]});const text=await response.text();return {boundary:response.headers.get("X-Solid-Boundary"),components:response.headers.get("X-Solid-Components"),obj:text.includes("\\nf ")}})()');
 assert.deepEqual(mesh,{boundary:'0',components:'1',obj:true});
 // Reanalyse light-on-dark ink using the browser processor.
 const light=await run('(async()=>{const c=document.createElement("canvas");c.width=photo.naturalWidth;c.height=photo.naturalHeight;const ctx=c.getContext("2d");ctx.drawImage(photo,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=255-pixels.data[i];pixels.data[i+1]=255-pixels.data[i+1];pixels.data[i+2]=255-pixels.data[i+2]}ctx.putImageData(pixels,0,0);const blob=await new Promise(r=>c.toBlob(r));return (await window.analyzeScrollImage(blob)).notes.length})()');
 assert(light>0,'Light foreground was not recognised');
 // Seed only this isolated test profile, then exercise the real retention and delete UI.
 await run('(async()=>{window.archiveTestDB=await new Promise((resolve,reject)=>{const q=indexedDB.open("ink-sound-form-archive",1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});window.archiveTestRecords=()=>new Promise(resolve=>{const q=archiveTestDB.transaction("records").objectStore("records").getAll();q.onsuccess=()=>resolve(q.result)});const sample=(await archiveTestRecords())[0];if(!sample)throw Error("No generated archive");await new Promise((resolve,reject)=>{const tx=archiveTestDB.transaction("records","readwrite"),store=tx.objectStore("records");store.clear();for(let i=0;i<101;i++)store.put({...sample,id:"seed-"+String(i).padStart(3,"0"),created:i+1});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})})()');
 await run('solidBtn.click()');await until('(async()=>{const r=await archiveTestRecords();return r.length===100&&!r.some(x=>x.id==="seed-000"||x.id==="seed-001")})()');
 await run('document.getElementById("archives").click()');await until('document.querySelectorAll(".archive-grid>button").length===20');
 await run('document.querySelector(".archive-grid>button").click();document.querySelector(".archive-delete").click()');
 await run('[...document.querySelectorAll(".archive-confirmation button")].find(b=>b.textContent==="Cancel").click()');assert.equal(await run('(async()=>(await archiveTestRecords()).length)()'),100);
 await run('document.querySelector(".archive-delete").click();[...document.querySelectorAll(".archive-confirmation button")].find(b=>b.textContent==="Delete permanently").click()');
 await until('(async()=>(await archiveTestRecords()).length===99)()');
 await run('document.getElementById("archive-close").click()');await until('document.getElementById("archive-content").children.length===0');
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('PASS: static upload, character opening, audio, 3D, actual OBJ export, closed mesh, white ink and 100-record deletion without a backend');
} finally {clearTimeout(timeout);ws?.close();chrome.kill();server.kill()}
