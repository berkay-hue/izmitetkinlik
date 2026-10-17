#!/usr/bin/env node
// Günlük blog yazısı — .github/workflows/daily.yml her gün çalıştırır. Bağımlılık yok, Node 20+.
// content/konular.json'dan bugünün konusunu seçer, Claude'a content/YAZIM-REHBERI.md'ye göre yazdırır,
// content/blog/<slug>.md'yi yazar, konuyu "yayinlandi" yapar, build + check çalıştırır.
// check hata verirse hataları Claude'a verip bir kez daha dener; yine olmazsa her şeyi geri alır ve 1 ile çıkar.
// Günde en çok bir yazı: bugün tarihli yazı varsa hiçbir şey yapmaz.
// Sırada 14'ten az genel konu kalırsa Claude'a rehbere uyan yeni genel konular ürettirir, denetleyip konular.json'a ekler
// (konu üretimi başarısız olursa yazı yine yayınlanır, yalnızca uyarı çıkar).
//
// Kullanım:
//   node tools/daily.mjs          # yaz (ANTHROPIC_API_KEY gerekir)
//   node tools/daily.mjs --dry    # yazdır, build + check ile dene, geri al; başlık/answer/SSS'yi yazdır
// Ortam: BUGUN=2026-10-20 tarihi elle verir. DAILY_MOCK=<dosya.json> API yerine dosyadaki yanıtı kullanır
// (yalnızca yerel deneme; dosya tek yanıt ya da deneme başına yanıt listesi olabilir).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadPosts, today, CATEGORIES } from "./build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = "claude-opus-5-5";
const DRY = process.argv.includes("--dry");
const KONULAR = "content/konular.json";

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const git = (...a) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8" });
const fail = (msg) => { console.error(`HATA: ${msg}`); process.exit(1); };
const plusYear = (d) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;

// ---------- Claude ----------
// corner-sites/blog-worker ile aynı: akışlı istek (uzun yazılarda bağlantı açık kalsın), metin parçaları birleştirilir.
let mockCall = 0;
async function claude(prompt, maxTokens = 16000) {
  if (process.env.DAILY_MOCK) {
    const m = JSON.parse(fs.readFileSync(process.env.DAILY_MOCK, "utf8"));
    const r = Array.isArray(m) ? m[Math.min(mockCall++, m.length - 1)] : m;
    return typeof r === "string" ? r : JSON.stringify(r);
  }
  if (!process.env.ANTHROPIC_API_KEY) fail("ANTHROPIC_API_KEY tanımlı değil (repo secret).");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, stream: true, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Claude ${MODEL} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const dec = new TextDecoder();
  let raw = "";
  for await (const chunk of r.body) raw += dec.decode(chunk, { stream: true });
  raw += dec.decode();
  if (raw.includes('"type":"error"')) throw new Error(`Claude ${MODEL} akış hatası: ${raw.slice(raw.indexOf('"type":"error"'), raw.indexOf('"type":"error"') + 300)}`);
  const lits = [];
  for (const m of raw.matchAll(/"type":"text_delta","text":("(?:[^"\\]|\\.)*")/g)) lits.push(m[1]);
  const text = JSON.parse(`[${lits.join(",")}]`).join("");
  if (!text) throw new Error(`Claude ${MODEL} boş yanıt`);
  if ((raw.match(/"stop_reason":"(\w+)"/) || [])[1] === "max_tokens") throw new Error(`Claude ${MODEL} yanıtı yarıda kesildi (max_tokens)`);
  return text;
}

// Kelime sınırında kırpar; sondaki noktalama ve bağlaçları atar.
function clip(str, max) {
  let t = str.slice(0, max + 1);
  t = t.slice(0, t.lastIndexOf(" ") > 0 ? t.lastIndexOf(" ") : max);
  return t.replace(/[\s,;:–—-]+$/u, "").replace(/\s+(ve|ile|veya|ya da|için)$/iu, "").trim();
}

// check.mjs ile aynı sınırlar: title ≤60, description 70–155. Son denemede değilse
// hata atar (yeniden denenir); son denemede uzun alanı güvenli biçimde kırpar.
function checkLengths(o, last) {
  o.title = o.title.trim();
  o.description = o.description.trim();
  const errs = [];
  if (o.title.length > 60) errs.push(`title ${o.title.length} karakter; en çok 60 olmalı`);
  if (o.description.length > 155 || o.description.length < 70) errs.push(`description ${o.description.length} karakter; 70–155 arası olmalı`);
  if (!errs.length) return;
  if (!last) throw new Error(`Uzunluk sınırı aşıldı: ${errs.join("; ")}`);
  if (o.title.length > 60) {
    // Önce soru ya da iki nokta sonrası eki at ("...? Ek" / "Ana: Ek"), yoksa kelime sınırında kırp.
    const q = o.title.slice(0, 61).lastIndexOf("?");
    const c = o.title.slice(0, 61).lastIndexOf(":");
    o.title = q >= 19 ? o.title.slice(0, q + 1) : c >= 20 ? o.title.slice(0, c).trim() : clip(o.title, 60);
    console.log(`title kırpıldı: ${o.title}`);
  }
  if (o.description.length > 155) {
    const d = o.description.slice(0, 155);
    const end = Math.max(d.lastIndexOf(". "), d.lastIndexOf("? "), d.lastIndexOf("! "));
    o.description = end >= 69 ? d.slice(0, end + 1) : clip(o.description, 154) + ".";
    console.log(`description kırpıldı (${o.description.length})`);
  }
}

function parseReply(text) {
  let o;
  try { o = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); }
  catch { throw new Error(`Claude geçersiz JSON döndürdü: ${text.slice(0, 200)}`); }
  for (const k of ["title", "description", "answer", "body"]) if (typeof o[k] !== "string" || !o[k].trim()) throw new Error(`Claude yanıtında "${k}" yok.`);
  if (!Array.isArray(o.faq) || !o.faq.length || o.faq.some((f) => !f?.q || !f?.a)) throw new Error(`Claude yanıtında faq [{q, a}] listesi yok.`);
  return o;
}

// ---------- konu seçimi ----------
function pickTopic(data, day) {
  const waiting = data.konular.filter((k) => k.durum === "bekliyor");
  const rolled = [];
  // Mevsimlik konunun son_tarih'i geçtiyse yazılmaz; planlanan ve son_tarih bir yıl ileri alınır.
  for (const k of waiting) {
    while (k.son_tarih && k.son_tarih < day) {
      k.son_tarih = plusYear(k.son_tarih);
      k.planlanan = plusYear(k.planlanan);
      rolled.push(k.slug);
    }
  }
  const byPlan = [...waiting].sort((a, b) => a.planlanan.localeCompare(b.planlanan));
  // Tarihi gelmiş en eski konu; yoksa sıradaki konu öne alınır.
  const topic = byPlan.find((k) => k.planlanan <= day) || byPlan[0];
  return { topic, rolled: [...new Set(rolled)] };
}

// ---------- konu üretimi ----------
// Genel konu: son_tarih ve ay alanı olmayan, her yıl geçerli konu. bolge dışarıda: gerçek yer adı riski.
const MIN_GENEL = 14;
const HEDEF_GENEL = 28;
const ANCHORS = ["/#hizmetler", "/#etkinlikler", "/#okullar", "/#bolgeler", "/#sss", "/#iletisim"];
const YENI_KATEGORI = Object.keys(CATEGORIES).filter((c) => c !== "bolge");
const isGenel = (k) => k.durum === "bekliyor" && !k.son_tarih && !k.ay;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function topicsPrompt(data, day, n, fix) {
  const list = data.konular.map((k) => `- ${k.slug} [${k.durum}] ${k.title}`).join("\n");
  let s = `Sen izmitetkinlik.com (İzmit Palyaço Etkinlikleri) blogu için konu planlıyorsun. Bugün ${day}.

Aşağıdaki yazım rehberine uyan ${n} YENİ blog konusu öner. Konular, ebeveynlerin, okul ve kreş öğretmenlerinin gerçekten arattığı sorulara cevap versin.
Kurallar:
- Her yıl geçerli genel konular olsun: belirli bir tarihe, bayrama, mevsime ya da yıla bağlı olmasın.
- Mevcut konuların hiçbirini tekrar etme, yalnızca kelimelerini değiştirip aynı soruyu sorma.
- İşletme hakkında yalnızca rehberdeki "Kullanılabilecek kesin bilgiler"e dayan. Sitede olmayan hizmet, fiyat, süre, ekip ya da sertifika gerektiren konu önerme.
- Gerçek mekân, kurum, kişi, marka ya da işletme adı kullanma. Belirli bir ilçe ya da yer üzerine konu önerme. Tıbbi ya da hukuki tavsiye gerektiren konu önerme.
- category şunlardan biri: ${YENI_KATEGORI.join(", ")}. Çoğunluk dogum-gunu, rehber ve okul-kres olsun.
- link_targets: şunlardan 2–4 tanesi: ${ANCHORS.join(", ")}. Sonuncusu "/#iletisim" olsun.
- title: en çok 60 karakter, soru biçiminde, "?" ile biter. slug: title'ın küçük harf, Türkçe karaktersiz, tireli kısa hali (en çok 60 karakter).
- outline: 4–7 madde. faq: 3–4 kısa soru, her biri "?" ile biter. yazilmayacaklar: bu konuya özgü yazılmaması gereken iddialar.

<rehber>
${read("content/YAZIM-REHBERI.md")}
</rehber>

Mevcut konular (tekrar etme):
${list}

Yanıt olarak YALNIZCA bir JSON dizisi döndür (öncesinde ya da sonrasında metin, kod bloğu işareti yok):
[{"slug": "...", "title": "...?", "question": "...", "category": "...", "link_targets": ["/#..."], "outline": ["..."], "faq": ["...?"], "yazilmayacaklar": "..."}]`;
  if (fix) s += `\n\nÖnceki önerin şu hatalarla reddedildi:\n${fix.errors}\n\nÖnceki yanıtın:\n${fix.reply}\n\nHatalı konuları düzelt ya da yenisiyle değiştir ve ${n} konuluk tam diziyi yeniden döndür.`;
  return s;
}

function checkTopics(arr, data, n) {
  if (!Array.isArray(arr)) return ["Yanıt bir JSON dizisi değil."];
  const errs = [];
  const seen = new Set(data.konular.map((k) => k.slug));
  const titles = new Set(data.konular.map((k) => k.title.toLocaleLowerCase("tr")));
  if (arr.length < n) errs.push(`${n} konu istendi, ${arr.length} geldi.`);
  arr.forEach((k, i) => {
    const e = (m) => errs.push(`${i + 1}. konu (${k?.slug || "?"}): ${m}`);
    if (!k || typeof k !== "object") return e("nesne değil");
    if (typeof k.slug !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(k.slug) || k.slug.length > 60) e("slug küçük harf, rakam ve tire olmalı, en çok 60 karakter");
    else if (seen.has(k.slug) || fs.existsSync(path.join(ROOT, `content/blog/${k.slug}.md`))) e("slug zaten var");
    seen.add(k.slug);
    if (typeof k.title !== "string" || k.title.length > 60 || !k.title.trim().endsWith("?")) e("title en çok 60 karakter olmalı ve ? ile bitmeli");
    else if (titles.has(k.title.toLocaleLowerCase("tr"))) e("aynı başlık zaten var");
    if (typeof k.question !== "string" || !k.question.trim()) e("question yok");
    if (!YENI_KATEGORI.includes(k.category)) e(`category şunlardan biri olmalı: ${YENI_KATEGORI.join(", ")}`);
    if (!Array.isArray(k.link_targets) || k.link_targets.length < 2 || k.link_targets.length > 4 || k.link_targets.some((t) => !ANCHORS.includes(t)) || new Set(k.link_targets).size !== k.link_targets.length) e(`link_targets ${ANCHORS.join(", ")} arasından 2–4 farklı adres olmalı`);
    if (!Array.isArray(k.outline) || k.outline.length < 4 || k.outline.length > 7 || k.outline.some((o) => typeof o !== "string" || !o.trim())) e("outline 4–7 madde olmalı");
    if (!Array.isArray(k.faq) || k.faq.length < 3 || k.faq.length > 4 || k.faq.some((q) => typeof q !== "string" || !q.trim().endsWith("?"))) e("faq 3–4 soru olmalı, her biri ? ile bitmeli");
    if (typeof k.yazilmayacaklar !== "string" || !k.yazilmayacaklar.trim()) e("yazilmayacaklar yok");
    if ("son_tarih" in k || "ay" in k) e("genel konu son_tarih ya da ay içermez");
  });
  return errs;
}

// Konu listesini doldurur; eklenen konuların slug'larını döndürür, olmazsa hata fırlatır.
async function refillTopics(data, day) {
  const genel = data.konular.filter(isGenel);
  const n = HEDEF_GENEL - genel.length;
  let fix = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let text = "";
    let errs;
    let arr;
    try {
      text = await claude(topicsPrompt(data, day, n, fix));
      arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
      errs = checkTopics(arr, data, n);
    } catch (e) {
      errs = [e.message];
    }
    if (!errs.length) {
      let last = genel.map((k) => k.planlanan).sort().pop() || day;
      if (last < day) last = day;
      const added = arr.slice(0, n).map((k) => {
        last = addDays(last, 1);
        return { slug: k.slug, durum: "bekliyor", planlanan: last, title: k.title.trim(), question: k.question.trim(), category: k.category, link_targets: k.link_targets, outline: k.outline.map((o) => o.trim()), faq: k.faq.map((q) => q.trim()), yazilmayacaklar: k.yazilmayacaklar.trim(), kaynak: "otomatik" };
      });
      data.konular.push(...added);
      fs.writeFileSync(path.join(ROOT, KONULAR), JSON.stringify(data, null, 2) + "\n");
      return added;
    }
    console.log(`Konu üretimi deneme ${attempt}:\n${errs.join("\n")}`);
    fix = { errors: errs.join("\n"), reply: text.slice(0, 20000) };
  }
  throw new Error("İki denemede de geçerli konu listesi çıkmadı.");
}

// ---------- istem ----------
function prompt(topic, day, posts, fix) {
  const t = { ...topic };
  delete t.durum;
  const published = posts.map((p) => `- /blog/${p.slug}/ — ${p.title}`).join("\n") || "(henüz yok)";
  let s = `Sen izmitetkinlik.com (İzmit Palyaço Etkinlikleri) blogu için yazıyorsun. Bugün ${day}.

Aşağıdaki yazım rehberine harfiyen uy. Rehberdeki "Kullanılabilecek kesin bilgiler" dışında işletmeyle ilgili hiçbir bilgi yazma;
"Yazılmayacaklar" ve konunun "yazilmayacaklar" alanı kesin yasaktır. Konuda "duzeltme" notu varsa outline'dan önce gelir.
Gerçek mekân, kurum, kişi ya da işletme adı uydurma. Dış bağlantı verme.

<rehber>
${read("content/YAZIM-REHBERI.md")}
</rehber>

<konu>
${JSON.stringify(t, null, 2)}
</konu>

Yayındaki yazılar (yalnızca bunlara /blog/<slug>/ bağlantısı verebilirsin; listede olmayan yazıya bağlantı verme):
${published}

Konunun "title" alanı taslaktır. Yanıttaki "title" en fazla 60 karakter olmalı (site adı eki hariç) ve rehberdeki soru kuralına uymalı; "description" 70–155 karakter arası olmalı. Bu sınırlar zorunludur, aşan yanıt reddedilir. Taslak başlık uzunsa anlamını koruyarak kısalt. "faq" alanı taslak sorulardır.
Yazmadan önce rehberdeki kontrol listesini kafanda uygula ve dürüstlük açısından kendini denetle: sitede yazmayan bir iddia kalmasın.

Yanıt olarak YALNIZCA şu biçimde tek bir JSON nesnesi döndür (öncesinde ya da sonrasında hiçbir metin, kod bloğu işareti yok):
{"title": "...", "description": "...", "answer": "...", "faq": [{"q": "...?", "a": "..."}], "body": "## ...markdown gövde..."}
"body" ön bilgi içermez, "## " ile başlar ve son bölümü rehberdeki çağrı bölümüdür.`;
  if (fix) {
    s += `

Önceki denemen sitenin denetleyicisinden (tools/check.mjs) şu hatalarla döndü:
${fix.errors}

Önceki yanıtın:
${fix.reply}

Bu hataların hepsini gider, geri kalan kurallara uymaya devam et ve aynı biçimde tam JSON'u yeniden döndür.`;
  }
  return s;
}

// ---------- yazma, deneme, geri alma ----------
function restore() {
  git("checkout", "--", ".");
  git("clean", "-fdq", "--", "content/blog", "blog");
}

function run(script) {
  try {
    return { ok: true, out: execFileSync(process.execPath, [path.join(ROOT, "tools", script)], { cwd: ROOT, encoding: "utf8", stdio: "pipe" }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ""}${e.stderr || ""}` };
  }
}

function writePost(topic, day, reply, data) {
  const meta = { title: reply.title.trim(), description: reply.description.trim(), date: day, category: topic.category, answer: reply.answer.trim(), faq: reply.faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() })) };
  fs.writeFileSync(path.join(ROOT, `content/blog/${topic.slug}.md`), `---\n${JSON.stringify(meta, null, 2)}\n---\n\n${reply.body.trim()}\n`);
  topic.durum = "yayinlandi";
  topic.yayin = day;
  fs.writeFileSync(path.join(ROOT, KONULAR), JSON.stringify(data, null, 2) + "\n");
  return meta;
}

// ---------- ana akış ----------
const day = today();
const posts = loadPosts({ includeHidden: true });
const todays = posts.find((p) => p.date === day);
if (todays && !DRY) {
  console.log(`Bugün (${day}) zaten bir yazı var: ${todays.slug}. Günde en çok bir yazı — çıkılıyor.`);
  process.exit(0);
}
if (git("status", "--porcelain").trim()) fail("Çalışma ağacı temiz değil; geri alma güvenli olmadığı için durduruldu.");

const data = JSON.parse(read(KONULAR));
const { topic, rolled } = pickTopic(data, day);
if (!topic) fail(`${KONULAR}'da "bekliyor" konu kalmadı; yeni konu ekleyin.`);
if (!CATEGORIES[topic.category]) fail(`${topic.slug}: geçersiz category "${topic.category}".`);
if (fs.existsSync(path.join(ROOT, `content/blog/${topic.slug}.md`))) fail(`content/blog/${topic.slug}.md zaten var; konunun durumunu düzeltin.`);
if (rolled.length) console.log(`Son tarihi geçen mevsimlik konular bir yıl ileri alındı: ${rolled.join(", ")}`);
console.log(`Konu: ${topic.slug} (planlanan ${topic.planlanan}${topic.planlanan > day ? ", öne alındı" : ""}).`);

const live = loadPosts();
let fix = null;
let meta = null;
for (let attempt = 1; attempt <= 2; attempt++) {
  let text;
  let reply;
  try {
    text = await claude(prompt(topic, day, live, fix));
    reply = parseReply(text);
    checkLengths(reply, attempt === 2);
  } catch (e) {
    console.log(`Deneme ${attempt}: ${e.message}`);
    fix = { errors: e.message, reply: (text || "").slice(0, 20000) };
    continue;
  }
  meta = writePost(topic, day, reply, data);
  const b = run("build.mjs");
  const c = b.ok ? run("check.mjs") : b;
  if (b.ok && c.ok) break;
  const errors = c.out.split("\n").filter((l) => l.startsWith("HATA") || /Error|hata/.test(l)).join("\n") || c.out.slice(-2000);
  console.log(`Deneme ${attempt}: ${b.ok ? "check" : "build"} başarısız:\n${errors}`);
  restore();
  // writePost konu nesnesini değiştirdi; ikinci deneme yine "bekliyor" konudan başlasın.
  topic.durum = "bekliyor";
  delete topic.yayin;
  meta = null;
  fix = { errors, reply: text };
}

if (!meta) {
  restore();
  fail("İki denemede de geçerli yazı çıkmadı; hiçbir şey yazılmadı.");
}

console.log(`\nBaşlık: ${meta.title}\nAnswer: ${meta.answer}\nSSS:\n${meta.faq.map((f) => `- ${f.q}`).join("\n")}`);
const genelLeft = data.konular.filter(isGenel).length;
if (genelLeft < MIN_GENEL) {
  console.log(`\nSırada ${genelLeft} genel konu kaldı; ${HEDEF_GENEL - genelLeft} yeni konu üretiliyor.`);
  const before = data.konular.length;
  try {
    const added = await refillTopics(data, day);
    const c = run("check.mjs");
    if (!c.ok) throw new Error(`konular eklendikten sonra check başarısız:\n${c.out.slice(-2000)}`);
    console.log(`Eklenen konular:\n${added.map((k) => `- ${k.planlanan} ${k.title}`).join("\n")}`);
  } catch (e) {
    // Yazı geçerli; yalnızca konu dosyası eski haline döner.
    data.konular.length = before;
    fs.writeFileSync(path.join(ROOT, KONULAR), JSON.stringify(data, null, 2) + "\n");
    console.log(`::warning::Yeni konu eklenemedi: ${e.message}`);
  }
}
if (DRY) {
  restore();
  console.log("\n--dry: build ve check geçti, değişiklikler geri alındı.");
} else {
  console.log(`\nYazıldı: content/blog/${topic.slug}.md (build ve check geçti).`);
}
