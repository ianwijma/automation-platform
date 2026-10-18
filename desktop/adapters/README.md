# Wayland window adapters

The portal helper controls capture and input only after compositor consent. Standard portals do not expose an arbitrary window title/PID catalog. These optional, user-installed adapters expose window metadata and focus operations over the user's session D-Bus. They grant no new privileges across users.

**Status:** source and helper compile checks are complete; neither adapter has passed a real compositor session acceptance run in this implementation environment. Run [the matrix](../../docs/DESKTOP-ACCEPTANCE.md) before treating a compositor/version as supported.

## GNOME

The extension uses the GNOME 45+ ESM extension format. The versions listed in its metadata are intended targets, not verified compatibility claims.

Copy `gnome/automation-platform@ianwijma.github.io` to `~/.local/share/gnome-shell/extensions/automation-platform@ianwijma.github.io`, log out and back in, then enable **Automation Platform Windows** in the Extensions application. Start the platform/agent in that same session. Disable/remove the extension to remove access.

The adapter serves `ListWindows` and `Focus` on `/org/automationplatform/Windows` through `org.gnome.Shell`. The helper uses these for unambiguous title/PID/app-ID selection and obtains screenshots/input through RemoteDesktop/ScreenCast portals.

## KDE Plasma 6

Install the `kwin` directory using `kpackagetool6 --type KWin/Script --install ./desktop/adapters/kwin`. Enable **Automation Platform Windows** in System Settings → Window Management → KWin Scripts. The script publishes current window geometry/PID/title and services focus requests through `org.automationplatform.Desktop` while the helper runs.

The script's timer and workspace APIs follow [KWin's scripting interface](https://develop.kde.org/docs/plasma/kwin/api/); the timer constructor is exposed by [KWin's implementation](https://github.com/KDE/kwin/blob/master/src/scripting/scripting.cpp). Disable the script to remove access.

## Session behavior

First capture/input requests show the desktop's permission dialog. A restore token can reduce repeat prompts where the compositor supports it; it does not bypass consent. Session permission can be revoked in the compositor. The helper closes idle sessions after five minutes and cancels in-progress requests when the caller disconnects. Monitor sizes and positions come from the selected portal stream; mixed scaling and multi-monitor correctness require the acceptance matrix.

Do not run the desktop helper as root or expose its local socket over the network. For headless machines, use only data/system nodes; connect a graphical-session agent for desktop work.
