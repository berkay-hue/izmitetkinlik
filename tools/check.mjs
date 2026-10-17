#!/usr/bin/env node
// izmitetkinlik.com denetleyicisi — yayından önce çalıştırın (önce tools/build.mjs).
// Yazıların ön bilgisini, üretilen sayfaları, bağlantıları ve sitede olmayan iddiaları denetler.
// HATA varsa 1 ile çıkar; Uyarı yalnızca bilgi verir.
// Kullanım: node tools/check.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, loadPosts, homeFacts, build, today } from "./build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://izmitetkinlik.com";
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// ---------- sitede olmayan iddialar ----------
// Sitede yazmayan hiçbir şeyi (fiyat, deneyim yılı, sayı, süre, kadro, belge, ödül, yorum/puan) yazılara koymayın.
// Kalıp gerçekten iddia değilse cümleyi değiştirin; listeyi gevşetmeyin.
const FORBIDDEN = [
  [/AggregateRating|ratingValue|reviewCount|"@type":\s*"Review"|"priceRange"|"price"\s*:/i, "puan, yorum ya da fiyat şeması"],
  [/\d[\d.,]*\s*(TL\b|₺|lira)|₺\s*\d|uygun\s+fiyatl[ıi]|(%\s*\d+|yüzde\s+\d+)\s*indirim/i, "fiyat"],
  [/\d+\s*\+?\s*yıl(lık|dır)?\s+(deneyim|tecrübe)|\d+\s*yıldır|yıllardır|yılların\s+(deneyim|tecrübe)|\d+\s*yılı\s+aşkın/i, "deneyim yılı"],
  [/\d+\s*\+\s*(mutlu\s+)?(etkinlik|çocuk|aile|müşteri|okul|kreş)|\d{3,}\s*(mutlu\s+)?(etkinli[kğ]|aile|müşteri|okul|kreş)|(binlerce|yüzlerce|onlarca)\s+(mutlu\s+)?(çocuk|aile|etkinlik|müşteri|okul)|mutlu\s+(müşteri|aile)/i, "etkinlik/çocuk/aile sayısı"],
  [/en\s+ucuz|uygun\s+fiyat\s+garanti|garanti(?!ye\s+al|le[mny])|kesinlikle\s+memnun|%\s*100|yüzde\s+yüz/i, "garanti ya da fiyat iddiası"],
  [/sertifika|lisanslı|belgeli|sigortalı|sigorta|pedagog|psikolog|çocuk\s+gelişim(ci|\s+uzman)|uzman\s+(kadro|ekip|eğitmen)|eğitimli\s+(kadro|ekip)/i, "belge, sigorta ya da uzmanlık iddiası"],
  [/ödül(ü|ler)?\s+(alan|kazan)|ödüllü(?!\s+(oyun|yarışma|yarış|etkinlik|soru|bulmaca))/i, "ödül iddiası"],
  [/hipoalerjenik|dermatolojik|alerji\s+yapmaz|toksik\s+değil|zararsız\s+boya|FDA|CE\s+belge/i, "boya/ürün güvenlik iddiası"],
  [/en\s+iyi\s+(palyaço|animatör|ekip|firma|hizmet|organizasyon)|bir\s+numara|1\s+numara|sektör(ün)?\s+lider|bölgenin\s+lider|lider\s+(firma|ekip)|(kocaeli|izmit|sakarya)'?\s*(n[ıi]n|in)\s+en\s+(iyi|büyük|çok)/i, "üstünlük iddiası"],
  [/müşteri\s+yorum|yorumlar[ıi]mız|referanslar[ıi]mız|velilerimiz\s+(diyor|ne\s+diyor)|★|⭐/i, "yorum/referans"],
  // "6 dk okuma" sayfa üst bilgisidir (build üretir), süre iddiası sayılmaz.
  [/\d+(?:[.,]\d+)?\s*(?:[–-]\s*\d+(?:[.,]\d+)?\s*)?(?:saat|dakika|dk\b)(?!\s*okuma)|\d+\s*kişilik\s+(?:ekip|kadro)|ekib(?:imiz|i)?\s+\d+\s*kişi/iu, "süre ya da kadro ayrıntısı"],
  [/güvenli\s+ve\s+(temiz|eğlence)|temiz\s+ortam|profesyonel\s+(hizmet|ekip|kadro)|her\s+yerdeyiz/i, "sitede olmayan güvence iddiası"],
  [/<img\b/i, "fotoğraf (çocuk fotoğrafı yayımlanmaz; görsel eklenecekse önce sorulur)"],
];

function scanClaims(where, text) {
  const plain = text.replace(/<!--[\s\S]*?-->/g, "");
  // "İ" gibi büyük Türkçe harfler /i ile küçüğüne eşlenmez; Türkçe küçük harfli kopyayı da tara.
  const lower = plain.toLocaleLowerCase("tr-TR");
  for (const [re, label] of FORBIDDEN) {
    const src = re.test(plain) ? plain : re.test(lower) ? lower : null;
    if (!src) continue;
    const m = src.match(re);
    const ctx = src.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, " ").trim();
    err(where, `sitede olmayan iddia (${label}): "…${ctx}…"`);
  }
}

// Sitede listelenmeyen yerler: yazıda geçerse uyarı (ana sayfa "listede olmayan ilçeler için de sorulabilir" der, söz vermez).
const OTHER_PLACES = ["Akyazı", "Ferizli", "Geyve", "Hendek", "Karapürçek", "Karasu", "Kaynarca", "Kocaali", "Pamukova", "Söğütlü", "Taraklı",
  "İstanbul", "Bursa", "Yalova", "Düzce", "Bolu", "Bilecik", "Ankara"];

// ---------- adres çözümleme ----------
function resolveFile(urlPath) {
  if (!urlPath || urlPath === "/") return exists("index.html") ? "index.html" : null;
  const clean = decodeURIComponent(urlPath.replace(/^\//, ""));
  if (clean.endsWith("/")) return exists(`${clean}index.html`) ? `${clean}index.html` : null;
  if (exists(clean) && fs.statSync(path.join(ROOT, clean)).isFile()) return clean;
  if (exists(`${clean}/index.html`)) return `${clean}/index.html`;
  return null;
}

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) idCache.set(file, new Set([...read(file).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idCache.get(file);
}

// ---------- yazılar: ön bilgi ----------
let all = [];
let loadFailed = false;
try {
  all = loadPosts({ includeHidden: true });
} catch (e) {
  loadFailed = true;
  err("content/blog", e.message);
}
let published = [];
try { published = loadPosts(); } catch { /* yukarıda raporlandı */ }
const publishedSlugs = new Set(published.map((p) => p.slug));
const allSlugs = new Map(all.map((p) => [p.slug, p]));
const now = (() => { try { return today(); } catch (e) { err("BUGUN", e.message); return "9999-12-31"; } })();

const titles = new Map();
for (const p of all) {
  const w = p.file;
  const hidden = p.draft || p.date > now;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) err(w, `dosya adı (slug) yalnızca küçük harf, rakam ve tire içermeli: "${p.slug}"`);
  if (p.slug.length > 80) warn(w, "dosya adı çok uzun (80 karakterden fazla)");
  if (typeof p.title !== "string" || p.title.length < 20) err(w, "title en az 20 karakter olmalı");
  else if (p.title.length > 60) err(w, `title ${p.title.length} karakter; en çok 60 olmalı (site adı eki hariç)`);
  const tkey = String(p.title).toLocaleLowerCase("tr-TR");
  if (titles.has(tkey)) err(w, `aynı başlık ${titles.get(tkey)} dosyasında da var`);
  titles.set(tkey, w);
  const dl = String(p.description).length;
  if (dl < 70 || dl > 155) err(w, `description ${dl} karakter; 70–155 arası olmalı`);
  const al = String(p.answer).length;
  if (al < 60) err(w, `answer (kısa cevap) ${al} karakter; en az 60 olmalı`);
  else if (al < 150 || al > 350) warn(w, `answer ${al} karakter; 150–350 arası olmalı`);
  if (!CATEGORIES[p.category]) err(w, `category geçersiz: ${p.category}`);
  if (!Array.isArray(p.faq) || p.faq.length < 3 || p.faq.length > 4) err(w, "faq 3–4 soru içermeli");
  else for (const f of p.faq) {
    if (typeof f?.q !== "string" || typeof f?.a !== "string") { err(w, "SSS maddesi { \"q\": \"…\", \"a\": \"…\" } biçiminde olmalı"); continue; }
    if (!/\?$/.test(f.q.trim())) err(w, `SSS sorusu soru işaretiyle bitmiyor: "${f.q}"`);
    if (f.a.length < 40) warn(w, `SSS cevabı çok kısa: "${f.q}"`);
  }
  if (p.updated && p.updated < p.date) err(w, "updated, date'ten önce olamaz");
  if (p.updated && p.updated > now) err(w, "updated bugünden sonra olamaz");
  if (p.words < 800 || p.words > 1400) warn(w, `${p.words} kelime; 800–1400 arası olmalı`);
  if (p.toc.length < 4 || p.toc.length > 7) warn(w, `${p.toc.length} adet "## " ara başlık var; 4–7 arası olmalı`);
  // GEO: ara başlıkların bir kısmı okurun soracağı soru biçiminde olmalı; son başlık kapanış (rezervasyon çağrısı).
  const questionH2 = p.toc.slice(0, -1).filter((t) => /\?$/.test(t.text.trim())).length;
  if (questionH2 < 2) err(w, `${questionH2} adet soru biçiminde "## " başlık var; en az 2 olmalı`);
  if (/^#{1,6} /m.test(p.body.split(/^## /m)[0])) err(w, "gövde \"## \" ara başlıkla başlamalı (giriş = answer)");
  if (/^## .*s[ıi]k sorulan/im.test(p.body)) err(w, "SSS gövdeye yazılmaz; front matter'daki faq'tan üretilir");
  const sentences = (p.answer || "").split(/[.!?…](\s|$)/).filter((x) => x && x.trim()).length;
  if (sentences > 3) warn(w, `answer ${sentences} cümle; başlıktaki soruyu ilk 2–3 cümlede cevaplamalı`);

  // Bağlantılar: gövde, kısa cevap ve SSS cevapları (hepsi sayfada ve llms-full.txt'de görünür).
  const linkText = [p.body, p.answer, ...(Array.isArray(p.faq) ? p.faq.map((f) => f.a) : [])].join("\n");
  for (const m of linkText.matchAll(/\]\(((?!\/)[^)\s]*)\)/g)) {
    err(w, `yalnızca site içi bağlantı (/ ile başlayan) verilir: ${m[1]}`);
  }
  const internal = new Set();
  for (const m of linkText.matchAll(/\]\((\/[^)\s]*)\)/g)) {
    const target = m[1];
    const [urlPath, hash] = target.split("#");
    const bm = urlPath.match(/^\/blog\/([^/]+)\/?$/);
    if (urlPath !== "/blog/" && urlPath !== "/blog") internal.add(target.replace(/\/$/, ""));
    if (bm) {
      const t = allSlugs.get(bm[1]);
      if (!t) { err(w, `bağlantı var olmayan yazıya gidiyor: ${target}`); continue; }
      if (!publishedSlugs.has(bm[1])) {
        // Yayındaki yazı, yayında olmayan yazıya bağlanamaz. Gizli yazı da kendisinden sonra çıkacak yazıya bağlanmasın.
        if (!hidden) { err(w, `bağlantı yayında olmayan yazıya gidiyor: ${target}`); continue; }
        if (t.draft || t.date > p.date) warn(w, `bağlantı verilen yazı (${bm[1]}) bu yazıdan önce yayına girmiyor; yayın sırasını kontrol edin`);
        continue;
      }
    }
    const file = resolveFile(urlPath || "/");
    if (!file) { err(w, `bağlantı var olmayan sayfaya gidiyor: ${target}`); continue; }
    if (hash && !idsOf(file).has(hash)) err(w, `bağlantıdaki #${hash} hedef sayfada yok: ${target}`);
  }
  if (internal.size < 2 || internal.size > 4) err(w, `${internal.size} farklı site içi bağlantı var (ana sayfa bölümü ya da başka yazı); 2–4 arası olmalı`);

  const text = [p.title, p.description, p.answer, p.body, ...(Array.isArray(p.faq) ? p.faq.flatMap((f) => [f.q, f.a]) : [])].join("\n");
  scanClaims(w, text);
  for (const place of OTHER_PLACES) {
    if (new RegExp(`(^|[^\\p{L}])${place}`, "u").test(text)) warn(w, `"${place}" sitede listelenen hizmet bölgelerinde yok; söz verir gibi yazılmasın`);
  }
}

// ---------- üretilen sayfalar ----------
const pages = ["index.html"];
if (exists("404.html")) pages.push("404.html");
if (exists("blog/index.html")) pages.push("blog/index.html");
if (exists("blog")) {
  for (const d of fs.readdirSync(path.join(ROOT, "blog"), { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    if (!loadFailed && !publishedSlugs.has(d.name)) err(`blog/${d.name}/`, "kaynağı olmayan ya da yayından kalkmış yazı klasörü; silin ya da yazıyı geri koyun");
    if (exists(`blog/${d.name}/index.html`)) pages.push(`blog/${d.name}/index.html`);
  }
}
for (const p of published) {
  if (!exists(`blog/${p.slug}/index.html`)) err(p.file, "yayında ama sayfası üretilmemiş; önce node tools/build.mjs çalıştırın");
}
// Üretilen her dosya kaynakla aynı mı? Kuru build hiçbir şey yazmaz, yalnızca değişecek dosyaları söyler.
if (!loadFailed) {
  try {
    for (const f of build({ dry: true }).written) err(f, "kaynakla uyuşmuyor; node tools/build.mjs çalıştırın");
  } catch (e) {
    err("tools/build.mjs", e.message);
  }
}

const seenTitles = new Map();
const seenDescs = new Map();
for (const page of pages) {
  const html = read(page);
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) err(page, `${h1} adet <h1> var; tam 1 olmalı`);
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  if (!title) err(page, "<title> yok");
  else {
    if (seenTitles.has(title)) err(page, `<title> ${seenTitles.get(title)} ile aynı`);
    seenTitles.set(title, page);
  }
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!desc) err(page, "meta description yok");
  else {
    if (seenDescs.has(desc)) err(page, `meta description ${seenDescs.get(desc)} ile aynı`);
    seenDescs.set(desc, page);
  }
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  const expected = `${SITE}/${page.replace(/index\.html$/, "")}`;
  if (canonical !== expected) err(page, `canonical "${canonical}" olmalıydı: "${expected}"`);
  if (!/<html lang="tr">/.test(html)) err(page, '<html lang="tr"> yok');

  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(json); } catch (e) { err(page, `JSON-LD okunamadı: ${e.message}`); }
  }
  if (!/application\/ld\+json/.test(html)) err(page, "JSON-LD yok");

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) err(page, `aynı id birden çok kez: ${[...new Set(dup)].join(", ")}`);

  for (const [, href] of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:)/.test(href)) continue;
    const [p, hash] = href.split("#");
    const file = p === "" ? page : resolveFile(p.startsWith("/") ? p : `/${path.posix.join(path.posix.dirname(page), p)}`);
    if (!file) { err(page, `kırık bağlantı: ${href}`); continue; }
    if (hash && !idsOf(file).has(hash)) err(page, `bağlantıdaki #${hash} hedef sayfada yok: ${href}`);
  }
  for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(m[0])) err(page, `target="_blank" bağlantıda rel="noopener" yok: ${m[0].slice(0, 80)}`);
  }
  for (const [, src] of html.matchAll(/<(?:script|link)\b[^>]*\s(?:src|href)="(\/[^"]+)"/g)) {
    if (!resolveFile(src.split("?")[0])) err(page, `eksik dosya: ${src}`);
  }
  for (const [, img] of html.matchAll(/<meta property="og:image" content="([^"]+)"/g)) {
    if (img.startsWith(SITE) && !resolveFile(img.slice(SITE.length))) err(page, `og:image dosyası yok: ${img}`);
  }

  scanClaims(page, html);
}

// ---------- llms.txt, sitemap, feed, robots ----------
for (const f of ["llms.txt", "llms-full.txt"]) {
  if (!exists(f)) { err(f, "yok; node tools/build.mjs çalıştırın"); continue; }
  const txt = read(f);
  scanClaims(f, txt);
  for (const [, url] of txt.matchAll(/\]\((https:\/\/izmitetkinlik\.com[^)\s]*)\)/g)) {
    const [p, hash] = url.slice(SITE.length).split("#");
    const file = resolveFile(p || "/");
    if (!file) err(f, `kırık bağlantı: ${url}`);
    else if (hash && !idsOf(file).has(hash)) err(f, `#${hash} hedef sayfada yok: ${url}`);
  }
}
if (exists("sitemap.xml")) {
  for (const [, loc] of read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)) {
    if (!loc.startsWith(SITE) || !resolveFile(loc.slice(SITE.length))) err("sitemap.xml", `sayfası olmayan adres: ${loc}`);
  }
} else err("sitemap.xml", "yok");
if (exists("feed.xml")) {
  const feed = read("feed.xml");
  if (!/<rss[\s\S]*<\/rss>\s*$/.test(feed)) err("feed.xml", "RSS yapısı bozuk");
  for (const [, link] of feed.matchAll(/<link>([^<]+)<\/link>/g)) {
    if (!resolveFile(link.slice(SITE.length))) err("feed.xml", `sayfası olmayan adres: ${link}`);
  }
  scanClaims("feed.xml", feed);
}
if (exists("robots.txt")) {
  const robots = read("robots.txt");
  if (!/Sitemap:\s*https:\/\/izmitetkinlik\.com\/sitemap\.xml/.test(robots)) err("robots.txt", "Sitemap satırı yok");
  if (/^\s*Disallow:\s*\/\s*$/m.test(robots)) err("robots.txt", "tüm siteyi kapatan Disallow: / var");
} else err("robots.txt", "yok");
for (const f of ["CNAME", ".nojekyll", "404.html", "assets/og.png", "assets/logo.png", "favicon.svg"]) {
  if (!exists(f)) err(f, "dosya yok");
}
const keyFiles = fs.readdirSync(ROOT).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (keyFiles.length !== 1) warn("IndexNow", `kök dizinde ${keyFiles.length} anahtar dosyası var; 1 olmalı`);
else if (read(keyFiles[0]).trim() !== keyFiles[0].replace(/\.txt$/, "")) err(keyFiles[0], "IndexNow anahtar dosyasının içeriği adıyla aynı olmalı");

// Ana sayfadan bilgi okunabiliyor mu (JSON-LD ve llms.txt buna dayanır)?
try {
  const facts = homeFacts(read("index.html"));
  if (!facts.services.length || !facts.faq.length || !facts.regions.length) err("index.html", "hizmet, SSS ya da bölge bilgisi okunamadı");
} catch (e) {
  err("index.html", e.message);
}

// ---------- sonuç ----------
for (const w of warnings) console.log(`Uyarı: ${w}`);
for (const e of errors) console.log(`HATA: ${e}`);
console.log(`${all.length} yazı (${published.length} yayında), ${pages.length} sayfa denetlendi: ${errors.length} hata, ${warnings.length} uyarı.`);
process.exit(errors.length ? 1 : 0);
