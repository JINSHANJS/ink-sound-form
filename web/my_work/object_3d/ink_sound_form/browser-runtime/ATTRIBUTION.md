# Browser runtime attribution

This bundle contains the unmodified Pyodide 0.27.7 runtime from the official Pyodide distribution (https://pyodide.org/en/0.27.7/), plus the NumPy 2.0.2, OpenCV Python 4.10.0.84 and Pillow 10.2.0 WebAssembly packages listed in its official lockfile. Package SHA-256 checksums are verified by tools/bundle-browser-runtime.py. Each wheel retains its original license and copyright files.

Pyodide is distributed under MPL-2.0; its bundled Python and libraries retain their respective license terms. See the included PYODIDE-LICENSE and the license files inside the wheels. The project's artwork algorithms are copied from backend/ without geometric changes and run in a dedicated web worker, following https://pyodide.org/en/0.27.7/usage/webworker.html.
