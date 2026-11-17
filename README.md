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

The browser preview includes the supplied scroll, reading and audio, particle and solid views, and the reading archive. Image processing, single-character reference paths, and printable OBJ export use the full runtime below.

An interactive calligraphy artwork by JINSHANJS. Read a scroll, listen to the generated score, and fold the reading into a form that alternates between particles and a solid.

The interface includes scroll reading, pointer reading, stroke tracing, single-character standard and free paths, camera and image upload, WAV and printable OBJ export, and a named browser archive with full-page PNG and SVG downloads. The standard path is an AI reference. Check the suggested character and the route against the source.

## Run the full artwork

The server serves the webpage and its image recognition, single-character inference, and mesh generation on the same address. A running Docker host is required for a browser-only deployment. GitHub stores the source and checkpoint.

```sh
docker build -t ink-sound-form .
docker run --rm -p 127.0.0.1:7860:7860 ink-sound-form
```

Open [http://127.0.0.1:7860/](http://127.0.0.1:7860/) in a browser. For a public Docker host, set `INK_FORM_ORIGIN` to its exact external HTTPS origin. The app also recognises the external host supplied by a Hugging Face Docker Space. The health endpoint reports whether the reference checkpoint is present.

Archives remain in the browser. Uploaded images are processed by the running server. Temporary files used during model inference are removed after the request.

## Model attribution

This project uses the phase-two checkpoint published by the [CalliRewrite authors](https://luoprojectpage.github.io/callirewrite/). The release asset includes the published checkpoint data and index with the required configuration. License notices and the inference source are retained under `vendor/`. The inference wrapper uses the checkpoint location configured by the host and skips an evaluation-only checkpoint, which is not used to generate paths.
