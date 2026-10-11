"""Draw the app icon: a revolver cylinder seen end-on, one chamber loaded."""
import math
import pathlib
from PIL import Image, ImageDraw, ImageFilter

S = 1024
out = pathlib.Path(__file__).resolve().parent.parent / "electron" / "icon.png"

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
c = S / 2

# rounded dark tile with a warm glow
d.rounded_rectangle([40, 40, S - 40, S - 40], radius=200, fill=(18, 10, 6, 255))
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([c - 380, c - 380, c + 380, c + 380], fill=(232, 140, 60, 90))
img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(90)))
d = ImageDraw.Draw(img)

# cylinder body with six flutes
R = 330
d.ellipse([c - R, c - R, c + R, c + R], fill=(52, 54, 60, 255), outline=(120, 124, 132, 255), width=10)
for i in range(6):
    a = math.radians(i * 60 + 30)
    x, y = c + math.cos(a) * (R - 8), c + math.sin(a) * (R - 8)
    d.ellipse([x - 48, y - 48, x + 48, y + 48], fill=(18, 10, 6, 255))
d.ellipse([c - 46, c - 46, c + 46, c + 46], fill=(25, 26, 30, 255), outline=(110, 112, 120, 255), width=6)

# chambers: five empty, one live round
for i in range(6):
    a = math.radians(i * 60 - 90)
    x, y = c + math.cos(a) * 190, c + math.sin(a) * 190
    if i == 0:
        d.ellipse([x - 82, y - 82, x + 82, y + 82], fill=(196, 150, 70, 255), outline=(240, 200, 120, 255), width=8)
        d.ellipse([x - 26, y - 26, x + 26, y + 26], fill=(150, 30, 20, 255))
    else:
        d.ellipse([x - 78, y - 78, x + 78, y + 78], fill=(6, 6, 7, 255), outline=(90, 92, 98, 255), width=6)

img.save(out)
img.resize((256, 256), Image.LANCZOS).save(out.with_name("icon-256.png"))
print("wrote", out)
