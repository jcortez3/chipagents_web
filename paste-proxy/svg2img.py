#!/usr/bin/env python3
"""Render a standalone SVG to PNG or JPG with headless Chrome/Edge (Windows) and Pillow."""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

from PIL import Image

BROWSERS = [
    "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
    "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
]
MAX_PX = 4096
DEFAULT_SIZE = (800, 600)


def browser():
    for b in [os.environ.get("CHROME_EXE", "")] + BROWSERS:
        if b and Path(b).is_file():
            return b
    sys.exit("svg2img: Chrome/Edge not found (set CHROME_EXE)")


def winpath(p):
    return subprocess.check_output(["wslpath", "-w", str(p)], text=True).strip()


def file_url(p):
    return "file:///" + urllib.parse.quote(winpath(p).replace("\\", "/"), safe="/:")


def px(v):
    m = re.fullmatch(r"\s*([\d.]+)\s*(px)?\s*", v or "")
    return float(m.group(1)) if m else None


def svg_size(text):
    tag = re.search(r"<svg\b[^>]*>", text, re.S)
    if not tag:
        sys.exit("svg2img: no <svg> element found")
    attr = lambda n: (re.search(rf'\b{n}\s*=\s*["\']([^"\']*)["\']', tag.group(0)) or [None, None])[1]
    w, h = px(attr("width")), px(attr("height"))
    vb = [float(x) for x in re.split(r"[\s,]+", (attr("viewBox") or "").strip()) if x] if attr("viewBox") else []
    if len(vb) == 4 and vb[2] > 0 and vb[3] > 0:
        if w and not h:
            h = w * vb[3] / vb[2]
        elif h and not w:
            w = h * vb[2] / vb[3]
        elif not w and not h:
            w, h = vb[2], vb[3]
    if not w or not h:
        w, h = DEFAULT_SIZE
    return max(1, round(w)), max(1, round(h))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("svg", type=Path)
    ap.add_argument("out", type=Path, help="output .png, .jpg or .jpeg")
    ap.add_argument("--scale", type=float, default=2.0, help="pixel density (default 2)")
    ap.add_argument("--background", default="white", help="CSS color, or 'transparent' (PNG only)")
    ap.add_argument("--quality", type=int, default=92, help="JPG quality (default 92)")
    a = ap.parse_args()
    ext = a.out.suffix.lower()
    if ext not in (".png", ".jpg", ".jpeg"):
        sys.exit("svg2img: output must end in .png, .jpg or .jpeg")
    if not a.svg.is_file():
        sys.exit(f"svg2img: SVG not found: {a.svg}")
    if a.background == "transparent" and ext != ".png":
        sys.exit("svg2img: transparent background needs a .png output")
    if not re.fullmatch(r"#?[\w(),.% -]+", a.background):
        sys.exit("svg2img: invalid --background")
    text = a.svg.read_text(encoding="utf-8", errors="replace")
    w, h = svg_size(text)
    scale = max(0.25, min(a.scale, MAX_PX / max(w, h)))
    a.out.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=".svg2img-", dir=a.out.parent))
    try:
        shutil.copyfile(a.svg, tmp / "src.svg")
        bg = "transparent" if a.background == "transparent" else a.background
        (tmp / "page.html").write_text(
            "<!doctype html><html><head><meta charset='utf-8'><style>"
            f"html,body{{margin:0;padding:0;overflow:hidden;background:{bg}}}"
            f"img{{display:block;width:{w}px;height:{h}px}}"
            "</style></head><body><img src='src.svg'></body></html>",
            encoding="utf-8",
        )
        cmd = [
            browser(), "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
            "--allow-file-access-from-files", f"--user-data-dir={winpath(tmp / 'profile')}",
            f"--window-size={w},{h}", f"--force-device-scale-factor={scale:g}",
            "--default-background-color=00000000", "--virtual-time-budget=3000",
            f"--screenshot={winpath(tmp / 'shot.png')}", file_url(tmp / "page.html"),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        shot = tmp / "shot.png"
        if not shot.is_file():
            sys.exit(f"svg2img: browser produced no image (exit {r.returncode}): {r.stderr.strip()[-300:]}")
        img = Image.open(shot)
        img.load()
        target = (round(w * scale), round(h * scale))
        if img.size != target:
            img = img.crop((0, 0, min(img.width, target[0]), min(img.height, target[1])))
        if ext == ".png":
            img.save(a.out, "PNG", optimize=True)
        else:
            rgba = img.convert("RGBA")
            flat = Image.new("RGB", rgba.size, "white")
            flat.paste(rgba, mask=rgba.split()[3])
            flat.save(a.out, "JPEG", quality=max(1, min(a.quality, 95)), optimize=True)
        print(f"{a.out} ({img.width}x{img.height})")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
