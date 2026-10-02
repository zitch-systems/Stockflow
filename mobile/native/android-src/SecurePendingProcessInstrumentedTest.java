package ng.com.stockflow.app;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import org.junit.Test;
import org.junit.runner.RunWith;

/** These methods run in separate adb instrument invocations with force-stop between them. */
@RunWith(AndroidJUnit4.class)
public class SecurePendingProcessInstrumentedTest {
    private static final String NAME = "stockflow_pending_process_test";
    private static final String ALIAS = "stockflow.pending.process.test";
    private static final String SLOT = "fd181f93-9800-409f-8079-48af3fdb681e:stockflow_v2_sale";
    private static final String REQUEST = "a32ad162-c842-4232-8200-363da06666e0";
    private static final String VALUE = "{\"key\":\"" + REQUEST + "\",\"tenantId\":\"aaaedeb2-010d-4182-a5b4-61e392efc424\",\"parameters\":{\"synthetic\":true,\"quantity\":3}}";

    private Context context() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("ng.com.stockflow.app.preview", context.getPackageName());
        return context;
    }

    @Test
    public void seedBeforeProcessDeath() throws Exception {
        Context context = context();
        // Reset only this synthetic namespace, including any prior corruption fixture.
        context.deleteSharedPreferences(NAME);
        KeyStore keystore = KeyStore.getInstance("AndroidKeyStore");
        keystore.load(null);
        if (keystore.containsAlias(ALIAS)) keystore.deleteEntry(ALIAS);
        new SecurePendingStore(context, NAME, ALIAS).put(SLOT, VALUE);
    }

    @Test
    public void restoreAfterProcessDeath() throws Exception {
        Context context = context();
        SecurePendingStore store = new SecurePendingStore(context, NAME, ALIAS);
        assertEquals(VALUE, store.get(SLOT));
        store.put(SLOT, VALUE); // Original request is replayable, without a new key.
        store.remove(SLOT, REQUEST);
        assertNull(store.get(SLOT));
        KeyStore keystore = KeyStore.getInstance("AndroidKeyStore");
        keystore.load(null); keystore.deleteEntry(ALIAS);
    }

    @Test
    public void corruptBeforeProcessDeath() throws Exception {
        Context context = context();
        File file = new File(context.getApplicationInfo().dataDir, "shared_prefs/" + NAME + ".xml");
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write("<map><string broken".getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
    }

    @Test
    public void rejectCorruptionAfterProcessDeath() throws Exception {
        Context context = context();
        File file = new File(context.getApplicationInfo().dataDir, "shared_prefs/" + NAME + ".xml");
        byte[] before = Files.readAllBytes(file.toPath());
        SecurePendingStore store = new SecurePendingStore(context, NAME, ALIAS);
        assertThrows(Exception.class, () -> store.get(SLOT));
        assertThrows(Exception.class, () -> store.put(SLOT, VALUE));
        assertThrows(Exception.class, () -> store.remove(SLOT, REQUEST));
        assertArrayEquals(before, Files.readAllBytes(file.toPath()));
        KeyStore keystore = KeyStore.getInstance("AndroidKeyStore");
        keystore.load(null); assertTrue(keystore.containsAlias(ALIAS));
    }

    @Test
    public void backupBeforeProcessDeath() throws Exception {
        Context context = context();
        File file = new File(context.getApplicationInfo().dataDir, "shared_prefs/" + NAME + ".xml");
        File backup = new File(file.getPath() + ".bak");
        try (FileOutputStream output = new FileOutputStream(backup)) {
            output.write(Files.readAllBytes(file.toPath()));
            output.getFD().sync();
        }
        corruptBeforeProcessDeath();
    }
}
