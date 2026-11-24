package io.github.nonuiucode.ankiforge;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final int MAX_REDIRECTS = 5;
    private static final int MAX_MANIFEST_BYTES = 512 * 1024;
    private static final String USER_AGENT = "Jiuji-AnkiForge/1.3";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean downloading = new AtomicBoolean(false);
    private volatile File pendingApkFile = null;

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            PackageInfo info = getPackageInfo(getContext());
            String versionName = info.versionName != null ? info.versionName : "1.3.0";
            long versionCode = PackageInfoCompat.getLongVersionCode(info);
            JSObject ret = new JSObject();
            ret.put("versionName", versionName);
            ret.put("versionCode", versionCode);
            call.resolve(ret);
        } catch (Exception exc) {
            call.reject("读取当前版本失败: " + exc.getMessage());
        }
    }

    @PluginMethod
    public void fetchUpdateManifest(PluginCall call) {
        JSArray urlsArray = call.getArray("urls");
        List<String> urls = toHttpsUrlList(urlsArray);
        if (urls.isEmpty()) {
            call.reject("缺少有效的更新清单地址");
            return;
        }

        executor.execute(() -> {
            String lastError = "所有节点均超时或不可达";
            for (String rawUrl : urls) {
                HttpURLConnection conn = null;
                try {
                    conn = openWithRedirects(rawUrl, 6000, 8000, "application/json, text/plain, */*");
                    int status = conn.getResponseCode();
                    if (status != HttpURLConnection.HTTP_OK) {
                        lastError = hostOf(rawUrl) + " HTTP " + status;
                        continue;
                    }
                    String body = readSmallText(conn.getInputStream(), MAX_MANIFEST_BYTES);
                    JSONObject parsed = new JSONObject(body);
                    if (!parsed.has("version") || !parsed.has("downloadUrls")) {
                        lastError = hostOf(rawUrl) + " 返回结构不匹配";
                        continue;
                    }
                    JSObject ret = new JSObject();
                    ret.put("json", body);
                    ret.put("sourceUrl", conn.getURL().toString());
                    call.resolve(ret);
                    return;
                } catch (Exception exc) {
                    lastError = hostOf(rawUrl) + ": " + safeMsg(exc);
                } finally {
                    if (conn != null) {
                        conn.disconnect();
                    }
                }
            }
            call.reject("无法连接更新节点（" + lastError + "）");
        });
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        JSArray urlsArray = call.getArray("urls");
        List<String> urls = toHttpsUrlList(urlsArray);
        if (urls.isEmpty()) {
            call.reject("缺少有效的 APK 下载地址");
            return;
        }
        String rawFilename = call.getString("filename", "Jiuji-AnkiForge-update.apk");
        String expectedSha = call.getString("expectedSha256", "");
        String normalizedSha = expectedSha != null ? expectedSha.trim().toLowerCase(Locale.ROOT) : "";
        Long expectedSizeObj = call.getLong("expectedSize");
        long expectedSize = expectedSizeObj != null ? expectedSizeObj : -1L;

        if (!downloading.compareAndSet(false, true)) {
            call.reject("正在下载更新，请稍候");
            return;
        }

        String cleanName = new File(rawFilename != null ? rawFilename : "Jiuji-AnkiForge-update.apk")
            .getName()
            .replaceAll("[^\\w.\\-]", "_");
        if (!cleanName.endsWith(".apk")) {
            cleanName = cleanName + ".apk";
        }
        final String targetFilename = cleanName;

        executor.execute(() -> {
            try {
                File updatesDir = new File(getContext().getCacheDir(), "updates");
                if (!updatesDir.exists() && !updatesDir.mkdirs()) {
                    call.reject("无法创建安装包缓存目录");
                    return;
                }
                cleanOldApks(updatesDir, null);

                File tmpFile = new File(updatesDir, targetFilename + ".tmp");
                File outFile = new File(updatesDir, targetFilename);
                String lastError = "所有下载镜像均不可用";
                int totalMirrors = urls.size();

                for (int idx = 0; idx < totalMirrors; idx += 1) {
                    String mirrorUrl = urls.get(idx);
                    String host = hostOf(mirrorUrl);
                    HttpURLConnection conn = null;
                    if (tmpFile.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        tmpFile.delete();
                    }
                    try {
                        conn = openWithRedirects(mirrorUrl, 8000, 20000, "*/*");
                        int status = conn.getResponseCode();
                        if (status != HttpURLConnection.HTTP_OK) {
                            lastError = host + " HTTP " + status;
                            continue;
                        }
                        long contentLength = conn.getContentLengthLong();
                        long totalBytes = contentLength > 0 ? contentLength : expectedSize;

                        MessageDigest digest = MessageDigest.getInstance("SHA-256");
                        try (
                            InputStream rawIn = new BufferedInputStream(conn.getInputStream());
                            FileOutputStream fos = new FileOutputStream(tmpFile)
                        ) {
                            byte[] firstFour = new byte[4];
                            int headRead = readFullyUpTo(rawIn, firstFour);
                            if (
                                headRead < 4 ||
                                firstFour[0] != 0x50 ||
                                firstFour[1] != 0x4B ||
                                firstFour[2] != 0x03 ||
                                firstFour[3] != 0x04
                            ) {
                                lastError = host + " 返回的不是有效 APK 文件";
                                continue;
                            }

                            fos.write(firstFour, 0, headRead);
                            digest.update(firstFour, 0, headRead);
                            long downloaded = headRead;
                            long lastNotifyAt = 0L;
                            emitProgress(downloaded, totalBytes, idx + 1, totalMirrors, host);

                            byte[] buf = new byte[16384];
                            int read;
                            while ((read = rawIn.read(buf)) != -1) {
                                fos.write(buf, 0, read);
                                digest.update(buf, 0, read);
                                downloaded += read;

                                long now = SystemClock.elapsedRealtime();
                                if (now - lastNotifyAt >= 150) {
                                    lastNotifyAt = now;
                                    emitProgress(downloaded, totalBytes, idx + 1, totalMirrors, host);
                                }
                            }
                            fos.flush();
                            emitProgress(downloaded, totalBytes > 0 ? totalBytes : downloaded, idx + 1, totalMirrors, host);
                        }

                        String actualSha = bytesToHex(digest.digest());
                        if (!normalizedSha.isEmpty() && !normalizedSha.equals(actualSha)) {
                            //noinspection ResultOfMethodCallIgnored
                            tmpFile.delete();
                            lastError = host + " 安装包 SHA-256 校验失败";
                            continue;
                        }

                        if (outFile.exists()) {
                            //noinspection ResultOfMethodCallIgnored
                            outFile.delete();
                        }
                        if (!tmpFile.renameTo(outFile)) {
                            lastError = "保存安装包文件失败";
                            continue;
                        }
                        cleanOldApks(updatesDir, outFile);
                        pendingApkFile = outFile;

                        String installStatus = launchInstaller(outFile);
                        JSObject ret = new JSObject();
                        ret.put("status", installStatus);
                        ret.put("sourceUrl", mirrorUrl);
                        call.resolve(ret);
                        return;
                    } catch (Exception exc) {
                        if (tmpFile.exists()) {
                            //noinspection ResultOfMethodCallIgnored
                            tmpFile.delete();
                        }
                        lastError = host + ": " + safeMsg(exc);
                    } finally {
                        if (conn != null) {
                            conn.disconnect();
                        }
                    }
                }
                call.reject("下载更新失败（" + lastError + "）");
            } finally {
                downloading.set(false);
            }
        });
    }

    @PluginMethod
    public void installPendingApk(PluginCall call) {
        File target = pendingApkFile;
        if (target == null || !target.exists()) {
            File updatesDir = new File(getContext().getCacheDir(), "updates");
            File[] files = updatesDir.listFiles((dir, name) -> name.endsWith(".apk"));
            if (files != null && files.length > 0) {
                target = files[0];
            }
        }
        if (target == null || !target.exists()) {
            JSObject ret = new JSObject();
            ret.put("status", "missing");
            call.resolve(ret);
            return;
        }
        try {
            String status = launchInstaller(target);
            JSObject ret = new JSObject();
            ret.put("status", status);
            call.resolve(ret);
        } catch (Exception exc) {
            call.reject("调起安装界面失败: " + exc.getMessage());
        }
    }

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String rawUrl = call.getString("url", "");
        if (rawUrl == null || !rawUrl.trim().toLowerCase(Locale.ROOT).startsWith("https://")) {
            call.reject("仅支持打开 HTTPS 链接");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(rawUrl.trim()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception exc) {
            call.reject("打开浏览器失败: " + exc.getMessage());
        }
    }

    private String launchInstaller(File apkFile) {
        Context ctx = getContext();
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !ctx.getPackageManager().canRequestPackageInstalls()
        ) {
            Intent permIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + ctx.getPackageName())
            );
            permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(permIntent);
            return "needs_install_permission";
        }

        Uri apkUri = FileProvider.getUriForFile(
            ctx,
            ctx.getPackageName() + ".fileprovider",
            apkFile
        );
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        ctx.startActivity(installIntent);
        return "installing";
    }

    private void emitProgress(
        long downloadedBytes,
        long totalBytes,
        int mirrorIndex,
        int mirrorCount,
        String host
    ) {
        int percent = 0;
        if (totalBytes > 0) {
            percent = (int) Math.min(100L, Math.max(0L, (downloadedBytes * 100L) / totalBytes));
        }
        JSObject data = new JSObject();
        data.put("percent", percent);
        data.put("downloadedBytes", downloadedBytes);
        data.put("totalBytes", Math.max(0L, totalBytes));
        data.put("mirrorIndex", mirrorIndex);
        data.put("mirrorCount", mirrorCount);
        data.put("host", host);
        notifyListeners("updateDownloadProgress", data);
    }

    private static HttpURLConnection openWithRedirects(
        String rawUrl,
        int connectMs,
        int readMs,
        String acceptHeader
    ) throws IOException {
        URI currentUri = URI.create(rawUrl);
        for (int hops = 0; hops <= MAX_REDIRECTS; hops += 1) {
            if (!"https".equalsIgnoreCase(currentUri.getScheme())) {
                throw new IOException("非 HTTPS 协议被拒绝");
            }
            URL url = currentUri.toURL();
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(connectMs);
            conn.setReadTimeout(readMs);
            conn.setRequestProperty("User-Agent", USER_AGENT);
            conn.setRequestProperty("Accept", acceptHeader);
            conn.setRequestProperty("Cache-Control", "no-cache");

            int code = conn.getResponseCode();
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null || location.trim().isEmpty()) {
                    throw new IOException("重定向缺少 Location");
                }
                currentUri = currentUri.resolve(location.trim());
                continue;
            }
            return conn;
        }
        throw new IOException("重定向次数过多");
    }

    private static List<String> toHttpsUrlList(JSArray array) {
        List<String> out = new ArrayList<>();
        if (array == null) {
            return out;
        }
        for (int i = 0; i < array.length(); i += 1) {
            String raw = array.optString(i, "").trim();
            if (raw.toLowerCase(Locale.ROOT).startsWith("https://")) {
                out.add(raw);
            }
        }
        return out;
    }

    private static String readSmallText(InputStream in, int maxBytes) throws IOException {
        try (InputStream stream = in) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int total = 0;
            int read;
            while ((read = stream.read(buf)) != -1) {
                total += read;
                if (total > maxBytes) {
                    throw new IOException("响应体积过大");
                }
                baos.write(buf, 0, read);
            }
            return new String(baos.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static int readFullyUpTo(InputStream in, byte[] dst) throws IOException {
        int off = 0;
        while (off < dst.length) {
            int n = in.read(dst, off, dst.length - off);
            if (n == -1) {
                break;
            }
            off += n;
        }
        return off;
    }

    private static void cleanOldApks(File dir, File keep) {
        File[] files = dir.listFiles();
        if (files == null) {
            return;
        }
        for (File f : files) {
            if (keep != null && f.equals(keep)) {
                continue;
            }
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format(Locale.ROOT, "%02x", b));
        }
        return sb.toString();
    }

    private static String hostOf(String rawUrl) {
        try {
            String h = URI.create(rawUrl).getHost();
            return h != null ? h : rawUrl;
        } catch (Exception ignored) {
            return rawUrl;
        }
    }

    private static String safeMsg(Exception exc) {
        String msg = exc.getMessage();
        return msg != null && !msg.trim().isEmpty() ? msg : exc.getClass().getSimpleName();
    }

    private static PackageInfo getPackageInfo(Context context)
        throws PackageManager.NameNotFoundException {
        PackageManager pm = context.getPackageManager();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return pm.getPackageInfo(
                context.getPackageName(),
                PackageManager.PackageInfoFlags.of(0)
            );
        }
        return getLegacyPackageInfo(pm, context.getPackageName());
    }

    @SuppressWarnings("deprecation")
    private static PackageInfo getLegacyPackageInfo(PackageManager pm, String pkgName)
        throws PackageManager.NameNotFoundException {
        return pm.getPackageInfo(pkgName, 0);
    }
}
