package ng.com.stockflow.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/** Capacitor invokes plugin methods on its plugin thread, never the Android UI thread. */
@CapacitorPlugin(name = "StockFlowPending")
public class SecurePendingPlugin extends Plugin {
    private SecurePendingStore store;

    @Override
    public void load() {
        store = new SecurePendingStore(getContext());
    }

    @PluginMethod
    public void get(PluginCall call) {
        try {
            String value = store.get(call.getString("key"));
            JSObject result = new JSObject();
            result.put("value", value == null ? JSONObject.NULL : value);
            call.resolve(result);
        } catch (Exception error) {
            reject(call);
        }
    }

    @PluginMethod
    public void put(PluginCall call) {
        try {
            store.put(call.getString("key"), call.getString("value"));
            call.resolve();
        } catch (Exception error) {
            reject(call);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        try {
            store.remove(call.getString("key"), call.getString("requestId"));
            call.resolve();
        } catch (Exception error) {
            reject(call);
        }
    }

    private void reject(PluginCall call) {
        // Do not log exception messages, transaction values or identifiers.
        call.reject("Secure checkout storage is unavailable. Reopen StockFlow and try again.", "PENDING_STORAGE");
    }
}
