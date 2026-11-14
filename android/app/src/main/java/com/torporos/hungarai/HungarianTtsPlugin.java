package com.torporos.hungarai;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(name = "HungarianTts")
public class HungarianTtsPlugin extends Plugin {
    private interface TtsOperation {
        void onReady(TextToSpeech tts);
        void onError();
    }

    private final List<TtsOperation> pendingOperations = new ArrayList<>();
    private TextToSpeech textToSpeech;
    private boolean isTtsInitializing;
    private boolean installerLaunchRequested;

    @PluginMethod
    public void ensureHungarianData(PluginCall call) {
        withTts(new TtsOperation() {
            @Override
            public void onReady(TextToSpeech tts) {
                boolean isAvailable = tts.isLanguageAvailable(new Locale("hu", "HU"))
                    >= TextToSpeech.LANG_AVAILABLE;
                if (isAvailable) {
                    tts.setLanguage(new Locale("hu", "HU"));
                    resolve(call, true, false);
                    return;
                }

                if (requestInstaller()) {
                    resolve(call, false, true);
                } else if (getActivity() == null) {
                    call.reject("Android could not open the text-to-speech data installer.");
                } else {
                    resolve(call, false, false);
                }
            }

            @Override
            public void onError() {
                call.reject("Android text-to-speech did not initialize.");
            }
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("Text to speak must not be empty.");
            return;
        }

        withTts(new TtsOperation() {
            @Override
            public void onReady(TextToSpeech tts) {
                int languageStatus = tts.setLanguage(new Locale("hu", "HU"));
                if (languageStatus < TextToSpeech.LANG_AVAILABLE) {
                    requestInstaller();
                    call.reject("The Hungarian voice is not installed yet.");
                    return;
                }

                tts.setSpeechRate(0.82f);
                Bundle parameters = new Bundle();
                int speechStatus = tts.speak(
                    text,
                    TextToSpeech.QUEUE_FLUSH,
                    parameters,
                    "hungarai-" + UUID.randomUUID()
                );
                if (speechStatus == TextToSpeech.ERROR) {
                    call.reject("Android could not play the Hungarian pronunciation.");
                    return;
                }
                call.resolve();
            }

            @Override
            public void onError() {
                call.reject("Android text-to-speech did not initialize.");
            }
        });
    }

    private void withTts(TtsOperation operation) {
        if (textToSpeech != null && !isTtsInitializing) {
            operation.onReady(textToSpeech);
            return;
        }

        pendingOperations.add(operation);
        if (isTtsInitializing) return;

        isTtsInitializing = true;
        final TextToSpeech[] engine = new TextToSpeech[1];
        try {
            engine[0] = new TextToSpeech(getContext(), status -> {
                isTtsInitializing = false;
                textToSpeech = engine[0];
                List<TtsOperation> operations = new ArrayList<>(pendingOperations);
                pendingOperations.clear();

                if (status != TextToSpeech.SUCCESS || textToSpeech == null) {
                    if (textToSpeech != null) textToSpeech.shutdown();
                    textToSpeech = null;
                    for (TtsOperation pending : operations) pending.onError();
                    return;
                }

                for (TtsOperation pending : operations) pending.onReady(textToSpeech);
            });
        } catch (RuntimeException error) {
            isTtsInitializing = false;
            List<TtsOperation> operations = new ArrayList<>(pendingOperations);
            pendingOperations.clear();
            for (TtsOperation pending : operations) pending.onError();
        }
    }

    private boolean requestInstaller() {
        if (installerLaunchRequested) return false;
        Activity activity = getActivity();
        if (activity == null) return false;

        installerLaunchRequested = true;
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA));
            } catch (RuntimeException error) {
                installerLaunchRequested = false;
            }
        });
        return true;
    }

    private void resolve(PluginCall call, boolean available, boolean installerOpened) {
        JSObject result = new JSObject();
        result.put("available", available);
        result.put("installerOpened", installerOpened);
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        if (textToSpeech != null) {
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.handleOnDestroy();
    }
}
