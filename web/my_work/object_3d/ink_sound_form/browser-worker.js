/* Run the same Python artwork algorithms off the interface thread. */
let engine;
let queue = Promise.resolve();
async function prepare(id) {
  if (!engine) engine = (async () => {
    self.postMessage({id, status: "Preparing browser engine… First use downloads the bundled components."});
    importScripts("browser-runtime/pyodide.js");
    const python = await loadPyodide({indexURL: new URL("browser-runtime/", self.location.href).href});
    await python.loadPackage(["numpy", "pillow", "opencv-python"], {
      messageCallback: () => {}, errorCallback: () => {},
    });
    const directory = "/artwork/my_work/object_3d/ink_sound_form";
    python.FS.mkdirTree(directory);
    for (const name of ["extract.py", "solidify.py", "solidify_tables.py"]) {
      const response = await fetch("browser-python/" + name + "?v=2");
      if (!response.ok) throw Error("A browser processing file is unavailable.");
      python.FS.writeFile(directory + "/" + name, await response.text());
    }
    python.runPython(`import sys, json
sys.path.insert(0, "${directory}")
import numpy as np
from PIL import Image
import extract, solidify`);
    return python;
  })().catch(error => {engine = null; throw error;});
  return engine;
}
self.onmessage = event => {
  const {id, operation, payload} = event.data;
  queue = queue.then(async () => {
    let ready = false;
    try {
      const python = await prepare(id);
      ready = true;
      self.postMessage({id, status: operation === "image" ? "Recognising strokes in your browser…" : "Sealing and checking the mesh in your browser…"});
      let output;
      if (operation === "image") {
        python.FS.writeFile("/input-image", new Uint8Array(payload));
        output = python.runPython(`json.dumps(extract.analyze(np.asarray(Image.open("/input-image").convert("RGB"))))`);
        python.FS.unlink("/input-image");
      } else if (operation === "mesh") {
        python.globals.set("mesh_payload", JSON.stringify(payload));
        output = python.runPython(`json.dumps(solidify.solidify(json.loads(mesh_payload)))`);
        python.globals.delete("mesh_payload");
      } else throw Error("Unknown browser operation.");
      self.postMessage({id, result: JSON.parse(output)});
    } catch (error) {
      self.postMessage({id, error: !ready
        ? "The browser engine could not load. Check your connection and try again."
        : operation === "image"
        ? "The image could not be analysed. Use a clear JPG or PNG of ink on light paper and try again."
        : "The reading could not be sealed into one closed mesh. Try a shorter connected reading."});
      console.error("Browser artwork processing failed:", error);
    }
  });
};
