package ng.com.stockflow.app;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.SharedPreferences;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class SecurePendingStoreInstrumentedTest {
    private static final String ACTOR = "b0d16025-b581-482b-ae11-f4c9515c5171";
    private static final String REQUEST = "d3029014-3d45-4c06-b875-1b8e917cd78f";
    private static final String TENANT = "aaaedeb2-010d-4182-a5b4-61e392efc424";
    private static final String OTHER_REQUEST = "d3029014-3d45-4c06-b875-1b8e917cd780";
    private static final String SLOT = ACTOR + ":stockflow_v2_sale";
    private static final String VALUE = "{\"key\":\"" + REQUEST + "\",\"tenantId\":\"" + TENANT + "\",\"parameters\":{\"note\":\"Synthetic native test receipt\",\"quantity\":2}}";
    private Context context;
    private String name;
    private String alias;
    private SecurePendingStore store;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("Never run synthetic persistence tests in the release application", "ng.com.stockflow.app.preview", context.getPackageName());
        name = "stockflow_pending_test_" + UUID.randomUUID();
        alias = name + "_key";
        store = new SecurePendingStore(context, name, alias);
    }

    @After
    public void tearDown() throws Exception {
        context.getSharedPreferences(name, Context.MODE_PRIVATE).edit().clear().commit();
        KeyStore keystore = KeyStore.getInstance("AndroidKeyStore");
        keystore.load(null);
        if (keystore.containsAlias(alias)) keystore.deleteEntry(alias);
    }

    @Test
    public void businessOperationsSurviveReopeningWithTheirOriginalIdentity() throws Exception {
        for (String operation : new String[]{"submit_return", "decide_return", "receive_order", "confirm_payment", "reverse_payment"}) {
            String slot = ACTOR + ":stockflow_v2_" + operation;
            store.put(slot, VALUE);
            SecurePendingStore reopened = new SecurePendingStore(context, name, alias);
            assertEquals(VALUE, reopened.get(slot));
            assertThrows(Exception.class, () -> reopened.put(slot, VALUE.replace(REQUEST, OTHER_REQUEST)));
            reopened.remove(slot, REQUEST);
            assertNull(new SecurePendingStore(context, name, alias).get(slot));
        }
    }

    @Test
    public void encryptedCommitSurvivesNewStoreAndNeverWritesPlaintext() throws Exception {
        store.put(SLOT, VALUE);
        assertEquals(VALUE, new SecurePendingStore(context, name, alias).get(SLOT));
        String disk = new String(Files.readAllBytes(new File(context.getApplicationInfo().dataDir, "shared_prefs/" + name + ".xml").toPath()), StandardCharsets.UTF_8);
        assertFalse(disk.contains(REQUEST));
        assertFalse(disk.contains("Synthetic native test receipt"));
        assertTrue(context.getSharedPreferences(name, Context.MODE_PRIVATE).getString(SLOT, "").startsWith("1:"));
        KeyStore keystore = KeyStore.getInstance("AndroidKeyStore");
        keystore.load(null);
        assertNull("Keystore key material must not be exportable", keystore.getKey(alias, null).getEncoded());
    }

    @Test
    public void exactRetryAllowedButDifferentUnresolvedIntentCannotOverwrite() throws Exception {
        store.put(SLOT, VALUE);
        store.put(SLOT, VALUE);
        assertThrows(Exception.class, () -> store.put(SLOT, VALUE.replace(REQUEST, OTHER_REQUEST)));
        assertEquals(VALUE, store.get(SLOT));
    }

    @Test
    public void twoConcurrentWritersCannotReplaceEachOther() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger successful = new AtomicInteger();
        Thread first = new Thread(() -> writeWhenStarted(start, successful, VALUE));
        Thread second = new Thread(() -> writeWhenStarted(start, successful, VALUE.replace(REQUEST, OTHER_REQUEST)));
        first.start(); second.start(); start.countDown(); first.join(); second.join();
        assertEquals(1, successful.get());
        assertNotNull(store.get(SLOT));
    }

    private void writeWhenStarted(CountDownLatch start, AtomicInteger successful, String value) {
        try { start.await(); new SecurePendingStore(context, name, alias).put(SLOT, value); successful.incrementAndGet(); }
        catch (Exception expected) { /* One conflicting writer must fail closed. */ }
    }

    @Test
    public void onlyMatchingRequestCanRemoveDurably() throws Exception {
        store.put(SLOT, VALUE);
        assertThrows(Exception.class, () -> store.remove(SLOT, OTHER_REQUEST));
        assertEquals(VALUE, store.get(SLOT));
        store.remove(SLOT, REQUEST);
        assertNull(new SecurePendingStore(context, name, alias).get(SLOT));
        store.remove(SLOT, REQUEST);
    }

    @Test
    public void rejectsUnknownOperationsInvalidJsonAndOversizedInputs() throws Exception {
        assertThrows(Exception.class, () -> store.put("owner:stockflow_v2_sale", VALUE));
        assertThrows(Exception.class, () -> store.put(ACTOR + ":stockflow_v2_refund", VALUE));
        assertThrows(Exception.class, () -> store.put(SLOT, "{'key':'" + REQUEST + "','parameters':{}}"));
        assertThrows(Exception.class, () -> store.put(SLOT, "{\"key\":\"" + REQUEST + "\",\"parameters\":[]}"));
        assertThrows(Exception.class, () -> store.put(SLOT, VALUE + " true"));
        assertThrows(Exception.class, () -> store.put(SLOT, VALUE.replace(TENANT, "invalid-tenant")));
        assertThrows(Exception.class, () -> store.put(SLOT, VALUE.replace(",\"tenantId\":\"" + TENANT + "\"", "")));
        assertThrows(Exception.class, () -> store.put(SLOT, VALUE.replace("{\"key\"", "{\"extra\":true,\"key\"")));
        assertThrows(Exception.class, () -> store.put(SLOT, VALUE.replace("Synthetic native test receipt", "x".repeat(SecurePendingStore.MAX_BYTES))));
        assertNull(store.get(SLOT));
    }

    @Test
    public void ciphertextCannotBeMovedToAnotherActorOrOperation() throws Exception {
        store.put(SLOT, VALUE);
        SharedPreferences prefs = context.getSharedPreferences(name, Context.MODE_PRIVATE);
        String other = ACTOR + ":stockflow_v2_customer";
        assertTrue(prefs.edit().putString(other, prefs.getString(SLOT, null)).commit());
        assertThrows(Exception.class, () -> store.get(other));
        assertThrows(Exception.class, () -> store.put(other, VALUE));
        assertThrows(Exception.class, () -> store.remove(other, REQUEST));
        assertEquals(VALUE, store.get(SLOT));
    }

    @Test
    public void missingKeyDoesNotEraseOrReplaceSurvivingIntents() throws Exception {
        store.put(SLOT, VALUE);
        String ciphertext = context.getSharedPreferences(name, Context.MODE_PRIVATE).getString(SLOT, null);
        KeyStore keystore = KeyStore.getInstance("AndroidKeyStore");
        keystore.load(null); keystore.deleteEntry(alias);
        assertThrows(Exception.class, () -> store.get(SLOT));
        assertThrows(Exception.class, () -> store.put(SLOT, VALUE));
        assertThrows(Exception.class, () -> store.put(ACTOR + ":stockflow_v2_product", VALUE));
        assertEquals(ciphertext, context.getSharedPreferences(name, Context.MODE_PRIVATE).getString(SLOT, null));
    }

    @Test
    public void failedCommitCannotBeAcknowledgedFromSharedPreferencesMemory() throws Exception {
        SecurePendingStore failing = new SecurePendingStore(context, name, alias) {
            @Override protected boolean commit(SharedPreferences.Editor editor) {
                editor.commit(); // Simulates uncertain persistence after memory has already changed.
                return false;
            }
        };
        assertThrows(Exception.class, () -> failing.put(SLOT, VALUE));
        SecurePendingStore retry = new SecurePendingStore(context, name, alias);
        assertThrows(Exception.class, () -> retry.get(SLOT));
        assertThrows(Exception.class, () -> retry.put(SLOT, VALUE));
        assertThrows(Exception.class, () -> retry.remove(SLOT, REQUEST));
    }

    @Test
    public void freshWriteUsesDifferentRandomIv() throws Exception {
        store.put(SLOT, VALUE);
        String first = context.getSharedPreferences(name, Context.MODE_PRIVATE).getString(SLOT, null);
        store.remove(SLOT, REQUEST);
        store.put(SLOT, VALUE);
        String second = context.getSharedPreferences(name, Context.MODE_PRIVATE).getString(SLOT, null);
        assertNotEquals(first, second);
        assertEquals(VALUE, store.get(SLOT));
    }

    @Test
    public void tenantReassignmentCannotReplacePriorTenantIntent() throws Exception {
        store.put(SLOT, VALUE);
        assertThrows(Exception.class, () -> store.put(SLOT, VALUE.replace(TENANT, "bbbedeb2-010d-4182-a5b4-61e392efc424")));
        assertEquals(VALUE, new SecurePendingStore(context, name, alias).get(SLOT));
    }

    @Test
    public void appRegistersPendingPluginInRealCapacitorBridge() {
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            activity.onActivity(main -> assertNotNull(main.getBridge().getPlugin("StockFlowPending")));
        }
    }
}
