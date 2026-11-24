package io.github.nonuiucode.ankiforge;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.Calendar;

@CapacitorPlugin(
    name = "ReviewReminder",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class ReviewReminderPlugin extends Plugin {

    public static final String PREFS_NAME = "jiuji_reminders";
    public static final String KEY_ENABLED = "enabled";
    public static final String KEY_HOUR = "hour";
    public static final String KEY_MINUTE = "minute";
    public static final String KEY_SMART_DUE_ENABLED = "smart_due_enabled";
    public static final String KEY_DUE_COUNT = "due_count";
    public static final String KEY_NEW_COUNT = "new_count";
    public static final String KEY_LEECHE_COUNT = "leech_count";
    public static final String KEY_DECK_NAME = "deck_name";
    public static final String KEY_NEXT_DUE_AT_MS = "next_due_at_ms";

    public static final String CHANNEL_ID = "jiuji_review_reminder";
    public static final String ACTION_DAILY_REMINDER =
        "io.github.nonuiucode.ankiforge.ACTION_DAILY_REMINDER";
    public static final String ACTION_SMART_DUE_REMINDER =
        "io.github.nonuiucode.ankiforge.ACTION_SMART_DUE_REMINDER";

    public static final int REQ_DAILY = 41001;
    public static final int REQ_SMART_DUE = 41002;
    public static final int NOTIF_DAILY = 42001;
    public static final int NOTIF_SMART = 42002;
    public static final int NOTIF_TEST = 42003;

    public static SharedPreferences getPrefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = context.getSystemService(NotificationManager.class);
            if (nm == null) {
                return;
            }
            NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "复习提醒",
                    NotificationManager.IMPORTANCE_DEFAULT
                );
                channel.setDescription("每日定时复习与记忆曲线到期提醒");
                nm.createNotificationChannel(channel);
            }
        }
    }

    public static boolean hasNotificationPermission(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                return false;
            }
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    private static PendingIntent buildReceiverPendingIntent(
        Context context,
        String action,
        int requestCode
    ) {
        Intent intent = new Intent(context, ReviewReminderReceiver.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, requestCode, intent, flags);
    }

    public static long computeNextDailyTriggerMs(int hour, int minute, long nowMs) {
        int clampedH = Math.max(0, Math.min(23, hour));
        int clampedM = Math.max(0, Math.min(59, minute));
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(nowMs);
        cal.set(Calendar.HOUR_OF_DAY, clampedH);
        cal.set(Calendar.MINUTE, clampedM);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= nowMs + 5_000L) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
        }
        return cal.getTimeInMillis();
    }

    private static void scheduleAlarmSafe(AlarmManager am, long triggerAtMs, PendingIntent pi) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
            }
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
            }
        } catch (SecurityException ignored) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
            }
        }
    }

    public static long[] rescheduleFromPrefs(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            return new long[] { 0L, 0L };
        }
        PendingIntent dailyPi = buildReceiverPendingIntent(context, ACTION_DAILY_REMINDER, REQ_DAILY);
        PendingIntent smartPi = buildReceiverPendingIntent(
            context,
            ACTION_SMART_DUE_REMINDER,
            REQ_SMART_DUE
        );
        am.cancel(dailyPi);
        am.cancel(smartPi);

        SharedPreferences prefs = getPrefs(context);
        boolean enabled = prefs.getBoolean(KEY_ENABLED, false);
        if (!enabled) {
            return new long[] { 0L, 0L };
        }

        long nowMs = System.currentTimeMillis();
        int hour = prefs.getInt(KEY_HOUR, 20);
        int minute = prefs.getInt(KEY_MINUTE, 30);
        long nextDailyAtMs = computeNextDailyTriggerMs(hour, minute, nowMs);
        scheduleAlarmSafe(am, nextDailyAtMs, dailyPi);

        long nextSmartAtMs = 0L;
        boolean smartEnabled = prefs.getBoolean(KEY_SMART_DUE_ENABLED, true);
        long storedSmartMs = prefs.getLong(KEY_NEXT_DUE_AT_MS, 0L);
        if (smartEnabled && storedSmartMs > nowMs + 5_000L) {
            scheduleAlarmSafe(am, storedSmartMs, smartPi);
            nextSmartAtMs = storedSmartMs;
        }
        return new long[] { nextDailyAtMs, nextSmartAtMs };
    }

    public static void showNotification(Context context, int notifId, String title, String body) {
        if (!hasNotificationPermission(context)) {
            return;
        }
        ensureChannel(context);
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent tapIntent = PendingIntent.getActivity(context, notifId, launchIntent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_reminder)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(tapIntent);

        try {
            NotificationManagerCompat.from(context).notify(notifId, builder.build());
        } catch (SecurityException ignored) {
            // Ignored if permission was revoked concurrently
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        Context ctx = getContext();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        boolean canExact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am != null) {
            canExact = am.canScheduleExactAlarms();
        }
        JSObject ret = new JSObject();
        ret.put("granted", hasNotificationPermission(ctx));
        ret.put("canExactAlarm", canExact);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        Context ctx = getContext();
        if (hasNotificationPermission(ctx)) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("notifications", call, "notificationPermCallback");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("granted", hasNotificationPermission(ctx));
        call.resolve(ret);
    }

    @PermissionCallback
    private void notificationPermCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasNotificationPermission(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void syncReminders(PluginCall call) {
        Context ctx = getContext();
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        int hour = call.getInt("hour", 20);
        int minute = call.getInt("minute", 30);
        boolean smartDueEnabled = Boolean.TRUE.equals(call.getBoolean("smartDueEnabled", true));
        int dueCount = call.getInt("dueCount", 0);
        int newCount = call.getInt("newCount", 0);
        int leechCount = call.getInt("leechCount", 0);
        String deckName = call.getString("deckName", "玖记");
        Long rawNextDue = call.getLong("nextDueAtMs", 0L);
        long nextDueAtMs = rawNextDue != null ? rawNextDue : 0L;

        getPrefs(ctx)
            .edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putInt(KEY_HOUR, hour)
            .putInt(KEY_MINUTE, minute)
            .putBoolean(KEY_SMART_DUE_ENABLED, smartDueEnabled)
            .putInt(KEY_DUE_COUNT, Math.max(0, dueCount))
            .putInt(KEY_NEW_COUNT, Math.max(0, newCount))
            .putInt(KEY_LEECHE_COUNT, Math.max(0, leechCount))
            .putString(KEY_DECK_NAME, deckName != null ? deckName : "玖记")
            .putLong(KEY_NEXT_DUE_AT_MS, Math.max(0L, nextDueAtMs))
            .apply();

        long[] scheduledTimes = rescheduleFromPrefs(ctx);
        JSObject ret = new JSObject();
        ret.put("scheduled", enabled);
        ret.put("nextDailyAtMs", scheduledTimes[0]);
        ret.put("nextSmartDueAtMs", scheduledTimes[1]);
        call.resolve(ret);
    }

    @PluginMethod
    public void sendTestNotification(PluginCall call) {
        Context ctx = getContext();
        if (!hasNotificationPermission(ctx)) {
            JSObject ret = new JSObject();
            ret.put("sent", false);
            call.resolve(ret);
            return;
        }
        showNotification(
            ctx,
            NOTIF_TEST,
            "玖记 · 复习提醒已就绪",
            "系统通知正常，到点会提醒你回来翻牌复习"
        );
        JSObject ret = new JSObject();
        ret.put("sent", true);
        call.resolve(ret);
    }
}
