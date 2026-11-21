# Full browser processing — 21 November 2026

The user requested removing functional restrictions from the GitHub version. The static preview wrapper previously blocked Upload image, Use camera and Export mesh. Those click restrictions are removed, and the wrapper has been deleted.

## Implementation

The website now includes Pyodide 0.27.7, NumPy 2.0.2, OpenCV 4.10.0.84 and Pillow 10.2.0. Approximately 28 MB of runtime files are stored in both repositories, with upstream package SHA-256 validation, attribution and licenses. The same extract.py, solidify.py and solidify_tables.py algorithms are bundled as browser Python modules. Image analysis and printable-mesh processing execute in a dedicated worker. No external processing host, local Python installation or API key is needed to use the published website.

The existing upload and export handlers select the browser processor when present, while the local application retains its native server routes. Character cropping can reuse the paths from any loaded image. The browser interface remains responsive during processing; progress is visible during the first runtime load. The public HTML includes the processor directly; deployment no longer injects a separate restricted preview script. Publication validates runtime hashes and parity between the Python source and the browser copies.

## Validation

A real file-input upload produced 186 paths. First-use image analysis and engine initialization on the local static test host took 3.78 seconds while 188 UI timer callbacks continued. A simulated camera video device was opened through the browser media API, captured a calligraphy frame and processed it into 192 paths. Actual physical camera hardware was not tested. Read score, audio playback, completed 3D generation, OBJ/WAV downloads and an archive full-page PNG download all passed.

The actual downloaded OBJ was independently parsed: zero boundary edges, zero non-manifold edges, one component, positive-volume sealing and a 120 mm longest side. The downloaded WAV was validated as a stereo PCM file. Runtime/dependency differences can change stroke decomposition counts for newly analysed images; existing stored data and archive measurements remain intact.

## Browser requirements retained

Camera access still needs the user's browser permission and HTTPS or localhost. Downloads and persistent storage follow browser permissions. The designed 20-record archive retention and printable-mesh quality/resource checks remain. Removing preview gates does not mean bypassing browser permissions, fabricating a verified cursive writing order or exporting invalid mesh geometry. Standard order remains estimated and character identity can be entered manually.

## Delivery

Both public and private ink_sound_form folders include the complete runtime and the new interaction boundary hooks. The public README documents actual capabilities, first-load cost and optional server use. Publication and live-site verification follow the local functional tests.
