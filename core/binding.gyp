{
  "targets": [{
    "target_name": "voicebridge_core",
    "sources": [
      "src/AudioCapture.cpp",
      "src/VAD.cpp",
      "src/PhraseDetector.cpp",
      "src/AudioPipeline.cpp",
      "addon/addon.cpp"
    ],
    "include_dirs": [
      "include",
      "<!@(node -p \"require('node-addon-api').include\")",
      "<!@(pkg-config --cflags-only-I portaudio-2.0 | sed 's/-I//g')"
    ],
    "libraries": [
      "<!@(pkg-config --libs portaudio-2.0)",
      "-lfvad"
    ],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
    "cflags_cc": ["-std=c++17", "-O2"],
    "xcode_settings": {
      "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
      "OTHER_CPLUSPLUSFLAGS": ["-O2"]
    },
    "conditions": [
      ["OS=='mac'", {
        "sources": ["../drivers/macos/ShmWriter.cpp"],
        "include_dirs": ["../drivers/macos"],
        "libraries": ["-framework CoreAudio", "-framework AudioToolbox"]
      }]
    ]
  }]
}
