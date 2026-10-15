#!/usr/bin/env node
// Değişen sayfaları IndexNow ile arama motorlarına (Bing, Yandex, Seznam, Naver…) hemen bildirir.
// Ücretsizdir, hesap gerektirmez; kök dizindeki <anahtar>.txt dosyası sitenin bize ait olduğunu kanıtlar.
//
// Kullanım:
//   node tools/indexnow.mjs --from-git <commit>   # <commit> ile HEAD arasında değişen sayfalar
//   node tools/indexnow.mjs --all                 # sitemap.xml'deki tüm adresler
//   node tools/indexnow.mjs https://izmitetkinlik.com/blog/... [...]
//   --dry   gönderme, yalnızca listele
//
// Göndermeden önce her adresin ve anahtar dosyasının canlıda açıldığını bekler (en çok ~5 dk),
// çünkü GitHub Pages yayını push'tan sonra 1–2 dakika sürer. --from-git ile canlı sayfanın
// HEAD'deki dosyayla bayt bayt aynı olmasını bekler (eski sürüm 200 dönse de yetmez).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://izmitetkinlik.com";
const HOST = "izmitetkinlik.com";
const ENDPOINT = "https://api.indexnow.org/indexnow";

const args = process.argv.slice(2);
const dry = args.includes("--dry");

const keyFile = fs.readdirSync(ROOT).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) {
  console.error("HATA: kök dizinde IndexNow anahtar dosyası (<32 hex>.txt) yok.");
  process.exit(1);
}
const key = keyFile.replace(/\.txt$/, "");

function fileToUrl(f) {
  if (f === "index.html") return `${SITE}/`;
  const m = f.match(/^(blog\/(?:[^/]+\/)?)index\.html$/);
  if (m) return `${SITE}/${m[1]}`;
  if (["llms.txt", "llms-full.txt"].includes(f)) return `${SITE}/${f}`;
  return null;
}

let urls = [];
const deleted = new Set();
const sourceOf = new Map(); // adres -> HEAD'deki dosya (--from-git)
if (args.includes("--all")) {
  urls = [...fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
} else if (args.includes("--from-git")) {
  const rev = args[args.indexOf("--from-git") + 1];
  if (!rev || rev.startsWith("--")) {
    console.error("HATA: --from-git için commit verin (ör. --from-git HEAD~1).");
    process.exit(1);
  }
  const out = execFileSync("git", ["-C", ROOT, "diff", "--name-status", "--no-renames", rev, "HEAD"], { encoding: "utf8" });
  for (const line of out.split("\n").filter(Boolean)) {
    const [status, f] = line.split("\t");
    const url = fileToUrl(f);
    if (!url) continue;
    urls.push(url);
    if (status === "D") deleted.add(url);
    else sourceOf.set(url, f);
  }
} else {
  urls = args.filter((a) => a.startsWith(`${SITE}/`));
}
urls = [...new Set(urls)];

if (!urls.length) {
  console.log("Bildirilecek sayfa yok.");
  process.exit(0);
}
console.log(`${urls.length} adres:\n${urls.map((u) => `  ${u}${deleted.has(u) ? " (silindi)" : ""}`).join("\n")}`);
if (dry) process.exit(0);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function live(url, check) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`, { redirect: "follow", cache: "no-store" });
      if (await check(res)) return true;
    } catch { /* ağ hatası: tekrar dene */ }
    await wait(10_000);
  }
  return false;
}

if (!(await live(`${SITE}/${keyFile}`, async (r) => r.ok && (await r.text()).trim() === key))) {
  console.error(`HATA: anahtar dosyası canlıda açılmıyor: ${SITE}/${keyFile}`);
  process.exit(1);
}
for (const url of urls) {
  const f = sourceOf.get(url);
  const expected = f ? execFileSync("git", ["-C", ROOT, "show", `HEAD:${f}`], { maxBuffer: 256 * 1024 * 1024 }) : null;
  const ok = await live(url, async (r) => {
    if (deleted.has(url)) return r.status === 404;
    if (!r.ok) return false;
    return expected ? Buffer.from(await r.arrayBuffer()).equals(expected) : true;
  });
  if (!ok) {
    console.error(`HATA: ${url} canlıda ${deleted.has(url) ? "hâlâ açılıyor" : "açılmıyor ya da yeni sürüm henüz çıkmadı"}; bildirim yapılmadı.`);
    process.exit(1);
  }
}

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key, keyLocation: `${SITE}/${keyFile}`, urlList: urls }),
});
const body = (await res.text()).slice(0, 300);
if (res.status === 200 || res.status === 202) {
  console.log(`IndexNow tamam (${res.status}).`);
} else {
  console.error(`HATA: IndexNow ${res.status} döndü. ${body}`);
  process.exit(1);
}
