# VoiceBridge — macOS Tam Kaldırma

Başka bir Mac'te eski kurulumu **tamamen** silmek için aşağıdaki komutu Terminal'e yapıştır.

## Tek komut (kopyala-yapıştır)

Şifre isteyecek (driver için `sudo`).

```bash
osascript -e 'quit app "VoiceBridge"' 2>/dev/null; pkill -9 -f VoiceBridge 2>/dev/null; sleep 2; \
sudo rm -rf "/Applications/VoiceBridge.app" "$HOME/Applications/VoiceBridge.app" \
  "/Library/Audio/Plug-Ins/HAL/VoiceBridgeAudio.driver" \
  "/tmp/VoiceBridgeAudio-staging.driver" "/tmp/vb_driver.log"; \
rm -rf "$HOME/Library/Application Support/voicebridge" \
  "$HOME/Library/Application Support/VoiceBridge" \
  "$HOME/Library/Application Support/app.voicebridge" \
  "$HOME/Library/Caches/voicebridge" \
  "$HOME/Library/Caches/VoiceBridge" \
  "$HOME/Library/Caches/app.voicebridge" \
  "$HOME/Library/Logs/VoiceBridge" \
  "$HOME/Library/Logs/voicebridge" \
  "$HOME/Library/Saved Application State/voicebridge.savedState" \
  "$HOME/Library/Saved Application State/com.voicebridge.voicebridge.savedState" \
  "$HOME/Library/Saved Application State/app.voicebridge.savedState"; \
rm -f "$HOME/Library/Preferences/voicebridge.plist" \
  "$HOME/Library/Preferences/com.voicebridge.voicebridge.plist" \
  "$HOME/Library/Preferences/app.voicebridge.plist"; \
sudo killall coreaudiod 2>/dev/null; sleep 3; \
hdiutil detach "/Volumes/VoiceBridge" -force 2>/dev/null; \
echo "=== Temizlik bitti ==="; \
system_profiler SPAudioDataType 2>/dev/null | grep -i voicebridge || echo "OK: VoiceBridge mic yok"
```

## Ne siler?

| Öğe | Konum |
|-----|--------|
| Uygulama | `/Applications/VoiceBridge.app` |
| License / login / ayarlar | `~/Library/Application Support/voicebridge` |
| Tercihler | `~/Library/Preferences/*voicebridge*` |
| Cache & log | `~/Library/Caches`, `~/Library/Logs` |
| Sanal mikrofon driver | `/Library/Audio/Plug-Ins/HAL/VoiceBridgeAudio.driver` |

## Sonra

1. Yeni DMG kur
2. Google ile giriş yap (yeni license oluşur)
3. Driver kurulumunu onayla
4. Test: Start Translation → konuş → Stop (uygulama kapanmamalı)

## Driver hâlâ görünüyorsa

```bash
sudo killall coreaudiod
# veya Mac'i restart et
```
