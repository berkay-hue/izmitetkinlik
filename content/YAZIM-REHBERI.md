# Yazım rehberi

Blog yazıları bu kurallara göre yazılır. Günlük otomatik görev de, elle yazan herkes de bu dosyayı okur.
`tools/check.mjs` kuralların çoğunu otomatik denetler, ama denetleyicinin yakalayamadığı en önemli kural şudur:
**sitede yazmayan bir bilgiyi işletme hakkında iddia etmeyin.**

## Amaç

- Kocaeli ve Sakarya'daki veliler, okullar ve kreşler için gerçekten işe yarayan, net cevaplar.
- Google'da ve yapay zeka asistanlarında (ChatGPT, Gemini, Copilot, Perplexity…) alıntılanabilecek kadar açık ve kendi başına anlaşılır metin.
- Satış dili değil, yardımcı dil. Okuyan kişi rezervasyon yapmasa bile işine yarayan bir şey öğrenmeli.

## Ses ve ton

- Sıcak, sade, "siz" diye hitap eden, kısa cümleler.
- İşletmenin adı: **İzmit Palyaço Etkinlikleri**. "Biz" denebilir ("programı birlikte planlıyoruz").
- Kişisel yazar yok; uydurma isim, unvan ya da "palyaço X anlatıyor" gibi karakterler kullanılmaz.
- Ünlem ve emoji az; yazıda emoji yok.
- Uydurma anı ya da vaka anlatılmaz ("geçen hafta Gebze'deki partide…" gibi). Genel örnekler "örneğin" diye verilir.

## Yapı

- **Başlık** (`title`): gerçek bir arama sorusu gibi, en çok 60 karakter (" | İzmit Palyaço Etkinlikleri" eki sayılmaz, onu site ekler). Örnek: "Okulda 23 Nisan etkinliği nasıl planlanır?"
- **Kısa cevap** (`answer`): 2–3 cümle, yaklaşık 150–350 karakter. Başlığın hemen altında giriş olarak görünür; ilk cümle başlıktaki soruya doğrudan, kendi başına cevap verir.
  Yapay zeka asistanları çoğunlukla bu kutuyu alıntılar; "aşağıda anlatıyoruz" gibi sayfaya bağımlı ifade kullanmayın.
- **Açıklama** (`description`): 70–155 karakter, arama sonucunda görünen özet.
- **Gövde:**
  - Gövde doğrudan bir `##` başlıkla başlar (giriş paragrafı yok; giriş kısa cevap kutusudur).
  - 4–7 `##` ara başlık; en az 2'si soru biçiminde (`?` ile biter), diğerleri net bir konu.
  - Gövdeye "Sık sorulan sorular" başlığı yazılmaz; SSS bölümü `faq`'tan otomatik üretilir.
  - Her bölümün ilk cümlesi o bölümün cevabıdır; ayrıntı sonra gelir.
  - En az bir kontrol listesi (`-`) ya da tablo (`|`).
  - Toplam yaklaşık 800–1400 kelime. Doldurmak için tekrar etmeyin.
  - İsteğe bağlı bir `> ` ipucu kutusu.
- **SSS** (`faq`): 3–4 soru, her biri `?` ile biter. Ara başlıkları tekrar etmeyen, ek sorular. Cevaplar kısa: 1–2 tam cümle.
  Sayfada son bölümün (rezervasyon yönlendirmesi) hemen önünde "## Sık sorulan sorular" altında `###` sorular olarak çıkar ve FAQPage verisine girer.
- **Son bölüm:** kısa bir "rezervasyon / bize yazın" yönlendirmesi ve [form](/#iletisim) bağlantısı.

## İç bağlantılar

Her yazıda 2–4 farklı iç bağlantı olsun (gövde, kısa cevap ve SSS birlikte; aynı adres bir kez sayılır). Kullanılabilecek adresler:

| Adres | Ne var |
|---|---|
| `/#hizmetler` | Hizmetler |
| `/#etkinlikler` | Etkinlik türleri |
| `/#okullar` | Okul ve kreş programları |
| `/#bolgeler` | Hizmet bölgeleri |
| `/#sss` | Sık sorulan sorular |
| `/#iletisim` | Rezervasyon formu |
| `/blog/<adres>/` | Yalnızca **yayında olan** başka bir yazı |

Henüz yayınlanmamış (`bekliyor` ya da tarihi ileride) yazıya bağlantı vermeyin. Dış sitelere bağlantı vermeyin.

## Kullanılabilecek kesin bilgiler

İşletme hakkında yalnızca bunlar söylenebilir (ana sayfada yazanlar):

**Hizmetler**
- Palyaço & animatör: oyun, şaka, müzik.
- Yüz boyama: kelebekten süper kahramana, çocukların seçtiği desenler.
- Sosis balon: köpek, kılıç, çiçek; her çocuğa kendi balonu.
- Grup oyunları: halat savaşı, sandalye kapmaca, yumurta maratonu.
- Dans & mini disco: "A ram zam zam", "Çu çu va", dans maratonu.
- Köpük baloncuk şovu.
- Kar spreyi eğlencesi (final olarak).
- Müzikli eğlence.
- Hizmetler tek tek ya da bir arada alınabilir.

**Etkinlik türleri**
- Doğum günü (evde, bahçede, kafede ya da salonda).
- Sünnet düğünü.
- Düğün & nişan (çocuklara özel eğlence).
- Okul & kreş (ana sınıfları ve ilkokullar; sınıfa özel ya da tüm okula özel).
- Açılış & mağaza etkinlikleri.
- Bayram ve özel günler (23 Nisan, 30 Ağustos, yılbaşı).
- Mekân: evde, bahçede, salonda, okulda ya da açık alanda; program etkinliğe göre hazırlanır.

**Okullar**
- Okul açılış haftası, yıl sonu şenliği, 23 Nisan gibi günler için yaşa uygun programlar.
- "Tek sınıf / grup": palyaço ya da animatör, yüz boyama, sosis balon, eğlenceli oyunlar.
- "Okul şenliği": kalabalık gruplara uygun ekip, yüz boyama ve sosis balon, dans, mini disco ve oyunlar, baloncuk şovu ve kar spreyi finali.
- Okula dönüş ve kış dönemlerinde okullara dönemsel kampanyalar olur; ayrıntı için bize yazılır. Kampanyanın oranı ya da tarihi yazılmaz.

**Bölgeler**
- Kocaeli: İzmit, Gebze, Kartepe, Başiskele, Derince, Körfez, Gölcük, Darıca, Çayırova, Dilovası, Karamürsel, Kandıra.
- Sakarya: Adapazarı, Serdivan, Erenler, Sapanca, Arifiye.
- Listede olmayan ilçeler için de sorulabilir. Başka ilçe ya da şehre "gidiyoruz" denmez.

**Fiyat ve rezervasyon**
- Sabit fiyat listesi yok. Fiyat süreye, çocuk sayısına, seçilen hizmetlere ve konuma göre verilir.
- Fiyat için form doldurulur ya da Instagram'dan yazılır.
- Hafta sonları, bayramlar ve okul dönemleri yoğundur; mümkün olduğunca erken yazmak önerilir.
- Rezervasyon: [form](/#iletisim) bilgileri hazır bir mesaja çevirir; Instagram mesajı (@izmit_palyaco_etkinlikleri).
- Form şunları sorar: etkinlik türü, tarih, saat, ilçe/yer, çocuk sayısı, yaş aralığı, istenen hizmetler.
- Telefon ya da WhatsApp numarası yazmayın (sitede henüz yok).

## Yazılmayacaklar

`check.mjs` bunların çoğunu yakalar ve yayını durdurur. Yakalamadıklarından da yazar sorumludur.

- **Fiyat:** rakam, aralık, "uygun fiyat", "en ucuz", indirim oranı. Fiyat sorusunun cevabı her zaman "neye göre değiştiği" ve "nasıl teklif alınacağı"dır.
- **Sayılar ve süreler:** deneyim yılı ("10 yıllık", "yıllardır"), etkinlik/çocuk/aile/okul sayısı, "binlerce mutlu çocuk", "500+ etkinlik".
- **Garanti:** "garanti", "%100", "kesinlikle memnun kalırsınız".
- **Belge ve uzmanlık:** sertifika, lisans, belge, sigorta, pedagog, psikolog, çocuk gelişim uzmanı, "eğitimli/uzman kadro".
- **Ödül ve üstünlük:** "en iyi palyaço", "bölgenin lideri", "bir numara", "Kocaeli'nin en…".
- **Yorum ve puan:** müşteri yorumu, veli sözü, yıldız, referans listesi, "velilerimiz diyor ki".
- **Ürün güvenliği:** boya için "hipoalerjenik", "dermatolojik test", "alerji yapmaz", "zararsız", marka adı.
  Bunun yerine genel tavsiye verin: "Çocuğunuzun cildi hassassa ya da alerjisi varsa önceden söyleyin; yüz boyamayı atlamak ya da küçük bir alana yapmak mümkün."
- **Süre ve kadro ayrıntısı:** "program 2 saat sürer", "3 kişilik ekip", "30 dakikada kurulum" gibi sitede olmayan rakamlar.
  "Süreyi birlikte belirliyoruz" denebilir.
- **Üçüncü taraflar:** belirli kafe, salon, park, AVM, okul adı; onların fiyatı, saati, kuralı. Gerçek kişi adı.
- **Tarih:** emin olunmayan bayram ya da tatil tarihleri. Sabit günler (23 Nisan, 30 Ağustos, 29 Ekim, 31 Aralık) yazılabilir;
  Ramazan/Kurban Bayramı için "her yıl yaklaşık 11 gün öne kayar, tarihini kontrol edin" gibi genel ifade kullanın.
- **Fotoğraf:** `<img>` yok. Çocuk fotoğrafı yayımlanmaz.
- **Sağlık ve güvenlik tavsiyesi:** tıbbi iddia yok. Genel ve sağduyulu öneriler (alerjiyi önceden bildirin, küçük parçalı balonları gözetimde verin, dans alanını eşyalardan boşaltın) yazılabilir.

## Genel tavsiye verirken

İşletme hakkında olmayan, velinin işine yarayan genel bilgiler serbesttir; ölçülü ve "genellikle" diliyle yazın:

- Yaşa göre oyun seçimi (3–5 yaş kısa ve basit, 6–9 yaş yarışmalı oyunlar gibi genel gözlemler).
- Parti planlama listeleri: tarih, davetli sayısı, mekân, alan, ses düzeni, ikram saati, pasta anı.
- Evde parti için alan hazırlığı, kırılacak eşyaları kaldırmak, prize yakın yer.
- Okul etkinliğinde izin, sınıf sayısı, saat çizelgesi, öğretmenlerle koordinasyon.

Kesin rakam gerekiyorsa vermeyin; "çocuk sayısına göre değişir" deyin.

## Yöre ve bölge yazıları

- Yalnızca yukarıdaki ilçeler. Her ilçe için ayrı, şablon kopyası yazılar üretmeyin; bir yazı bir bölgeyi anlatıyorsa gerçekten o bölgeye özgü
  ve doğru bilgi olsun (ör. "Gebze, Darıca ve Çayırova'da evde doğum günü") ya da hiç yazılmasın.
- Belirli mekân, mahalle önerisi ve mesafe/süre iddiası yok.

## Biçim

- Desteklenen markdown: `##`, `###`, paragraf, `-` ve `1.` listeler, `|` tablo (ikinci satır `|---|`), `**kalın**`, `*eğik*`, `[bağlantı](/#hizmetler)`, `> ` ipucu.
- Gövdede `#` (h1) yok.
- Dosya adı = adres: küçük harf, rakam, tire; Türkçe karakter yok (`ogretmenler-gunu-okul-etkinligi.md`).
- `date`: yayın günü (`YYYY-AA-GG`). Sonradan büyük değişiklik yapılırsa `updated` eklenir.

## Yayından önce kontrol

1. Başlık bir soru mu, kısa cevap tek başına anlaşılıyor mu?
2. İşletme hakkında yazılan her cümle "Kullanılabilecek kesin bilgiler"de var mı?
3. Fiyat, sayı, süre, belge, garanti, yorum, üstünlük iddiası yok mu?
4. İç bağlantılar yalnızca yayındaki sayfalara mı gidiyor?
5. `node tools/build.mjs` ve `node tools/check.mjs` → **0 hata**.
