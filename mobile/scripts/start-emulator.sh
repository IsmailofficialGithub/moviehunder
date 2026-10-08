#!/usr/bin/env bash
set -e

export JAVA_HOME="$HOME/Android/jdk"
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$JAVA_HOME/bin:$PATH"

AVD_NAME="Pixel_6_API_34"

echo "Starting Android Emulator: $AVD_NAME..."
"$ANDROID_HOME/emulator/emulator" -avd "$AVD_NAME" -netdelay none -netspeed full &
