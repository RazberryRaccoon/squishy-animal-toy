package com.ratkey.squishyfriends;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * A thin shell: one full-screen WebView running the bundled game, plus a small bridge
 * that gives the page the phone's motion sensors, vibration and save storage.
 */
public class MainActivity extends Activity implements SensorEventListener {
    private WebView web;
    private SensorManager sensors;
    private Sensor linearSensor, gyroSensor, gravitySensor, accelSensor;
    private Vibrator vibrator;
    private SharedPreferences prefs;

    // latest sensor readings (written on the sensor thread, read on the JS bridge thread)
    private volatile float lx, ly, lz, gx, gy, gz, rx, ry = 9.8f, rz;
    private boolean haveLinear, haveGravity;
    private final float[] lowPass = new float[]{0f, 9.8f, 0f};

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        hideSystemUi();

        prefs = getSharedPreferences("squishy", MODE_PRIVATE);
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        sensors = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        linearSensor = sensors.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
        gyroSensor = sensors.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
        gravitySensor = sensors.getDefaultSensor(Sensor.TYPE_GRAVITY);
        accelSensor = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);

        web = new WebView(this);
        web.setBackgroundColor(0xFF1B1433);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "SquishyNative");
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        register(linearSensor);
        register(gyroSensor);
        register(gravitySensor);
        // fall back to the raw accelerometer when the fused sensors are missing
        if (linearSensor == null || gravitySensor == null) register(accelSensor);
    }

    private void register(Sensor s) {
        if (s != null) sensors.registerListener(this, s, SensorManager.SENSOR_DELAY_GAME);
    }

    @Override
    protected void onPause() {
        super.onPause();
        sensors.unregisterListener(this);
        web.onPause();
    }

    @Override
    public void onBackPressed() {
        // let the game handle "back" (close a panel, return to the menu); exit when it declines
        web.evaluateJavascript("(window.__onBack ? window.__onBack() : false)", value -> {
            if (!"true".equals(value)) finish();
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (web != null) web.destroy();
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        float[] v = e.values;
        switch (e.sensor.getType()) {
            case Sensor.TYPE_LINEAR_ACCELERATION:
                haveLinear = true;
                lx = v[0]; ly = v[1]; lz = v[2];
                break;
            case Sensor.TYPE_GYROSCOPE:
                gx = v[0]; gy = v[1]; gz = v[2];
                break;
            case Sensor.TYPE_GRAVITY:
                haveGravity = true;
                rx = v[0]; ry = v[1]; rz = v[2];
                break;
            case Sensor.TYPE_ACCELEROMETER:
                // derive gravity (low-pass) and linear acceleration when the fused sensors are absent
                for (int i = 0; i < 3; i++) lowPass[i] = 0.9f * lowPass[i] + 0.1f * v[i];
                if (!haveGravity) { rx = lowPass[0]; ry = lowPass[1]; rz = lowPass[2]; }
                if (!haveLinear) { lx = v[0] - lowPass[0]; ly = v[1] - lowPass[1]; lz = v[2] - lowPass[2]; }
                break;
            default:
                break;
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    /** Methods callable from the page as window.SquishyNative.* */
    private class Bridge {
        @JavascriptInterface
        public void vibrate(int ms, int amplitude) {
            if (vibrator == null || !vibrator.hasVibrator()) return;
            try {
                if (Build.VERSION.SDK_INT >= 26) {
                    int amp = vibrator.hasAmplitudeControl() ? Math.max(1, Math.min(255, amplitude)) : VibrationEffect.DEFAULT_AMPLITUDE;
                    vibrator.vibrate(VibrationEffect.createOneShot(Math.max(1, ms), amp));
                } else {
                    vibrator.vibrate(ms);
                }
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public String motion() {
            return lx + "," + ly + "," + lz + "," + gx + "," + gy + "," + gz + "," + rx + "," + ry + "," + rz;
        }

        @JavascriptInterface
        public void save(String json) {
            prefs.edit().putString("save", json).apply();
        }

        @JavascriptInterface
        public String load() {
            return prefs.getString("save", "");
        }
    }
}
