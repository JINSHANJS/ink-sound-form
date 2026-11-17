/* Self-contained archival plates: all coordinates and event values derive from the record. */
window.ArchivePlate = (() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const pitch = midi => ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][((midi%12)+12)%12]+(Math.floor(midi/12)-1);
  function events(record) {
    if(record.events) return record.events;
    let time=0;
    return record.notes.map((note,index)=>{const duration=Number(note.dur)||.08;const event={start:time,duration,gap:Math.max(0,note.rest||0),pitches:[note.midi],noteIndices:[index]};time+=duration+event.gap;return event;});
  }
  function notation(duration) {
    const choices=[.125,.25,.5,.75,1,1.5,2,3,4,6,8];
    const beats=duration*2; // explicit editorial quarter = 120 BPM
    const value=choices.reduce((a,b)=>Math.abs(Math.log(beats/a))<Math.abs(Math.log(beats/b))?a:b);
    const dotted=[.75,1.5,3,6].includes(value),base=dotted?value/1.5:value;
    return {value,dotted,open:base>=2,stem:base<4,flags:base<1?Math.round(-Math.log2(base)):0};
  }
  function svg(record) {
    const ev=events(record), rows=Math.max(1,Math.ceil(ev.length/8));
    const height=1780+rows*450;
    let out=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${height}" viewBox="0 0 1400 ${height}"><rect width="1400" height="${height}" fill="#eeeDE7"/><defs><clipPath id="upper"><rect x="320" y="270" width="760" height="360"/></clipPath><clipPath id="lower"><rect x="320" y="630" width="760" height="370"/></clipPath></defs>`;
    const text=(x,y,t,size=12,color='#53564e',family='monospace')=>{out+=`<text x="${x}" y="${y}" fill="${color}" font-family="${family}" font-size="${size}">${escape(t)}</text>`};
    const line=(x,y,a,b,color='#a9aba1',dash='')=>{out+=`<path d="M${x} ${y}L${a} ${b}" fill="none" stroke="${color}" stroke-width=".8" ${dash?'stroke-dasharray="'+dash+'"':''}/>`};
    const dot=(x,y,r=2,color='#30352d')=>{out+=`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`};
    const duration=Math.max(0,...ev.map(e=>e.start+e.duration));
    const points=record.chains.flat(), bounds=[0,1,2].map(i=>[Math.min(...points.map(p=>p.p[i])),Math.max(...points.map(p=>p.p[i]))]);
    const extent=Math.max(1,...bounds.map(b=>Math.max(Math.abs(b[0]),Math.abs(b[1]))));
    const project=p=>[700+(p[0]*.94+p[2]*.34)/extent*280,630-(p[1]*.96-p[2]*.18)/extent*280];
    text(64,55,'INK / SOUND / FORM',13);text(1030,55,'READING ATLAS / 01',13);line(64,75,1336,75);
    text(64,130,record.name.length>65?record.name.slice(0,62)+'…':record.name,32,'#222720','Georgia');
    text(64,163,new Date(record.created).toISOString().replace('T',' / ').slice(0,22)+' UTC');
    text(64,191,`${record.mode} · ${record.notes.length} source notes · ${ev.length} sound events`);
    text(990,163,`${duration.toFixed(3)} s / SCORE SPAN`);text(990,191,record.events?'PLAYBACK SNAPSHOT':'LEGACY / TIMING ESTIMATE');
    line(64,220,1336,220);text(64,252,'01 / MATERIAL TRANSLATION');
    // Reference planes and registration marks frame a continuous form.
    for(let i=0;i<7;i++){const yy=330+i*100;line(330,yy,1060,yy,'#c8c9c0','2 7');text(1068,yy+4,((630-yy)/280*extent).toFixed(2),10);}
    line(700,280,700,1000,'#a9aba1','3 8');line(330,630,1060,630,'#797f72','8 6');
    text(334,300,'DISPERSED / P',11);text(334,976,'CONSOLIDATED / S',11);text(935,976,'OBLIQUE X–Y–Z',10);
    const segments=[];
    for(const chain of record.chains)for(let i=1;i<chain.length;i++)segments.push({a:chain[i-1],b:chain[i]});
    segments.sort((a,b)=>(a.a.p[2]+a.b.p[2])-(b.a.p[2]+b.b.p[2]));
    out+='<g clip-path="url(#lower)" stroke-linecap="round">';
    for(const {a,b} of segments){const [x,y]=project(a.p),[xx,yy]=project(b.p);const width=Math.max(1.8,Math.min(12,(Number(b.r)||Number(b.thick)*.5||.012)*560/extent));out+=`<path d="M${x} ${y}L${xx} ${yy}" stroke="#252b24" stroke-width="${width}"/><path d="M${x-.5} ${y-.6}L${xx-.5} ${yy-.6}" stroke="#92978a" stroke-width="${width*.4}"/>`;}
    out+='</g><g clip-path="url(#upper)">';
    let seed=42;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
    const stride=Math.max(1,Math.ceil(segments.length/6500));
    for(let i=0;i<segments.length;i+=stride){const {a,b}=segments[i];for(let j=0;j<5;j++){const t=random();const p=a.p.map((v,k)=>v+(b.p[k]-v)*t);const [x,y]=project(p);const spread=2+random()**3*24;dot(x+(random()-.5)*spread,y+(random()-.5)*spread,.45+random()*.65,'#454c41');}}
    out+='</g>';
    text(64,332,'PARTICLE STATE',14,'#20271e');text(64,359,'Sampled from saved geometry');text(64,381,`${points.length.toLocaleString('en-US')} vertices / model units`);text(64,403,'Static dispersed illustration');
    text(1100,332,'SOLID STATE',14,'#20271e');text(1100,359,`${record.chains.length} path chains`);text(1100,381,'Width / depth retained');text(1100,403,'Static surface projection');
    // Coordinate callouts reference real saved vertices and their note indices.
    for(let i=0;i<6;i++){const p=points[Math.floor((i+.5)*points.length/6)];if(!p)continue;const [x,y]=project(p.p),left=i<3,yy=470+(i%3)*125,edge=left?300:1100,tx=left?64:1100;line(x,y,left?350:1050,yy-12,'#697060');line(left?350:1050,yy-12,edge,yy-12,'#697060');dot(x,y,3);text(tx,yy,`V${String(Math.floor((i+.5)*points.length/6)).padStart(5,'0')}`,12,'#242a20');text(tx,yy+22,`X ${p.p[0].toFixed(4)}`);text(tx,yy+40,`Y ${p.p[1].toFixed(4)}  Z ${p.p[2].toFixed(4)}`);const n=record.notes[p.noteIndex];text(tx,yy+58,n?`Source ${pitch(n.midi)} / MIDI ${n.midi}`:'Bridge / no source note',11);}
    text(64,1028,'ENVELOPE',11);bounds.forEach((b,i)=>text(260+i*330,1028,`${'XYZ'[i]}  ${b[0].toFixed(3)} → ${b[1].toFixed(3)}`));line(64,1050,1336,1050);
    text(64,1085,'02 / SOURCE & READING ORDER');
    out+=`<image href="${escape(record.image)}" x="64" y="1110" width="570" height="310" preserveAspectRatio="xMidYMid meet"/>`;
    const scale=Math.min(570/record.width,310/record.height),ox=720+(570-record.width*scale)/2,oy=1110+(310-record.height*scale)/2;
    out+='<rect x="720" y="1110" width="570" height="310" fill="#e4e3db"/>';
    record.notes.forEach((n,i)=>{out+=`<path d="${n.points.map((p,j)=>`${j?'L':'M'}${ox+p[0]*scale} ${oy+p[1]*scale}`).join(' ')}" fill="none" stroke="#454c40" stroke-width=".9" opacity=".65"/>`;if(i%Math.max(1,Math.ceil(record.notes.length/12))===0&&n.points.length){const p=n.points[0];dot(ox+p[0]*scale,oy+p[1]*scale);text(ox+p[0]*scale+4,oy+p[1]*scale-4,i+1,9)}});
    text(64,1450,'Original colour / source image');text(720,1450,'Selected ink paths / numbered in reading order');
    line(64,1480,1336,1480);text(64,1515,'03 / SOUND TRANSCRIPTION');
    text(64,1544,'Sounding pitch · chords aligned · sharp spelling · quarter = 120 BPM (editorial reference)');
    text(64,1566,'Rhythm symbols are nearest-value approximations. Exact onset, duration and gap appear below each event.');
    if(!record.events)text(64,1588,'Legacy archive: original chord grouping and tempo were not saved. Events below are a sequential estimate.',11,'#915138');
    ev.forEach((e,i)=>{
      const row=Math.floor(i/8),col=i%8,base=1780+row*450,x=150+col*149;
      if(col===0){for(let j=0;j<5;j++){line(90,base-j*10,1310,base-j*10,'#8a8d80');line(90,base+110-j*10,1310,base+110-j*10,'#8a8d80');}text(64,base-1,'𝄞',48,'#333','serif');text(64,base+99,'𝄢',36,'#333','serif');text(64,base-75,`SYSTEM ${row+1}`,10);}
      const note=notation(e.duration);
      [...new Set(e.pitches)].forEach(m=>{const pc=((Math.round(m)%12)+12)%12,step=[0,0,1,1,2,3,3,4,4,5,5,6][pc]+7*(Math.floor(m/12)-1);const bass=m<60,staff=bass?base+110:base,relative=step-(bass?18:30),y=staff-relative*5;
        for(let k=-2;k>=relative;k-=2)line(x-10,staff-k*5,x+10,staff-k*5,'#444');
        for(let k=10;k<=relative;k+=2)line(x-10,staff-k*5,x+10,staff-k*5,'#444');
        out+=`<ellipse cx="${x}" cy="${y}" rx="6" ry="4" transform="rotate(-18 ${x} ${y})" fill="${note.open?'#eeede7':'#252a22'}" stroke="#252a22" stroke-width="1.4"/>`;
        if([1,3,6,8,10].includes(pc))text(x-19,y+5,'♯',17,'#252a22','serif');
        if(note.stem){line(x+5,y,x+5,y-30,'#252a22');for(let f=0;f<note.flags;f++)out+=`<path d="M${x+5} ${y-30+f*6}q17 6 8 16" fill="none" stroke="#252a22" stroke-width="1.6"/>`;}
        if(note.dotted)dot(x+12,y-2,1.5);
      });
      text(x-32,base+220,`#${i+1} @ ${e.start.toFixed(3)}s`,10);text(x-32,base+236,`dur ${e.duration.toFixed(3)}s`,10);text(x-32,base+252,`gap ${e.gap.toFixed(3)}s`,10);
    });
    text(64,height-25,`ARCHIVE ${record.id} / Coordinates use model units; geometry samples are not mesh faces.`,10);
    return out+'</svg>';
  }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  async function png(record){const markup=svg(record);const blob=new Blob([markup],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);try{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);const png=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!png)throw Error('Image export failed');download(png,record.name+'.png');}finally{URL.revokeObjectURL(url);}}
  return {svg,png,download,events,notation};
})();
