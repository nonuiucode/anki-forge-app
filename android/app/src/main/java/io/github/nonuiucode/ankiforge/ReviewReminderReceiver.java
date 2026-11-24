package io.github.nonuiucode.ankiforge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class ReviewReminderReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }
        String action = intent.getAction();
        if (action == null) {
            return;
        }

        SharedPreferences prefs = ReviewReminderPlugin.getPrefs(context);
        boolean enabled = prefs.getBoolean(ReviewReminderPlugin.KEY_ENABLED, false);

        if (ReviewReminderPlugin.ACTION_DAILY_REMINDER.equals(action)) {
            if (enabled) {
                int dueCount = prefs.getInt(ReviewReminderPlugin.KEY_DUE_COUNT, 0);
                int newCount = prefs.getInt(ReviewReminderPlugin.KEY_NEW_COUNT, 0);
                int leechCount = prefs.getInt(ReviewReminderPlugin.KEY_LEECHE_COUNT, 0);

                String title = "玖记 · 每日复习提醒";
                String body;
                if (dueCount > 0) {
                    body = leechCount > 0
                        ? "今日有 " + dueCount + " 张卡片待复习（含 " + leechCount + " 张卡壳题），点此开始"
                        : "今日有 " + dueCount + " 张卡片待复习，点此开始翻牌";
                } else if (newCount > 0) {
                    body = "今日还可学习 " + newCount + " 张新卡片，点此开始翻牌";
                } else {
                    body = "今日待复习已清空，进来巩固几张保持手感";
                }
                ReviewReminderPlugin.showNotification(
                    context,
                    ReviewReminderPlugin.NOTIF_DAILY,
                    title,
                    body
                );
            }
            ReviewReminderPlugin.rescheduleFromPrefs(context);
            return;
        }

        if (ReviewReminderPlugin.ACTION_SMART_DUE_REMINDER.equals(action)) {
            boolean smartEnabled = prefs.getBoolean(ReviewReminderPlugin.KEY_SMART_DUE_ENABLED, true);
            if (enabled && smartEnabled) {
                String deckName = prefs.getString(ReviewReminderPlugin.KEY_DECK_NAME, "玖记");
                String title = "玖记 · 记忆曲线到期提醒";
                String body = "「" + deckName + "」有卡片进入最佳复习窗口，点此开始复习";
                ReviewReminderPlugin.showNotification(
                    context,
                    ReviewReminderPlugin.NOTIF_SMART,
                    title,
                    body
                );
            }
            prefs.edit().putLong(ReviewReminderPlugin.KEY_NEXT_DUE_AT_MS, 0L).apply();
            return;
        }

        if (
            Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            Intent.ACTION_TIME_CHANGED.equals(action) ||
            Intent.ACTION_TIMEZONE_CHANGED.equals(action) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
        ) {
            ReviewReminderPlugin.rescheduleFromPrefs(context);
        }
    }
}
