package io.github.nonuiucode.ankiforge;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkgIntentPlugin.class);
        registerPlugin(ReviewReminderPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        ApkgIntentPlugin.handleIncomingIntent(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        ApkgIntentPlugin.handleIncomingIntent(this, intent);
    }
}
