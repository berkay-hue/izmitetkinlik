#!/usr/bin/env node
// Günlük blog yazısı — .github/workflows/daily.yml her gün çalıştırır. Bağımlılık yok, Node 20+.
// content/konular.json'dan bugünün konusunu seçer, Claude'a content/YAZIM-REHBERI.md'ye göre yazdırır,
// content/blog/<slug>.md'yi yazar, konuyu "yayinlandi" yapar, build + check çalıştırır.
// check hata verirse hataları Claude'a verip bir kez daha dener; yine olmazsa her şeyi geri alır ve 1 ile çıkar.
// Günde en çok bir yazı: bugün tarihli yazı varsa hiçbir şey yapmaz.
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
  return { topic, rolled: [...new Set(rolled)], left: waiting.length - 1 };
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

Konunun "title" alanı taslaktır; rehberdeki uzunluk ve soru kuralına göre yeniden yazabilirsin. "faq" alanı taslak sorulardır.
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
const { topic, rolled, left } = pickTopic(data, day);
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
if (left < 14) console.log(`\nUyarı: sırada ${left} "bekliyor" konu kaldı; ${KONULAR}'a yeni konu ekleyin.`);
if (DRY) {
  restore();
  console.log("\n--dry: build ve check geçti, değişiklikler geri alındı.");
} else {
  console.log(`\nYazıldı: content/blog/${topic.slug}.md (build ve check geçti).`);
}
