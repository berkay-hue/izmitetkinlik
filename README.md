# izmitetkinlik.com

İzmit Palyaço Etkinlikleri için tek sayfalık, statik tanıtım sitesi (HTML + CSS + JS, derleme gerekmez).

## Dosyalar

- `index.html` — tüm bölümler, SEO etiketleri ve Google için işletme bilgisi (JSON-LD)
- `assets/style.css` — tasarım (mobil öncelikli)
- `assets/main.js` — mobil menü, rezervasyon formu, WhatsApp/telefon ayarları
- `favicon.svg`, `robots.txt`, `sitemap.xml`

## Telefon / WhatsApp eklemek

`assets/main.js` dosyasının en üstündeki iki satırı doldurun:

```js
const WHATSAPP = "905321234567";   // ülke koduyla, boşluksuz
const PHONE = "0532 123 45 67";    // sitede görünecek biçim
```

Boş bırakılırsa bu bağlantılar gizli kalır; form mesajı Instagram DM üzerinden gönderilir.
WhatsApp girildiğinde formda "WhatsApp'tan gönder" butonu da çıkar.

## Fotoğraflar

Sitede çocuk fotoğrafı kullanılmadı; görseller çizimdir. Fotoğraf eklenecekse çocuk içermeyen
kareler (kostümlü ekip, süsleme, kurulum) tercih edilmeli. Çocuk görünen bir fotoğraf için velinin
açık izni (KVKK) gerekir.

## Yayınlama

Klasörün içeriği olduğu gibi herhangi bir statik hostinge yüklenebilir (Cloudflare Pages, Netlify,
Vercel ya da cPanel'deki `public_html`). Ardından alan adının DNS kayıtları hostinge yönlendirilir.
Yayından sonra Google Search Console'a `https://izmitetkinlik.com/sitemap.xml` eklenmesi önerilir.
