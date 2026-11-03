package io.galagogen.fitbuilder;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openSharedText(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openSharedText(intent);
    }

    /**
     * Text shared into the app (Claude's reply to a Fuel meal estimate or menu
     * plan) is handed to the web app the same way the PWA's manifest
     * share_target does it: the page is loaded with ?text=… and
     * health/cutClaude.ts takes it once at boot, then main.ts opens Fuel. The
     * local server serves by path, so the query string reaches only the page.
     */
    private void openSharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return;
        CharSequence extra = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (extra == null || extra.toString().trim().isEmpty()) return;
        String text = extra.toString();
        // Consume it, so a configuration change or relaunch doesn't log the meal twice.
        intent.setAction(Intent.ACTION_MAIN);

        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        String appUrl = bridge.getAppUrl();
        if (webView == null || appUrl == null) return;
        String url = Uri.parse(appUrl).buildUpon().appendQueryParameter("text", text).build().toString();
        webView.post(() -> webView.loadUrl(url));
    }
}
