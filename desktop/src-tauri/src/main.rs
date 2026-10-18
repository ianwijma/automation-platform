#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};

struct Sidecar {
    child: Option<Child>,
}

impl Sidecar {
    fn pid(&self) -> Option<u32> {
        self.child.as_ref().map(|c| c.id())
    }

    fn send_sigterm(&mut self) {
        if let Some(pid) = self.pid() {
            unsafe {
                libc::kill(pid as libc::pid_t, libc::SIGTERM);
            }
        }
    }

    fn try_wait(&mut self) -> Option<std::process::ExitStatus> {
        self.child
            .as_mut()
            .and_then(|c| c.try_wait().ok().flatten())
    }

    fn force_kill(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn is_running(&mut self) -> bool {
        self.try_wait().is_none()
    }
}

fn prepare_sidecar(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource = app
        .path()
        .resolve("resources/ap.gz", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let compressed = fs::read(&resource)
        .map_err(|e| format!("Cannot read bundled runtime {}: {e}", resource.display()))?;
    let digest = format!("{:x}", Sha256::digest(&compressed));
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("runtime")
        .join(digest);
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
        .map_err(|e| e.to_string())?;
    let executable = directory.join("ap");
    if !executable.is_file() {
        let temporary = directory.join(format!("ap-{}.tmp", std::process::id()));
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
        let mut decoder = flate2::read::GzDecoder::new(compressed.as_slice());
        std::io::copy(&mut decoder, &mut file).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, &executable).map_err(|e| e.to_string())?;
    }
    Ok(executable)
}

fn spawn_sidecar(
    app: &tauri::AppHandle,
) -> Result<(Sidecar, BufReader<std::process::ChildStdout>), String> {
    let path_to_use = prepare_sidecar(app)?;

    let mut child = Command::new(&path_to_use)
        .args(["serve", "--port", "0", "--no-browser"])
        .env("AP_HOST", "127.0.0.1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn sidecar at {}: {e}", path_to_use.display()))?;

    let stdout = child
        .stdout
        .take()
        .expect("stdout not captured despite Stdio::piped");

    let stderr = child
        .stderr
        .take()
        .expect("stderr not captured despite Stdio::piped");

    let sidecar = Sidecar { child: Some(child) };
    let stdout_reader = BufReader::new(stdout);

    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            eprintln!("[ap stderr] {line}");
        }
    });

    Ok((sidecar, stdout_reader))
}

fn shutdown_sidecar(sidecar: &Arc<Mutex<Sidecar>>) {
    let mut guard = sidecar.lock().unwrap();
    guard.send_sigterm();

    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(10) {
        if !guard.is_running() {
            return;
        }
        drop(guard);
        std::thread::sleep(Duration::from_millis(500));
        guard = sidecar.lock().unwrap();
    }

    if guard.is_running() {
        eprintln!("[desktop] sidecar did not exit after SIGTERM+10s, sending SIGKILL");
        guard.force_kill();
    }
}

fn autostart_path() -> PathBuf {
    let home = env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home)
        .join(".config")
        .join("autostart")
        .join("automation-platform.desktop")
}

fn set_autostart(enabled: bool) {
    let path = autostart_path();
    if enabled {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let executable = env::var("APPIMAGE")
            .ok()
            .map(PathBuf::from)
            .unwrap_or_else(|| env::current_exe().unwrap());
        let escaped = executable
            .to_string_lossy()
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("%", "%%")
            .replace("`", "\\`")
            .replace("$", "\\$");
        let desktop_entry = concat!(
            "[Desktop Entry]\n",
            "Type=Application\n",
            "Name=Automation Platform\n",
            "Exec=automation-platform\n",
            "X-GNOME-Autostart-enabled=true\n",
            "Hidden=false\n"
        );
        let _ = fs::write(
            &path,
            desktop_entry.replace("Exec=automation-platform", &format!("Exec=\"{escaped}\"")),
        );
    } else {
        let _ = fs::remove_file(&path);
    }
}

fn is_autostart_enabled() -> bool {
    autostart_path().exists()
}

fn update_tray_icon(app: &tauri::AppHandle, is_up: bool) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let icon_bytes = if is_up {
            include_bytes!("../icons/tray-green.png").to_vec()
        } else {
            include_bytes!("../icons/tray-red.png").to_vec()
        };
        if let Ok(icon) = tauri::image::Image::from_bytes(&icon_bytes) {
            let _ = tray.set_icon(Some(icon));
        }
    }
}

static IS_QUITTING: AtomicBool = AtomicBool::new(false);

fn main() {
    let sidecar: Arc<Mutex<Sidecar>> = Arc::new(Mutex::new(Sidecar { child: None }));
    let sidecar_for_run = Arc::clone(&sidecar);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let sidecar_for_setup = Arc::clone(&sidecar);

            let open_item = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let autostart_item = CheckMenuItem::with_id(
                app,
                "autostart",
                "Start on Login",
                true,
                is_autostart_enabled(),
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &autostart_item, &quit_item])?;

            let red_icon_bytes = include_bytes!("../icons/tray-red.png").to_vec();
            let red_icon =
                tauri::image::Image::from_bytes(&red_icon_bytes).expect("failed to load tray icon");

            let sidecar_for_tray_quit = Arc::clone(&sidecar);

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(red_icon)
                .tooltip("Automation Platform")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app_handle, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "autostart" => {
                        let current = is_autostart_enabled();
                        let new_state = !current;
                        set_autostart(new_state);
                        let _ = autostart_item.set_checked(new_state);
                    }
                    "quit" => {
                        if IS_QUITTING.swap(true, Ordering::SeqCst) {
                            return;
                        }
                        let sidecar_ref = Arc::clone(&sidecar_for_tray_quit);
                        let app_h = app_handle.clone();
                        std::thread::spawn(move || {
                            shutdown_sidecar(&sidecar_ref);
                            app_h.exit(0);
                        });
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            let main_window = app
                .get_webview_window("main")
                .expect("main window not found");

            let window_for_close = main_window.clone();
            main_window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    if IS_QUITTING.load(Ordering::SeqCst) {
                        return;
                    }
                    api.prevent_close();
                    let _ = window_for_close.hide();
                }
            });

            match spawn_sidecar(&app_handle) {
                Ok((sidecar_instance, stdout_reader)) => {
                    let pid = sidecar_instance.pid();
                    eprintln!("[desktop] sidecar spawned, pid={pid:?}");

                    {
                        let mut guard = sidecar_for_setup.lock().unwrap();
                        *guard = sidecar_instance;
                    }

                    let app_h = app_handle.clone();
                    let url_for_rx: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

                    std::thread::spawn(move || {
                        for line in stdout_reader.lines().flatten() {
                            if let Some(url) = line.strip_prefix("AP_READY ") {
                                let url = url.trim().to_string();
                                eprintln!("[desktop] sidecar ready at {url}");
                                {
                                    let mut guard = url_for_rx.lock().unwrap();
                                    *guard = Some(url.clone());
                                }
                                let url_clone = url;
                                let app_ref = app_h.clone();
                                if let Some(window) = app_ref.get_webview_window("main") {
                                    let _ = window.eval(&format!(
                                        "window.location.href = {}",
                                        serde_json::to_string(&url_clone).unwrap()
                                    ));
                                }
                                update_tray_icon(&app_h, true);
                            }
                        }
                        eprintln!("[desktop] sidecar stdout closed");
                        update_tray_icon(&app_h, false);
                    });
                }
                Err(e) => {
                    eprintln!("[desktop] failed to spawn sidecar: {e}");
                    let _ = main_window.eval(&format!(
                        "document.querySelector('.status').textContent = {}",
                        serde_json::to_string(&e).unwrap()
                    ));
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |_app_handle, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            if IS_QUITTING.load(Ordering::SeqCst) {
                return;
            }
            api.prevent_exit();
            IS_QUITTING.store(true, Ordering::SeqCst);
            let sidecar_ref = Arc::clone(&sidecar_for_run);
            let ah = _app_handle.clone();
            std::thread::spawn(move || {
                shutdown_sidecar(&sidecar_ref);
                ah.exit(0);
            });
        }
        RunEvent::Exit { .. } => {
            shutdown_sidecar(&sidecar_for_run);
        }
        _ => {}
    });
}
