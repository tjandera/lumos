#!/usr/bin/env python3
"""
Fetch and optimise the CC0 furniture models from Poly Haven.

Committed so the asset set is reproducible: running this reproduces exactly what's in
`apps/web/public/models/ph/`. Re-run it to refresh the set or change the mapping.

Pipeline per asset:
  1. download the 1k glTF and its textures
  2. downscale every texture to 512 (these are viewed at furniture scale in a room, not
     as hero renders — the PBR surface set is already capped at 512 for the same reason)
  3. pack to a single Draco-compressed .glb via gltf-pipeline

Draco matters here rather than being a nicety: the scanned plants are ~5 MB of geometry
each *before* textures, because their leaves are real cut geometry rather than alpha
cards. Compressing the meshes is what keeps the whole set to a few MB.

Requires: python3 + Pillow, and `pnpm dlx gltf-pipeline` (no repo dependency added).
"""

import json
import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "apps/web/public/models/ph"
WORK = Path("/tmp/ph-models")
TEXTURE_PX = 512
JPEG_QUALITY = 82

# catalog id -> Poly Haven asset. Several catalog entries deliberately share one asset
# (a 3-seat sofa is the 2-seat scaled up); the renderer scales each to its catalog width.
MAPPING = {
    "sofa-2seat": "Sofa_01",
    "sofa-3seat": "Sofa_01",
    "armchair": "ArmChair_01",
    "lounge-chair": "mid_century_lounge_chair",
    "bench": "painted_wooden_bench",
    "desk-chair": "dining_chair_02",
    "bar-stool": "bar_chair_round_01",
    "coffee-table": "modern_coffee_table_01",
    "round-table": "round_wooden_table_01",
    "dining-table": "dining_table",
    "side-table": "side_table_01",
    "desk": "metal_office_desk",
    "corner-desk": "metal_office_desk",
    "bookshelf": "wooden_bookshelf_worn",
    "wardrobe": "painted_wooden_cabinet",
    "tv-stand": "modern_wooden_cabinet",
    "plant": "potted_plant_01",
    "plant-small": "potted_plant_02",
}

UA = {"User-Agent": "interior-design-asset-pipeline"}


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)


def process(asset: str) -> tuple[int, str] | None:
    api = f"https://api.polyhaven.com/files/{asset}"
    req = urllib.request.Request(api, headers=UA)
    files = json.load(urllib.request.urlopen(req, timeout=60))
    spec = files.get("gltf", {}).get("1k", {}).get("gltf")
    if not spec:
        print(f"  !! {asset}: no 1k glTF", file=sys.stderr)
        return None

    work = WORK / asset
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)

    root_name = spec["url"].split("/")[-1]
    fetch(spec["url"], work / root_name)
    for rel, info in spec.get("include", {}).items():
        fetch(info["url"], work / rel)

    # Downscale textures in place, keeping filenames so the glTF's URIs stay valid.
    for img_path in work.rglob("*.jpg"):
        with Image.open(img_path) as im:
            if max(im.size) <= TEXTURE_PX:
                continue
            im.convert("RGB").resize((TEXTURE_PX, TEXTURE_PX), Image.LANCZOS).save(
                img_path, "JPEG", quality=JPEG_QUALITY, optimize=True
            )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{asset}.glb"
    res = subprocess.run(
        ["pnpm", "dlx", "gltf-pipeline", "-i", str(work / root_name), "-o", str(out), "-d"],
        capture_output=True,
        text=True,
    )
    if res.returncode != 0 or not out.exists():
        print(f"  !! {asset}: gltf-pipeline failed\n{res.stderr[-500:]}", file=sys.stderr)
        return None
    return out.stat().st_size, asset


def main() -> None:
    assets = sorted(set(MAPPING.values()))
    print(f"Processing {len(assets)} assets -> {OUT_DIR}")
    total = 0
    done = []
    for a in assets:
        r = process(a)
        if r:
            size, name = r
            total += size
            done.append(name)
            print(f"  ok {name:32s} {size/1024/1024:5.2f} MB")
    print(f"\n{len(done)}/{len(assets)} assets, {total/1024/1024:.1f} MB total")
    (OUT_DIR / "manifest.json").write_text(
        json.dumps({"source": "polyhaven.com (CC0)", "mapping": MAPPING}, indent=2, sort_keys=True)
    )


if __name__ == "__main__":
    main()
