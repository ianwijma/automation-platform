import Gio from 'gi://Gio';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
const xml = `<node><interface name="org.automationplatform.Windows">
<method name="ListWindows"><arg type="s" direction="out"/></method>
<method name="Focus"><arg type="s" direction="in"/><arg type="b" direction="out"/></method>
</interface></node>`;
const windows = () => global.get_window_actors().map(actor => actor.meta_window).filter(window => !window.skip_taskbar);
export default class WindowBridge extends Extension {
    enable() {
        this.object = Gio.DBusExportedObject.wrapJSObject(xml, {
            ListWindows() {
                return JSON.stringify(windows().map(window => {
                    const rect = window.get_frame_rect();
                    return { windowId: String(window.get_stable_sequence()), title: window.get_title(), pid: window.get_pid(), appId: window.get_gtk_application_id() || window.get_wm_class(), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }));
            },
            Focus(id) {
                const window = windows().find(window => String(window.get_stable_sequence()) === id);
                if (!window) return false;
                window.activate(global.get_current_time()); return true;
            },
        });
        this.object.export(Gio.DBus.session, '/org/automationplatform/Windows');
    }
    disable() { this.object?.unexport(); this.object = null; }
}
