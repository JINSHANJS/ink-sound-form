(() => {
  const workerURL = new URL("browser-worker.js?v=3", document.currentScript.src);
  let worker, nextId = 0;
  const pending = new Map();
  function process(operation, payload) {
    if (!worker) {
      worker = new Worker(workerURL);
      worker.onmessage = ({data}) => {
        const job = pending.get(data.id);
        if (!job) return;
        if (data.status) {
          document.getElementById("why").textContent = data.status;
          return;
        }
        pending.delete(data.id);
        data.error ? job.reject(Error(data.error)) : job.resolve(data.result);
      };
      worker.onerror = () => {
        for (const job of pending.values()) job.reject(Error("The browser engine could not start. Reload and try again."));
        pending.clear(); worker.terminate(); worker = null;
      };
    }
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, {resolve, reject});
      worker.postMessage({id, operation, payload});
    });
  }
  window.analyzeScrollImage = async blob => process("image", await blob.arrayBuffer());
  window.requestPrintableMesh = async payload => {
    const result = await process("mesh", payload);
    return new Response(result.obj, {headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Solid-Thin-Mm": String(result.thin_mm),
      "X-Solid-Boundary": String(result.boundary),
      "X-Solid-Components": String(result.components),
    }});
  };
  // The bundled scroll already contains paths; a crop can reuse them without a server.
  window.analyzeCharacterCrop = async () => {
    const study = characterStudy, box = study.crop, source = study.original.score;
    const width = Math.max(1, Math.round(box.width / box.height * 480)), height = 480;
    const scaleX = width / box.width, scaleY = height / box.height;
    const notes = [];
    const inside = p => p[0] >= box.x && p[0] <= box.x + box.width &&
      p[1] >= box.y && p[1] <= box.y + box.height;
    for (const note of source.notes) {
      let run = [];
      const finish = () => {
        if (run.length > 1) notes.push({...note, points: run});
        run = [];
      };
      for (const p of note.points) {
        if (inside(p)) run.push([(p[0] - box.x) * scaleX, (p[1] - box.y) * scaleY,
          Math.max(1.5, p[2] * Math.min(scaleX, scaleY))]);
        else finish();
      }
      finish();
    }
    return {
      width, height, notes, characters: [], recognition: "unavailable",
      analysis: {method: "Saved full-scroll ink paths", scope: "selected crop", orderVerified: false},
      standard: {source: "Saved ink paths", verified: false,
        paths: notes.map(note => note.points.map(p => [p[0] / width, p[1] / height]))},
    };
  };
})();
