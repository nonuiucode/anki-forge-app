package io.github.nonuiucode.ankiforge;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.util.Locale;

@CapacitorPlugin(name = "ApkgIntent")
public class ApkgIntentPlugin extends Plugin {

    private static final int MAX_FILE_BYTES = 64 * 1024 * 1024;
    private static final Object LOCK = new Object();
    private static PendingFile pendingFile = null;
    private static WeakReference<ApkgIntentPlugin> activeRef = null;

    private static final class PendingFile {
        final String filename;
        final String dataBase64;

        PendingFile(String filename, String dataBase64) {
            this.filename = filename;
            this.dataBase64 = dataBase64;
        }
    }

    @Override
    public void load() {
        super.load();
        synchronized (LOCK) {
            activeRef = new WeakReference<>(this);
        }
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (LOCK) {
            if (activeRef != null && activeRef.get() == this) {
                activeRef = null;
            }
        }
        super.handleOnDestroy();
    }

    public static void handleIncomingIntent(Context context, Intent intent) {
        if (intent == null || context == null) {
            return;
        }
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                uri = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
            } else {
                uri = readLegacyStreamExtra(intent);
            }
        }
        if (uri == null) {
            return;
        }

        PendingFile loaded = readUriPayload(context, uri);
        if (loaded == null) {
            return;
        }

        ApkgIntentPlugin instance;
        synchronized (LOCK) {
            instance = activeRef != null ? activeRef.get() : null;
            if (instance != null && instance.hasListeners("fileOpened")) {
                pendingFile = null;
            } else {
                pendingFile = loaded;
                instance = null;
            }
        }

        if (instance != null) {
            JSObject payload = new JSObject();
            payload.put("filename", loaded.filename);
            payload.put("dataBase64", loaded.dataBase64);
            instance.notifyListeners("fileOpened", payload);
        }
    }

    @SuppressWarnings("deprecation")
    private static Uri readLegacyStreamExtra(Intent intent) {
        return intent.getParcelableExtra(Intent.EXTRA_STREAM);
    }

    private static PendingFile readUriPayload(Context context, Uri uri) {
        ContentResolver resolver = context.getContentResolver();
        String filename = resolveDisplayName(resolver, uri);
        try (InputStream is = resolver.openInputStream(uri)) {
            if (is == null) {
                return null;
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int total = 0;
            int read;
            while ((read = is.read(buf)) != -1) {
                total += read;
                if (total > MAX_FILE_BYTES) {
                    return null;
                }
                baos.write(buf, 0, read);
            }
            byte[] raw = baos.toByteArray();
            if (raw.length == 0) {
                return null;
            }
            String lower = filename.toLowerCase(Locale.ROOT);
            boolean isZip = raw.length >= 4 && raw[0] == 0x50 && raw[1] == 0x4B && raw[2] == 0x03 && raw[3] == 0x04;
            if (!lower.endsWith(".apkg") && !lower.endsWith(".json") && isZip) {
                filename = filename + ".apkg";
            }
            String base64 = Base64.encodeToString(raw, Base64.NO_WRAP);
            return new PendingFile(filename, base64);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String resolveDisplayName(ContentResolver resolver, Uri uri) {
        if ("content".equalsIgnoreCase(uri.getScheme())) {
            try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (idx >= 0) {
                        String name = cursor.getString(idx);
                        if (name != null && !name.trim().isEmpty()) {
                            return name.trim();
                        }
                    }
                }
            } catch (Exception ignored) {
                // Fall back to URI path segment
            }
        }
        String seg = uri.getLastPathSegment();
        if (seg != null && !seg.trim().isEmpty()) {
            return new File(seg).getName();
        }
        return "imported.apkg";
    }

    @PluginMethod
    public void getPendingFile(PluginCall call) {
        PendingFile current;
        synchronized (LOCK) {
            current = pendingFile;
            pendingFile = null;
        }
        JSObject ret = new JSObject();
        if (current == null) {
            ret.put("hasFile", false);
        } else {
            ret.put("hasFile", true);
            ret.put("filename", current.filename);
            ret.put("dataBase64", current.dataBase64);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String rawName = call.getString("filename", "export.dat");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String dataBase64 = call.getString("dataBase64", "");
        if (dataBase64 == null || dataBase64.isEmpty()) {
            call.reject("dataBase64 is required");
            return;
        }

        String safeName = new File(rawName != null ? rawName : "export.dat").getName().replaceAll("[^\\w.\\-\\u4e00-\\u9fff]", "_");
        if (safeName.isEmpty()) {
            safeName = "export.dat";
        }

        try {
            byte[] decoded = Base64.decode(dataBase64, Base64.DEFAULT);
            File exportsDir = new File(getContext().getCacheDir(), "exports");
            if (!exportsDir.exists() && !exportsDir.mkdirs()) {
                call.reject("Failed to create cache exports directory");
                return;
            }
            File outFile = new File(exportsDir, safeName);
            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                fos.write(decoded);
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                outFile
            );
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType);
            shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, safeName);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(shareIntent, safeName);
            getActivity().startActivity(chooser);

            JSObject ret = new JSObject();
            ret.put("shared", true);
            call.resolve(ret);
        } catch (Exception exc) {
            call.reject("Failed to share file: " + exc.getMessage());
        }
    }
}
