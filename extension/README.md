# LinguaMeet — Chrome Extension

**LinguaMeet**, Google Meet toplantılarında Türkçe konuşmanızı anlık İngilizce sese çevirir. BlackHole veya başka sanal ses sürücüsü **gerekmez**.

## Nasıl çalışır?

```
Gerçek mikrofon → Web Speech (TR) → Google Translate → ElevenLabs TTS
                                                          ↓
Meet getUserMedia hook ← sentetik mikrofon track ← AudioContext
```

Extension, Meet'in mikrofon kaynağını tarayıcı içinde değiştirir. Çevrilmiş ses doğrudan Meet'e gider.

## Kurulum (geliştirici modu)

1. Chrome'da `chrome://extensions` aç
2. **Geliştirici modu**nu aç
3. **Paketlenmemiş öğe yükle** → `extension/` klasörünü seç
4. Extension ikonuna tıkla → ElevenLabs API anahtarını gir → **Kaydet**

## Kullanım

1. [meet.google.com](https://meet.google.com) sekmesini aç
2. LinguaMeet popup'tan veya Meet sayfasındaki sağ alt panelden **Başlat**
3. Meet'e katıl (veya zaten katılıysan mikrofonu bir kez kapat-aç)
4. Türkçe konuş — karşı taraf İngilizce duyar

## Gereksinimler

- Google Chrome (veya Chromium tabanlı tarayıcı)
- ElevenLabs API anahtarı
- Mikrofon izni (extension + Meet)

## Dosya yapısı

```
extension/
├── manifest.json
├── background/service-worker.js   # Orkestrasyon, çeviri, TTS
├── offscreen/                     # Web Speech STT
├── injected/page-bridge.js        # Meet getUserMedia hook (MAIN world)
├── content/                       # Meet panel UI
├── popup/                         # Ayarlar ve başlat/durdur
└── lib/shared.js                  # Paylaşılan yardımcılar
```

## Bilinen sınırlamalar (v0.1)

- Meet mikrofonu **Başlat**'tan önce alınmışsa sayfayı yenile veya mic'i kapat-aç
- Sadece **outbound** (TR → EN ses); inbound altyazı sonraki sürümde
- Web Speech API kalitesi ortam gürültüsüne duyarlı

## Testler

Otomatik kontroller (manifest, syntax, mesaj tipleri, birim testler, Google Translate smoke test):

```bash
cd extension
npm test
```

Manuel QA (Chrome):

1. `chrome://extensions` → LinguaMeet yüklü ve hatasız
2. Meet sekmesi → sağ altta panel görünüyor
3. Popup → API key kaydet → Başlat → panel yeşil nokta
4. Meet'te mic kapat-aç → konuş → TR/EN metin panelde
5. Karşı taraf İngilizce duyuyor (test odası ile doğrula)
6. Durdur → hook kalkıyor, offscreen kapanıyor

## Ana uygulamadan fark

| | Midas Meet Translator | LinguaMeet Extension |
|---|---|---|
| Kurulum | BlackHole + Başlat.command | Sadece extension |
| Ses yolu | BlackHole 2ch | getUserMedia hook |
| Platform | macOS ağırlıklı | Chrome (macOS/Win/Linux) |
