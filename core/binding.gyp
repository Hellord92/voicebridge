{
  "targets": [{
    "target_name": "voicebridge_core",
    "sources": [
      "src/AudioCapture.cpp",
      "src/VAD.cpp",
      "src/PhraseDetector.cpp",
      "src/AudioPipeline.cpp",
      "addon/addon.cpp",
      "third_party/fvad/src/fvad.c",
      "third_party/fvad/src/signal_processing/division_operations.c",
      "third_party/fvad/src/signal_processing/energy.c",
      "third_party/fvad/src/signal_processing/get_scaling_square.c",
      "third_party/fvad/src/signal_processing/resample_48khz.c",
      "third_party/fvad/src/signal_processing/resample_by_2_internal.c",
      "third_party/fvad/src/signal_processing/resample_fractional.c",
      "third_party/fvad/src/signal_processing/spl_inl.c",
      "third_party/fvad/src/vad/vad_core.c",
      "third_party/fvad/src/vad/vad_filterbank.c",
      "third_party/fvad/src/vad/vad_gmm.c",
      "third_party/fvad/src/vad/vad_sp.c"
    ],
    "include_dirs": [
      "include",
      "node_modules/node-addon-api",
      "third_party/fvad/include",
      "third_party/minimp3",
      "third_party/httplib",
      "third_party",
      "<!(xcrun --show-sdk-path)/usr/include/c++/v1"
    ],
    "defines": [
      "CPPHTTPLIB_OPENSSL_SUPPORT"
    ],
    "cflags_cc": ["-std=c++17", "-O2", "-fexceptions"],
    "cflags_cc!": ["-fno-exceptions"],
    "cflags": ["-O2"],
    "xcode_settings": {
      "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
      "OTHER_CPLUSPLUSFLAGS": ["-O2", "-fexceptions"],
      "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
    },
    "conditions": [
      ["OS=='mac'", {
        "sources": ["../drivers/macos/ShmWriter.cpp"],
        "include_dirs": [
          "../drivers/macos",
          "<!(brew --prefix portaudio 2>/dev/null || echo /opt/homebrew/opt/portaudio)/include",
          "<!(brew --prefix openssl@3 2>/dev/null || echo /opt/homebrew/opt/openssl@3)/include"
        ],
        "libraries": [
          "-L<!(brew --prefix portaudio 2>/dev/null || echo /opt/homebrew/opt/portaudio)/lib",
          "-lportaudio",
          "-L<!(brew --prefix openssl@3 2>/dev/null || echo /opt/homebrew/opt/openssl@3)/lib",
          "-lssl",
          "-lcrypto",
          "-framework CoreAudio",
          "-framework AudioToolbox"
        ]
      }],
      ["OS=='win'", {
        "include_dirs": [
          "<!(echo %VCPKG_ROOT%\\installed\\x64-windows\\include)"
        ],
        "libraries": [
          "-L<!(echo %VCPKG_ROOT%\\installed\\x64-windows\\lib)",
          "-lportaudio"
        ]
      }],
      ["OS=='linux'", {
        "include_dirs": [
          "<!@(pkg-config --cflags-only-I portaudio-2.0 | sed 's/-I//g')"
        ],
        "libraries": [
          "<!@(pkg-config --libs portaudio-2.0)",
          "-lssl",
          "-lcrypto"
        ]
      }]
    ]
  }]
}
