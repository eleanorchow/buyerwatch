// Buyer Watch engine: payer matcher, notice reader, risk model, exposure and action plan.
// The three models use weights from js/model-weights.js (trained by model/train_model.py on synthetic data).
(function () {
  const W = window.BW_MODEL;
  const D = window.BW_DATA;
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));

  // ---------- 1. payer matcher (same features as the Python training script)
  const LEGAL = new Set(W.matcher.legal);
  const TYPES = new Set(W.matcher.types);
  function normalise(s) {
    s = s.toUpperCase().replace(/P\/L/g, " PTE LTD ").replace(/&/g, " AND ").replace(/S'PORE/g, "SINGAPORE");
    s = s.replace(/[^A-Z0-9 ]/g, " ");
    return s.split(/\s+/).filter(Boolean).map((t) => W.matcher.abbr[t] || t);
  }
  const core = (toks) => toks.filter((t) => !LEGAL.has(t));
  function trigrams(s) {
    s = "  " + s + " ";
    const out = new Set();
    for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
    return out;
  }
  function jac(a, b) {
    a = new Set(a); b = new Set(b);
    const inter = [...a].filter((x) => b.has(x)).length;
    const uni = new Set([...a, ...b]).size;
    return uni ? inter / uni : 0;
  }
  function typeMatch(rc, nc) {
    const rt = rc.filter((t) => TYPES.has(t)), nt = new Set(nc.filter((t) => TYPES.has(t)));
    if (!rt.length) return 0.5;
    return rt.every((t) => nt.has(t)) ? 1 : 0;
  }
  function pairFeatures(raw, name, uenRef) {
    const rc = core(normalise(raw)), nc = core(normalise(name));
    const rs = rc.join(""), ns = nc.join("");
    return [
      jac(trigrams(rs), trigrams(ns)),
      rc.length && nc.length && rc[0] === nc[0] ? 1 : 0,
      rs.length >= 6 && ns.startsWith(rs) ? 1 : 0,
      typeMatch(rc, nc),
      uenRef ? 1 : 0,
    ];
  }
  function matchScore(raw, name, uenRef) {
    const f = pairFeatures(raw, name, uenRef);
    let z = W.matcher.intercept;
    f.forEach((x, i) => { z += W.matcher.coef[i] * x; });
    return { p: sigmoid(z), f };
  }

  // ---------- 2. notice reader (bag of words + word pairs, like CountVectorizer(ngram_range=(1, 2)))
  const LABELS = {
    winding_up: "Winding-up or liquidation", legal_claim: "Legal claim for unpaid sums", project_halt: "Work stopped on site",
    officer_change: "Directors or officers left", financial_strain: "Financial strain", neutral: "No risk (neutral or positive)",
  };
  function readNotice(text) {
    const toks = text.toLowerCase().match(/\b\w\w+\b/g) || [];
    const grams = new Set(toks);
    for (let i = 0; i < toks.length - 1; i++) grams.add(toks[i] + " " + toks[i + 1]);
    const scores = W.reader.classes.map((c) => {
      let z = W.reader.intercept[c];
      grams.forEach((g) => { if (W.reader.coef[c][g] !== undefined) z += W.reader.coef[c][g]; });
      return z;
    });
    const mx = Math.max(...scores);
    const ex = scores.map((s) => Math.exp(s - mx));
    const sum = ex.reduce((a, b) => a + b, 0);
    const probs = ex.map((e) => e / sum);
    const k = probs.indexOf(Math.max(...probs));
    const cls = W.reader.classes[k];
    return { cls, label: LABELS[cls], conf: probs[k], severity: W.reader.severity[cls] };
  }

  // ---------- 3. risk model
  const FEAT_TEXT = {
    delay_trend: (x) => `Paying ${Math.round(x * 30)} days slower than 3 months ago`,
    late_vs_terms: (x) => `On average ${Math.round(x * 30)} days past the agreed terms`,
    partial_share: (x) => `${Math.round(x * 6)} of the last 6 payments were only part-paid`,
    payer_change: (x) => (x ? "Recent payment came from a different payer or bank" : "Same payer and bank as usual"),
    public_signal: (x) => (x >= 1 ? "Public notice: winding-up or liquidation" : x >= 0.6 ? "Public notice: legal claim or work stopped" :
      x >= 0.4 ? "Public record: directors or officers left" : x > 0 ? "News: signs of financial strain" : "No public warning signs"),
  };
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;

  function noticesFor(buyer) {
    return D.notices.map((n) => {
      const m = matchScore(n.subject, buyer.acra, false);
      return { ...n, match: m.p, sameFirstWord: m.f[1] === 1, read: readNotice(n.text) };
    }).filter((n) => n.match >= 0.3 || n.sameFirstWord);   // near-misses are shown, but only matches >= 0.8 count
  }
  function payerFor(buyer, pay) {
    const direct = matchScore(pay.payer, buyer.acra, !!pay.uenRef);
    if (direct.p >= 0.8) return { kind: "direct", p: direct.p, entity: buyer.acra };
    const rel = (buyer.relatedCompanies || []).map((r) => ({ r, s: matchScore(pay.payer, r.name, false) }))
      .sort((a, b) => b.s.p - a.s.p)[0];
    if (rel && rel.s.p >= 0.8) return { kind: "related", p: direct.p, entity: rel.r.name, link: rel.r.link, relP: rel.s.p };
    return { kind: direct.p >= 0.5 ? "review" : "unknown", p: direct.p, entity: buyer.acra };
  }

  function features(buyer) {
    const pays = buyer.payments.slice(-6);
    const d = pays.map((p) => p.days);
    const last3 = avg(d.slice(-3)), prev3 = avg(d.slice(0, 3));
    const usualBank = buyer.payments[0].bank;
    const payerChange = pays.slice(-3).some((p) => p.bank !== usualBank || payerFor(buyer, p).kind !== "direct") ? 1 : 0;
    const public_ = Math.max(0, ...noticesFor(buyer).filter((n) => n.match >= 0.8).map((n) => n.read.severity));
    return {
      delay_trend: (last3 - prev3) / 30,
      late_vs_terms: Math.max(0, last3 - buyer.terms) / 30,
      partial_share: pays.filter((p) => p.paid < p.invoice).length / pays.length,
      payer_change: payerChange,
      public_signal: public_,
    };
  }

  function assess(buyer) {
    const x = features(buyer);
    let z = W.risk.intercept;
    const contrib = W.risk.features.map((k, i) => {
      const c = W.risk.coef[i] * x[k];
      z += c;
      return { k, x: x[k], c, text: FEAT_TEXT[k](x[k]) };
    }).sort((a, b) => b.c - a.c);
    const p = sigmoid(z);
    const band = p >= W.risk.high ? "high" : p >= W.risk.watch ? "watch" : "low";
    const exp = buyer.exposure;
    return { p, band, x, contrib, exposure: exp.invoices + exp.unbilled + exp.retention, notices: noticesFor(buyer) };
  }

  function totals(extraUnbilled) {
    const rows = D.buyers.map((b) => {
      const a = assess(b);
      const extra = (extraUnbilled && extraUnbilled[b.id]) || 0;
      return { b, a, total: a.exposure + extra };
    });
    const sum = rows.reduce((s, r) => s + r.total, 0);
    rows.forEach((r) => { r.share = r.total / sum; });
    return { rows, sum };
  }

  window.BW = { matchScore, pairFeatures, readNotice, payerFor, features, assess, totals, LABELS };
})();
