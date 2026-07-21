/* ============================================================================
   Launch Rocket — HS Classification & Duty Intelligence
   Single-SKU classifier: form → /api/classify → five-block result renderer.
   Duty totals are computed HERE from the returned rates (exact arithmetic);
   the model is never asked for the total. Indicative only — see disclaimer.
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.LR_HSC || { endpoint: "/api/classify", turnstileSiteKey: "", analyticsEndpoint: "" };

  var DISCLAIMER =
    "This free tool provides an AI-generated, indicative classification and duty view for a single product. " +
    "It is not legal advice, not an expert-signed opinion, and not a customs ruling; rates shown are indicative and must be " +
    "verified against the tariff and notifications in force on your transaction date. Binding classification certainty in India is " +
    "available only via a CAAR advance ruling (valid 5 years). Preferential (FTA) rates are subject to rules of origin and " +
    "CAROTAR 2020 documentation. For expert-signed classifications with verified rates across your catalog, contact Launch Rocket — " +
    "care@launchrocket.in · +91 87967 90066.";

  var INDICATIVE_RATE_NOTE =
    "Every rate above is indicative — verify against the live tariff and notifications in force on your transaction date.";

  /* ---------- tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function isArr(a) { return Object.prototype.toString.call(a) === "[object Array]"; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function todayStr() {
    try {
      return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    } catch (e) { return new Date().toDateString(); }
  }

  /* ---------- analytics: dataLayer + CustomEvent (+ optional beacon) ---------- */
  function lrTrack(name, props) {
    props = props || {};
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: name }, props));
    } catch (e) {}
    try { document.dispatchEvent(new CustomEvent("lr:" + name, { detail: props })); } catch (e) {}
    if (CFG.analyticsEndpoint && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(CFG.analyticsEndpoint, new Blob(
          [JSON.stringify({ event: name, props: props, t: Date.now() })], { type: "application/json" }));
      } catch (e) {}
    }
  }
  window.lrTrack = lrTrack;

  /* =========================================================================
     Shared page chrome (nav, reveal, FAQ) — mirrors the main site behaviour.
     ========================================================================= */
  var nav = $("nav");
  if (nav) window.addEventListener("scroll", function () { nav.classList.toggle("scrolled", window.scrollY > 20); }, { passive: true });
  var hbg = $("hbg"), nl = $("navLinks");
  if (hbg && nl) {
    hbg.addEventListener("click", function () { var o = nl.classList.toggle("open"); hbg.setAttribute("aria-expanded", o); });
    nl.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { nl.classList.remove("open"); hbg.setAttribute("aria-expanded", false); });
    });
  }
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("visible"); obs.unobserve(en.target); } });
  }, { threshold: 0.09, rootMargin: "0px 0px -36px 0px" });
  document.querySelectorAll(".reveal").forEach(function (e) { obs.observe(e); });
  window.addEventListener("load", function () {
    document.querySelectorAll(".reveal").forEach(function (e) { if (e.getBoundingClientRect().top < window.innerHeight) e.classList.add("visible"); });
  });
  document.querySelectorAll(".faq-q").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".faq-item"), isOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item.open").forEach(function (o) { o.classList.remove("open"); o.querySelector(".faq-q").setAttribute("aria-expanded", "false"); });
      if (!isOpen) { item.classList.add("open"); btn.setAttribute("aria-expanded", "true"); }
    });
  });

  /* track enterprise CTA clicks (email / call / pilot form + in-result buttons) */
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="mailto:"],a[href^="tel:"],[data-ent-cta]');
    if (a && (a.hasAttribute("data-ent-cta") || a.closest("#contact") || a.closest(".ent-card"))) {
      lrTrack("enterprise_cta_clicked", { where: a.getAttribute("data-ent-cta") || (a.getAttribute("href") || "").slice(0, 24) });
    }
  });

  /* =========================================================================
     Cross-sell link map — render each triggered flag as a chip to LR services.
     ========================================================================= */
  var LINK_MAP = [
    { re: /legal\s*metrolog|label/i,                        href: "/#productlabelguru" },
    { re: /fcc/i,                                            href: "/#global-approvals" },
    { re: /ce[\s\-]?red|\bce\b/i,                            href: "/#global-approvals" },
    { re: /bis|crs|isi|qco/i,                                href: "/#india-compliance" },
    { re: /fssai/i,                                          href: "/#india-compliance" },
    { re: /cdsco/i,                                          href: "/#india-compliance" },
    { re: /wpc|eta/i,                                        href: "/#india-compliance" },
    { re: /epr/i,                                            href: "/#india-compliance" },
    { re: /bee|peso|ayush/i,                                 href: "/#india-compliance" },
    { re: /dgft|scomet|rodtep|rcmc|\biec\b/i,                href: "/#india-compliance" }
  ];
  function flagHref(flag) {
    for (var i = 0; i < LINK_MAP.length; i++) { if (LINK_MAP[i].re.test(flag)) return LINK_MAP[i].href; }
    return "/#india-compliance"; // safe default: compliance hub
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }

  /* =========================================================================
     Form wiring
     ========================================================================= */
  var form = $("classifyForm");
  if (!form) return;

  var descEl = $("f-desc"), descCount = $("descCount");
  if (descEl && descCount) {
    var upd = function () { descCount.textContent = descEl.value.length; };
    descEl.addEventListener("input", upd); upd();
  }

  /* image → base64 (client cap 4 MB) */
  var imageData = null, imageMedia = null;
  var fileInput = $("f-image"), filePrev = $("filePrev"), filePrevImg = $("filePrevImg"), filePrevName = $("filePrevName");
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      imageData = null; imageMedia = null; if (filePrev) filePrev.classList.remove("show");
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { showError("Please choose a JPG, PNG or WebP image."); fileInput.value = ""; return; }
      if (f.size > 4 * 1024 * 1024) { showError("That image is over 4 MB. Please choose a smaller file."); fileInput.value = ""; return; }
      var reader = new FileReader();
      reader.onload = function () {
        var s = String(reader.result || "");
        var comma = s.indexOf(",");
        imageData = comma >= 0 ? s.slice(comma + 1) : s;
        imageMedia = f.type;
        if (filePrevImg) filePrevImg.src = s;
        if (filePrevName) filePrevName.textContent = f.name;
        if (filePrev) filePrev.classList.add("show");
        clearError();
      };
      reader.onerror = function () { showError("Couldn't read that image — try another file."); };
      reader.readAsDataURL(f);
    });
  }

  var errLine = $("errLine");
  function showError(msg) { if (errLine) { errLine.textContent = msg; errLine.classList.add("show"); } }
  function clearError() { if (errLine) { errLine.classList.remove("show"); errLine.textContent = ""; } }

  /* loading rotator */
  var LOAD_LINES = ["Reading attributes…", "Walking the GRI rules…", "Building your duty view…"];
  var loadTimer = null;
  function startLoading() {
    var i = 0, line = $("loadLine");
    if (line) line.textContent = LOAD_LINES[0];
    loadTimer = setInterval(function () { i = (i + 1) % LOAD_LINES.length; if (line) line.textContent = LOAD_LINES[i]; }, 1600);
  }
  function stopLoading() { if (loadTimer) { clearInterval(loadTimer); loadTimer = null; } }

  function setView(v) {
    $("toolForm").style.display = v === "form" ? "" : "none";
    $("toolLoading").classList.toggle("show", v === "loading");
    $("toolResults").classList.toggle("show", v === "results");
  }

  /* submit */
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    clearError();
    var name = $("f-name"), desc = $("f-desc");
    name.classList.remove("invalid"); desc.classList.remove("invalid");

    var nameV = (name.value || "").trim(), descV = (desc.value || "").trim();
    if (nameV.length < 2) { name.classList.add("invalid"); showError("Please enter the product name."); name.focus(); return; }
    if (descV.length < 12) { desc.classList.add("invalid"); showError("Please describe the product in a little more detail (material, function, how it's sold)."); desc.focus(); return; }
    if (descV.length > 2000) { desc.classList.add("invalid"); showError("Description is too long — please keep it under 2,000 characters."); return; }

    var turnstileToken = "";
    var tsField = form.querySelector('[name="cf-turnstile-response"]');
    if (tsField) turnstileToken = tsField.value || "";
    if (CFG.turnstileSiteKey && !turnstileToken) { showError("Please complete the verification challenge above and try again."); return; }

    var payload = {
      name: nameV.slice(0, 160),
      description: descV.slice(0, 2000),
      origin: ($("f-origin").value || "") || null,
      channel: $("f-channel").value || "Import to India",
      unit_price: $("f-price").value ? num($("f-price").value) : null,
      image_base64: imageData || null,
      image_media_type: imageMedia || null,
      url_text: ($("f-url").value || "").trim().slice(0, 400) || null,
      turnstile_token: turnstileToken || null
    };

    lrTrack("classify_submitted", { channel: payload.channel, has_image: !!payload.image_base64, has_price: payload.unit_price != null, origin: payload.origin || "unspecified" });

    var btn = $("submitBtn"); btn.disabled = true;
    setView("loading"); startLoading();
    document.getElementById("tool").scrollIntoView({ behavior: "smooth", block: "start" });

    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 45000);

    fetch(CFG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).then(function (res) {
      clearTimeout(timeout);
      if (res.status === 429) {
        return res.json().catch(function () { return {}; }).then(function (j) { throw { rateLimit: true, msg: (j && j.message) || null }; });
      }
      return res.json().then(function (j) { if (!res.ok) throw { msg: (j && (j.error || j.message)) || ("Server error (" + res.status + ")") }; return j; });
    }).then(function (data) {
      stopLoading(); btn.disabled = false;
      renderResult(data, payload);
    }).catch(function (err) {
      stopLoading(); clearTimeout(timeout); btn.disabled = false;
      if (err && err.rateLimit) { renderRateLimit(err.msg); lrTrack("rate_limit_hit", {}); return; }
      setView("form");
      var msg = (err && err.name === "AbortError")
        ? "That took too long to come back. Please try again — if it keeps happening, email care@launchrocket.in."
        : (err && err.msg) || "We couldn't reach the classifier just now. Please try again in a moment, or email care@launchrocket.in and we'll classify it for you.";
      showError(msg);
      if (typeof turnstile !== "undefined" && turnstile.reset) { try { turnstile.reset(); } catch (e) {} }
    });
  });

  /* =========================================================================
     Duty maths — computed client-side from returned rates (never the model).
     Total effective duty % = D + IGST(1+D), where D = BCD + SWS + AIDC + HC,
     and SWS = 10% of BCD when applicable.
     ========================================================================= */
  function computeDuty(d, price) {
    d = d || {};
    var confident = d.rates_confident !== false;
    var bcd = num(d.bcd_pct), aidc = num(d.aidc_pct), hc = num(d.health_cess_pct), igst = num(d.igst_pct);
    var sws = d.sws_applicable ? 0.10 * bcd : 0;
    var Dpct = bcd + sws + aidc + hc;         // pre-IGST duties, in %
    var D = Dpct / 100;
    var igstLeg = (igst / 100) * (1 + D);      // fraction
    var totalFrac = D + igstLeg;               // fraction
    var totalPct = totalFrac * 100;
    var perUnit = (price != null && isFinite(price)) ? {
      bcd: price * bcd / 100, sws: price * sws / 100, aidc: price * aidc / 100,
      hc: price * hc / 100, igst: price * (igst / 100) * (1 + D), total: price * totalFrac
    } : null;
    return { confident: confident, bcd: bcd, sws: sws, sws_applicable: !!d.sws_applicable, aidc: aidc, hc: hc, igst: igst, totalPct: totalPct, perUnit: perUnit };
  }
  function fmtPct(n) { return (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "") + "%"; }
  function fmtINR(n) { return "₹" + (Math.round(n * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }

  /* =========================================================================
     Render: refusal OR the five collapsible blocks
     ========================================================================= */
  function renderResult(data, payload) {
    var box = $("toolResults");
    box.innerHTML = "";

    if (data && data.refusal) {
      box.appendChild(refusalNode(data.refusal));
      appendStampAndDisclaimer(box);
      box.appendChild(enterpriseCard());
      box.appendChild(resetBar());
      setView("results");
      lrTrack("classify_result_refused", {});
      wireBlocks(box);
      return;
    }

    var conf = (data && data.confidence) || "Medium";
    lrTrack("classify_result_" + slug(conf), { code: (data && data.itc_hs_8digit) || "", risk: (data && data.risk_rating) || "" });

    /* header with actions */
    var head = el("div", "res-head");
    head.innerHTML =
      '<div><h3>Indicative classification</h3><p>' + esc(payload.name) + ' · ' + esc(payload.channel) + '</p></div>' +
      '<div class="res-actions">' +
        '<button type="button" id="btnPrint"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Download as PDF</button>' +
        '<button type="button" id="btnReset2"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>Classify another</button>' +
      '</div>';
    box.appendChild(head);

    var blocks = el("div", "blocks");
    blocks.appendChild(block1(data, payload));
    blocks.appendChild(block2(data));
    blocks.appendChild(block3(data, payload));
    blocks.appendChild(block4(data, payload));
    blocks.appendChild(block5(data));
    box.appendChild(blocks);

    appendStampAndDisclaimer(box);
    box.appendChild(enterpriseCard());
    box.appendChild(resetBar());

    setView("results");
    wireBlocks(box);

    $("btnPrint").addEventListener("click", function () { lrTrack("result_print", {}); window.print(); });
    $("btnReset2").addEventListener("click", resetTool);
    box.querySelectorAll("a.chip-x").forEach(function (a) {
      a.addEventListener("click", function () { lrTrack("flag_chip_clicked_" + slug(a.getAttribute("data-flag")), { flag: a.getAttribute("data-flag") }); });
    });
  }

  function makeBlock(n, title, sub, openByDefault) {
    var b = el("div", "blk" + (openByDefault ? " open" : ""));
    var h = el("button", "blk-head");
    h.type = "button";
    h.setAttribute("aria-expanded", openByDefault ? "true" : "false");
    h.innerHTML = '<span class="blk-n">' + n + '</span><span class="blk-t">' + esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
      '<svg class="blk-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
    var wrap = el("div", "blk-wrap");
    var inner = el("div", "blk-inner");
    var pad = el("div", "blk-pad");
    inner.appendChild(pad); wrap.appendChild(inner);
    b.appendChild(h); b.appendChild(wrap);
    b._pad = pad;
    return b;
  }
  function wireBlocks(scope) {
    scope.querySelectorAll(".blk-head").forEach(function (h) {
      h.addEventListener("click", function () {
        var b = h.closest(".blk"), open = b.classList.toggle("open");
        h.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  }

  /* ---- Block 1: Inputs & extraction ---- */
  function block1(data, payload) {
    var b = makeBlock("1", "Inputs & extraction", "What we received and read off it", true);
    var p = b._pad;
    var inputs = [];
    inputs.push("<b>Product:</b> " + esc(payload.name));
    inputs.push("<b>Channel:</b> " + esc(payload.channel));
    if (payload.origin) inputs.push("<b>Origin:</b> " + esc(payload.origin));
    if (payload.unit_price != null) inputs.push("<b>CIF unit price:</b> " + fmtINR(payload.unit_price));
    if (payload.image_base64) inputs.push("<b>Image:</b> provided");
    if (payload.url_text) inputs.push("<b>Reference URL:</b> provided (as text)");
    p.appendChild(el("div", "subh", "Inputs received"));
    p.appendChild(el("div", "kv", inputs.join(" &nbsp;·&nbsp; ")));

    var ex = isArr(data.extracted_attributes) ? data.extracted_attributes.filter(Boolean) : [];
    if (ex.length) {
      p.appendChild(el("div", "subh", "Key extracted attributes"));
      var c1 = el("div", "chips");
      ex.forEach(function (a) { c1.appendChild(el("span", "chip blue", esc(a))); });
      p.appendChild(c1);
    }
    var miss = isArr(data.missing_attributes) ? data.missing_attributes.filter(Boolean) : [];
    p.appendChild(el("div", "subh", "Missing attributes"));
    if (miss.length) {
      var c2 = el("div", "chips");
      miss.forEach(function (a) { c2.appendChild(el("span", "chip amber", esc(a))); });
      p.appendChild(c2);
    } else {
      p.appendChild(el("div", "kv", "None flagged — the description carried the duty-determinative facts."));
    }
    return b;
  }

  /* ---- Block 2: Classification ---- */
  function block2(data) {
    var b = makeBlock("2", "Classification", "The code, the candidates, and why", true);
    var p = b._pad;
    var code = (data.itc_hs_8digit || "").replace(/\D/g, "");
    var codeHtml = code
      ? code.replace(/^(\d{4})(\d{2})?(\d{2})?$/, function (_, a, c, d) { return a + (c ? "." + c : "") + (d ? "." + d : ""); })
      : "—";
    var conf = data.confidence || "Medium";
    var confCls = /grey/i.test(conf) ? "grey" : /med/i.test(conf) ? "med" : "high";
    var row = el("div", "hs-code");
    row.innerHTML = '<span class="code">' + esc(codeHtml) + '</span><span class="badge ' + confCls + '">Confidence: ' + esc(conf) + '</span>';
    p.appendChild(row);
    if (data.heading_description) p.appendChild(el("div", "heading-desc", esc(data.heading_description)));

    var cand = isArr(data.candidates_considered) ? data.candidates_considered.filter(Boolean) : [];
    if (cand.length) {
      p.appendChild(el("div", "subh", "Candidates considered"));
      var c = el("div", "chips");
      cand.forEach(function (x) { c.appendChild(el("span", "chip", esc(x))); });
      p.appendChild(c);
    }
    if (data.reasoning) {
      p.appendChild(el("div", "subh", "Reasoning"));
      p.appendChild(el("div", "reason", esc(data.reasoning)));
    }
    if (data.gri_path) p.appendChild(el("div", "gri", "GRI path: " + esc(data.gri_path)));

    p.appendChild(el("div", "subh", "GST (indicative)"));
    var gstHsn = (data.gst_hsn_6digit || "").replace(/\D/g, "");
    var gstTxt = (gstHsn ? "<b>HSN " + esc(gstHsn) + "</b>" : "<b>HSN —</b>") +
      " &nbsp;·&nbsp; indicative GST rate " + (data.gst_rate_pct != null ? "<b>" + esc(data.gst_rate_pct) + "%</b>" : "<b>—</b>");
    p.appendChild(el("div", "kv", gstTxt));
    return b;
  }

  /* ---- Block 3: Import duty stack ---- */
  function block3(data, payload) {
    var b = makeBlock("3", "Import duty stack (indicative)", "Computed from the returned rates", true);
    var p = b._pad;
    var duty = computeDuty(data.duty, payload.unit_price);
    var showINR = duty.perUnit != null;

    if (!duty.confident) {
      p.appendChild(el("div", "indic-note",
        "The engine wasn't confident enough about the exact rates for this line to quote numbers. Rates are shown as “—”. This is precisely where the enterprise service verifies against the live tariff and notifications before you rely on a landed cost."));
    }

    var t = el("table", "duty-tbl");
    var head = "<tr><th>Component</th><th class='num'>Rate</th>" + (showINR ? "<th class='num'>₹ / unit</th>" : "") + "</tr>";
    function r(label, rate, inr, cls) {
      var rc = duty.confident ? rate : "—";
      var ic = showINR ? ("<td class='num'>" + (duty.confident ? fmtINR(inr) : "—") + "</td>") : "";
      return "<tr class='" + (cls || "") + "'><td>" + label + "</td><td class='num'>" + rc + "</td>" + ic + "</tr>";
    }
    var pu = duty.perUnit || {};
    var rows = "";
    rows += r("Basic Customs Duty (BCD)", fmtPct(duty.bcd), pu.bcd);
    rows += r("Social Welfare Surcharge (SWS)<br><small>" + (duty.sws_applicable ? "10% of BCD" : "not applicable to this line") + "</small>", fmtPct(duty.sws), pu.sws);
    rows += r("AIDC", fmtPct(duty.aidc), pu.aidc);
    rows += r("Health Cess", fmtPct(duty.hc), pu.hc);
    rows += r("IGST<br><small>on duty-inclusive value</small>", fmtPct(duty.igst), pu.igst);
    rows += "<tr class='tot'><td>Total effective duty</td><td class='num'>" + (duty.confident ? fmtPct(duty.totalPct) : "—") + "</td>" +
      (showINR ? "<td class='num'>" + (duty.confident ? fmtINR(pu.total) : "—") + "</td>" : "") + "</tr>";
    t.innerHTML = head + rows;
    p.appendChild(t);
    p.appendChild(el("div", "indic-note", INDICATIVE_RATE_NOTE));
    return b;
  }

  /* ---- Block 4: Opportunity & compliance ---- */
  function block4(data, payload) {
    var b = makeBlock("4", "Opportunity & compliance", "FTA routes, flags and export notes", true);
    var p = b._pad;

    /* FTA routes */
    p.appendChild(el("div", "subh", "Possible FTA routes"));
    var fta = isArr(data.fta_routes) ? data.fta_routes.filter(Boolean) : [];
    if (fta.length) {
      fta.forEach(function (f) {
        var st = (f.status || "").toLowerCase();
        var stCls = /force/.test(st) ? "inforce" : "pipeline";
        var item = el("div", "fta-item");
        item.innerHTML =
          '<div class="fta-top"><b>' + esc(f.agreement || "FTA") + '</b>' +
          (f.origin ? '<span class="chip">' + esc(f.origin) + '</span>' : '') +
          (f.status ? '<span class="fta-status ' + stCls + '">' + esc(f.status) + '</span>' : '') + '</div>' +
          '<div class="fta-caveat">' + esc(f.note || "Preferential rate subject to product-specific rules of origin and CAROTAR 2020 documentation.") + '</div>';
        p.appendChild(item);
      });
    } else {
      p.appendChild(el("div", "kv", payload.origin
        ? "No preferential route indicated for this origin — the standard (MFN) duty above applies."
        : "Add an origin country to see the FTA routes that could apply. Any preferential rate is subject to rules of origin and CAROTAR 2020 documentation."));
    }

    /* compliance flags → cross-sell chips */
    p.appendChild(el("div", "subh", "Regulatory compliance flags"));
    var flags = isArr(data.compliance_flags) ? data.compliance_flags.filter(Boolean) : [];
    if (flags.length) {
      var c = el("div", "chips");
      flags.forEach(function (fl) {
        var a = el("a", "chip-x");
        a.href = flagHref(fl);
        a.setAttribute("data-flag", fl);
        a.innerHTML = esc(fl) + ' <span class="xr">— Launch Rocket handles this →</span>';
        c.appendChild(a);
      });
      p.appendChild(c);
    } else {
      p.appendChild(el("div", "kv", "No specific clearance flagged from the description. Confirm against your final product spec before import."));
    }

    /* export notes */
    if (payload.channel === "Export from India" || (data.export_notes && String(data.export_notes).trim())) {
      p.appendChild(el("div", "subh", "Export notes"));
      p.appendChild(el("div", "kv", esc(data.export_notes && String(data.export_notes).trim() ? data.export_notes :
        "RoDTEP / drawback may apply on this line at export — benefit is published per tariff line and subject to the schedule in force. We quantify this in the enterprise service.")));
    }
    return b;
  }

  /* ---- Block 5: Risk & action ---- */
  function block5(data) {
    var b = makeBlock("5", "Risk & action", "What to do next", true);
    var p = b._pad;
    var risk = data.risk_rating || "Medium";
    var riskCls = "risk-" + slug(risk);
    p.appendChild(el("div", "subh", "Risk rating"));
    var rr = el("div"); rr.innerHTML = '<span class="badge ' + riskCls + '">' + esc(risk) + " risk</span>";
    p.appendChild(rr);

    p.appendChild(el("div", "subh", "Recommended action"));
    var ar = el("div", "action-row");
    ar.innerHTML = '<span class="action-pill">' + esc(data.recommended_action || "Obtain info") + "</span>";
    p.appendChild(ar);

    var info = isArr(data.info_needed) ? data.info_needed.filter(Boolean) : [];
    if (info.length) {
      p.appendChild(el("div", "subh", "Information needed to firm this up"));
      var ul = el("ul", "info-needed");
      info.forEach(function (q) { ul.appendChild(el("li", null, esc(q))); });
      p.appendChild(ul);
    }
    return b;
  }

  /* ---- refusal ---- */
  function refusalNode(msg) {
    var d = el("div", "refusal");
    d.innerHTML =
      '<div class="refusal-ic">🧭</div>' +
      '<h3>We can only classify physical, tradeable products</h3>' +
      '<p>' + esc(msg) + '</p>' +
      '<p style="font-size:12.5px;color:var(--muted)">Try again with a physical product — its material, function and how it’s sold.</p>';
    return d;
  }

  /* ---- stamp + disclaimer ---- */
  function appendStampAndDisclaimer(box) {
    box.appendChild(el("div", "stamp", "Indicative result · generated " + esc(todayStr()) + " · not expert-signed"));
    var dis = el("div", "disclaimer");
    dis.innerHTML = '<div class="dt">Disclaimer</div><p>' + esc(DISCLAIMER) + "</p>";
    box.appendChild(dis);
  }

  /* ---- enterprise card ---- */
  function enterpriseCard() {
    var c = el("div", "ent-card");
    c.innerHTML =
      '<span class="ec-ey">The enterprise service</span>' +
      '<h4>This is the free, indicative version.</h4>' +
      '<p>The enterprise service adds expert sign-off, verified live rates, FTA savings quantification, licensing execution, and 48-hour change monitoring across your whole catalogue.</p>' +
      '<div class="ec-acts">' +
        '<a class="btn-w" data-ent-cta="result-email" href="mailto:care@launchrocket.in?subject=' + encodeURIComponent("Enterprise HS classification enquiry") + '">Email us</a>' +
        '<a class="btn-ow" data-ent-cta="result-call" href="tel:+918796790066">Call +91 87967 90066</a>' +
        '<a class="btn-ow" data-ent-cta="result-pilot" href="#contact">Book a pilot</a>' +
      '</div>';
    return c;
  }

  /* ---- reset bar ---- */
  function resetBar() {
    var d = el("div");
    d.style.cssText = "text-align:center;padding:0 26px 26px";
    var btn = el("button", "btn-s", "Classify another product");
    btn.type = "button";
    btn.addEventListener("click", resetTool);
    d.appendChild(btn);
    return d;
  }

  function resetTool() {
    form.reset();
    imageData = null; imageMedia = null;
    if (filePrev) filePrev.classList.remove("show");
    if (descCount) descCount.textContent = "0";
    clearError();
    $("toolResults").innerHTML = "";
    if (typeof turnstile !== "undefined" && turnstile.reset) { try { turnstile.reset(); } catch (e) {} }
    setView("form");
    document.getElementById("tool").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---- rate limit ---- */
  function renderRateLimit(msg) {
    var box = $("toolResults"); box.innerHTML = "";
    var d = el("div", "refusal");
    d.innerHTML =
      '<div class="refusal-ic">⏳</div>' +
      '<h3>Free daily limit reached</h3>' +
      '<p>' + esc(msg || "You’ve used today’s free classifications. The enterprise service has no limits — and adds expert sign-off, verified rates and monitoring across your whole catalogue.") + "</p>";
    box.appendChild(d);
    box.appendChild(enterpriseCard());
    box.appendChild(resetBar());
    setView("results");
    wireBlocks(box);
  }

  /* Offline renderer hook — lets you exercise the five-block renderer with a
     sample payload without a live backend (used in previews / acceptance tests).
     e.g. window.__lrRender(sampleJson, {name:"…", channel:"Import to India", unit_price:1500}) */
  window.__lrRender = function (data, payload) {
    payload = Object.assign({ name: "Sample product", channel: "Import to India", origin: null, unit_price: null, image_base64: null, url_text: null }, payload || {});
    renderResult(data, payload);
  };
  window.__lrComputeDuty = computeDuty; // expose for duty-math verification

  /* =========================================================================
     Enterprise lead form — posts via mailto (matches the site's #contact
     fallback). Honeypot + basic validation.
     ========================================================================= */
  var lead = $("leadForm");
  if (lead) {
    lead.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var hp = lead.querySelector('[name="website"]');
      if (hp && hp.value) return; // bot
      var n = $("l-name"), e = $("l-email"), m = $("l-msg"), msg = $("leadMsg");
      var nv = (n.value || "").trim(), ev2 = (e.value || "").trim(), mv = (m.value || "").trim();
      function show(t, ok) { msg.textContent = t; msg.className = "lead-msg show " + (ok ? "ok" : "err"); }
      if (nv.length < 2) { show("Please enter your name.", false); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ev2)) { show("Please enter a valid work email.", false); return; }
      if (mv.length < 5) { show("Tell us a little about what you need.", false); return; }
      lrTrack("enterprise_cta_clicked", { where: "lead-form" });
      var body = "Name: " + nv + "\nEmail: " + ev2 + "\n\n" + mv;
      window.location.href = "mailto:care@launchrocket.in?subject=" +
        encodeURIComponent("Pilot request — HS classification") + "&body=" + encodeURIComponent(body);
      show("Opening your email client… if nothing happens, email care@launchrocket.in directly.", true);
      lead.reset();
    });
  }

})();
