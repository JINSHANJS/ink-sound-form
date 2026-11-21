(() => {
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
  const serverActions = new Set(["upload", "shoot", "export"]);
  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || !serverActions.has(button.id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.getElementById("now").textContent = "Processing service required";
    document.getElementById("why").textContent =
      "This web preview runs the supplied scroll. See the GitHub project for the full version.";
  }, true);
})();
