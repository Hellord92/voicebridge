# VoiceBridge — Satılabilir MVP Checklist

DMG’yi son kullanıcıya vermeden önce **10/10 geçilmeli**. Her madde test edilebilir ve PASS/FAIL ile işaretlenir.

---

## 1. Temiz kurulum
**Test:** `bash scripts/clean-install-macos.sh` → yeni DMG kur → ilk açılış

| Kriter | PASS |
|--------|------|
| Uygulama açılıyor, donmuyor | ☐ |
| Google ile giriş çalışıyor | ☐ |
| Eski license/settings kalmamış | ☐ |

---

## 2. Sanal mikrofon
**Test:** Settings → Sound → Input

| Kriter | PASS |
|--------|------|
| `VoiceBridge Microphone` listede görünüyor | ☐ |
| Uygulama içinde Output = VoiceBridge Microphone | ☐ |
| Driver kurulumu hatasız (veya net uyarı) | ☐ |

---

## 3. Mikrofon seçimi
**Test:** Input = MacBook Pro Microphone, Refresh

| Kriter | PASS |
|--------|------|
| Tüm fiziksel mic’ler listeleniyor | ☐ |
| Seçilen mic pipeline’a gidiyor (konuşunca transcript geliyor) | ☐ |
| Dropdown tıklanabilir, donmuyor | ☐ |

---

## 4. Pipeline — kısa cümle (normal mod)
**Test:** TR→EN, ⚡RT kapalı, 5 sn konuş: *"Merhaba, nasılsın?"*

| Kriter | PASS |
|--------|------|
| Transcript Türkçe, doğru | ☐ |
| Çeviri İngilizce, anlamlı | ☐ |
| Latency **< 900ms** (yeşil/sarı) | ☐ |
| 403 / trial hatası yok | ☐ |

---

## 5. Pipeline — uzun cümle
**Test:** 20–30 sn kesintisiz konuş (paragraf oku)

| Kriter | PASS |
|--------|------|
| Cümle yarıda kesilmiyor (veya mantıklı chunk’lar) | ☐ |
| `...` / gürültü çevrilmiyor | ☐ |
| Ortalama latency **< 1200ms** | ☐ |

---

## 6. Stop butonu
**Test:** Start → 10 sn konuş → Stop

| Kriter | PASS |
|--------|------|
| Uygulama **kapanmıyor** | ☐ |
| Session summary veya Ready ekranı geliyor | ☐ |
| Tekrar Start çalışıyor | ☐ |

---

## 7. Karşı taraf sesi (echo)
**Test:** Hoparlörden ses çal (YouTube), sen konuşma

| Kriter | PASS |
|--------|------|
| Karşı tarafın sesi çevrilmiyor (veya PTT ile engelleniyor) | ☐ |
| PTT: Space basılı tut → sadece senin sesin gidiyor | ☐ |

---

## 8. Realtime mod (⚡RT)
**Test:** ⚡RT açık → Start → konuş

| Kriter | PASS |
|--------|------|
| Bağlantı hatası yok | ☐ |
| Streaming transcript/çeviri geliyor | ☐ |
| Latency normal moddan düşük veya eşit | ☐ |

---

## 9. Lisans / trial
**Test:** Railway `DEV_UNLIMITED_TRIAL=true` (test ortamı)

| Kriter | PASS |
|--------|------|
| 30+ dk testte 403 yok | ☐ |
| Sign out → sign in sonrası license yenileniyor | ☐ |
| `api.voicebridgeapps.com/health` → db ok | ☐ |

---

## 10. Build smoke
**Test:** Terminal

```bash
cd core && npm run build
cd ../app && npm run build
curl -s https://api.voicebridgeapps.com/health | python3 -m json.tool
```

| Kriter | PASS |
|--------|------|
| Core build 0 error | ☐ |
| App build 0 error | ☐ |
| Health `status: ok`, `db: true` | ☐ |

---

## MVP kararı

| Sonuç | Anlam |
|-------|--------|
| **10/10** | Satılabilir beta — DMG dağıt |
| **8–9/10** | Kritik bug fix, sonra tekrar test |
| **< 8/10** | MVP değil — önce stabilite |

---

## Bilinen riskler (şu an)

- Latency 400ms–2000ms arası dalgalanıyor
- Uzun konuşmada chunk parçalanması
- Eski kurulumda stale `licenseKey` → 403 (fix: clean install + start’ta refresh)

## Test sonrası

Sonuçları not et: hangi madde FAIL, ekran görüntüsü, latency ms, hata metni.
