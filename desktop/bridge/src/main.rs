use anyhow::{anyhow, bail, Context, Result};
use ashpd::desktop::{
    remote_desktop::{DeviceType, KeyState, RemoteDesktop, SelectDevicesOptions},
    screencast::{CursorMode, Screencast, SelectSourcesOptions, SourceType, Stream},
    PersistMode, Session,
};
use serde_json::{json, Value};
use std::{
    env, fs,
    os::{
        fd::AsRawFd,
        unix::fs::{OpenOptionsExt, PermissionsExt},
    },
    path::PathBuf,
    process::Stdio,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{UnixListener, UnixStream},
    process::Command,
};

#[derive(Clone)]
struct WindowBridge {
    windows: Arc<Mutex<(String, Instant)>>,
    focus: Arc<Mutex<String>>,
}
#[zbus::interface(name = "org.automationplatform.WindowBridge")]
impl WindowBridge {
    fn publish(&self, windows: String) {
        if windows.len() <= 1024 * 1024 && serde_json::from_str::<Value>(&windows).is_ok() {
            *self.windows.lock().unwrap() = (windows, Instant::now());
        }
    }
    fn take_focus(&self) -> String {
        std::mem::take(&mut *self.focus.lock().unwrap())
    }
}
struct Portal {
    remote: RemoteDesktop,
    cast: Screencast,
    session: Session<RemoteDesktop>,
    streams: Vec<Stream>,
}
fn runtime_path() -> Result<PathBuf> {
    Ok(
        PathBuf::from(env::var("XDG_RUNTIME_DIR").context("XDG_RUNTIME_DIR is required")?)
            .join("ap-desktop-bridge.sock"),
    )
}
fn token_path() -> PathBuf {
    PathBuf::from(
        env::var("XDG_STATE_HOME")
            .unwrap_or_else(|_| format!("{}/.local/state", env::var("HOME").unwrap_or_default())),
    )
    .join("automation-platform/portal-token")
}
impl Portal {
    async fn new() -> Result<Self> {
        let remote = RemoteDesktop::new().await?;
        let cast = Screencast::with_connection(remote.connection().clone()).await?;
        let session = remote.create_session(Default::default()).await?;
        let path = token_path();
        let token = fs::read_to_string(&path).ok();
        if token.is_some() {
            fs::remove_file(&path)?;
        }
        let mut options =
            SelectDevicesOptions::default().set_devices(DeviceType::Keyboard | DeviceType::Pointer);
        if remote.version() >= 2 {
            options = options
                .set_persist_mode(PersistMode::ExplicitlyRevoked)
                .set_restore_token(token.as_deref());
        }
        remote.select_devices(&session, options).await?.response()?;
        cast.select_sources(
            &session,
            SelectSourcesOptions::default()
                .set_sources(Some(SourceType::Monitor.into()))
                .set_multiple(true)
                .set_cursor_mode(CursorMode::Hidden),
        )
        .await?
        .response()?;
        let response = remote
            .start(&session, None, Default::default())
            .await?
            .response()?;
        if !response.devices().contains(DeviceType::Pointer)
            || !response.devices().contains(DeviceType::Keyboard)
        {
            bail!("Pointer and keyboard permission were not granted");
        }
        if let Some(token) = response.restore_token() {
            fs::create_dir_all(path.parent().unwrap())?;
            let mut file = fs::OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .mode(0o600)
                .open(&path)?;
            std::io::Write::write_all(&mut file, token.as_bytes())?;
        }
        let streams = response.streams().to_vec();
        if streams.is_empty() {
            bail!("No monitor was shared");
        }
        Ok(Self {
            remote,
            cast,
            session,
            streams,
        })
    }
    fn stream_for(&self, x: f64, y: f64, monitor: Option<usize>) -> Result<&Stream> {
        if let Some(index) = monitor {
            return self
                .streams
                .get(index)
                .context("Shared monitor index is unavailable");
        }
        self.streams
            .iter()
            .find(|s| {
                let (px, py) = s.position().unwrap_or((0, 0));
                let (w, h) = s.size().unwrap_or((0, 0));
                x >= px as f64 && y >= py as f64 && x < (px + w) as f64 && y < (py + h) as f64
            })
            .context("Coordinates are outside the shared monitors; grant the appropriate monitor")
    }
    async fn key(&self, keysym: i32, state: KeyState) -> Result<()> {
        self.remote
            .notify_keyboard_keysym(&self.session, keysym, state, Default::default())
            .await?;
        Ok(())
    }
    async fn perform(&self, request: &Value) -> Result<Value> {
        let op = request["op"].as_str().unwrap_or("");
        let x = request["x"].as_f64().unwrap_or(0.0);
        let y = request["y"].as_f64().unwrap_or(0.0);
        let monitor = request["monitor"].as_u64().map(|n| n as usize);
        match op {
            "move" | "click" => {
                let stream = self.stream_for(x, y, monitor)?;
                let (px, py) = stream.position().unwrap_or((0, 0));
                self.remote
                    .notify_pointer_motion_absolute(
                        &self.session,
                        stream.pipe_wire_node_id(),
                        x - px as f64,
                        y - py as f64,
                        Default::default(),
                    )
                    .await?;
                if op == "click" {
                    let button = match request["button"].as_str().unwrap_or("left") {
                        "left" => 0x110,
                        "right" => 0x111,
                        "middle" => 0x112,
                        _ => bail!("Invalid button"),
                    };
                    let count = request["clickCount"].as_u64().unwrap_or(1);
                    if !(1..=20).contains(&count) {
                        bail!("Invalid click count");
                    }
                    for _ in 0..count {
                        self.remote
                            .notify_pointer_button(
                                &self.session,
                                button,
                                KeyState::Pressed,
                                Default::default(),
                            )
                            .await?;
                        self.remote
                            .notify_pointer_button(
                                &self.session,
                                button,
                                KeyState::Released,
                                Default::default(),
                            )
                            .await?;
                        tokio::time::sleep(Duration::from_millis(100)).await;
                    }
                }
            }
            "type" => {
                let text = request["text"].as_str().context("Text required")?;
                if text.len() > 100_000 {
                    bail!("Text too long");
                }
                for c in text.chars() {
                    let key = match c {
                        '\n' => 0xff0d,
                        '\t' => 0xff09,
                        c if c as u32 <= 0xff => c as i32,
                        c => (0x0100_0000 | c as u32) as i32,
                    };
                    self.key(key, KeyState::Pressed).await?;
                    self.key(key, KeyState::Released).await?;
                    tokio::time::sleep(Duration::from_millis(
                        request["delay"].as_u64().unwrap_or(12).min(1000),
                    ))
                    .await;
                }
            }
            "key" => {
                let keys = request["key"]
                    .as_str()
                    .context("Key required")?
                    .split('+')
                    .map(keysym)
                    .collect::<Result<Vec<_>>>()?;
                for key in &keys {
                    self.key(*key, KeyState::Pressed).await?;
                }
                for key in keys.iter().rev() {
                    self.key(*key, KeyState::Released).await?;
                }
            }
            "capture" => {
                let region = request.get("region").filter(|v| !v.is_null());
                let rx = region.and_then(|v| v["x"].as_f64()).unwrap_or(0.0);
                let ry = region.and_then(|v| v["y"].as_f64()).unwrap_or(0.0);
                let stream = if region.is_some() {
                    self.stream_for(rx, ry, monitor)?
                } else {
                    self.streams
                        .get(monitor.unwrap_or(0))
                        .context("Shared monitor unavailable")?
                };
                let path = request["path"].as_str().context("Output path required")?;
                let fd = self
                    .cast
                    .open_pipe_wire_remote(&self.session, Default::default())
                    .await?;
                let raw = fd.as_raw_fd();
                let mut command = Command::new("gst-launch-1.0");
                command.args([
                    "-q",
                    "pipewiresrc",
                    &format!("fd={raw}"),
                    &format!("path={}", stream.pipe_wire_node_id()),
                    "num-buffers=1",
                    "!",
                    "videoconvert",
                    "!",
                    "pngenc",
                    "!",
                    "filesink",
                    &format!("location={path}"),
                ]);
                // Only this child inherits the PipeWire remote; never expose it over the socket.
                unsafe {
                    command.pre_exec(move || {
                        if libc::fcntl(raw, libc::F_SETFD, 0) == -1 {
                            return Err(std::io::Error::last_os_error());
                        }
                        Ok(())
                    });
                }
                let result = tokio::time::timeout(
                    Duration::from_secs(15),
                    command.kill_on_drop(true).output(),
                )
                .await??;
                if !result.status.success() {
                    bail!(
                        "PipeWire capture failed: {}",
                        String::from_utf8_lossy(&result.stderr)
                    );
                }
                let (w, h) = stream
                    .size()
                    .context("Portal did not supply logical monitor size")?;
                let mut args = vec![path.to_string(), "-resize".into(), format!("{w}x{h}!")];
                if let Some(r) = region {
                    let (px, py) = stream.position().unwrap_or((0, 0));
                    let rw = r["width"].as_f64().context("Region width required")?;
                    let rh = r["height"].as_f64().context("Region height required")?;
                    if rw <= 0.0
                        || rh <= 0.0
                        || rx + rw > (px + w) as f64
                        || ry + rh > (py + h) as f64
                    {
                        bail!("Target spans outside the shared monitor");
                    }
                    args.extend([
                        "-crop".into(),
                        format!(
                            "{}x{}+{}+{}",
                            rw as i32,
                            rh as i32,
                            rx as i32 - px,
                            ry as i32 - py
                        ),
                        "+repage".into(),
                    ]);
                }
                args.push(path.to_string());
                let output = Command::new("convert")
                    .args(args)
                    .kill_on_drop(true)
                    .output()
                    .await?;
                if !output.status.success() {
                    bail!(
                        "Image scaling/crop failed: {}",
                        String::from_utf8_lossy(&output.stderr)
                    );
                }
            }
            _ => bail!("Unsupported operation"),
        }
        Ok(json!({"success": true}))
    }
}
fn keysym(key: &str) -> Result<i32> {
    Ok(match key.to_ascii_lowercase().as_str() {
        "ctrl" | "control" => 0xffe3,
        "alt" => 0xffe9,
        "shift" => 0xffe1,
        "super" | "meta" => 0xffeb,
        "return" | "enter" => 0xff0d,
        "escape" | "esc" => 0xff1b,
        "tab" => 0xff09,
        "backspace" => 0xff08,
        "delete" => 0xffff,
        "left" => 0xff51,
        "up" => 0xff52,
        "right" => 0xff53,
        "down" => 0xff54,
        "home" => 0xff50,
        "end" => 0xff57,
        "space" => 32,
        value
            if value.starts_with('f')
                && value[1..]
                    .parse::<i32>()
                    .is_ok_and(|n| (1..=12).contains(&n)) =>
        {
            0xffbd + value[1..].parse::<i32>()?
        }
        _ if key.chars().count() == 1 => key.chars().next().unwrap() as i32,
        _ => bail!("Unsupported key: {key}"),
    })
}
async fn window_action(
    connection: &zbus::Connection,
    bridge: &WindowBridge,
    request: &Value,
) -> Result<Value> {
    let op = request["op"].as_str().unwrap_or("");
    if env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_lowercase()
        .contains("kde")
    {
        if bridge.windows.lock().unwrap().1.elapsed() > Duration::from_secs(3) {
            bail!("Enable the Automation Platform KWin script");
        }
        if op == "windows" {
            return Ok(
                json!({"windows": serde_json::from_str::<Value>(&bridge.windows.lock().unwrap().0)?}),
            );
        }
        let id = request["windowId"]
            .as_str()
            .context("Window ID required")?
            .to_string();
        *bridge.focus.lock().unwrap() = id;
        tokio::time::sleep(Duration::from_millis(300)).await;
        if !bridge.focus.lock().unwrap().is_empty() {
            bail!("KWin did not acknowledge focus request");
        }
    } else {
        let proxy = zbus::Proxy::new(
            connection,
            "org.gnome.Shell",
            "/org/automationplatform/Windows",
            "org.automationplatform.Windows",
        )
        .await?;
        if op == "windows" {
            let windows: String = proxy
                .call("ListWindows", &())
                .await
                .context("Enable the Automation Platform GNOME Shell extension")?;
            return Ok(json!({"windows": serde_json::from_str::<Value>(&windows)?}));
        }
        let focused: bool = proxy
            .call(
                "Focus",
                &(request["windowId"].as_str().context("Window ID required")?,),
            )
            .await?;
        if !focused {
            bail!("Window no longer exists");
        }
    }
    Ok(json!({"success":true}))
}
async fn daemon() -> Result<()> {
    let path = runtime_path()?;
    let lock = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .mode(0o600)
        .open(path.with_extension("lock"))?;
    if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        bail!("Bridge already running");
    }
    if path.exists() {
        fs::remove_file(&path)?;
    }
    let listener = UnixListener::bind(&path)?;
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    let bridge = WindowBridge {
        windows: Arc::new(Mutex::new((
            "[]".into(),
            Instant::now() - Duration::from_secs(10),
        ))),
        focus: Arc::new(Mutex::new(String::new())),
    };
    let connection = zbus::connection::Builder::session()?
        .name("org.automationplatform.Desktop")?
        .serve_at("/org/automationplatform/Windows", bridge.clone())?
        .build()
        .await?;
    let mut portal: Option<Portal> = None;
    loop {
        let (client, _) =
            match tokio::time::timeout(Duration::from_secs(300), listener.accept()).await {
                Ok(result) => result?,
                Err(_) => {
                    if let Some(session) = portal.take() {
                        let _ = session.session.close().await;
                    }
                    let _ = fs::remove_file(&path);
                    return Ok(());
                }
            };
        if client.peer_cred()?.uid() != unsafe { libc::geteuid() } {
            continue;
        }
        let (read, mut write) = client.into_split();
        let mut reader = BufReader::new(read.take(1024 * 1024));
        let mut line = String::new();
        if tokio::time::timeout(Duration::from_secs(5), reader.read_line(&mut line))
            .await
            .is_err()
        {
            continue;
        }
        let response: Result<Value> = async {
            let request: Value = serde_json::from_str(&line)?;
            let op = request["op"].as_str().unwrap_or("");
            if op == "status" { let remote = RemoteDesktop::new().await?; let devices = remote.available_device_types().await?; return Ok(json!({"portal": devices.contains(DeviceType::Pointer) && devices.contains(DeviceType::Keyboard), "permissionGranted": portal.is_some()})); }
            if op == "release" { if let Some(session) = portal.take() { session.session.close().await?; } return Ok(json!({"success":true})); }
            if op == "windows" || op == "focus" { return window_action(&connection, &bridge, &request).await; }
            let mut closed = [0u8; 1];
            tokio::select! {
                result = async {
                    if portal.is_none() { portal = Some(tokio::time::timeout(Duration::from_secs(120), Portal::new()).await??); }
                    portal.as_ref().unwrap().perform(&request).await
                } => result,
                _ = reader.read(&mut closed) => Err(anyhow!("Request cancelled")),
            }
        }.await;
        let response = match response {
            Ok(value) => value,
            Err(error) => {
                if let Some(session) = portal.take() {
                    let _ = session.session.close().await;
                }
                json!({"error":error.to_string()})
            }
        };
        let _ = write.write_all(format!("{response}\n").as_bytes()).await;
    }
}
#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    if args.get(1).map(String::as_str) == Some("daemon") {
        return daemon().await;
    }
    let request = args
        .get(2)
        .context("Usage: ap-desktop-bridge request '<JSON>' | daemon")?;
    let path = runtime_path()?;
    let mut client = match UnixStream::connect(&path).await {
        Ok(client) => client,
        Err(_) => {
            Command::new(env::current_exe()?)
                .arg("daemon")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()?;
            let mut result = None;
            for _ in 0..30 {
                tokio::time::sleep(Duration::from_millis(100)).await;
                if let Ok(client) = UnixStream::connect(&path).await {
                    result = Some(client);
                    break;
                }
            }
            result.context(
                "Desktop bridge failed to start; run ap-desktop-bridge daemon for diagnostics",
            )?
        }
    };
    client.write_all(format!("{request}\n").as_bytes()).await?;
    let mut response = String::new();
    BufReader::new(client).read_line(&mut response).await?;
    let value: Value = serde_json::from_str(&response)?;
    if let Some(error) = value["error"].as_str() {
        bail!("{error}");
    }
    println!("{value}");
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chords() {
        assert_eq!(keysym("ctrl").unwrap(), 0xffe3);
        assert_eq!(keysym("F12").unwrap(), 0xffc9);
        assert!(keysym("malformed").is_err());
    }
}
