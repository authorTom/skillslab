# App icon and launch screen

Source artwork for the iOS app icon and launch screen. The SVGs here are the
masters; the PNGs in `../ios/App/App/Assets.xcassets/` are generated from them.

| Source        | Generated                                                   |
| ------------- | ----------------------------------------------------------- |
| `app-icon.svg`| `AppIcon.appiconset/AppIcon-512@2x.png` (1024×1024)          |
| `splash.svg`  | `Splash.imageset/splash-2732x2732{,-1,-2}.png` (2732×2732)   |

Xcode generates every smaller icon size from the single 1024×1024 image, so
`AppIcon.appiconset/Contents.json` needs no edits when the icon changes. The
three splash PNGs are identical — Capacitor registers the same image at 1×, 2×
and 3×.

## Design notes

- Teal gradient (`#14b8a6` → `#0f766e`) matching the app's palette in
  `src/index.css`.
- A pulse trace beside a tick: clinical, and reads as "skill signed off".
- `LaunchScreen.storyboard` uses `scaleAspectFill`, so a square splash is
  cropped on the short edge of any iPad. The mark sits well inside the central
  square that always survives that crop.

## Regenerating

App icons must be fully opaque — the App Store rejects an icon with an alpha
channel — so the rasterised PNG is flattened to RGB before being installed.

```sh
# 1024x1024 icon
qlmanage -t -s 1024 -o . app-icon.svg
node flatten-png.mjs app-icon.svg.png \
  ../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png

# 2732x2732 splash, copied to all three scales
qlmanage -t -s 2732 -o . splash.svg
node flatten-png.mjs splash.svg.png splash-flat.png
for f in splash-2732x2732.png splash-2732x2732-1.png splash-2732x2732-2.png; do
  cp splash-flat.png "../ios/App/App/Assets.xcassets/Splash.imageset/$f"
done

rm -f app-icon.svg.png splash.svg.png splash-flat.png
```

`qlmanage` is macOS Quick Look and needs no install. Any rasteriser works —
`rsvg-convert -w 1024 -h 1024` or `magick -density 384` produce the same result
if you have them.
