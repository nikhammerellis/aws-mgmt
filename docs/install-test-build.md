# Installing AWS Profile Manager (Test Build)

These are unsigned test builds. Both Windows and macOS will warn you when you first run the installer — that's expected. Follow the steps below to dismiss the warning and complete the install.

## Where to find a build

Test builds live on the project's **GitHub Releases** page. Each release is tagged `v0.1.x` (or similar) and includes:

- `AWS Profile Manager-X.Y.Z-Setup-x64.exe` — Windows 10/11 64-bit
- `AWS Profile Manager-X.Y.Z-arm64.dmg` — macOS, Apple Silicon (M1, M2, M3, M4)
- `AWS Profile Manager-X.Y.Z-x64.dmg` — macOS, Intel

Pick the one that matches your machine.

> **Not sure which Mac you have?** Click the Apple menu → **About This Mac**. If the chip line says "Apple M…", grab `arm64`. If it says "Intel", grab `x64`.

---

## macOS install

1. Download the right `.dmg` for your chip.
2. Open the DMG and drag **AWS Profile Manager** into your `/Applications` folder.
3. Eject the DMG.
4. **First launch (do this once)**: open Finder → Applications → right-click **AWS Profile Manager** → **Open**. macOS will show a dialog warning that the app is from an unidentified developer. Click **Open**. macOS remembers this choice and won't ask again.

### Alternative: clear the quarantine flag

If right-click → Open isn't working (or you'd rather do it from the terminal), run this once:

```bash
xattr -cr "/Applications/AWS Profile Manager.app"
```

This removes the quarantine attribute that triggers Gatekeeper. After that, double-clicking the app launches it normally.

### Why the warning?

The build is unsigned — we haven't paid for an Apple Developer ID for test distribution. macOS treats unsigned apps as untrusted by default. Once you approve the app once, it's trusted on your machine forever (until you reinstall a different version).

---

## Windows install

1. Download `AWS Profile Manager-X.Y.Z-Setup-x64.exe`.
2. Double-click the installer. Windows SmartScreen will appear with the message **"Windows protected your PC"**.
3. Click **More info** (small link near the top of the dialog).
4. Click the **Run anyway** button that appears at the bottom.
5. Follow the installer prompts. The installer creates a desktop shortcut and a Start menu entry.
6. Launch from the Start menu or desktop shortcut.

### Why the warning?

The installer is unsigned — we haven't bought an Authenticode certificate for test distribution. SmartScreen flags every unsigned installer until enough people install it for Microsoft's reputation system to trust it. **Run anyway** is safe for our test builds.

---

## Reporting bugs

Found something broken? Note:

- The version string from the app's title bar (or the installer file name).
- Your OS version and architecture (Apple Silicon vs Intel, Windows version).
- Steps to reproduce.
- A screenshot of the issue if it's visual.

Send these to the project owner via the usual channel.

## Uninstalling

- **macOS**: drag `AWS Profile Manager` from `/Applications` to the Trash. The app stores its state in `~/.aws/` (your AWS config), which it does **not** delete on uninstall — that's by design so your AWS profiles stay intact.
- **Windows**: Settings → Apps → search for **AWS Profile Manager** → Uninstall. Same caveat: `~/.aws/` is left alone.
