---
title: Ink Sound Form
emoji: 🖋️
colorFrom: gray
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Ink · Sound · Form

[**Open the current artwork in your browser**](https://jinshanjs.github.io/ink-sound-form/)

The published website includes the supplied scroll, custom image uploads, camera capture, all three reading methods, single-character standard/free paths, audio, particle and solid views, printable OBJ export, and the named reading archive with full-page PNG and SVG downloads.

Image analysis and closed-mesh generation run in a browser worker using the bundled Pyodide 0.27.7, NumPy 2.0.2, OpenCV 4.10.0.84 and Pillow 10.2.0. All required runtime files are included in this repository and served by GitHub Pages. A separate server, model selector, API key or local installation is not needed. The first upload or mesh export loads approximately 28 MB of runtime files; the interface stays responsive while processing runs in the worker. Uploaded photographs stay in the browser in this mode.

The standard path is an image-based estimate. It is not a verified reconstruction of a calligrapher's historical writing order. Character labels may be entered or corrected manually.

Camera access uses the browser's normal permission prompt and requires HTTPS or localhost. Downloads and archive storage follow the browser's permissions. OBJ export retains the one-shell, closed-edge and positive-volume checks rather than exporting a defective printable mesh. Archives store the most recent 100 readings in this browser. Open a record to delete it; the library displays 20 at a time.

## Run a local copy

Serve the `web` directory with any static HTTP server, for example:

```sh
python3 -m http.server 8000 --directory web
```

Then open `/my_work/object_3d/ink_sound_form/字-音-像.html` on that server. A supported browser and the bundled files are sufficient; the Python image-processing packages do not need to be installed on the host. Run `python3 tools/bundle-browser-runtime.py` only when rebuilding or refreshing the pinned bundle. Package hashes are verified against the official Pyodide lockfile; `bundle-manifest.json` records the vendored files.

## Optional server runtime

The Python backend remains available for existing integrations:

```sh
docker build -t ink-sound-form .
docker run --rm -p 127.0.0.1:7860:7860 ink-sound-form
```

For a public Docker host, set `INK_FORM_ORIGIN` to its exact HTTPS origin. This backend is optional for the published browser artwork.

## Model attribution

The repository retains the experimental phase-two checkpoint wrapper published by the [CalliRewrite authors](https://luoprojectpage.github.io/callirewrite/). The optional experimental release asset includes the published checkpoint data and index with the required configuration. The published browser paths use image-based ink continuity, rather than this checkpoint. License notices and the inference source are retained under `vendor/`. The inference wrapper uses the checkpoint location configured by the host and skips an evaluation-only checkpoint, which is not used to generate paths.
