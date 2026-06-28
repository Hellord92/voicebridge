# VoiceBridge — Domain + DNS Kurulum Kılavuzu

## Adım 1: Domain Satın Alma (Natro)

1. Natro.com'a git → "Domain Sorgula"
2. `voicebridgeapps.com` ara → varsa al (~₺500/yıl)
   - Yoksa: `voicebridgeapp.com` veya `voicebridge.io`
3. Satın alma sırasında "Whois Koruma" ekle (gizlilik için, genellikle ücretsiz)

## Adım 2: Cloudflare Ücretsiz Hesap Aç

1. https://cloudflare.com → "Sign Up" (ücretsiz)
2. Dashboard → "Add a Site" → domain adını yaz
3. "Free" plan seç
4. Cloudflare mevcut DNS kayıtlarını okuyacak → "Continue"
5. Cloudflare sana **2 adet nameserver** verecek:
   ```
   xxx.ns.cloudflare.com
   yyy.ns.cloudflare.com
   ```
   Bu değerleri kopyala.

## Adım 3: Natro'da Nameserver Değiştir

1. Natro → "Hesabım" → "Domain Yönetimi" → domain'e tıkla
2. "DNS/Nameserver" sekmesi → "Nameserver Değiştir"
3. Cloudflare'den gelen 2 NS'i yaz → Kaydet
4. Yayılma süresi: 24-48 saat (genellikle 1-2 saat)

## Adım 4: Cloudflare DNS Kayıtları

Cloudflare Dashboard → DNS → "Add record":

| Tür | Ad | Değer | Proxy |
|-----|-----|-------|-------|
| A | @ (root) | 76.76.21.21 | Proxied (turuncu) |
| CNAME | www | cname.vercel-dns.com | Proxied (turuncu) |
| CNAME | api | voicebridge-api.railway.app | Proxied (turuncu) |

## Adım 5: SSL/TLS Güvenlik Ayarları

Cloudflare → SSL/TLS:
- Mode: **Full (strict)**

Cloudflare → Security:
- WAF → Managed Rules: **Aktif**
- Bot Fight Mode: **Aktif**

Cloudflare → Speed → Optimization:
- Auto Minify: JS, CSS, HTML ✓

## Adım 6: Vercel'de Custom Domain Ekle

1. Vercel Dashboard → voicebridge project → Settings → Domains
2. `voicebridgeapps.com` ekle → "Add"
3. `www.voicebridgeapps.com` ekle → "Add"
4. Vercel sana DNS kayıtlarını doğrulayacak (Cloudflare üzerinden otomatik olur)

## Adım 7: Railway'de Custom Domain

1. Railway Dashboard → voicebridge-api service → Settings → Domains
2. `api.voicebridgeapps.com` ekle

---

## Özet Kontrol Listesi

- [ ] Domain satın alındı (Natro)
- [ ] Cloudflare hesabı oluşturuldu
- [ ] Natro'da nameserverlar değiştirildi
- [ ] Cloudflare DNS kayıtları eklendi
- [ ] SSL Full (strict) ayarlandı
- [ ] WAF + Bot Fight Mode açıldı
- [ ] Vercel'e domain eklendi
- [ ] Railway'e api subdomain eklendi
