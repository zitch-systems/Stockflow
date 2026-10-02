package ng.com.stockflow.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.JsonReader;
import android.util.JsonToken;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Durable unresolved transaction intent; never stores authentication credentials. */
public class SecurePendingStore {
    static final int MAX_BYTES = 256 * 1024;
    static final String PREFERENCES = "stockflow_pending_v1";
    private static final String ALIAS = "stockflow.pending.aes.v1";
    private static final String UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
    private static final Pattern UUID = Pattern.compile("^" + UUID_PATTERN + "$");
    private static final Pattern SLOT = Pattern.compile("^" + UUID_PATTERN + ":stockflow_v2_(sale|product|customer|adjust_stock|import_products)$");
    private static final Object LOCK = new Object();
    // SharedPreferences updates memory before reporting a failed disk commit.
    // Do not acknowledge a subsequent read/retry from that uncommitted memory.
    private static final Set<String> FAILED_COMMITS = new HashSet<>();
    private final SharedPreferences preferences;
    private final String preferenceName;
    private final String alias;
    private final String packageName;

    public SecurePendingStore(Context context) {
        this(context, PREFERENCES, ALIAS);
    }

    // Separate namespaces allow instrumented tests to exercise real Android storage safely.
    SecurePendingStore(Context context, String preferenceName, String alias) {
        Context app = context.getApplicationContext();
        this.preferences = app.getSharedPreferences(preferenceName, Context.MODE_PRIVATE);
        this.preferenceName = preferenceName;
        this.alias = alias;
        this.packageName = app.getPackageName();
    }

    public String get(String slot) throws Exception {
        synchronized (LOCK) {
            validateSlot(slot);
            requireHealthyStorage();
            String stored = preferences.getString(slot, null);
            if (stored == null) return null;
            return decrypt(slot, stored);
        }
    }

    public void put(String slot, String value) throws Exception {
        synchronized (LOCK) {
            validateSlot(slot);
            validateIntent(value);
            requireHealthyStorage();
            String stored = preferences.getString(slot, null);
            if (stored != null) {
                if (!decrypt(slot, stored).equals(value)) throw unavailable();
                return;
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(true));
            cipher.updateAAD(aad(slot));
            byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] iv = cipher.getIV();
            if (iv.length != 12) throw unavailable();
            String encrypted = "1:" + Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ciphertext, Base64.NO_WRAP);
            durableCommit(preferences.edit().putString(slot, encrypted));
        }
    }

    public void remove(String slot, String requestId) throws Exception {
        synchronized (LOCK) {
            validateSlot(slot);
            if (requestId == null || !UUID.matcher(requestId).matches()) throw unavailable();
            requireHealthyStorage();
            String stored = preferences.getString(slot, null);
            if (stored == null) return;
            JSONObject intent = validateIntent(decrypt(slot, stored));
            if (!requestId.equals(intent.getString("key"))) throw unavailable();
            durableCommit(preferences.edit().remove(slot));
        }
    }

    private String decrypt(String slot, String stored) throws Exception {
        if (stored.length() > MAX_BYTES * 2) throw unavailable();
        String[] parts = stored.split(":", -1);
        if (parts.length != 3 || !parts[0].equals("1")) throw unavailable();
        byte[] iv = Base64.decode(parts[1], Base64.NO_WRAP);
        byte[] encrypted = Base64.decode(parts[2], Base64.NO_WRAP);
        if (iv.length != 12 || encrypted.length < 16 || encrypted.length > MAX_BYTES + 16) throw unavailable();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
        cipher.updateAAD(aad(slot));
        String value = new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        validateIntent(value);
        return value;
    }

    private SecretKey key(boolean mayCreate) throws Exception {
        KeyStore keystore = KeyStore.getInstance("AndroidKeyStore");
        keystore.load(null);
        if (keystore.containsAlias(alias)) {
            java.security.Key existing = keystore.getKey(alias, null);
            if (!(existing instanceof SecretKey)) throw unavailable();
            return (SecretKey) existing;
        }
        // A missing key with surviving ciphertext is a recovery failure, never a fresh store.
        if (!mayCreate || !preferences.getAll().isEmpty()) throw unavailable();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private byte[] aad(String slot) {
        return (packageName + "|stockflow-pending-v1|" + slot).getBytes(StandardCharsets.UTF_8);
    }

    private static void validateSlot(String slot) throws Exception {
        if (slot == null || !SLOT.matcher(slot).matches()) throw unavailable();
    }

    private static JSONObject validateIntent(String value) throws Exception {
        if (value == null || value.length() > MAX_BYTES || value.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) throw unavailable();
        // JSONObject accepts some non-JSON syntax. JsonReader first enforces strict JSON.
        try (JsonReader reader = new JsonReader(new StringReader(value))) {
            reader.setLenient(false);
            if (reader.peek() != JsonToken.BEGIN_OBJECT) throw unavailable();
            reader.skipValue();
            if (reader.peek() != JsonToken.END_DOCUMENT) throw unavailable();
        }
        JSONObject intent = new JSONObject(value);
        Object requestId = intent.opt("key");
        Object tenantId = intent.opt("tenantId");
        if (intent.length() != 3 || !(requestId instanceof String) || !UUID.matcher((String) requestId).matches()
            || !(tenantId instanceof String) || !UUID.matcher((String) tenantId).matches()
            || !(intent.opt("parameters") instanceof JSONObject)) throw unavailable();
        return intent;
    }

    private void requireHealthyStorage() throws Exception {
        if (FAILED_COMMITS.contains(preferenceName)) throw unavailable();
    }

    protected boolean commit(SharedPreferences.Editor editor) {
        return editor.commit();
    }

    private void durableCommit(SharedPreferences.Editor editor) throws Exception {
        try {
            if (commit(editor)) return;
        } catch (RuntimeException error) {
            FAILED_COMMITS.add(preferenceName);
            throw unavailable();
        }
        FAILED_COMMITS.add(preferenceName);
        throw unavailable();
    }

    private static Exception unavailable() {
        return new Exception("Pending operation storage unavailable");
    }
}
