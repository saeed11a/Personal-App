# App icon and splash source

These files are the **source** launcher assets. They are not used by the web app
(the web app loads `public/hiker-logo.png`); they are consumed at build time.

| File | What it is |
| --- | --- |
| `icon-only.png` | 1024×1024, the HIKER+ mark centred on the brand off-white (`#F4F4F4`). |
| `icon.png` | Same as `icon-only.png` (kept for the simpler "one icon" setups). |
| `icon-foreground.png` | 1024×1024, the mark alone on transparency, sized into the Android adaptive-icon safe zone. |
| `icon-background.png` | 1024×1024 solid `#F4F4F4` plate. |
| `splash.png` / `splash-dark.png` | 2732×2732, the mark centred on `#F4F4F4` / `#16191f`. |

## Android (APK)

`.github/workflows/android-apk.yml` runs `@capacitor/assets` against this folder
after `npx cap add android`, which writes every `mipmap-*` density plus the
adaptive-icon resources, so the installed APK shows this mark instead of the
Capacitor default.

## Windows (EXE)

`electron-builder` picks up its application icon from the `build/` resources
folder — `build/icon.png` (512×512, the same mark) is used and converted for
Windows. That path only takes effect once the Electron shell itself exists; see
`AGENTS.md` for the state of the Windows build.

## Regenerating

The PNGs are derived from the original 512×512 mark with `sharp`
(`resize` + `flatten` onto `#F4F4F4`). Replace them wholesale if the logo changes.
