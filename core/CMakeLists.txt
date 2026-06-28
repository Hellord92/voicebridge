cmake_minimum_required(VERSION 3.20)
project(VoiceBridgeCore VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── Dependencies ──────────────────────────────────────────────────────────
find_package(PkgConfig REQUIRED)
pkg_check_modules(PORTAUDIO REQUIRED portaudio-2.0)

# libfvad (WebRTC VAD) — bundled in third_party/
add_subdirectory(third_party/fvad EXCLUDE_FROM_ALL)

# cpp-httplib (header-only, for TTS proxy calls)
# Fetched via FetchContent
include(FetchContent)
FetchContent_Declare(httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG        v0.16.0)
FetchContent_MakeAvailable(httplib)

FetchContent_Declare(nlohmann_json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG        v3.11.3)
FetchContent_MakeAvailable(nlohmann_json)

# minimp3 — header-only MP3 decoder
FetchContent_Declare(minimp3
    GIT_REPOSITORY https://github.com/lieff/minimp3.git
    GIT_TAG        master)
FetchContent_MakeAvailable(minimp3)

# ── Library target ────────────────────────────────────────────────────────
add_library(voicebridge_core STATIC
    src/AudioCapture.cpp
    src/VAD.cpp
    src/PhraseDetector.cpp
    src/VirtualMicOutput.cpp
    src/AudioPipeline.cpp
    src/Mp3Decoder.cpp
    src/HttpClient.cpp
)

target_include_directories(voicebridge_core
    PUBLIC  include
    PRIVATE ${PORTAUDIO_INCLUDE_DIRS}
    PRIVATE ${minimp3_SOURCE_DIR}
    PRIVATE ${httplib_SOURCE_DIR}
)

target_link_libraries(voicebridge_core
    PUBLIC  fvad
    PRIVATE ${PORTAUDIO_LIBRARIES}
            nlohmann_json::nlohmann_json
)

target_compile_options(voicebridge_core PRIVATE
    ${PORTAUDIO_CFLAGS_OTHER}
    -Wall -Wextra -O2
)

if(APPLE)
    target_link_libraries(voicebridge_core PRIVATE
        "-framework CoreAudio"
        "-framework AudioToolbox"
    )
    # Add ShmWriter from driver module
    target_sources(voicebridge_core PRIVATE
        ../drivers/macos/ShmWriter.cpp)
    target_include_directories(voicebridge_core PRIVATE
        ../drivers/macos)
endif()

# ── Node.js native addon ──────────────────────────────────────────────────
# Built separately via node-gyp, but sources listed here for reference.
# See binding.gyp for node-gyp build configuration.

# ── CLI test binary ───────────────────────────────────────────────────────
add_executable(vb_pipeline_test src/main_test.cpp)
target_link_libraries(vb_pipeline_test PRIVATE voicebridge_core)
