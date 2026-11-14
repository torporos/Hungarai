package com.torporos.hungarai;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HungarianTtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
