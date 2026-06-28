# VoiceBridge — Firebase Kurulum Kılavuzu

## Adım 1: Firebase Projesi Oluştur

1. https://console.firebase.google.com → "Add project"
2. Proje adı: `VoiceBridge`
3. Google Analytics: isteğe bağlı (açabilirsin)
4. "Create project"

## Adım 2: Authentication Ayarları

1. Sol menü → Build → **Authentication**
2. "Get started"
3. Sign-in method → **Google** → Enable → Project public-facing name: "VoiceBridge" → Support email → Save
4. Sign-in method → **Email/Password** → Enable → Save
5. Settings → **Authorized domains** → "Add domain":
   - `voicebridgeapps.com`
   - `www.voicebridgeapps.com`
   - `localhost` (zaten var)

## Adım 3: Web Uygulaması Kaydet (Website + Electron için)

1. Project Overview → "</>" (Web) butonu
2. App nickname: `VoiceBridge Web`
3. "Register app"
4. Firebase config'i kopyala:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "voicebridge-xxxxx.firebaseapp.com",
  projectId: "voicebridge-xxxxx",
  storageBucket: "voicebridge-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

Bu değerleri `website/.env.local` ve `app/.env` dosyalarına koy.

## Adım 4: Service Account Key (Backend için)

1. Project Settings (gear icon) → **Service accounts**
2. "Generate new private key" → JSON dosyasını indir
3. Bu JSON'u **güvenli tut** — hiçbir zaman commit etme!
4. JSON içeriğini Railway ortam değişkenine ekle:
   - Railway → voicebridge-api → Variables:
   - Key: `FIREBASE_SERVICE_ACCOUNT_JSON`
   - Value: JSON dosyasının tüm içeriği (tek satır stringify edilmiş)

## Adım 5: Environment Variables

### website/.env.local
```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=voicebridge-xxxxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=voicebridge-xxxxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=voicebridge-xxxxx.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
```

### app/.env
```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=voicebridge-xxxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=voicebridge-xxxxx
VITE_FIREBASE_STORAGE_BUCKET=voicebridge-xxxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

### Railway (server env)
```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"voicebridge-xxxxx",...}
```

## Adım 6: Vercel'e Environment Variables Ekle

Vercel Dashboard → voicebridge project → Settings → Environment Variables:
- Yukarıdaki `NEXT_PUBLIC_*` değerlerinin hepsini ekle

---

## Özet Kontrol Listesi

- [ ] Firebase projesi oluşturuldu
- [ ] Google + Email/Password auth aktif
- [ ] Authorized domains eklendi
- [ ] Web uygulaması kayıt edildi
- [ ] Config değerleri not alındı
- [ ] Service Account JSON indirildi
- [ ] Railway'e FIREBASE_SERVICE_ACCOUNT_JSON eklendi
- [ ] website/.env.local oluşturuldu
- [ ] app/.env oluşturuldu
- [ ] Vercel'e env vars eklendi
