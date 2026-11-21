/* Single-character readings use a user-confirmed reference traced on the source image. */
const characterStudy = {
  mode: "off", routes: [], selected: 0, confirmed: false, strokes: [], active: null,
  frame: 0, request: 0, original: null, analysis: null, crop: null
};
const studyPanel = document.createElement("section");
studyPanel.id = "character-study";
studyPanel.innerHTML = `
  <button id="select-character" type="button">Select a character</button>
  <div id="character-tools" hidden>
    <button id="back-scroll" type="button">Back to scroll</button>
    <p id="character-status" role="status"></p>
    <div id="crop-tools">
      <button id="open-character" type="button" disabled>Open character</button>
    </div>
    <div id="route-tools" hidden>
      <label>Character <input id="character-name" maxlength="4" autocomplete="off" placeholder="Confirm or enter"></label>
      <p id="recognition-status"></p>
      <div hidden>
        <select id="reference-path"></select>
        <button id="path-up"></button><button id="path-down"></button>
        <button id="path-reverse"></button><button id="path-delete"></button>
        <button id="path-join"></button><button id="path-draw"></button>
        <button id="confirm-paths"></button><button id="guided-trace"></button>
        <button id="save-paths"></button><button id="load-paths"></button>
      </div>
      <div class="study-actions">
        <button id="show-order" disabled>Standard path</button>
        <button id="free-trace">Free path</button>
        <button id="save-character">Save this reading</button>
      </div>
      <input id="path-file" type="file" accept=".json,application/json" hidden>
      <p id="reading-result"></p>
    </div>
  </div>`;
document.getElementById("controls").before(studyPanel);
const studyElement = id => document.getElementById(id);
function studyStatus(text) { studyElement("character-status").textContent = text; }
function cancelStudyFrame() { cancelAnimationFrame(characterStudy.frame); characterStudy.frame = 0; }
function clearStudyReading() {
  stop(); cancelStudyFrame(); phase = "idle"; handOn = pointerOn = tracing = false;
  handVisits = []; pointerVisits = []; handVisit = null; saved = null;
  handBtn.classList.remove("on"); pointerBtn.classList.remove("on");
  document.body.classList.remove("hand", "ribbon");
  setSolid(false);
}
function studyButtons(enabled) {
  [uploadBtn, shootBtn].forEach(button => button.disabled = !enabled);
  [playBtn, handBtn, pointerBtn].forEach(button => button.disabled = false);
}
function startCharacterSelection() {
  if (characterStudy.mode !== "off") return;
  characterStudy.original = { score: { ...piece, notes: canonNotes.slice() }, image: photo.src };
  clearStudyReading(); adopt(characterStudy.original.score);
  characterStudy.mode = "select"; characterStudy.crop = null; characterStudy.cropImage = null;
  studyButtons(false); stage.classList.remove("rolled", "unrolling");
  studyElement("character-tools").hidden = false; studyElement("crop-tools").hidden = false;
  studyElement("route-tools").hidden = true;
  studyElement("open-character").disabled = true;
  studyStatus("Click a character to suggest a crop. Drag a box to adjust its boundary, then select Open character.");
}
function leaveCharacter() {
  characterStudy.request++; clearStudyReading();
  if (characterStudy.original) {
    photo.src = characterStudy.original.image; adopt(characterStudy.original.score);
  }
  document.body.classList.remove("character-focus");
  characterStudy.mode = "off"; characterStudy.original = null;
  studyButtons(true); studyElement("character-tools").hidden = true;
}
studyElement("select-character").onclick = startCharacterSelection;
studyElement("back-scroll").onclick = leaveCharacter;
function cropBox(a, b) {
  const x = Math.max(0, Math.min(a.x, b.x)), y = Math.max(0, Math.min(a.y, b.y));
  return { x, y, width: Math.min(piece.width - x, Math.abs(b.x - a.x)),
    height: Math.min(piece.height - y, Math.abs(b.y - a.y)) };
}
function suggestCrop(p) {
  let closest = null, distance = Infinity;
  for (const note of canonNotes) {
    for (const pt of note.points) {
      const d = Math.hypot(p.x - pt[0], p.y - pt[1]);
      if (d < distance) { distance = d; closest = note; }
    }
  }
  if (!closest) return cropBox({x:p.x-40,y:p.y-50},{x:p.x+40,y:p.y+50});
  const same = canonNotes.filter(n => n.column === closest.column).flatMap(n => n.points);
  const left = Math.min(...same.map(p => p[0])) - 4;
  const right = Math.max(...same.map(p => p[0])) + 4;
  const size = Math.max(45, Math.min(130, right - left));
  return cropBox({x:left,y:p.y-size*0.6},{x:right,y:p.y+size*0.6});
}
function paintCrop() {
  const box = characterStudy.crop;
  ctx2d.clearRect(0,0,canvas.width,canvas.height);
  ctx2d.save(); ctx2d.strokeStyle = "#e4c88d"; ctx2d.lineWidth = 2;
  ctx2d.strokeRect(box.x,box.y,box.width,box.height); ctx2d.restore();
  studyElement("open-character").disabled = box.width < 12 || box.height < 12;
}
studyElement("open-character").onclick = async function () {
  const box = characterStudy.crop;
  if (!box || box.width < 12 || box.height < 12) return;
  const source = document.createElement("canvas");
  source.height = 480; source.width = Math.max(1, Math.round(box.width / box.height * 480));
  source.getContext("2d").drawImage(photo,box.x/piece.width*photo.naturalWidth,
    box.y/piece.height*photo.naturalHeight,box.width/piece.width*photo.naturalWidth,
    box.height/piece.height*photo.naturalHeight,0,0,source.width,480);
  await analyzeCharacter(source);
};
async function analyzeCharacter(source) {
  const revision = ++characterStudy.request;
  const previousMode = characterStudy.mode;
  const image = source.toDataURL("image/png");
  clearStudyReading(); characterStudy.mode = "analysing";
  ["open-character", "show-order", "free-trace", "save-character"].forEach(id => studyElement(id).disabled = true);
  studyStatus("Reading the ink paths… You can also use the full scroll with Read score, Follow pointer or Trace strokes.");
  try {
    const blob = await new Promise(resolve => source.toBlob(resolve));
    const response = await fetch("/character",{method:"POST",body:blob});
    if (!response.ok) throw Error("analysis");
    const result = await response.json();
    if (revision !== characterStudy.request) return;
    photo.src = image; await photo.decode();
    if (revision !== characterStudy.request) return;
    document.body.classList.add("character-focus");
    characterStudy.analysis = result; characterStudy.cropImage = image;
    characterStudy.routes = result.notes.map(n => ({...n,points:n.points.map(p=>p.slice())}));
    characterStudy.selected = 0; characterStudy.confirmed = false;
    characterStudy.strokes = []; characterStudy.mode = "edit";
    adopt({...result,notes:characterStudy.routes});
    const candidate = result.characters?.find(c=>/^[\u3400-\u9fff\uf900-\ufaff]$/u.test(c.text));
    studyElement("character-name").value = candidate?.text || "";
    studyElement("recognition-status").textContent = candidate
      ? "OCR candidate: " + candidate.text + ". Verify against the source. Paths below are provisional."
      : "Character uncertain. Enter its identity if known. Confirm or redraw the cursive paths.";
    studyElement("crop-tools").hidden = true; studyElement("route-tools").hidden = false;
    characterStudy.referenceAvailable=Boolean(result.standard?.paths?.length);
    if(characterStudy.referenceAvailable){
      characterStudy.routes=result.standard.paths.map((path,i)=>{
        const samples=path.map(p=>[p[0]*result.width,p[1]*result.height,2]);
        const points=[samples[0]];
        for(let j=1;j<samples.length;j++){
          const a=samples[j-1],b=samples[j],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3));
          for(let k=1;k<=steps;k++)points.push([a[0]+(b[0]-a[0])*k/steps,a[1]+(b[1]-a[1])*k/steps,2]);
        }
        const length=points.slice(1).reduce((sum,p,j)=>sum+Math.hypot(p[0]-points[j][0],p[1]-points[j][1]),0);
        const midi=48+Math.round(48*(1-Math.min(1,length/1200)));
        return {points,column:i+1,chord:null,midi,freq:440*2**((midi-69)/12),
          name:["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][midi%12]+(Math.floor(midi/12)-1),
          dur:Math.max(.12,Math.min(2,length/240)),rest:.08,cutoff:2200,attack:.03,words:"Estimated ink path"};
      });
    }
    characterStudy.confirmed=true;characterStudy.mode="ready";studyButtons(true);
    if(revision!==characterStudy.request)return;
    updateRoutes();
    studyElement("recognition-status").textContent = (candidate
      ? "Suggested character: " + candidate.text + ". "
      : "Character not recognised. You may enter it manually. ")
      + (characterStudy.referenceAvailable ? result.standard.paths.length + " continuous ink paths. Image-based order is estimated, not verified." : "No reference generated. Free path is available.");
    studyStatus("Character ready. Use Read score, Follow pointer or Trace strokes, or preview the Standard path.");
  } catch {
    if (revision !== characterStudy.request) return;
    characterStudy.mode = characterStudy.cropImage ? previousMode : "select";
    studyStatus("Analysis unavailable. Check the local service and try the crop again.");
  } finally {
    if (revision === characterStudy.request) {
      ["open-character"].forEach(id => studyElement(id).disabled = false);
      if (characterStudy.cropImage) updateRoutes();
    }
  }
}
function updateRoutes() {
  const s=characterStudy;
  s.selected=Math.max(0,Math.min(s.selected,s.routes.length-1));
  studyElement("reference-path").replaceChildren(...s.routes.map((route,i)=>{
    const option=document.createElement("option"); option.value=i;
    option.textContent="Path "+(i+1); return option;
  }));
  studyElement("reference-path").value=s.selected;
  studyElement("show-order").disabled=!s.referenceAvailable;
  studyElement("guided-trace").disabled=!s.referenceAvailable;
  studyElement("free-trace").disabled=false;
  studyElement("save-character").disabled=!["guided","free"].includes(s.mode);
  studyElement("save-character").textContent=saved?"Reading saved":"Save this reading";
  studyElement("show-order").title=s.referenceAvailable?"Play the reference route":"Reference generation is unavailable for this crop.";
  studyElement("show-order").textContent=s.referenceAvailable?"Standard path":"Standard path · unavailable";
  paintReference();
}
function editRoutes(change) {
  if (!["edit","ready"].includes(characterStudy.mode)) return;
  stop();cancelStudyFrame();phase="idle";setSolid(false);fitCanvases();
  change(); characterStudy.confirmed=false; characterStudy.mode="edit";
  saved=null; piece.characterReading=null; updateRoutes();
}
studyElement("reference-path").onchange=function(){characterStudy.selected=Number(this.value);paintReference();};
studyElement("path-up").onclick=()=>editRoutes(()=>{
  const s=characterStudy,i=s.selected;if(i>0){[s.routes[i-1],s.routes[i]]=[s.routes[i],s.routes[i-1]];s.selected--;}
});
studyElement("path-down").onclick=()=>editRoutes(()=>{
  const s=characterStudy,i=s.selected;if(i<s.routes.length-1){[s.routes[i+1],s.routes[i]]=[s.routes[i],s.routes[i+1]];s.selected++;}
});
studyElement("path-reverse").onclick=()=>editRoutes(()=>characterStudy.routes[characterStudy.selected]?.points.reverse());
studyElement("path-delete").onclick=()=>editRoutes(()=>characterStudy.routes.splice(characterStudy.selected,1));
studyElement("path-join").onclick=()=>editRoutes(()=>{
  const s=characterStudy,i=s.selected;if(i+1<s.routes.length){
    s.routes[i].points.push(...s.routes[i+1].points);s.routes.splice(i+1,1);
  }
});
studyElement("path-draw").onclick=()=>{
  if(!["edit","ready"].includes(characterStudy.mode))return;
  stop();cancelStudyFrame();phase="idle";setSolid(false);fitCanvases();
  characterStudy.mode="draw";characterStudy.confirmed=false;updateRoutes();
  studyStatus("Hold the left button and draw one reference stroke from start to end. Release to add it.");
};
studyElement("confirm-paths").onclick=()=>{
  if (!["edit","ready"].includes(characterStudy.mode)||!characterStudy.routes.length) return;
  characterStudy.confirmed=true;characterStudy.mode="ready";updateRoutes();
  saveLocalReference();
  studyStatus("Reference confirmed. Show the route, then trace with guidance or freely.");
};
function referenceLine(points,color,width) {
  if(!points.length)return;
  ctx2d.beginPath();ctx2d.moveTo(points[0][0],points[0][1]);
  points.slice(1).forEach(p=>ctx2d.lineTo(p[0],p[1]));
  ctx2d.strokeStyle=color;ctx2d.lineWidth=width;ctx2d.lineCap="round";ctx2d.stroke();
}
function paintReference() {
  if(solid)return;
  ctx2d.clearRect(0,0,canvas.width,canvas.height);
  const s=characterStudy;
  if(s.referenceAvailable&&s.mode==="guide")s.routes.forEach((route,i)=>{
    referenceLine(route.points,i===s.selected?"rgba(255,222,158,.85)":"rgba(255,255,255,.3)",2);

  });
  s.strokes.forEach(stroke=>referenceLine(stroke.points,"rgba(139,223,214,.9)",2.5));
  if(s.active)referenceLine(s.active.points,"#fff",3);
}
function animateGuide(loop) {
  cancelStudyFrame();
  const s=characterStudy;
  const total=s.routes.reduce((n,r)=>n+r.points.length,0);
  const started=performance.now();
  function tick(now) {
    if(!["guide","guided"].includes(s.mode))return;
    let step=Math.max(0,now-started)/15;
    if(step>=total&&!loop){s.mode="ready";paintReference();return;}
    step%=total;paintReference();
    for(const route of s.routes){
      if(step>=route.points.length){step-=route.points.length;continue;}
      const p=route.points[Math.floor(step)];
      ctx2d.save();ctx2d.fillStyle="#fff";ctx2d.shadowColor="#fff";ctx2d.shadowBlur=18;
      ctx2d.beginPath();ctx2d.arc(p[0],p[1],4,0,Math.PI*2);ctx2d.fill();ctx2d.restore();break;
    }
    s.frame=requestAnimationFrame(tick);
  }
  s.frame=requestAnimationFrame(tick);
}
function useStandardReading() {
  const s=characterStudy;if(!s.referenceAvailable)return;
  clearStudyReading();
  piece={...s.analysis,notes:structuredClone(s.routes),characterReading:{complete:true,coverage:1,inOrder:true,
    character:studyElement("character-name").value,referenceSource:s.analysis.standard.source + " (estimated order)"}};
  phrases=piece.notes.map(n=>[n]);handOrder=false;noteSeat=null;
  bodies=buildBodies();remember("Standard path");fitCanvases();drawScore();
  piece.notes.forEach(n=>addScore([n.name],false));
  s.mode="guide";animateGuide(false);updateRoutes();
  nowEl.textContent="Standard path ready";
  studyStatus("Estimated path ready. Play audio, build the form, or use the reading controls to explore.");
}
studyElement("show-order").onclick=useStandardReading;

function startCharacterTrace(mode) {
  const s=characterStudy;if(mode==="guided"&&!s.referenceAvailable)return;
  clearStudyReading();s.strokes=[];s.active=null;s.mode=mode;
  adopt({...s.analysis,notes:s.routes});studyButtons(true);updateRoutes();
  studyElement("reading-result").textContent="";
  studyStatus("Hold the left button to trace. Release between strokes. Save this reading when finished.");
  if(mode==="guided")animateGuide(true);
}
studyElement("guided-trace").onclick=()=>startCharacterTrace("guided");
studyElement("free-trace").onclick=()=>startCharacterTrace("free");
function closestReference(p) {
  let best={distance:Infinity,route:-1,index:0};
  characterStudy.routes.forEach((r,i)=>r.points.forEach((pt,j)=>{
    const d=Math.hypot(p[0]-pt[0],p[1]-pt[1]);
    if(d<best.distance)best={distance:d,route:i,index:j};
  }));
  return best;
}
function appendTracePoint(event) {
  const p=imageXY(event),s=characterStudy;
  const point=[Math.max(0,Math.min(piece.width,p.x)),Math.max(0,Math.min(piece.height,p.y)),2];
  const prev=s.active.points.at(-1);
  if(prev&&Math.hypot(prev[0]-point[0],prev[1]-point[1])<1)return;
  s.active.points.push(point);s.active.times.push(performance.now());
  if(s.mode!=="draw"){
    const match=closestReference(point);
    const now=performance.now();
    if(match.route>=0&&match.distance<20&&(s.soundedRoute!==match.route||now-(s.soundedAt||0)>180)){
      moveLine(s.routes[match.route]);s.soundedRoute=match.route;s.soundedAt=now;
    }
  }
  paintReference();
}
canvas.style.touchAction="none";
canvas.addEventListener("pointerdown",event=>{
  const s=characterStudy;
  if(["off","reader"].includes(s.mode)||solid)return;
  event.stopImmediatePropagation();
  if(event.button!==0)return;
  if(s.mode==="select"){s.anchor=imageXY(event);canvas.setPointerCapture(event.pointerId);return;}
  if(!["draw","guided","free"].includes(s.mode))return;
  s.soundedRoute=-1;s.soundedAt=0;
  s.active={points:[],times:[]};canvas.setPointerCapture(event.pointerId);appendTracePoint(event);
},true);
canvas.addEventListener("pointermove",event=>{
  const s=characterStudy;if(["off","reader"].includes(s.mode)||solid)return;event.stopImmediatePropagation();
  if(s.mode==="select"&&s.anchor){s.crop=cropBox(s.anchor,imageXY(event));paintCrop();}
  else if(s.active)appendTracePoint(event);
},true);
function finishStudyPointer(event) {
  const s=characterStudy;if(["off","reader"].includes(s.mode)||solid)return;event.stopImmediatePropagation();
  if(s.mode==="select"&&s.anchor){
    const p=imageXY(event);
    if(Math.hypot(p.x-s.anchor.x,p.y-s.anchor.y)<6)s.crop=suggestCrop(p);
    s.anchor=null;paintCrop();return;
  }
  if(!s.active)return;
  const stroke=s.active;s.active=null;hushLine(false);
  if(stroke.points.length>2){
    if(s.mode==="draw"){
      const base=s.routes[s.selected]||s.analysis.notes[0]||{name:"C5",freq:523.25,midi:72,dur:.3,rest:.08,cutoff:1800,attack:.03,words:"Reference path",column:1};
      s.routes.push({...base,points:stroke.points});s.selected=s.routes.length-1;s.mode="edit";updateRoutes();
      studyStatus("Path added. Arrange and confirm the reference order.");
    }else{s.strokes.push(stroke);paintReference();}
  }
}
canvas.addEventListener("pointerup",finishStudyPointer,true);
canvas.addEventListener("pointercancel",finishStudyPointer,true);
function saveFreeReading() {
  const s=characterStudy;
  if(s.active){s.strokes.push(s.active);s.active=null;hushLine(false);}
  const strokes=s.strokes.filter(st=>st.points.length>2);
  if(!strokes.length){studyStatus("Hold the left button to draw a path first.");return;}
  cancelStudyFrame();stop();phase="idle";
  const notes=strokes.map((st,i)=>{
    const length=st.points.slice(1).reduce((n,p,j)=>n+Math.hypot(p[0]-st.points[j][0],p[1]-st.points[j][1]),0);
    const midi=48+Math.round(48*(1-Math.min(1,length/1200)));
    const pitch=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][midi%12]+(Math.floor(midi/12)-1);
    return {column:i+1,name:pitch,midi,freq:440*Math.pow(2,(midi-69)/12),chord:null,
      dur:Math.max(.08,(st.times.at(-1)-st.times[0])/1000),
      rest:Math.max(0,Math.min(2,((strokes[i+1]?.times[0]??st.times.at(-1))-st.times.at(-1))/1000)),
      cutoff:2200,attack:.03,words:"Free path",points:st.points.map(p=>p.slice())};
  });
  piece={...s.analysis,notes,characterReading:{complete:false,coverage:1,inOrder:false,traces:structuredClone(strokes),
    character:studyElement("character-name").value}};
  phrases=notes.map(n=>[n]);handOrder=false;noteSeat=null;bodies=buildBodies();remember("Free path");
  s.mode="ready";paintKept();drawScore();notes.forEach(n=>addScore([n.name],false));
  nowEl.textContent="Free path saved";whyEl.textContent=notes.length+" pen-down paths recorded.";
  studyStatus("Play audio or build the form. Free path starts a new recording.");updateRoutes();
}
function saveCharacterReading() {
  const s=characterStudy;
  if(!["guided","free"].includes(s.mode))return;
  if(!s.referenceAvailable){saveFreeReading();return;}
  if(s.active){s.strokes.push(s.active);s.active=null;hushLine(false);}
  if(!s.strokes.some(st=>st.points.length>2)){studyStatus("Trace the character before saving.");return;}
  cancelStudyFrame();stop();
  const coverage=s.routes.map(()=>new Set()),sequence=[],notes=[];
  let reversed=false;
  for(const stroke of s.strokes){
    if(stroke.points.length<3)continue;
    let run=null;
    for(let j=0;j<stroke.points.length;j++){
      const point=stroke.points[j],m=closestReference(point);
      // Reject off-ink travel from matching while retaining it in the trace.
      const id=m.distance<=Math.max(16,s.routes[m.route].points[m.index][2]*3)?m.route:-1;
      if(!run||run.id!==id){run={id,points:[],start:stroke.times[j],end:stroke.times[j],first:m.index,last:m.index};notes.push(run);}
      run.points.push(point);run.end=stroke.times[j];run.last=m.index;
      if(id>=0){
        // Sparse pointer events cover the intervening reference segment.
        const from=run.points.length>1?run.previous:m.index;
        if(Math.abs(m.index-from)<s.routes[id].points.length*.3+5)
          for(let k=Math.min(from,m.index);k<=Math.max(from,m.index);k++)coverage[id].add(k);
        coverage[id].add(m.index);run.previous=m.index;
      }
    }
  }
  const runs=notes.filter(r=>r.points.length>=3);
  for(const run of runs){
    if(run.id<0)continue;
    if(sequence.at(-1)!==run.id)sequence.push(run.id);
    if(run.last<run.first-3)reversed=true;
  }
  const fractions=coverage.map((c,i)=>c.size/s.routes[i].points.length);
  const inOrder=!reversed&&sequence.length===s.routes.length&&sequence.every((id,i)=>id===i);
  const totalPoints=notes.reduce((sum,r)=>sum+r.points.length,0);
  const offPathPoints=notes.filter(r=>r.id<0).reduce((sum,r)=>sum+r.points.length,0);
  const complete=inOrder&&fractions.every(f=>f>=.7)&&offPathPoints/Math.max(1,totalPoints)<.1;
  const accuracy=fractions.reduce((sum,f)=>sum+f,0)/s.routes.length;
  if(!complete){saveFreeReading();studyElement("reading-result").textContent="Custom route · Open circular form";return;}
  const inkRuns=runs.filter(r=>r.id>=0);
  let converted=inkRuns.map((run,i)=>{
    const template=s.routes[run.id];
    return {...template,chord:null,column:i+1,
      points:run.points.map(p=>[p[0],p[1],Math.max(1.5,template.points[0][2])]),
      dur:Math.max(.08,(run.end-run.start)/1000),
      rest:Math.max(0,Math.min(2,((inkRuns[i+1]?.start??run.end)-run.end)/1000)),
      reference:run.id,words:"Character trace"};
  });
  if(complete)converted=s.routes.map(r=>({...r,points:r.points.map(p=>p.slice())}));
  if(!converted.length){studyStatus("The trace missed the reference ink. Try again or correct the reference paths.");return;}
  piece={...s.analysis,notes:converted,characterReading:{complete,coverage:accuracy,inOrder,
    reference:s.routes.map(r=>r.points),traces:s.strokes.map(st=>({points:st.points,times:st.times})),
    character:studyElement("character-name").value}};
  phrases=converted.map(n=>[n]);handOrder=false;noteSeat=null;
  bodies=buildBodies();remember("Character trace");s.mode="ready";phase="idle";
  paintKept();drawScore();converted.forEach(n=>addScore([n.name],false));
  nowEl.textContent="Character reading saved";
  const result="Coverage "+Math.round(accuracy*100)+"% · "+(inOrder?"Reference order":"Changed order or direction")+" · "+(complete?"Closed circular form":"Open circular form");
  whyEl.textContent=result;studyElement("reading-result").textContent=result;
  studyStatus("Reading saved. Build the form, play the audio, or start another trace.");
  updateRoutes();
}
studyElement("save-character").onclick=saveCharacterReading;
haltBtn.addEventListener("click",event=>{
  if(["guided","free"].includes(characterStudy.mode)){event.stopImmediatePropagation();saveCharacterReading();}
},true);
for(const button of [solidBtn,musicBtn,againBtn,exportBtn,recordBtn]){
  button.addEventListener("click",event=>{
    if(characterStudy.mode==="off")return;
    if(["guided","free"].includes(characterStudy.mode))saveCharacterReading();
    if(!saved){event.stopImmediatePropagation();studyStatus("Use Read score, Follow pointer or Trace strokes first.");}
    else cancelStudyFrame();
  },true);
}
const buildScrollGeometry=buildCubeStrips;
buildCubeStrips=function(){
  const reading=piece.characterReading;
  if(!reading)return buildScrollGeometry();
  const total=piece.notes.reduce((n,note)=>n+Math.max(1,note.points.length-1),0);
  const span=reading.complete?Math.PI*2:Math.PI*(1.05+.6*Math.min(1,reading.coverage));
  const chain=[];let offset=0;
  piece.notes.forEach((note,index)=>{
    const length=Math.max(1,note.points.length-1);
    const path=note.points.map((pt,k)=>{
      const theta=(offset+k)/total*span;
      const radial=.78+.12*(pt[0]/piece.width-.5);
      return {p:[Math.sin(theta)*radial,(.5-pt[1]/piece.height)*.65,Math.cos(theta)*radial],
        n:[Math.sin(theta),0,Math.cos(theta)],r:.022,thick:.024,noteIndex:index,along:k/length,bridge:false};
    });
    if(chain.length)chain.push(...bridgeBetween(chain.at(-1),path[0]));
    chain.push(...path);offset+=length;
  });
  if(reading.complete&&chain.length){
    chain.push(...bridgeBetween(chain.at(-1),chain[0]),{...chain[0],bridge:true,noteIndex:-1});
  }
  return chain.length?[chain]:[];
};
async function referenceKey() {
  const buffer=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(characterStudy.cropImage));
  return "ink-character-"+Array.from(new Uint8Array(buffer),n=>n.toString(16).padStart(2,"0")).join("");
}
async function saveLocalReference() {
  const routes=structuredClone(characterStudy.routes),character=studyElement("character-name").value;
  try { localStorage.setItem(await referenceKey(),JSON.stringify({routes,character})); }
  catch { studyStatus("Reference confirmed. Use Save reference to keep a copy on disk."); }
}
async function matchLocalReference() {
  const revision=characterStudy.request;
  try {
    const previous=JSON.parse(localStorage.getItem(await referenceKey()));
    if(revision===characterStudy.request&&previous?.routes?.length) {
      characterStudy.routes=previous.routes;
      studyElement("character-name").value=previous.character;
      studyElement("recognition-status").textContent="Matched your previously confirmed paths for this exact source crop. Review before tracing.";
    }
  } catch { /* A local reference is optional. */ }
}
function downloadReference(){
  if(!characterStudy.confirmed){studyStatus("Confirm the reference before saving it.");return;}
  const data={version:1,character:studyElement("character-name").value,image:characterStudy.cropImage,
    width:piece.width,height:piece.height,routes:characterStudy.routes};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download="character-reference.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
studyElement("save-paths").onclick=downloadReference;
studyElement("load-paths").onclick=()=>studyElement("path-file").click();
studyElement("path-file").onchange=async function(){
  const file=this.files[0];this.value="";if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(data.version!==1||data.image!==characterStudy.cropImage||!Array.isArray(data.routes)||!data.routes.length||
      data.routes.some(r=>!Array.isArray(r.points)||r.points.length<2||r.points.some(p=>
        !Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||p[0]<0||p[0]>piece.width||p[1]<0||p[1]>piece.height)))
      throw Error("reference");
    characterStudy.routes=data.routes;characterStudy.confirmed=false;characterStudy.mode="edit";
    studyElement("character-name").value=String(data.character||"").slice(0,4);updateRoutes();
    studyStatus("Matching source image found. Review and confirm the saved paths.");
  }catch{studyStatus("This reference does not match the selected image, or its paths are invalid.");}
};

// Cropping is optional; it must never trap the three main reading controls.
for(const button of [playBtn,pointerBtn,handBtn]){
  button.addEventListener("click",()=>{
    const s=characterStudy;
    if(["off","reader"].includes(s.mode))return;
    if(["select","analysing"].includes(s.mode)){leaveCharacter();return;}
    clearStudyReading();adopt({...s.analysis,notes:s.routes});s.mode="reader";
    studyButtons(true);updateRoutes();
    studyStatus("Reading the selected image. Back to scroll restores the full work.");
  },true);
}
