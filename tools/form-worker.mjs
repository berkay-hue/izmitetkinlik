// izmitetkinlik.com rezervasyon formu → e-posta (Cloudflare Worker "izmit-form").
// Site bu dosyayı kullanmaz; Worker'ın kaynağı olarak burada sürümlenir.
// Bağlamalar (Cloudflare'de): MAIL (send_email, yalnızca MAIL_TO'ya gönderebilir), MAIL_TO (hedef adres),
// MAIL_FROM (gönderen, izmitetkinlik.com alanında).
// Gönderebilmesi için izmitetkinlik.com'da Email Routing açık, hedef adres doğrulanmış olmalı. Secret kullanmaz.

import { EmailMessage } from "cloudflare:email";

const ORIGINS = new Set(["https://izmitetkinlik.com", "https://www.izmitetkinlik.com"]);
const FIELDS = [
  ["ad", "Ad", 100],
  ["telefon", "Telefon", 30],
  ["eposta", "E-posta", 120],
  ["tur", "Etkinlik", 60],
  ["tarih", "Tarih", 20],
  ["saat", "Saat", 10],
  ["yer", "Yer", 120],
  ["sayi", "Çocuk sayısı", 10],
  ["yas", "Yaş aralığı", 60],
  ["hizmetler", "Hizmetler", 300],
  ["not", "Not", 2000],
];
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

const cors = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});
const reply = (status, body, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(origin ? cors(origin) : {}) },
  });

// Satır sonu, sekme ve denetim karakterlerini temizler; başlığa giden değerlerde satır sonu kalmaz.
const clean = (v, max, multiline) => {
  let s = String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");
  if (!multiline) s = s.replace(/\n/g, " ");
  return s.trim().slice(0, max);
};

const b64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const encodeWord = (str) => `=?UTF-8?B?${b64(str)}?=`;
const wrap = (s) => s.replace(/.{1,76}/g, "$&\r\n");

function buildMime({ from, to, replyTo, subject, text }) {
  const headers = [
    `From: ${encodeWord("izmitetkinlik.com formu")} <${from}>`,
    `To: <${to}>`,
    ...(replyTo ? [`Reply-To: <${replyTo}>`] : []),
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@izmitetkinlik.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${wrap(b64(text))}`;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ORIGINS.has(origin) ? origin : "";

    if (request.method === "OPTIONS") {
      return allowed ? new Response(null, { status: 204, headers: cors(allowed) }) : new Response(null, { status: 403 });
    }
    if (request.method !== "POST") return reply(405, { ok: false, error: "method" }, allowed);
    if (!allowed) return reply(403, { ok: false, error: "origin" });

    const raw = await request.text();
    if (raw.length > 10000) return reply(413, { ok: false, error: "size" }, allowed);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return reply(400, { ok: false, error: "json" }, allowed);
    }
    if (!data || typeof data !== "object") return reply(400, { ok: false, error: "json" }, allowed);

    // Bal küpü: insanlar görmez, botlar doldurur. Bota başarılı görünür, e-posta gitmez.
    if (clean(data.web, 200)) return reply(200, { ok: true }, allowed);

    const f = {};
    for (const [key, , max] of FIELDS) f[key] = clean(data[key], max, key === "not");
    // Eski form tek "iletisim" alanı gönderiyordu; önbellekteki sayfalar için hâlâ kabul edilir.
    const legacy = clean(data.iletisim, 120);
    if (legacy && !f.telefon && !f.eposta) f[EMAIL_RE.test(legacy) ? "eposta" : "telefon"] = legacy;
    const telDigits = f.telefon.replace(/\D/g, "").length;
    if (!f.ad || !f.tur || (!f.telefon && !legacy)) return reply(400, { ok: false, error: "required" }, allowed);
    if (!legacy && (telDigits < 10 || telDigits > 13)) return reply(400, { ok: false, error: "telefon" }, allowed);

    const lines = ["izmitetkinlik.com rezervasyon formundan yeni talep:", ""];
    for (const [key, label] of FIELDS) if (f[key]) lines.push(`${label}: ${f[key]}`);
    lines.push("", `Gönderim: ${new Date().toISOString()}`);

    const replyTo = EMAIL_RE.test(f.eposta) ? f.eposta : "";
    const mime = buildMime({
      from: env.MAIL_FROM,
      to: env.MAIL_TO,
      replyTo,
      subject: `Rezervasyon talebi: ${f.tur} – ${f.ad}`,
      text: lines.join("\n"),
    });

    try {
      await env.MAIL.send(new EmailMessage(env.MAIL_FROM, env.MAIL_TO, mime));
    } catch (e) {
      console.error("send_email", e && e.message);
      return reply(502, { ok: false, error: "send" }, allowed);
    }
    return reply(200, { ok: true }, allowed);
  },
};
