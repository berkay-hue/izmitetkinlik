# izmitetkinlik.com

İzmit Palyaço Etkinlikleri'nin statik sitesi: tanıtım sayfası ve blog (HTML + CSS + JS).
GitHub Pages'te `main` dalının kökünden yayınlanır; `main`'e gönderilen her değişiklik 1–2 dakikada canlıya çıkar.
Üretici ve denetleyici Node 18+ ile çalışır, hiçbir paket kurulmaz.

## Dosyalar

- `index.html` — ana sayfa. `<!-- JSONLD:… -->` ve `<!-- BLOG:… -->` arası üretilir, elle düzenlemeyin.
- `assets/style.css`, `assets/main.js` — tasarım; mobil menü, rezervasyon formu, WhatsApp/telefon ayarı.
  Yazı tipi olarak cihazın kendi yazı tipleri kullanılır; dış yazı tipi servisine istek gitmez.
- `content/blog/*.md` — blog yazılarının kaynağı
- `content/konular.json` — sıradaki yazı konuları (günlük görev buradan seçer)
- `content/YAZIM-REHBERI.md` — yazı kuralları: ton, yapı, yazılmayacak iddialar
- `tools/build.mjs` — yazılardan sayfaları ve yapay zeka/arama dosyalarını üretir
- `tools/check.mjs` — yayından önce denetler (kırık bağlantı, şema, sitede olmayan iddia…)
- `tools/indexnow.mjs` — değişen sayfaları arama motorlarına bildirir
- `tools/og.html` — paylaşım görseli ve logonun kaynağı
- Üretilen dosyalar: `blog/`, `feed.xml`, `sitemap.xml`, `llms.txt`, `llms-full.txt`, `404.html` (elle düzenlemeyin)
- `<32 haneli anahtar>.txt` — IndexNow doğrulama dosyası; silmeyin, adını değiştirmeyin
- `.gitignore` — depoya girmeyecek sistem dosyaları (`.DS_Store`)

## Yazı eklemek

1. `content/blog/<adres>.md` oluşturun. Dosya adı adres olur: `/blog/<adres>/`
   (küçük harf, rakam ve tire; Türkçe karakter yok).
2. Dosyanın başına `---` satırları arasına JSON ön bilgi yazın:

```
---
{
  "title": "İzmit'te çocuk doğum günü nasıl planlanır?",
  "description": "Arama sonucunda görünen 70–155 karakterlik özet.",
  "date": "2026-10-20",
  "category": "dogum-gunu",
  "answer": "Sayfanın başında 'Kısa cevap' kutusunda çıkan 1–3 cümle. Yapay zeka asistanları çoğunlukla bunu alıntılar.",
  "faq": [
    { "q": "Soru?", "a": "Cevap." },
    { "q": "İkinci soru?", "a": "Cevap." },
    { "q": "Üçüncü soru?", "a": "Cevap." }
  ]
}
---
## İlk ara başlık

Metin…
```

- `faq` 3–5 soru içerir.
- Kategoriler: `dogum-gunu`, `okul-kres`, `sunnet-dugun`, `ozel-gun`, `hizmet`, `bolge`, `rehber`
- İsteğe bağlı alanlar:
  - `"updated": "2026-11-02"` — yazı sonradan güncellendiyse; `date`'ten önce ve bugünden sonra olamaz
  - `"draft": true` — yayına çıkmaz
- Tarihi ileride olan yazı o güne kadar yayına çıkmaz. Gün İstanbul saatiyle hesaplanır, sonrasında bir build gerekir.
- Desteklenen biçimler:
  - `##` ve `###` başlık, paragraf
  - `-` ve `1.` listeler, `|` tablo (ikinci satır `|---|`)
  - `**kalın**`, `*eğik*`, `[bağlantı](/#hizmetler)`
  - `> ` ile ipucu kutusu
- Gövdede `#` (h1) kullanılmaz; sayfa başlığı `title`'dan gelir.
- Kurallar ve yazılmayacak iddialar için `content/YAZIM-REHBERI.md` okunmalı.

3. Üretip denetleyin:

```bash
node tools/build.mjs
```

```bash
node tools/check.mjs
```

`check.mjs` 0 hata vermeden yayınlamayın. Uyarılar bilgi içindir.

4. Değişen dosyaları adıyla ekleyip `main`'e gönderin, ardından arama motorlarına bildirin:

```bash
node tools/indexnow.mjs --from-git HEAD~1
```

Gönderirken bir merge commit'i oluştuysa `HEAD~1` yerine push'tan önceki `origin/main` commit'ini verin.
Tarihi ileride olan bir yazının sayfası, o tarihten sonraki ilk build'de yeni bir `blog/<adres>/index.html` dosyası olarak çıkar;
onu da adıyla eklemeyi unutmayın.
Betik, canlıdaki sayfa yeni sürümle aynı olana kadar (en çok ~5 dk) bekler, sonra bildirir.

## Günlük otomatik yazı

GitHub Actions'taki `daily` iş akışı (`.github/workflows/daily.yml`) her gün 10:17'de (TR) `tools/daily.mjs`'i çalıştırır.
GitHub zamanlanmış çalıştırmaları bazen düşürdüğü için 18:43'te bir telafi çalıştırması daha vardır; bugün yazı varsa hiçbir şey yapmaz.

1. `content/konular.json`'dan konu seçer: `durum` = `bekliyor` ve `planlanan` ≤ bugün olanlardan `planlanan` tarihi en eski olan.
   Mevsimlik bir konunun `son_tarih`i geçmişse yazılmaz; `planlanan` ve `son_tarih` bir yıl ileri alınır, sıradakine geçilir.
   Tarihi gelmiş konu yoksa sıradaki `bekliyor` konuyu öne alır. Günde en çok bir yazı çıkar.
2. Claude API ile (`claude-opus-5-5`) rehbere göre yazdırır: `duzeltme` notu önce gelir, `yazilmayacaklar` kesin yasak.
3. `content/blog/<adres>.md`'yi yazar, konuyu `yayinlandi` yapar (`yayin` = tarih), `build` ve `check` çalıştırır.
   `check` hata verirse hataları Claude'a verip bir kez daha dener; yine geçmezse hiçbir şey yazmadan kırmızı biter.
4. İş akışı "Izmit Blog Bot" adıyla commit atıp gönderir, GitHub Pages yayınının başladığını doğrular
   (başlamadıysa API ile başlatır) ve IndexNow ile bildirir.

Sırada 14'ten az genel konu (`son_tarih` ve `ay` alanı olmayan `bekliyor` konu) kalırsa yazıdan sonra Claude'a
rehbere uyan yeni genel konular ürettirir ve sırayı 28'e tamamlar. Konular denetlenir (adres, başlık, kategori, bağlantılar, SSS),
geçmeyen liste hatalarla bir kez daha istenir. Eklenen konular `"kaynak": "otomatik"` alır ve en son planlanan tarihten itibaren
günde bir tane olacak şekilde sıraya girer; aynı commit'le gönderilir. Konu üretimi başarısız olursa yazı yine yayınlanır,
günlükte uyarı çıkar. Yer adına dayalı (`bolge`) ve mevsimlik konular otomatik üretilmez.

Gerekli secret: `ANTHROPIC_API_KEY` (`gh secret set ANTHROPIC_API_KEY -R berkay-hue/izmitetkinlik`).
Elle denemek için Actions → daily → Run workflow; `dry` işaretliyse yazıyı üretir, build + check ile dener, commit etmez.
Yerelde: `node tools/daily.mjs --dry` (çalışma ağacı temiz olmalı).

Konu durumları:

- `bekliyor` — sırada
- `yayinlandi` — yayında
- `sahibe-sor` — yazmak için işletme sahibinin cevabı gerekiyor (`sahibe_soru`). Cevap gelince bilgi rehberin
  "Kullanılabilecek kesin bilgiler" bölümüne eklenir, konu `bekliyor` yapılıp bir `planlanan` tarih verilir.
- `beklet` — yazılmaz

Konu eklemek için `konular.json`'a aynı biçimde, `planlanan` tarihi olan yeni bir kayıt eklemek yeterlidir.

## Yapay zeka ve arama görünürlüğü

- Her sayfada JSON-LD bulunur:
  - Ana sayfa: işletme, hizmetler, bölgeler, SSS.
  - Yazılar: BlogPosting, içerik haritası (breadcrumb), SSS.
- Bu bilgiler sayfada görünen metinden üretilir; sayfada olmayan bir şey şemaya da yazılmaz.
- Yorum ve puan şeması kullanılmaz. Gerçek yorum yoksa eklenmez.
- `llms.txt` ve `llms-full.txt`, yapay zeka asistanları için sitenin kısa ve tam metin özetidir.
- `robots.txt` arama ve yapay zeka tarayıcılarına açıktır.
- `sitemap.xml` ve `feed.xml` (RSS) her build'de güncellenir.

## Görseller

`assets/og.png` (paylaşım görseli) ve `assets/logo.png`, `tools/og.html`'den Chrome ile üretilir:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --hide-scrollbars --virtual-time-budget=6000 --window-size=1200,630 --screenshot=assets/og.png "file://$PWD/tools/og.html"
```

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --hide-scrollbars --default-background-color=00000000 --virtual-time-budget=3000 --window-size=512,512 --screenshot=assets/logo.png "file://$PWD/tools/og.html?logo"
```

## Telefon / WhatsApp eklemek

`assets/main.js` dosyasının en üstündeki iki satırı doldurun:

```js
const WHATSAPP = "905321234567";   // ülke koduyla, boşluksuz
const PHONE = "0532 123 45 67";    // sitede görünecek biçim
```

Boş bırakılırsa bu bağlantılar gizli kalır ve form mesajı Instagram DM üzerinden gönderilir.
WhatsApp girildiğinde formda "WhatsApp'tan gönder" butonu da çıkar. Ardından `node tools/build.mjs` çalıştırın.

## Fotoğraflar

Sitede çocuk fotoğrafı kullanılmaz; görseller çizimdir. Fotoğraf eklenecekse çocuk içermeyen kareler
tercih edilmeli: kostümlü ekip, süsleme, kurulum. Çocuk görünen bir fotoğraf için velinin açık izni (KVKK) gerekir.
`check.mjs` yazılarda ve sayfalarda `<img>` gördüğünde hata verir. Fotoğraf eklenmesi bilinçli bir karar olmalı.
