#!/usr/bin/env node
// izmitetkinlik.com üreticisi — bağımlılık yok, Node 18+.
// content/blog/*.md → blog/<slug>/index.html, blog/index.html, feed.xml, sitemap.xml,
// llms.txt, llms-full.txt; ayrıca index.html içindeki işaretli bölgeleri (JSON-LD, son yazılar) günceller.
// Kullanım: node tools/build.mjs        (BUGUN=2026-10-20 ile tarih elle verilebilir)

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://izmitetkinlik.com";
const NAME = "İzmit Palyaço Etkinlikleri";
const IG = "https://www.instagram.com/izmit_palyaco_etkinlikleri/";
const IG_DM = "https://ig.me/m/izmit_palyaco_etkinlikleri";
const ORG_ID = `${SITE}/#isletme`;
const OG_IMAGE = `${SITE}/assets/og.png`;
const LOGO = `${SITE}/assets/logo.png`;

export const CATEGORIES = {
  "dogum-gunu": "Doğum Günü",
  "okul-kres": "Okul & Kreş",
  "sunnet-dugun": "Sünnet & Düğün",
  "ozel-gun": "Özel Günler",
  "hizmet": "Hizmetler",
  "bolge": "Bölgeler",
  "rehber": "Rehber",
};
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GENERATED = "<!-- Bu dosya tools/build.mjs ile üretilir; elle düzenlemeyin. -->";

// ---------- yardımcılar ----------
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const written = [];
let DRY = false;
function write(p, content) {
  const full = path.join(ROOT, p);
  const old = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
  if (old === content) return;
  if (DRY) { written.push(p); return; }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  written.push(p);
}

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const decode = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&hellip;/g, "…").replace(/&amp;/g, "&");
const stripTags = (s) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const jsonLd = (obj) => `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, "\\u003c")}\n</script>`;

export function slugify(text) {
  const map = { ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
  return text.toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]|i̇/g, (c) => map[c] || c)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function today() {
  if (process.env.BUGUN) {
    if (!isDay(process.env.BUGUN)) throw new Error(`BUGUN geçerli bir YYYY-AA-GG tarihi olmalı: "${process.env.BUGUN}"`);
    return process.env.BUGUN;
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export const trDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const rfc822 = (iso) => new Date(`${iso}T09:00:00+03:00`).toUTCString();

// ---------- markdown (kısıtlı alt küme) ----------
// Desteklenen: ## / ### başlık, paragraf, - ve 1. listeler, > not kutusu, | tablo |, **kalın**, *eğik*, [bağlantı](/yol)
function inline(src) {
  let out = esc(src);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const external = /^https?:\/\//.test(url) && !url.startsWith(SITE);
    return `<a href="${url}"${external ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>");
  return out;
}
// Markdown satırının düz metni (şema ve özetler için): bağlantı ve vurgu işaretleri kalkar.
const plain = (s) => decode(inline(s).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

export function markdown(src, slug = "") {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  const toc = [];
  const ids = new Set(["sss", "icerik", "ust", "menu", "sss-baslik", "ilgili-baslik"]);
  const isBlockStart = (l) => /^(#{1,6}\s|>\s?|\s*[-*]\s+|\s*\d+[.)]\s+|\|)/.test(l);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.+?)\s*#*$/))) {
      const level = m[1].length;
      if (level === 1) throw new Error(`${slug}: gövdede "# " başlığı kullanılamaz (h1 başlıktan gelir); "## " kullanın.`);
      if (level > 3) throw new Error(`${slug}: en fazla "### " başlık kullanılabilir.`);
      let id = slugify(m[2].replace(/[*_`]/g, "")) || "bolum";
      while (ids.has(id)) id += "-2";
      ids.add(id);
      if (level === 2) toc.push({ id, text: m[2].replace(/\*\*/g, "") });
      html.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      const paras = buf.join("\n").split(/\n\s*\n/).map((p) => `<p>${inline(p.replace(/\n/g, " ").trim())}</p>`);
      html.push(`<aside class="tip">${paras.join("")}</aside>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
      const items = [];
      while (i < lines.length && lines[i].trim()) {
        if (re.test(lines[i])) items.push(lines[i].replace(re, ""));
        else if (/^\s+\S/.test(lines[i]) && items.length) items[items.length - 1] += " " + lines[i].trim();
        else break;
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((t) => `<li>${inline(t.trim())}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (rows.length < 2 || !/^\|?\s*:?-{3,}/.test(rows[1])) throw new Error(`${slug}: tablo başlık satırı ve |---| ayırıcı satırı ister.`);
      const head = cells(rows[0]).map((c) => `<th scope="col">${inline(c)}</th>`).join("");
      const body = rows.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("");
      html.push(`<div class="table-wrap" tabindex="0" role="region" aria-label="Tablo (yana kaydırılabilir)"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !(buf.length && isBlockStart(lines[i]))) buf.push(lines[i++].trim());
    html.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return { html: html.join("\n"), toc };
}

// ---------- içerik ----------
const REQUIRED = ["title", "description", "date", "category", "answer", "faq"];

export function parsePost(file, raw) {
  const slug = path.basename(file, ".md");
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: dosya "---" arasında JSON ön bilgiyle başlamalı.`);
  let meta;
  try { meta = JSON.parse(m[1]); } catch (e) { throw new Error(`${file}: ön bilgi geçerli JSON değil (${e.message}).`); }
  for (const k of REQUIRED) if (meta[k] === undefined || meta[k] === "") throw new Error(`${file}: "${k}" alanı eksik.`);
  if (!isDay(meta.date)) throw new Error(`${file}: date geçerli bir YYYY-AA-GG tarihi olmalı.`);
  if (meta.updated && !isDay(meta.updated)) throw new Error(`${file}: updated geçerli bir YYYY-AA-GG tarihi olmalı.`);
  if (!CATEGORIES[meta.category]) throw new Error(`${file}: category şunlardan biri olmalı: ${Object.keys(CATEGORIES).join(", ")}.`);
  if (!Array.isArray(meta.faq) || meta.faq.some((f) => !f.q || !f.a)) throw new Error(`${file}: faq [{"q": "...", "a": "..."}] listesi olmalı.`);
  const body = m[2].trim();
  const { html, toc } = markdown(body, slug);
  const words = body.replace(/[#>*|\-\[\]()]/g, " ").split(/\s+/).filter(Boolean).length;
  return {
    ...meta,
    slug,
    body,
    html,
    toc,
    words,
    minutes: Math.max(1, Math.round(words / 200)),
    modified: meta.updated && meta.updated > meta.date ? meta.updated : meta.date,
    url: `${SITE}/blog/${slug}/`,
    path: `/blog/${slug}/`,
  };
}

export function loadPosts({ includeHidden = false } = {}) {
  const dir = path.join(ROOT, "content/blog");
  if (!fs.existsSync(dir)) return [];
  const now = today();
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ ...parsePost(`content/blog/${f}`, fs.readFileSync(path.join(dir, f), "utf8")), file: `content/blog/${f}` }))
    .filter((p) => includeHidden || (!p.draft && p.date <= now))
    .sort((a, b) => (b.date + b.slug).localeCompare(a.date + a.slug));
}

// ---------- ana sayfadan bilgi çıkarma (tek kaynak: görünen içerik) ----------
function section(html, id) {
  const at = html.indexOf(`id="${id}"`);
  if (at < 0) return "";
  return html.slice(html.lastIndexOf("<section", at), html.indexOf("</section>", at));
}
function pairs(html) {
  return [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => ({ name: stripTags(m[1]), text: stripTags(m[2]) }));
}
function siteSettings() {
  const js = read("assets/main.js");
  const get = (k) => (js.match(new RegExp(`const ${k} = "([^"]*)"`)) || [])[1] || "";
  const wa = get("WHATSAPP").replace(/\D/g, "");
  return { whatsapp: wa, phone: get("PHONE").trim() };
}
export function homeFacts(html) {
  const regions = [...section(html, "bolgeler").matchAll(/<div class="region">[\s\S]*?<h3>[\s\S]*?(?:<\/span>)?([^<>]+)<\/h3>[\s\S]*?<ul class="chips">([\s\S]*?)<\/ul>/g)]
    .map((m) => ({ name: m[1].trim(), places: [...m[2].matchAll(/<li>([^<]+)<\/li>/g)].map((x) => x[1].trim()) }));
  const faq = [...section(html, "sss").matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
    .map((m) => ({ q: stripTags(m[1]), a: stripTags(m[2]) }));
  const description = decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "");
  return { description, services: pairs(section(html, "hizmetler")), events: pairs(section(html, "etkinlikler")), regions, faq, ...siteSettings() };
}

// Ana sayfa <main> içeriğini düz metne (markdown) çevirir; form ve üretilen blog bölümü hariç.
function homeToMarkdown(html) {
  let main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  main = main
    .replace(/<!-- BLOG:BASLA -->[\s\S]*?<!-- BLOG:BITIR -->/, "")
    .replace(/<form[\s\S]*?<\/form>/g, "")
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<(li|div|p)[^>]*\shidden[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<p class="eyebrow">[\s\S]*?<\/p>/g, "")
    .replace(/<a\b[^>]*class="btn[^"]*"[^>]*>[\s\S]*?<\/a>/g, "")
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, (_, t) => `\n\n# ${stripTags(t)}\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (_, t) => `\n\n## ${stripTags(t)}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, (_, t) => `\n\n### ${stripTags(t)}\n\n`)
    .replace(/<summary>([\s\S]*?)<\/summary>/g, (_, t) => `\n\n### ${stripTags(t)}\n\n`)
    .replace(/<strong>([\s\S]*?)<\/strong>/g, (_, t) => `**${stripTags(t)}** `)
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<\/(p|div|li|ul|ol|header|article|details)>/g, "\n")
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, " ");
  return decode(main)
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter((l, i, a) => l || (a[i - 1] && a[i - 1].trim()))
    .join("\n").replace(/\n{3,}/g, "\n\n").replace(/^- \n/gm, "").trim();
}

// ---------- ortak şablon ----------
const NAV = [
  ["/#hizmetler", "Hizmetler"],
  ["/#etkinlikler", "Etkinlikler"],
  ["/#okullar", "Okullar"],
  ["/#bolgeler", "Bölgeler"],
  ["/#sss", "SSS"],
  ["/galeri/", "Galeri"],
  ["/hakkimizda/", "Hakkımızda"],
  ["/blog/", "Blog"],
];

function head({ title, description, url, type = "website", extra = "", graph, robots = "index, follow, max-snippet:-1, max-image-preview:large" }) {
  return `<!doctype html>
<html lang="tr">
<head>
  ${GENERATED}
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="${robots}">
  <meta name="theme-color" content="#e63946">
  <meta name="color-scheme" content="light">

  <meta property="og:type" content="${type}">
  <meta property="og:locale" content="tr_TR">
  <meta property="og:site_name" content="${NAME}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${NAME} logosu ve Kocaeli–Sakarya palyaço ve animatör yazısı">
  <meta name="twitter:card" content="summary_large_image">
${extra}
  <link rel="alternate" type="application/rss+xml" title="${NAME} Blog" href="${SITE}/feed.xml">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/style.css">

  ${jsonLd(graph).replace(/\n/g, "\n  ")}
</head>`;
}

function header(current, kind = "page") {
  const links = NAV.map(([href, label]) => `        <a href="${href}"${href === current ? ` aria-current="${kind}"` : ""}>${label}</a>`).join("\n");
  return `<body>
  <a class="skip" href="#icerik">İçeriğe geç</a>

  <header class="site-header" id="ust">
    <div class="wrap header-inner">
      <a class="brand" href="/" aria-label="${NAME} ana sayfa">
        <svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="22" fill="#ffc23d"/>
          <circle cx="24" cy="26" r="9" fill="#e63946"/>
          <circle cx="21" cy="23" r="2.6" fill="#fff" opacity=".85"/>
        </svg>
        <span class="brand-text">
          <strong>İzmit Palyaço</strong>
          <small>Etkinlikleri</small>
        </span>
      </a>

      <button class="nav-toggle" aria-expanded="false" aria-controls="menu">
        <span class="sr">Menüyü aç</span>
        <span class="bars" aria-hidden="true"></span>
      </button>

      <nav id="menu" class="nav" aria-label="Ana menü">
${links}
        <a class="btn btn-sm btn-red" href="/#iletisim">Rezervasyon</a>
      </nav>
    </div>
  </header>
`;
}

const FOOTER = `
  <footer class="site-footer">
    <div class="wrap footer-inner">
      <div>
        <strong>${NAME}</strong>
        <p>Kocaeli ve Sakarya bölgelerine palyaço &amp; animatör hizmeti.</p>
      </div>
      <nav aria-label="Alt menü">
        <a href="/#hizmetler">Hizmetler</a>
        <a href="/#etkinlikler">Etkinlikler</a>
        <a href="/#okullar">Okullar</a>
        <a href="/galeri/">Galeri</a>
        <a href="/hakkimizda/">Hakkımızda</a>
        <a href="/blog/">Blog</a>
        <a href="/#iletisim">Rezervasyon</a>
        <a href="${IG}" target="_blank" rel="noopener">Instagram</a>
      </nav>
      <p class="copy">© <span data-year>2026</span> izmitetkinlik.com</p>
    </div>
  </footer>

  <a class="fab" href="/#iletisim" aria-label="Rezervasyon yap">
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    Rezervasyon
  </a>

  <script src="/assets/main.js" defer></script>
</body>
</html>
`;

const ORG_REF = { "@type": "EntertainmentBusiness", "@id": ORG_ID, name: NAME, url: `${SITE}/` };
const crumbs = (items) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, ...(item ? { item } : {}) })),
});
const faqLd = (faq) => ({
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

function postCard(p, level = "h3") {
  return `<article class="post-card">
          <p class="post-card-meta"><span class="tag tag-cat">${esc(CATEGORIES[p.category])}</span><time datetime="${p.date}">${trDate(p.date)}</time></p>
          <${level}><a href="${p.path}">${esc(p.title)}</a></${level}>
          <p>${esc(p.description)}</p>
        </article>`;
}

// Yazı içi SSS: her soru görünür bir ### başlık (yapay zeka ve arama motorları için açık soru-cevap).
function postFaqHtml(faq) {
  return faq.map((f) => `          <h3>${esc(f.q)}</h3>
          <p>${inline(f.a)}</p>`).join("\n");
}

// Gövdeyi son "## " bölümünden (kapanış / rezervasyon çağrısı) önce ikiye ayırır; SSS araya girer.
function splitBeforeLast(text, marker) {
  const i = text.lastIndexOf(marker);
  return i > 0 ? [text.slice(0, i).trimEnd(), text.slice(i)] : [text, ""];
}

function faqHtml(faq) {
  return faq.map((f) => `          <details>
            <summary>${esc(f.q)}</summary>
            <p>${inline(f.a)}</p>
          </details>`).join("\n");
}

// ---------- sayfalar ----------
function renderPost(p, all) {
  const related = [
    ...all.filter((x) => x.slug !== p.slug && x.category === p.category),
    ...all.filter((x) => x.slug !== p.slug && x.category !== p.category),
  ].slice(0, 3);
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${p.url}#yazi`,
        mainEntityOfPage: p.url,
        url: p.url,
        headline: p.title,
        description: p.description,
        abstract: plain(p.answer),
        datePublished: p.date,
        dateModified: p.modified,
        inLanguage: "tr-TR",
        articleSection: CATEGORIES[p.category],
        wordCount: p.words,
        image: OG_IMAGE,
        author: ORG_REF,
        publisher: { ...ORG_REF, logo: { "@type": "ImageObject", url: LOGO } },
        isPartOf: { "@type": "Blog", "@id": `${SITE}/blog/#blog`, name: `${NAME} Blog` },
      },
      crumbs([["Ana sayfa", `${SITE}/`], ["Blog", `${SITE}/blog/`], [p.title]]),
      faqLd(p.faq.map((f) => ({ q: f.q, a: plain(f.a) }))),
    ],
  };
  const extra = [
    `  <meta property="article:published_time" content="${p.date}">`,
    `  <meta property="article:modified_time" content="${p.modified}">`,
    `  <meta property="article:section" content="${esc(CATEGORIES[p.category])}">`,
  ].join("\n");
  const tocItems = [...p.toc.slice(0, -1), { id: "sss-baslik", text: "Sık sorulan sorular" }, ...p.toc.slice(-1)];
  const [bodyMain, bodyEnd] = splitBeforeLast(p.html, "<h2");
  const toc = p.toc.length >= 3
    ? `
        <nav class="toc" aria-label="Bu yazıda">
          <strong>Bu yazıda</strong>
          <ol>${tocItems.map((t) => `<li><a href="#${t.id}">${inline(t.text)}</a></li>`).join("")}</ol>
        </nav>`
    : "";
  const updated = p.modified !== p.date ? ` · Güncellendi: <time datetime="${p.modified}">${trDate(p.modified)}</time>` : "";
  return `${head({ title: `${p.title} | ${NAME}`, description: p.description, url: p.url, type: "article", extra, graph })}
${header("/blog/", "true")}
  <main id="icerik">
    <article class="post">
      <div class="wrap narrow">
        <nav class="crumbs" aria-label="Sayfa yolu">
          <ol><li><a href="/">Ana sayfa</a></li><li><a href="/blog/">Blog</a></li><li aria-current="page">${esc(p.title)}</li></ol>
        </nav>

        <header class="post-head">
          <span class="tag tag-cat">${esc(CATEGORIES[p.category])}</span>
          <h1>${esc(p.title)}</h1>
          <p class="post-meta"><time datetime="${p.date}">${trDate(p.date)}</time>${updated} · ${p.minutes} dk okuma · ${NAME}</p>
        </header>

        <div class="answer">
          <strong>Kısa cevap</strong>
          <p>${inline(p.answer)}</p>
        </div>
${toc}
        <div class="prose">
${bodyMain}
        </div>

        <section class="post-faq prose" aria-labelledby="sss-baslik">
          <h2 id="sss-baslik">Sık sorulan sorular</h2>
${postFaqHtml(p.faq)}
        </section>
${bodyEnd ? `
        <div class="prose">
${bodyEnd}
        </div>
` : ""}
        <aside class="cta-box">
          <h2>Etkinliğiniz için tarih ayıralım</h2>
          <p>Tarih, yer, çocuk sayısı ve yaş aralığını yazın; size uygun programı ve fiyatı iletelim. Hizmet verdiğimiz ilçeler için <a href="/#bolgeler">bölgeler</a> bölümüne bakın.</p>
          <div class="cta-row">
            <a class="btn btn-red" href="/#iletisim">Rezervasyon formu</a>
            <a class="btn btn-ig" data-ig-dm href="${IG_DM}" target="_blank" rel="noopener">Instagram'dan yaz</a>
          </div>
        </aside>
${related.length ? `
        <section class="related" aria-labelledby="ilgili-baslik">
          <h2 id="ilgili-baslik">Bunlar da işinize yarayabilir</h2>
          <div class="post-cards">
        ${related.map((r) => postCard(r)).join("\n        ")}
          </div>
        </section>` : ""}
      </div>
    </article>
  </main>
${FOOTER}`;
}

function renderBlogIndex(posts) {
  const url = `${SITE}/blog/`;
  const description = "Kocaeli ve Sakarya'da doğum günü, okul şenliği, sünnet düğünü ve özel günler için palyaço ve animatör rehberi: planlama, oyun fikirleri ve sık sorulan sorular.";
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Blog",
        "@id": `${url}#blog`,
        url,
        name: `${NAME} Blog`,
        description,
        inLanguage: "tr-TR",
        publisher: ORG_REF,
        blogPost: posts.map((p) => ({ "@type": "BlogPosting", "@id": `${p.url}#yazi`, headline: p.title, url: p.url, datePublished: p.date, dateModified: p.modified })),
      },
      crumbs([["Ana sayfa", `${SITE}/`], ["Blog"]]),
    ],
  };
  const list = posts.length
    ? `<div class="post-cards">
        ${posts.map((p) => postCard(p, "h2")).join("\n        ")}
        </div>`
    : `<p class="note"><strong>Yazılar yolda</strong>İlk yazılarımız çok yakında burada olacak.</p>`;
  return `${head({ title: `Blog: Çocuk Etkinliği Rehberi | ${NAME}`, description, url, graph })}
${header("/blog/")}
  <main id="icerik">
    <section class="section blog-list">
      <div class="wrap">
        <nav class="crumbs" aria-label="Sayfa yolu">
          <ol><li><a href="/">Ana sayfa</a></li><li aria-current="page">Blog</li></ol>
        </nav>
        <header class="section-head">
          <p class="eyebrow">Blog</p>
          <h1>Çocuk etkinliği rehberi</h1>
          <p>Doğum günü, okul şenliği, sünnet düğünü ve özel günler için planlama ipuçları. Kocaeli ve Sakarya'daki aileler ve okullar için.</p>
        </header>
        ${list}
      </div>
    </section>
  </main>
${FOOTER}`;
}

function renderHomeBlog(posts) {
  if (!posts.length) return "";
  return `
    <section class="section section-tint" id="blog">
      <div class="wrap">
        <header class="section-head">
          <p class="eyebrow">Blog</p>
          <h2>Etkinlik planlarken işinize yarayacak yazılar</h2>
          <p>Doğum günü, okul şenliği ve özel günler için pratik rehberler.</p>
        </header>
        <div class="post-cards">
        ${posts.slice(0, 3).map((p) => postCard(p)).join("\n        ")}
        </div>
        <p class="more"><a class="btn btn-ghost" href="/blog/">Tüm yazılar</a></p>
      </div>
    </section>
    `;
}

function homeGraph(facts) {
  const business = {
    "@type": "EntertainmentBusiness",
    "@id": ORG_ID,
    name: NAME,
    url: `${SITE}/`,
    description: "Kocaeli ve Sakarya'da palyaço ve animatör hizmeti: doğum günü, sünnet, düğün, okul ve özel gün etkinlikleri.",
    image: OG_IMAGE,
    logo: LOGO,
    address: { "@type": "PostalAddress", addressLocality: "İzmit", addressRegion: "Kocaeli", addressCountry: "TR" },
    areaServed: facts.regions.flatMap((r) => [
      { "@type": "AdministrativeArea", name: r.name },
      ...r.places.map((pl) => ({ "@type": "City", name: `${pl}, ${r.name}` })),
    ]),
    knowsLanguage: "tr",
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Hizmetler",
      itemListElement: facts.services.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s.name, description: s.text } })),
    },
    sameAs: [IG],
  };
  if (facts.phone) business.telephone = facts.phone;
  return {
    "@context": "https://schema.org",
    "@graph": [
      business,
      { "@type": "WebSite", "@id": `${SITE}/#site`, url: `${SITE}/`, name: NAME, inLanguage: "tr-TR", publisher: { "@id": ORG_ID } },
      { ...faqLd(facts.faq), "@id": `${SITE}/#sss` },
    ],
  };
}

function replaceBetween(html, start, end, content, file) {
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < a) throw new Error(`${file}: ${start} … ${end} işaretleri bulunamadı.`);
  return html.slice(0, a + start.length) + content + html.slice(b);
}

// ---------- llms.txt ----------
function contactLines(facts) {
  const lines = [`- Instagram: ${IG} (mesaj: ${IG_DM})`, `- Rezervasyon formu: ${SITE}/#iletisim (form, talebi bize gönderir; bilgileri hazır bir mesaja da çevirir)`];
  if (facts.whatsapp) lines.push(`- WhatsApp: https://wa.me/${facts.whatsapp}`);
  if (facts.phone) lines.push(`- Telefon: ${facts.phone}`);
  return lines.join("\n");
}

function renderLlms(facts, posts) {
  const regions = facts.regions.map((r) => `${r.name} (${r.places.join(", ")})`).join("; ");
  return `# ${NAME}

> ${facts.description}

${NAME}, Kocaeli ve Sakarya'da çocuk etkinlikleri için palyaço ve animatör ekibidir. Doğum günü, sünnet düğünü, düğün, nişan, okul ve kreş etkinlikleri, açılışlar ve özel günler için program hazırlar.

- Hizmetler: ${facts.services.map((s) => s.name).join(", ")}
- Etkinlik türleri: ${facts.events.map((e) => e.name).join(", ")}
- Hizmet bölgeleri: ${regions}. Listede olmayan ilçeler için de sorulabilir.
- Fiyat: Sabit fiyat listesi yoktur; fiyat etkinlik süresine, çocuk sayısına, seçilen hizmetlere ve konuma göre verilir.
- Hizmetler tek tek ya da bir arada alınabilir.
${contactLines(facts)}

## Ana sayfa

- [Ana sayfa](${SITE}/): Hizmetler, etkinlik türleri, okul paketleri, bölgeler, sık sorulan sorular ve rezervasyon formu
- [Hizmetler](${SITE}/#hizmetler): ${facts.services.map((s) => s.name).join(", ")}
- [Etkinlik türleri](${SITE}/#etkinlikler): ${facts.events.map((e) => e.name).join(", ")}
- [Okullar ve kreşler](${SITE}/#okullar): Sınıfa özel ve tüm okula özel programlar
- [Hizmet bölgeleri](${SITE}/#bolgeler): Kocaeli ve Sakarya ilçeleri
- [Sık sorulan sorular](${SITE}/#sss): ${facts.faq.map((f) => f.q).join(" · ")}
- [Rezervasyon](${SITE}/#iletisim): Tarih, yer, çocuk sayısı ve yaş aralığıyla rezervasyon mesajı

## Blog

${posts.length ? posts.map((p) => `- [${p.title}](${p.url}): ${p.description}`).join("\n") : "- Henüz yazı yok."}

## Optional

- [Tüm içerik tek dosyada](${SITE}/llms-full.txt): Ana sayfa metni ve tüm blog yazıları
- [Blog listesi](${SITE}/blog/)
- [RSS](${SITE}/feed.xml)
`;
}

// Markdown içindeki site içi bağlantıları tam adrese çevirir.
const abs = (s) => s.replace(/\]\(\//g, `](${SITE}/`);

function renderLlmsFull(html, facts, posts) {
  const parts = [
    `# ${NAME} — tüm içerik`,
    `> ${facts.description}`,
    `Kaynak: ${SITE}/ · Bu dosya sitedeki metnin düz hâlidir ve her yayında yeniden üretilir.`,
    `## İletişim\n\n${contactLines(facts)}`,
    `---\n\n# Ana sayfa (${SITE}/)\n\n${homeToMarkdown(html).replace(/^# /m, "## ").replace(/^(#{2,3}) /gm, (m, h) => (h === "##" ? "## " : "### "))}`,
  ];
  for (const p of posts) {
    parts.push(`---

# ${p.title}

URL: ${p.url}
Yayın: ${p.date}${p.modified !== p.date ? ` · Güncelleme: ${p.modified}` : ""} · Kategori: ${CATEGORIES[p.category]}

**Kısa cevap:** ${abs(p.answer)}

${(() => {
  const [main, end] = splitBeforeLast(abs(p.body), "\n## ");
  return `${main}

## Sık sorulan sorular

${p.faq.map((f) => `### ${f.q}\n\n${abs(f.a)}`).join("\n\n")}${end ? `\n${end}` : ""}`;
})()}`);
  }
  return parts.join("\n\n") + "\n";
}

// ---------- feed / sitemap ----------
function renderFeed(posts) {
  const last = posts.length ? posts.map((p) => p.modified).sort().at(-1) : today();
  const items = posts.slice(0, 30).map((p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${p.url}</link>
      <guid isPermaLink="true">${p.url}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <category>${esc(CATEGORIES[p.category])}</category>
      <description>${esc(p.description)}</description>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${NAME} Blog</title>
    <link>${SITE}/blog/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Kocaeli ve Sakarya'da çocuk etkinlikleri, doğum günü, okul şenliği ve özel günler için palyaço ve animatör rehberi.</description>
    <language>tr-TR</language>
    <lastBuildDate>${rfc822(last)}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

function gitDate(file) {
  try {
    const dirty = execFileSync("git", ["-C", ROOT, "status", "--porcelain", "--", file], { encoding: "utf8" }).trim();
    if (dirty) return today();
    return execFileSync("git", ["-C", ROOT, "log", "-1", "--format=%cs", "--", file], { encoding: "utf8" }).trim() || today();
  } catch {
    return today();
  }
}

function renderSitemap(posts) {
  const latest = posts.length ? posts.map((p) => p.modified).sort().at(-1) : null;
  const homeDate = [gitDate("index.html"), latest].filter(Boolean).sort().at(-1);
  const urls = [[`${SITE}/`, homeDate]];
  urls.push([`${SITE}/galeri/`, gitDate("galeri/index.html")], [`${SITE}/hakkimizda/`, gitDate("hakkimizda/index.html")]);
  if (posts.length) urls.push([`${SITE}/blog/`, latest]);
  for (const p of posts) urls.push([p.url, p.modified]);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([loc, mod]) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${mod}</lastmod>\n  </url>`).join("\n")}
</urlset>
`;
}

function render404() {
  const url = `${SITE}/404.html`;
  const graph = { "@context": "https://schema.org", "@graph": [{ "@type": "WebPage", name: "Sayfa bulunamadı", url, inLanguage: "tr-TR", publisher: ORG_REF }] };
  return `${head({ title: `Sayfa bulunamadı | ${NAME}`, description: "Aradığınız sayfa taşınmış ya da kaldırılmış olabilir. Ana sayfaya, bloga ya da rezervasyon formuna buradan dönebilirsiniz.", url, robots: "noindex, follow", graph })}
${header("")}
  <main id="icerik">
    <section class="section">
      <div class="wrap">
        <header class="section-head">
          <p class="eyebrow">404</p>
          <h1>Sayfa bulunamadı</h1>
          <p>Aradığınız sayfa taşınmış ya da kaldırılmış olabilir. Aşağıdaki bağlantılardan devam edebilirsiniz.</p>
        </header>
        <div class="hero-cta">
          <a class="btn btn-red btn-lg" href="/">Ana sayfa</a>
          <a class="btn btn-ghost btn-lg" href="/blog/">Blog</a>
          <a class="btn btn-ghost btn-lg" href="/#iletisim">Rezervasyon formu</a>
        </div>
      </div>
    </section>
  </main>
${FOOTER}`;
}

// ---------- galeri / hakkımızda ----------
// Fotoğraflardaki tüm yüzler (palyaçolar dahil) emojiyle kapatılır; isim, okul adı gibi yazılar kırpılır ya da kapatılır.
const GALLERY = [
  { id: "dogum-gunu", title: "Doğum Günü", emoji: "🎂", note: "Evde, bahçede, parkta ve salonda yaptığımız doğum günlerinden kareler.",
    photos: [["01", 900, 1200], ["03", 900, 675], ["05", 900, 507], ["06", 900, 1200], ["07", 900, 1200], ["08", 900, 1600], ["09", 900, 1200], ["10", 900, 1429], ["11", 900, 675], ["12", 900, 1200], ["13", 900, 1200], ["14", 900, 1200], ["15", 900, 1200], ["16", 900, 1200], ["17", 900, 1200], ["18", 900, 1200], ["19", 900, 1200], ["20", 900, 1200], ["21", 900, 1200], ["22", 900, 750]] },
  { id: "okul", title: "Okul &amp; Kreş", emoji: "🏫", note: "Okul şenliklerinde kostümlü karakterler ve palyaçolarla.", photos: [["02", 900, 768]] },
  { id: "diger", title: "Sünnet, Düğün, Açılış ve Özel Günler", emoji: "🎉", note: "Bu etkinliklerin fotoğraflarını yakında ekliyoruz. Örnek görmek isterseniz Instagram'dan yazın.", photos: [] },
];

function renderGallery() {
  const url = `${SITE}/galeri/`;
  const description = "Kocaeli ve Sakarya'da yaptığımız doğum günü ve okul etkinliklerinden fotoğraflar. Çocukların ve ekibimizin yüzleri gizlilik için emojiyle kapatıldı.";
  const graph = { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", name: "Etkinlik galerisi", url, inLanguage: "tr-TR", publisher: ORG_REF },
    crumbs([["Ana sayfa", `${SITE}/`], ["Galeri"]]),
  ] };
  const sections = GALLERY.map((g) => `        <section class="gallery-group" id="${g.id}">
          <h2><span aria-hidden="true">${g.emoji}</span> ${g.title}</h2>
          <p>${esc(g.note)}</p>
${g.photos.length ? `          <div class="gallery">
${g.photos.map(([n, w, h]) => `            <figure><img src="/assets/galeri/${n}.webp" width="${w}" height="${h}" loading="lazy" decoding="async" alt="${g.id === "okul" ? "Okul şenliğinde kostümlü karakterler ve çocuklar" : "Doğum günü etkinliğinden bir kare"}, yüzler emojiyle kapatılmış"></figure>`).join("\n")}
          </div>` : `          <p><a class="btn btn-ghost" href="${IG}" target="_blank" rel="noopener">Instagram'da örneklere bakın</a></p>`}
        </section>`).join("\n");
  return `${head({ title: `Etkinlik Galerisi | ${NAME}`, description, url, graph })}
${header("/galeri/")}
  <main id="icerik">
    <section class="section">
      <div class="wrap">
        <header class="section-head">
          <p class="eyebrow">Galeri</p>
          <h1>Yaptığımız etkinliklerden kareler</h1>
          <p>Çocukların ve ekibimizin yüzlerini gizlilik için emojiyle kapattık. Fotoğraflarda farklı palyaçolar görmeniz normal: <a href="/hakkimizda/">tek kişi değil, ekip olarak çalışıyoruz</a>.</p>
        </header>
${sections}
        <div class="hero-cta">
          <a class="btn btn-red btn-lg" href="/#iletisim">Rezervasyon yap</a>
        </div>
      </div>
    </section>
  </main>
${FOOTER}`;
}

function renderAbout() {
  const url = `${SITE}/hakkimizda/`;
  const description = "İzmit Palyaço Etkinlikleri kimdir? 6 yıldır Kocaeli ve Sakarya'da 5–6 kişilik palyaço ve animatör ekibiyle doğum günü, okul ve özel gün etkinlikleri yapıyoruz.";
  const graph = { "@context": "https://schema.org", "@graph": [
    { "@type": "AboutPage", name: "Hakkımızda", url, inLanguage: "tr-TR", about: ORG_REF, publisher: ORG_REF },
    crumbs([["Ana sayfa", `${SITE}/`], ["Hakkımızda"]]),
  ] };
  return `${head({ title: `Hakkımızda | ${NAME}`, description, url, graph })}
${header("/hakkimizda/")}
  <main id="icerik">
    <section class="section">
      <div class="wrap prose">
        <header class="section-head">
          <p class="eyebrow">Hakkımızda</p>
          <h1>Biz kimiz?</h1>
          <p>İzmit merkezli bir palyaço ve animatör ekibiyiz. 6 yıldır Kocaeli ve Sakarya'da doğum günü, sünnet, düğün, okul ve özel gün etkinliklerinde çocukları eğlendiriyoruz.</p>
        </header>

        <h2>Tek palyaço değil, 5–6 kişilik ekip</h2>
        <p>Çoğu yerde palyaço tek kişidir. Biz 5–6 kişilik bir kadroyla çalışıyoruz. Bu sayede aynı gün birden fazla etkinliğe gidebiliyor, kalabalık etkinliklerde birkaç animatörle birlikte gelebiliyoruz.</p>
        <p>Bu yüzden <a href="/galeri/">galerideki</a> fotoğraflarda farklı palyaçolar ve kostümlü karakterler görürsünüz. Hepsi bizim ekibimiz.</p>

        <h2>Neler yapıyoruz?</h2>
        <ul>
          <li>Yüz boyama ve sosis balon</li>
          <li>Grup oyunları ve yarışmalar</li>
          <li>Mini disco ve köpük baloncuk şovu</li>
          <li>Kostümlü karakterlerle okul şenlikleri</li>
        </ul>

        <h2>Gerçek etkinliklerden</h2>
        <p>Parkta yapılan doğum günlerinden okul bahçesindeki şenliklere kadar yaptığımız işlerden kareleri <a href="/galeri/">galeride</a> paylaşıyoruz. Çocukların ve ekibimizin yüzlerini gizlilik için emojiyle kapatıyoruz.</p>

        <div class="hero-cta">
          <a class="btn btn-red btn-lg" href="/#iletisim">Rezervasyon yap</a>
          <a class="btn btn-ghost btn-lg" href="/galeri/">Galeriye bak</a>
        </div>
      </div>
    </section>
  </main>
${FOOTER}`;
}

// ---------- çalıştır ----------
// dry: dosyaya yazmaz, yalnızca değişecek dosyaların listesini döndürür (check.mjs bunu kullanır).
export function build({ dry = false } = {}) {
  DRY = dry;
  written.length = 0;
  const posts = loadPosts();

  let home = read("index.html");
  home = replaceBetween(home, "<!-- BLOG:BASLA -->", "<!-- BLOG:BITIR -->", renderHomeBlog(posts), "index.html");
  // Arka planlar sırayla değişsin: blog bölümü varken renkli olan o, SSS düz kalır.
  const SSS_TINT = 'class="section section-tint" id="sss"';
  const SSS_PLAIN = 'class="section" id="sss"';
  home = posts.length ? home.replace(SSS_TINT, SSS_PLAIN) : home.replace(SSS_PLAIN, SSS_TINT);
  const facts = homeFacts(home);
  if (!facts.services.length || !facts.faq.length || !facts.regions.length) throw new Error("index.html: hizmet, SSS ya da bölge bilgisi okunamadı.");
  home = replaceBetween(home, "<!-- JSONLD:BASLA -->", "<!-- JSONLD:BITIR -->", `\n  ${jsonLd(homeGraph(facts)).replace(/\n/g, "\n  ")}\n  `, "index.html");
  write("index.html", home);

  for (const p of posts) write(`blog/${p.slug}/index.html`, renderPost(p, posts));
  write("blog/index.html", renderBlogIndex(posts));
  write("feed.xml", renderFeed(posts));
  write("sitemap.xml", renderSitemap(posts));
  write("llms.txt", renderLlms(facts, posts));
  write("llms-full.txt", renderLlmsFull(home, facts, posts));
  write("404.html", render404());
  write("galeri/index.html", renderGallery());
  write("hakkimizda/index.html", renderAbout());

  const live = new Set(posts.map((p) => p.slug));
  const blogDir = path.join(ROOT, "blog");
  const stale = fs.existsSync(blogDir)
    ? fs.readdirSync(blogDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !live.has(d.name)).map((d) => `blog/${d.name}/`)
    : [];

  if (!dry) {
    console.log(`${posts.length} yazı yayında (bugün: ${today()}).`);
    console.log(written.length ? `Güncellenen: ${written.join(", ")}` : "Değişen dosya yok.");
    if (stale.length) console.warn(`Uyarı: kaynağı olmayan ya da yayından kalkan klasörler: ${stale.join(", ")} — gerekiyorsa elle kaldırın.`);
  }
  return { posts, written: [...written], stale };
}

const isMain = () => {
  try {
    return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isMain()) {
  try {
    build();
  } catch (e) {
    console.error(`HATA: ${e.message}`);
    process.exit(1);
  }
}
