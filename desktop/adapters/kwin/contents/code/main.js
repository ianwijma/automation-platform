function publish() {
    var windows = workspace.windowList().filter(function (window) { return window.normalWindow; });
    var entries = windows.map(function (window) {
        var rect = window.frameGeometry;
        return { windowId: String(window.internalId), title: window.caption, pid: window.pid, appId: String(window.resourceClass), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    callDBus('org.automationplatform.Desktop', '/org/automationplatform/Windows', 'org.automationplatform.WindowBridge', 'Publish', JSON.stringify(entries));
    callDBus('org.automationplatform.Desktop', '/org/automationplatform/Windows', 'org.automationplatform.WindowBridge', 'TakeFocus', function (id) {
        if (!id) return;
        var target = windows.find(function (window) { return String(window.internalId) === id; });
        if (target) { target.minimized = false; workspace.activeWindow = target; }
    });
}
var timer = new QTimer();
timer.interval = 200;
timer.timeout.connect(publish);
timer.start();
publish();
