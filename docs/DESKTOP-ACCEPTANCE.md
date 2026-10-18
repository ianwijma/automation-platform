# Linux desktop release acceptance

Automated evidence currently covers an isolated X11 server and a test-owned window. The Rust bridge builds and its key mapping test passes. A successful build is not evidence of working portal consent, compositor extensions, keyboard layouts, tray integration or autostart.

| Environment | Current evidence | Release gate |
|---|---|---|
| X11, Xvfb 800×600 | Window title/PID discovery, focus, capture artifact, offline OCR, typing and relative click pass | Repeat with a real WM, multiple monitors and keyboard layouts |
| GNOME Wayland | Helper compiled; extension source present | All session checks below on named GNOME/distribution versions |
| KDE Plasma 6 Wayland | Helper compiled; KWin script source present | All session checks below on named Plasma/distribution versions |
| Tauri shell | Cargo compile and Debian packaging | Open/quit, tray, second launch, start-on-login and orphan checks |
| Headless | API/fleet/polling/container checks | Screen/input must fail clearly while system/data nodes remain usable |

For each GNOME/KDE session, record compositor/version, distribution, scale, monitor layout, keyboard layout, portal backend version and the build commit. Use a disposable VM or test account with a test-owned application window.

1. Fresh profile: launch the app, create a simple state workflow, save, run, close, reopen and verify history/state.
2. Trigger screenshot: allow portal consent, verify image dimensions and monitor selection. Deny consent on a fresh profile and verify a useful failure with no input. Revoke permission and repeat.
3. Enable the matching adapter. List title/PID/app/geometry, select by anchored title and PID, test ambiguity/no match, focus a minimized window, then close it mid-request.
4. Capture whole screen, selected window and region. Test negative monitor origins, mixed 100/150/200% scaling and bounds. Verify OCR consumes the same artifact after a remote hop.
5. Type text into the owned window; test Unicode, non-US layout and modifier combinations. Click/move at known window/region-relative locations. Ensure no input goes to a stale or ambiguous target.
6. Cancel while waiting for consent, capturing, typing and OCR. Verify stopped input, closed requests, no worker/process leaks, and terminal run status.
7. Idle five minutes, resume and revoke consent. Confirm sessions are released and can be re-established without bypassing prompts.
8. Start a second shell instance; verify one sidecar. Close/quit and check sidecar/children stop. Test tray Open/Quit and start-on-login enabled/disabled across logout.
9. Disconnect the agent during an action: expect interrupted/uncertain outcome with no automatic replay; reconnect retains identity and tags.

Known limitations to resolve before broad release: no arbitrary window metadata without an adapter; portal behavior differs by compositor; no unattended desktop work in a locked/headless session guarantee; no tested accessibility permission recovery; no signed release/update channel. Do not replace these checks with mocked portal responses.
