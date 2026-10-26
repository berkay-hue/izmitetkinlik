// ---- Ayarlar ----
// Numara girildiğinde WhatsApp / telefon bağlantıları sitede kendiliğinden görünür.
// WHATSAPP: ülke koduyla, örn. "905321234567"   PHONE: görünen biçimde, örn. "0532 123 45 67"
const WHATSAPP = "";
const PHONE = "";
const INSTAGRAM_DM = "https://ig.me/m/izmit_palyaco_etkinlikleri";
// Formu e-postaya çeviren Cloudflare Worker (kaynağı: tools/form-worker.mjs)
const FORM_ENDPOINT = "https://izmit-form.berkay-999.workers.dev";

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  $$("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
  $$("[data-ig-dm]").forEach((a) => { a.href = INSTAGRAM_DM; });

  // ---- Mobil menü ----
  const toggle = $(".nav-toggle");
  const menu = $("#menu");
  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      menu.classList.toggle("open", open);
      $(".sr", toggle).textContent = open ? "Menüyü kapat" : "Menüyü aç";
    };
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || toggle.getAttribute("aria-expanded") !== "true") return;
      const inside = menu.contains(document.activeElement);
      setOpen(false);
      if (inside) toggle.focus();
    });
  }

  // ---- İletişim bağlantıları ----
  const waDigits = WHATSAPP.replace(/\D/g, "");
  const formatPhone = (d) =>
    d.length === 12 && d.startsWith("90")
      ? `+90 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`
      : `+${d}`;

  if (waDigits) {
    $$('[data-needs="whatsapp"]').forEach((el) => { el.hidden = false; });
    $$("[data-wa-link]").forEach((a) => { a.href = `https://wa.me/${waDigits}`; });
    $$("[data-wa-text]").forEach((el) => { el.textContent = formatPhone(waDigits); });
  }
  if (PHONE.trim()) {
    $$('[data-needs="phone"]').forEach((el) => { el.hidden = false; });
    $$("[data-tel-link]").forEach((a) => { a.href = `tel:${PHONE.replace(/[^\d+]/g, "")}`; });
    $$("[data-tel-text]").forEach((el) => { el.textContent = PHONE.trim(); });
  }

  // ---- Rezervasyon butonu: iletişim bölümü veya alt bilgi görünürken gizle ----
  const fab = $(".fab");
  const hideZones = $$("#iletisim, .site-footer");
  if (fab && hideZones.length && "IntersectionObserver" in window) {
    const visible = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
      fab.classList.toggle("away", visible.size > 0);
    });
    hideZones.forEach((el) => io.observe(el));
  }

  // ---- Rezervasyon formu → e-posta + hazır mesaj ----
  const form = $("#rezervasyon");
  if (!form) return;

  const status = $(".form-status", form);
  const preview = $(".msg-preview", form);
  const previewText = $("textarea", preview);
  const sendWa = $("[data-send-wa]", form);
  const sendIg = $("[data-send-ig]", form);
  const submitBtn = $('button[type="submit"]', form);
  let lastSent = "";

  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  form.elements.tarih.min = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const val = (name) => (form.elements[name]?.value || "").trim();
  const fmtDate = (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  };
  const setStatus = (text, kind) => {
    status.textContent = text;
    status.className = `form-status ${kind || ""}`.trim();
  };

  const buildMessage = () => {
    const services = $$('input[name="hizmet"]:checked', form).map((i) => i.value);
    const lines = ["Merhaba! izmitetkinlik.com üzerinden yazıyorum.", ""];
    const add = (label, v) => { if (v) lines.push(`${label}: ${v}`); };
    add("Ad", val("ad"));
    add("İletişim", val("iletisim"));
    add("Etkinlik", val("tur"));
    add("Tarih", fmtDate(val("tarih")));
    add("Saat", val("saat"));
    add("Yer", val("yer"));
    add("Çocuk sayısı", val("sayi"));
    add("Yaş aralığı", val("yas"));
    add("Hizmetler", services.join(", "));
    add("Not", val("not"));
    lines.push("", "Müsaitlik ve fiyat bilgisi alabilir miyim?");
    return lines.join("\n");
  };

  form.addEventListener("input", (e) => {
    if (e.target.classList.contains("invalid") && e.target.value.trim()) {
      e.target.classList.remove("invalid");
      e.target.removeAttribute("aria-invalid");
    }
  });

  const payload = () => ({
    ad: val("ad"),
    iletisim: val("iletisim"),
    tur: val("tur"),
    tarih: fmtDate(val("tarih")),
    saat: val("saat"),
    yer: val("yer"),
    sayi: val("sayi"),
    yas: val("yas"),
    hizmetler: $$('input[name="hizmet"]:checked', form).map((i) => i.value).join(", "),
    not: val("not"),
    web: val("web"),
  });

  const send = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      return res.ok && data.ok === true;
    } catch (_) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;
    const required = [form.elements.ad, form.elements.iletisim, form.elements.tur];
    const missing = required.filter((f) => !f.value.trim());
    required.forEach((f) => {
      const bad = missing.includes(f);
      f.classList.toggle("invalid", bad);
      if (bad) f.setAttribute("aria-invalid", "true");
      else f.removeAttribute("aria-invalid");
    });
    if (missing.length) {
      setStatus("Lütfen adınızı, telefon ya da e-postanızı ve etkinlik türünü doldurun.", "err");
      missing[0].focus();
      return;
    }

    const msg = buildMessage();
    previewText.value = msg;
    preview.hidden = false;
    if (waDigits) {
      sendWa.href = `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}`;
      sendWa.hidden = false;
    }
    const reveal = () =>
      preview.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });

    // Aynı talep ikinci kez gönderilmez.
    if (msg === lastSent) {
      setStatus("Talebiniz bize ulaştı. En kısa sürede dönüş yapacağız.", "ok");
      return;
    }

    submitBtn.disabled = true;
    setStatus("Gönderiliyor…");
    const ok = await send();
    submitBtn.disabled = false;
    if (ok) {
      lastSent = msg;
      setStatus("Talebiniz bize ulaştı! En kısa sürede dönüş yapacağız.", "ok");
    } else {
      setStatus(
        waDigits
          ? "Talebiniz şu an gönderilemedi. Aşağıdaki hazır mesajı WhatsApp ya da Instagram'dan bize gönderin."
          : "Talebiniz şu an gönderilemedi. Aşağıdaki hazır mesajı kopyalayıp Instagram'dan bize gönderin.",
        "err"
      );
    }
    reveal();
  });

  // Bağlantı tıklandığı anda kopyala; sekme tarayıcının kendi bağlantı davranışıyla açılır.
  sendIg.addEventListener("click", () => {
    const text = previewText.value;
    const legacy = () => {
      try {
        previewText.select();
        document.execCommand("copy");
      } catch (_) { /* kullanıcı elle kopyalayabilir */ }
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(legacy);
    } else {
      legacy();
    }
    setStatus("Mesaj kopyalandı. Açılan Instagram sohbetine yapıştırıp gönderin.", "ok");
  });
})();
