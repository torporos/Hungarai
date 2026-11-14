package com.torporos.hungarai;

import android.app.Activity;
import android.content.Intent;
import android.speech.tts.TextToSpeech;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "HungarianTts")
public class HungarianTtsPlugin extends Plugin {
    private boolean installerLaunchRequested;

    @PluginMethod
    public void ensureHungarianData(PluginCall call) {
        final TextToSpeech[] engine = new TextToSpeech[1];
        try {
            engine[0] = new TextToSpeech(getContext(), status -> {
                TextToSpeech tts = engine[0];
                if (tts == null) {
                    call.reject("Android text-to-speech did not initialize.");
                    return;
                }

                if (status != TextToSpeech.SUCCESS) {
                    tts.shutdown();
                    call.reject("Android text-to-speech did not initialize.");
                    return;
                }

                boolean isAvailable = tts.isLanguageAvailable(new Locale("hu", "HU"))
                    >= TextToSpeech.LANG_AVAILABLE;
                tts.shutdown();

                if (isAvailable) {
                    resolve(call, true, false);
                    return;
                }

                if (installerLaunchRequested) {
                    resolve(call, false, false);
                    return;
                }
                installerLaunchRequested = true;

                Activity activity = getActivity();
                if (activity == null) {
                    installerLaunchRequested = false;
                    call.reject("Android could not open the text-to-speech data installer.");
                    return;
                }

                activity.runOnUiThread(() -> {
                    try {
                        activity.startActivity(new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA));
                        resolve(call, false, true);
                    } catch (RuntimeException error) {
                        installerLaunchRequested = false;
                        call.reject("No Android text-to-speech data installer is available.");
                    }
                });
            });
        } catch (RuntimeException error) {
            if (engine[0] != null) engine[0].shutdown();
            call.reject("Android text-to-speech could not be started.");
        }
    }

    private void resolve(PluginCall call, boolean available, boolean installerOpened) {
        JSObject result = new JSObject();
        result.put("available", available);
        result.put("installerOpened", installerOpened);
        call.resolve(result);
    }
}
