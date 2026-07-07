cmake_minimum_required(VERSION 3.20)
project(VoiceBridgeAudio VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Universal binary — arm64 (Apple Silicon) + x86_64 (Intel)
# Override with: cmake -DCMAKE_OSX_ARCHITECTURES=arm64 for arm64-only
if(NOT CMAKE_OSX_ARCHITECTURES)
  set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "macOS architectures" FORCE)
endif()
set(CMAKE_OSX_DEPLOYMENT_TARGET "12.0" CACHE STRING "Minimum macOS version" FORCE)

# Must build as a macOS bundle (.driver)
set(BUNDLE_NAME "VoiceBridgeAudio")

add_library(${BUNDLE_NAME} MODULE
    VoiceBridgeDriver.cpp
)

set_target_properties(${BUNDLE_NAME} PROPERTIES
    BUNDLE                    ON
    BUNDLE_EXTENSION          "driver"
    MACOSX_BUNDLE_INFO_PLIST  "${CMAKE_CURRENT_SOURCE_DIR}/Info.plist"
    OUTPUT_NAME               "VoiceBridgeAudio"
)

target_compile_options(${BUNDLE_NAME} PRIVATE
    -Wall -Wextra -O2
)

# Link CoreAudio and CoreFoundation frameworks
target_link_libraries(${BUNDLE_NAME} PRIVATE
    "-framework CoreAudio"
    "-framework CoreFoundation"
    "-framework AudioToolbox"
)

# Install into system HAL plug-ins directory
# sudo cmake --install build
install(TARGETS ${BUNDLE_NAME}
    BUNDLE  DESTINATION "/Library/Audio/Plug-Ins/HAL"
    LIBRARY DESTINATION "/Library/Audio/Plug-Ins/HAL"
)

# Post-install: restart coreaudiod (killall works better than launchctl under SIP)
install(CODE "
    message(STATUS \"Restarting coreaudiod ...\")
    execute_process(COMMAND killall coreaudiod RESULT_VARIABLE _rc ERROR_QUIET)
")
