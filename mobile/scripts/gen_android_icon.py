from PIL import Image

src = Image.open(
    r"c:\Users\DELL\Documents\coding\moviebox.clone\mobile\assets\icon.png"
).convert("RGBA")
size = 1024
zoom = 1.22  # slight zoom for Android adaptive safe zone

scaled = src.resize((int(size * zoom), int(size * zoom)), Image.Resampling.LANCZOS)
left = (scaled.width - size) // 2
top = (scaled.height - size) // 2
fg = scaled.crop((left, top, left + size, top + size))

out = r"c:\Users\DELL\Documents\coding\moviebox.clone\mobile\assets\android-icon-foreground.png"
fg.save(out, "PNG")
print("saved", out, fg.size)

bg = Image.new("RGB", (size, size), (12, 12, 14))
bg_path = r"c:\Users\DELL\Documents\coding\moviebox.clone\mobile\assets\android-icon-background.png"
bg.save(bg_path, "PNG")
print("saved", bg_path)
