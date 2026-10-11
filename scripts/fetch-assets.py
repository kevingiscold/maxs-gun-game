"""Download the CC0 assets the game ships with (re-runnable).

Textures: Poly Haven (CC0) -- https://polyhaven.com/license
Music:    "Horror Atmosphere" by Juhani Junkala / SubspaceAudio (CC0)
          https://opengameart.org/content/horror-atmosphere
"""
import json
import pathlib
import subprocess
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEX = ROOT / "public" / "textures"
MUSIC_SRC = ROOT / "assets-src" / "music" / "horror-atmosphere.ogg"
MUSIC_OUT = ROOT / "public" / "audio" / "horror-atmosphere.ogg"

TEXTURES = ["wood_table_worn", "old_wood_floor", "decrepit_wallpaper", "dark_wood", "dirty_carpet"]
MAPS = {"Diffuse": "diff", "nor_gl": "nor", "Rough": "rough"}
UA = {"User-Agent": "maxs-gun-game-asset-fetch"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def fetch_textures():
    TEX.mkdir(parents=True, exist_ok=True)
    for name in TEXTURES:
        files = json.loads(get(f"https://api.polyhaven.com/files/{name}"))
        for key, short in MAPS.items():
            out = TEX / f"{name}_{short}.jpg"
            if out.exists():
                continue
            url = files[key]["1k"]["jpg"]["url"]
            out.write_bytes(get(url))
            print("got", out.name)


def fetch_music():
    if not MUSIC_SRC.exists():
        MUSIC_SRC.parent.mkdir(parents=True, exist_ok=True)
        MUSIC_SRC.write_bytes(
            get(
                "https://opengameart.org/sites/default/files/"
                "Juhani%20Junkala%20-%20Post%20Apocalyptic%20Wastelands%20%5BLoop%20Ready%5D.ogg"
            )
        )
    MUSIC_OUT.parent.mkdir(parents=True, exist_ok=True)
    # Background bed played quietly: mono 64 kbps is plenty and ~2.5 MB instead of 14.
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(MUSIC_SRC), "-ac", "1", "-c:a", "libvorbis", "-b:a", "64k", str(MUSIC_OUT)],
        check=True,
    )
    print("music ->", MUSIC_OUT, MUSIC_OUT.stat().st_size // 1024, "KB")


def fetch_cloudflared():
    """Cloudflare's tunnel client (Apache-2.0), bundled into the desktop app."""
    out = ROOT / "vendor" / "cloudflared.exe"
    if out.exists():
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(get("https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"))
    print("got", out.name)


if __name__ == "__main__":
    fetch_textures()
    fetch_music()
    fetch_cloudflared()
