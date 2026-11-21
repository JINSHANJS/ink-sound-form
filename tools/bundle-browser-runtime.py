"""Bundle the pinned browser Python runtime and verify every package hash."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web/my_work/object_3d/ink_sound_form"
RUNTIME = WEB / "browser-runtime"
VERSION = "0.27.7"
BASE = f"https://cdn.jsdelivr.net/pyodide/v{VERSION}/full/"
RUNTIME.mkdir(exist_ok=True)

def download(name):
    path = RUNTIME / name
    if not path.exists():
        subprocess.run(["curl", "--http1.1", "-fsSL", "--retry-all-errors", "--retry", "3", "--connect-timeout", "15", "--max-time", "300", BASE + name, "-o", str(path.with_suffix(path.suffix + ".part"))], check=True)
        path.with_suffix(path.suffix + ".part").replace(path)
    return path

manifest = json.loads(download("pyodide-lock.json").read_text())
packages = manifest["packages"]
names = set()
def dependencies(name):
    if name in names:
        return
    names.add(name)
    for dep in packages[name]["depends"]:
        dependencies(dep)
for name in ("numpy", "pillow", "opencv-python"):
    dependencies(name)
files = ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip"]
files += [packages[name]["file_name"] for name in sorted(names)]
with ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(download, files))
for name in sorted(names):
    info = packages[name]
    digest = hashlib.sha256((RUNTIME / info["file_name"]).read_bytes()).hexdigest()
    if digest != info["sha256"]:
        raise RuntimeError("Package integrity check failed: " + name)
    print("Verified", name, info["version"], flush=True)
python = WEB / "browser-python"
python.mkdir(exist_ok=True)
for name in ("extract.py", "solidify.py", "solidify_tables.py"):
    shutil.copy2(ROOT / "backend" / name, python / name)
(RUNTIME / "bundle-manifest.json").write_text(json.dumps({"pyodide":VERSION,"source":BASE,"files":{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in RUNTIME.iterdir() if p.is_file() and p.name!="bundle-manifest.json"}},indent=2)+"\n")
print("Bundled browser runtime and artwork algorithms.", flush=True)
