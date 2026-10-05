package ng.com.stockflow.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** App-owned native plugins are registered before BridgeActivity creates the bridge. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecurePendingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
