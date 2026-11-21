"""Serve the artwork and its three processing routes on one origin."""
import base64
import json
import os
import re
import socket
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import BoundedSemaphore
from urllib.parse import quote

import numpy as np
from PIL import Image

import extract
import solidify

ROOT = Path(__file__).resolve().parents[1]
PAGE = "/my_work/object_3d/ink_sound_form/" + quote("字-音-像.html")
PORT = int(os.environ.get("PORT", 7860))
CHECKPOINT = Path(os.environ.get("INK_FORM_CHECKPOINT_DIR", ROOT / "weights")).resolve()
os.environ["INK_FORM_CHECKPOINT_DIR"] = str(CHECKPOINT)
MODEL_READY = (CHECKPOINT / "new_train_phase_2/p2s-30000.index").is_file()
ORIGIN = os.environ.get("INK_FORM_ORIGIN")
if not ORIGIN and os.environ.get("SPACE_HOST"):
    ORIGIN = "https://" + os.environ["SPACE_HOST"]
LIMITS = {"/recognize": 16_000_000, "/character": 4_000_000, "/solidify": 3_000_000}
PROCESSING = BoundedSemaphore(2)
MODEL = BoundedSemaphore(1)
Image.MAX_IMAGE_PIXELS = 28_000_000


def read_image(raw):
    with Image.open(BytesIO(raw)) as image:
        if image.width * image.height > 28_000_000:
            raise ValueError("The image exceeds 28 megapixels.")
        return extract.to_working_size(np.asarray(image.convert("RGB")))


def character_candidates(rgb):
    buffer = BytesIO()
    Image.fromarray(rgb).save(buffer, format="PNG")
    try:
        result = subprocess.run(
            ["tesseract", "stdin", "stdout", "-l", "chi_tra+chi_sim", "--psm", "10"],
            input=buffer.getvalue(), capture_output=True, timeout=8, check=True,
        )
        found = re.findall(r"[\u3400-\u9fff]", result.stdout.decode("utf-8"))
        return [{"text": found[0]}] if len(found) == 1 else []
    except (OSError, subprocess.SubprocessError):
        return []


def reference_paths(rgb):
    result = extract.analyze(rgb)
    return {
        "source": "Ink continuity", "verified": False,
        "paths": [[[p[0] / result["width"], p[1] / result["height"]]
                   for p in note["points"]] for note in result["notes"]],
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

    def setup(self):
        self.request.settimeout(20)
        super().setup()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def reply(self, status, body, mime, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for name, value in (headers or {}).items():
            self.send_header(name, str(value))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, socket.timeout):
            pass

    def json_reply(self, status, payload):
        self.reply(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def do_GET(self):
        if self.path == "/":
            self.send_response(302)
            self.send_header("Location", PAGE)
            self.end_headers()
        elif self.path == "/health":
            self.json_reply(200, {"app": "Ink Sound Form", "reference_model": MODEL_READY})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path not in LIMITS:
            self.json_reply(404, {"error": "Unknown operation."})
            return
        origin = ORIGIN or f"http://127.0.0.1:{PORT}"
        if self.headers.get("Origin") != origin:
            self.json_reply(403, {"error": "Open the artwork directly to use this feature."})
            return
        try:
            size = int(self.headers.get("Content-Length", 0))
        except ValueError:
            size = 0
        if not 0 < size <= LIMITS[self.path]:
            self.json_reply(413, {"error": "This upload is too large or empty."})
            return
        if not PROCESSING.acquire(blocking=False):
            self.json_reply(503, {"error": "The service is busy. Try again shortly."})
            return
        try:
            raw = self.rfile.read(size)
            if self.path == "/solidify":
                payload = json.loads(raw)
                points = [point for chain in payload["chains"] for point in chain]
                array = np.asarray(points, dtype=float)
                if array.ndim != 2 or array.shape[1] != 4 or not 2 <= len(array) <= 40_000:
                    raise ValueError("The mesh path has an unsupported number of samples.")
                if not np.isfinite(array).all() or np.abs(array[:, :3]).max() > 4 or array[:, 3].max() > 0.25:
                    raise ValueError("The mesh path exceeds the model space.")
                result = solidify.solidify(payload)
                self.reply(200, result["obj"].encode("utf-8"), "text/plain; charset=utf-8", {
                    "X-Solid-Boundary": result["boundary"],
                    "X-Solid-Components": result["components"],
                    "X-Solid-Thin-Mm": result["thin_mm"],
                })
                return
            rgb = read_image(raw)
            result = extract.analyze(rgb)
            if self.path == "/character":
                result["characters"] = character_candidates(rgb)
                result["standard"] = reference_paths(rgb)
            else:
                buffer = BytesIO()
                Image.fromarray(rgb).save(buffer, format="JPEG", quality=82)
                result["image"] = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
            self.json_reply(200, result)
        except solidify.SolidifyError:
            self.json_reply(422, {"error": "This reading could not be sealed into one printable mesh."})
        except (OSError, ValueError, KeyError, TypeError, Image.DecompressionBombError):
            self.json_reply(400, {"error": "This input could not be processed. Try a smaller image or a shorter reading."})
        finally:
            PROCESSING.release()


if __name__ == "__main__":
    with ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as server:
        server.serve_forever()
