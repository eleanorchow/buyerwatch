// Buyer Watch prototype: screens, actions, maker-checker flow, RM view, results and governance.
(function () {
  const D = window.BW_DATA, BW = window.BW, W = window.BW_MODEL;
  const $ = (s, r = document) => r.querySelector(s);
  const money = (n) => "S$" + Math.round(n).toLocaleString("en-SG");
  const pct = (p) => (p >= 0.995 ? ">99%" : p < 0.01 ? "<1%" : Math.round(p * 100) + "%");
  const pct1 = (p) => (p * 100).toFixed(1) + "%";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const BAND = { high: "High risk", watch: "Watch", low: "Low risk" };
  const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
  const monthName = (m) => new Date(m + "-01T00:00:00").toLocaleDateString("en-SG", { month: "short" });
  const byId = (id) => D.buyers.find((b) => b.id === id);
  const NEXT_SCAN = "1 Dec 2026";

  const S = {
    view: "buyers", sel: null, ai: true,
    rmConfirmed: {}, rmFlagged: {}, done: {}, open: null,
    extraUnbilled: {}, payments: {}, requests: [], audit: [], err: {},
  };
  function log(who, what) {
    const t = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    S.audit.unshift({ t, who, what });
  }
  log("Buyer Watch", "Weekly scan finished: 5 buyers, 10 months of receipts, 7 public items read");
  log("Buyer Watch", "High alert raised for Norbridge Construction. RM call-back scheduled before any action");
  log("Buyer Watch", "Watch alert raised for Halcyon Build");
  log("Buyer Watch", "Winding-up notice for 'Corvane Holdings Ltd' ignored: not the same company as your buyer Corvane Contractors");

  const assessAll = () => BW.totals(S.extraUnbilled);
  const exposureOf = (id) => assessAll().rows.find((r) => r.b.id === id).total;

  // ------------------------------------------------------------------ navigation
  const NAV = [
    { sec: "IDEAL" },
    { id: "accounts", label: "Accounts", disabled: true },
    { id: "payments", label: "Payments", disabled: true },
    { id: "trade", label: "Trade finance", disabled: true },
    { sec: "Buyer Watch" },
    { id: "buyers", label: "Buyer Watch", isNew: true, badge: () => (S.ai ? assessAll().rows.filter((r) => r.a.band !== "low").length : 0) },
    { id: "approvals", label: "Approvals", badge: () => pendingApprovals() },
    { id: "financing", label: "Financing requests", badge: () => 0 },
    { sec: "DBS side" },
    { id: "rm", label: "RM view" },
    { sec: "About this concept" },
    { id: "results", label: "Pilot results" },
    { id: "governance", label: "Governance" },
  ];
  function pendingApprovals() {
    const p = D.pendingPayments.filter((x) => !S.payments[x.id]).length;
    return p + S.requests.filter((r) => r.status === "pending").length;
  }
  function renderNav() {
    $("#sidenav").innerHTML = NAV.map((n) => {
      if (n.sec) return `<div class="sec">${n.sec}</div>`;
      const b = n.badge ? n.badge() : 0;
      return `<button class="nav-btn${S.view === n.id ? " active" : ""}" data-nav="${n.id}" ${n.disabled ? "disabled" : ""}>
        <span>${n.label}</span><span>${n.isNew ? '<span class="new">NEW</span> ' : ""}${b ? `<span class="badge">${b}</span>` : ""}</span></button>`;
    }).join("");
    $("#who").innerHTML = `<strong>${esc(D.client.name)}</strong>Figures as of ${fmtDate(D.asOf)}`;
    $("#viewas-buyers").innerHTML = `Viewing as <b>${esc(D.client.maker)}</b>`;
    $("#viewas-approvals").innerHTML = `Viewing as <b>${esc(D.client.approver)}</b>`;
    $("#viewas-rm").innerHTML = `Viewing as <b>${esc(D.client.rm)}</b>`;
  }
  function show(view) {
    S.view = view;
    document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== "view-" + view; });
    render();
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ buyer watch screen
  function renderSummary(t) {
    const atRisk = t.rows.filter((r) => r.a.band !== "low").reduce((s, r) => s + r.total, 0);
    const top = [...t.rows].sort((a, b) => b.share - a.share)[0];
    const segs = [...t.rows].sort((a, b) => b.share - a.share).map((r) =>
      `<span class="${S.ai ? r.a.band : "low"}" style="width:${(r.share * 100).toFixed(1)}%" title="${esc(r.b.acra)}: ${pct(r.share)}"></span>`).join("");
    $("#summary").innerHTML = `
      <h2>What your customers owe you, including work not yet billed and retention</h2>
      <div class="sumstats">
        <div><b>${money(t.sum)}</b>Total at stake</div>
        ${S.ai ? `<div class="warn"><b>${money(atRisk)}</b>With buyers on High or Watch</div>` : ""}
        <div><b>${pct(top.share)}</b>Largest customer (${esc(top.b.acra.split(" ")[0])})</div>
        <div><b>${fmtDate(D.asOf)}</b>Last weekly scan</div>
      </div>
      <div class="conc" role="img" aria-label="Share of exposure by customer">${segs}</div>
      ${S.ai ? `<div class="legend"><span><i style="background:var(--high)"></i>High risk</span><span><i style="background:#d99b3a"></i>Watch</span><span><i style="background:#8fb9a3"></i>Low risk</span></div>` : ""}`;
  }

  function renderList(t) {
    const rows = [...t.rows].sort((a, b) => (S.ai ? b.a.p - a.a.p : b.total - a.total));
    const max = Math.max(...rows.map((r) => r.total));
    $("#buyerList").innerHTML = `<h2>Your customers (${rows.length})</h2>` + rows.map((r) => {
      const e = r.b.exposure, extra = S.extraUnbilled[r.b.id] || 0, tot = r.total;
      const w = (v) => ((v / tot) * (tot / max) * 100).toFixed(1);
      return `<button class="row${S.sel === r.b.id ? " selected" : ""}" data-buyer="${r.b.id}">
        <span class="t">${esc(r.b.acra)}</span><span class="amt">${money(tot)}</span>
        <span class="m">${pct(r.share)} of what you're owed · terms ${r.b.terms} days</span>
        <span class="r">${S.ai ? `<span class="pill ${r.a.band}">${BAND[r.a.band]}</span>` : `<span class="pill grey">Alerts only</span>`}</span>
        <span class="sharebar"><span class="expbar" style="width:${((tot / max) * 100).toFixed(1)}%">
          <span class="inv" style="width:${((e.invoices / tot) * 100).toFixed(1)}%"></span>
          <span class="unb" style="width:${(((e.unbilled + extra) / tot) * 100).toFixed(1)}%"></span>
          <span class="ret" style="width:${((e.retention / tot) * 100).toFixed(1)}%"></span></span></span>
      </button>`;
    }).join("") + `<div class="pad"><div class="legend"><span><i style="background:var(--inv)"></i>Unpaid invoices</span><span><i style="background:var(--unb)"></i>Work done, not yet billed</span><span><i style="background:var(--ret)"></i>Retention held</span></div></div>`;
  }

  function trendSVG(b) {
    const P = b.payments, w = 560, h = 190, L = 34, B = 24, T = 10;
    const max = Math.max(90, ...P.map((p) => p.days)) + 5;
    const bw = (w - L - 10) / P.length;
    const y = (v) => T + (h - T - B) * (1 - v / max);
    let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Days taken to pay each month">`;
    [0, 30, 60, 90].forEach((v) => { s += `<line x1="${L}" x2="${w - 6}" y1="${y(v)}" y2="${y(v)}" stroke="#e1e5ea"/><text x="${L - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="#5f6b76">${v}</text>`; });
    P.forEach((p, i) => {
      const x = L + i * bw + 4, part = p.paid < p.invoice;
      s += `<rect x="${x}" y="${y(p.days)}" width="${bw - 8}" height="${y(0) - y(p.days)}" rx="2" fill="${part ? "#c4141f" : "#9aa3ad"}"><title>${monthName(p.m)}: paid after ${p.days} days${part ? " (part-paid)" : ""}</title></rect>`;
      s += `<text x="${x + (bw - 8) / 2}" y="${h - 8}" font-size="10" text-anchor="middle" fill="#5f6b76">${monthName(p.m)}</text>`;
      if (i === P.length - 1) s += `<text x="${x + (bw - 8) / 2}" y="${y(p.days) - 4}" font-size="11" font-weight="700" text-anchor="middle" fill="#1f2328">${p.days}</text>`;
    });
    s += `<line x1="${L}" x2="${w - 6}" y1="${y(b.terms)}" y2="${y(b.terms)}" stroke="#0f5c8a" stroke-dasharray="5 4" stroke-width="1.5"/>`;
    s += `</svg>`;
    return s;
  }

  function timeline(b, a) {
    const items = [];
    b.payments.slice(-6).forEach((p) => {
      const who = BW.payerFor(b, p), part = p.paid < p.invoice;
      const payer = who.kind === "related" ? `${esc(p.payer)} <span class="bad">(related company, not ${esc(b.acra.split(" ")[0])})</span>` : esc(p.payer);
      items.push({ d: p.m + "-28", html: `<span class="${part ? "bad" : p.days > b.terms + 15 ? "meh" : "ok"}">${part ? "Part-paid" : "Paid"} ${money(p.paid)}${part ? ` of ${money(p.invoice)}` : ""}</span> after ${p.days} days
        <span class="why">Payer in bank record: ${payer}${p.bank !== b.payments[0].bank ? ` · <span class="bad">new paying bank (${esc(p.bank)})</span>` : ""}</span>` });
    });
    a.notices.forEach((n) => {
      const counts = n.match >= 0.8;
      const cls = !counts ? "ignored" : n.read.severity >= 0.6 ? "bad" : n.read.severity > 0 ? "meh" : "ok";
      items.push({ d: n.date, cls: counts ? "" : "ignored", html: `<span class="src">${esc(n.source)}</span><span class="${cls === "ignored" ? "" : cls}">${esc(n.text)}</span>
        <span class="why">${counts ? `AI reading: <b>${n.read.label}</b> (${pct(n.read.conf)} sure) · matched to your buyer (${pct(n.match)})`
          : `Ignored: "${esc(n.subject)}" is a different company from your buyer (name match ${pct(n.match)})`}</span>` });
    });
    items.sort((x, y) => y.d.localeCompare(x.d));
    return `<ul class="tl">${items.map((i) => `<li class="${i.cls || ""}"><span class="d">${i.d.endsWith("-28") ? monthName(i.d.slice(0, 7)) + " " + i.d.slice(0, 4) : fmtDate(i.d)}</span><span>${i.html}</span></li>`).join("")}</ul>`;
  }

  function payerTable(b) {
    const seen = new Map();
    b.payments.forEach((p) => { if (!seen.has(p.payer)) seen.set(p.payer, p); });
    const rows = [...seen.values()].map((p) => {
      const m = BW.payerFor(b, p);
      const res = m.kind === "direct" ? `<span class="ok">${esc(b.acra)}</span>` : m.kind === "related"
        ? `<span class="bad">${esc(m.entity)}</span><span class="why">${esc(m.link)}</span>` : `<span class="meh">Needs review</span>`;
      const how = m.kind === "related" ? `Not ${esc(b.acra.split(" ")[0])} itself (${pct(m.p)}), so treated as a related-company payment` : p.uenRef ? "UEN in PayNow reference" : "Name match after expanding short forms";
      return `<tr><td>${esc(p.payer)}</td><td>${res}</td><td class="n">${m.kind === "related" ? pct(m.relP) : pct(m.p)}</td><td>${how}</td></tr>`;
    }).join("");
    return `<div class="tw"><table><tr><th>Payer name in bank record</th><th>Matched to (ACRA)</th><th>Match</th><th>How</th></tr>${rows}</table></div>
      <p class="note">An exact-name rule would miss short forms like "CONSTR" or "P/L". The matcher is a small model trained on synthetic payer names.</p>`;
  }

  function whyBlock(a) {
    const max = Math.max(...a.contrib.map((c) => Math.abs(c.c)), 0.01);
    return `<details class="why"><summary>Why this rating (show the AI's reasoning)</summary>
      ${a.contrib.map((c) => `<div class="contrib"><span>${esc(c.text)}</span><span class="bar"><span style="width:${(Math.max(0, c.c) / max * 100).toFixed(0)}%"></span></span><span class="n">+${c.c.toFixed(1)}</span></div>`).join("")}
      <p class="note mt">Each number is how much that factor pushes the score up (model weight × value). Starting point ${W.risk.intercept.toFixed(1)}; High risk from ${pct(W.risk.high)}.</p></details>`;
  }

  function journey(b, a) {
    const pay = D.pendingPayments.find((p) => p.buyer === b.id);
    const decided = pay && S.payments[pay.id];
    const reqs = S.requests.filter((r) => r.buyer === b.id);
    const human = S.rmConfirmed[b.id] && (b.id !== "NOR" || decided) && (b.id !== "HAL" || reqs.length);
    const avoided = decided && decided.status !== "Approved" ? pay.amount : 0;
    const freed = reqs.filter((r) => r.status !== "rejected").reduce((s, r) => s + r.amount, 0);
    const first = b.payments[0], last = b.payments[b.payments.length - 1];
    const parts = b.payments.slice(-6).filter((p) => p.paid < p.invoice).length;
    const top = a.notices.filter((n) => n.match >= 0.8).sort((x, y) => y.read.severity - x.read.severity)[0];
    const outcome = avoided || freed ? `${freed ? `${money(freed)} of financing requested. ` : ""}${avoided ? `${money(avoided)} of extra exposure avoided.` : ""}` : "Waiting for your decisions.";
    return `<div><div class="label">The journey (DBS 5 steps)</div><div class="journey">
      <div class="step done"><b>1 Before</b>You would only notice when ${esc(b.acra.split(" ")[0])} stops paying. ${money(a.exposure)} at stake.</div>
      <div class="step done"><b>2 Signal</b>Now takes ${last.days} days to pay (${first.days} in ${monthName(first.m)}), ${parts} part-payment${parts === 1 ? "" : "s"}${top ? `, ${top.read.label.toLowerCase()} (${fmtDate(top.date)})` : ""}.</div>
      <div class="step done"><b>3 AI thinks</b>Matched payer to ACRA, read ${a.notices.length} public item${a.notices.length === 1 ? "" : "s"}, rated ${BAND[a.band]} (${pct(a.p)}), worked out exposure.</div>
      <div class="step${human ? " done" : ""}"><b>4 Human decides</b>${S.rmConfirmed[b.id] ? "RM confirmed on call. " : a.band === "high" ? "RM call scheduled. " : "RM informed. "}You and the director choose the actions below.</div>
      <div class="step${avoided || freed ? " done" : ""}"><b>5 Outcome</b>${outcome}</div></div></div>`;
  }

  function actionsFor(b, a) {
    const pay = D.pendingPayments.find((p) => p.buyer === b.id);
    const overdue = b.invoices.filter((i) => i.status.startsWith("Overdue")).reduce((s, i) => s + i.amount, 0);
    if (a.band === "high") {
      const healthy = D.buyers.filter((x) => BW.assess(x).band === "low" && ["TES", "LUM"].includes(x.id));
      const pool = healthy.reduce((s, x) => s + x.exposure.invoices, 0);
      return [
        { id: "rm", t: "A DBS RM confirms this alert with you first", s: `High alerts are always checked by a person. ${esc(D.client.rm.split(" (")[0])} will call you within 1 working day.`,
          state: S.rmConfirmed[b.id] ? "Confirmed on call by your RM" : "Call scheduled" },
        pay && { id: "hold", t: `Decide on the ${money(pay.amount)} supplier payment for this project`, s: `It is waiting for the director. Approving it would raise what you could lose on ${esc(b.acra.split(" ")[0])} to ${money(exposureOf(b.id) + (S.payments[pay.id] ? 0 : pay.amount))}.`,
          btn: S.payments[pay.id] ? null : "Open in Approvals", state: S.payments[pay.id] ? `Director: ${S.payments[pay.id].status}` : null },
        { id: "letter", t: "Ask for overdue payment and payment security", s: `${money(overdue)} is overdue. A pre-filled letter asks for payment and a banker's guarantee or escrow before more work.`, btn: "Prepare letter" },
        { id: "finance", t: "Free up cash using invoices from healthy customers", s: `Tessera and Lumen invoices (${money(pool)}, both low risk) can back DBS invoice financing of up to 90%. ${esc(b.acra.split(" ")[0])} invoices are not offered: DBS credit would not take on a buyer facing a winding-up application.`,
          btn: "Prepare request", amount: Math.round(pool * 0.9), invoicesFrom: healthy },
      ].filter(Boolean);
    }
    if (a.band === "watch") {
      const notDue = b.invoices.filter((i) => !i.status.startsWith("Overdue")).reduce((s, i) => s + i.amount, 0);
      return [
        { id: "rm", t: "Your RM is told about this alert", s: "Watch alerts are shared with your RM (with your consent) so you can talk them through.", state: S.rmConfirmed[b.id] ? "Discussed with your RM" : "RM informed" },
        { id: "protect", t: `Protect ${esc(b.acra.split(" ")[0])} invoices now, while the risk is still moderate`, s: `Non-recourse receivables purchase on the ${money(notDue)} of invoices not yet due: DBS pays up to 90% now and covers you if the buyer fails. DBS credit prices it independently.`,
          btn: "Prepare request", amount: Math.round(notDue * 0.9), invoicesFrom: [b] },
        { id: "terms", t: "Shorten terms on new invoices", s: `Move from ${b.terms} to 30 days, or ask for progress payments.`, btn: "Prepare letter" },
        { id: "watch", t: "Keep watching", s: `Buyer Watch checks again on ${NEXT_SCAN}.` },
      ];
    }
    return [];
  }

  function letterText(b, id) {
    const overdue = b.invoices.filter((i) => i.status.startsWith("Overdue"));
    if (id === "letter") return `To: Accounts Payable, ${b.acra}\nSubject: Overdue invoices and payment security\n\nDear Sir/Madam,\n\nOur records show ${overdue.map((i) => `${i.no} (${money(i.amount)}, due ${fmtDate(i.due)})`).join(" and ")} remain unpaid.\n\nPlease arrange payment within 7 days. Before we continue further works on the ${b.project}, we also ask for payment security in the form of a banker's guarantee or an escrow arrangement.\n\nYours faithfully,\n${D.client.maker.split(" (")[0]}\n${D.client.name}`;
    return `To: ${b.acra}\nSubject: Payment terms for new invoices\n\nDear Sir/Madam,\n\nFrom 1 January 2027, new invoices for the ${b.project} will be payable within 30 days, with progress payments every month.\n\nThank you for your understanding.\n\n${D.client.maker.split(" (")[0]}\n${D.client.name}`;
  }

  function openBox(b, act) {
    if (act.id === "letter" || act.id === "terms") {
      return `<div class="box"><h4>Draft letter (you can edit before sending)</h4><div class="draft">${esc(letterText(b, act.id))}</div>
        <div class="actions"><button class="btn primary small" data-do="sent" data-b="${b.id}" data-a="${act.id}">Mark as sent</button><button class="btn small" data-do="close">Close</button></div>
        <p class="note">Buyer Watch never sends anything on its own. You send the letter from your own email.</p></div>`;
    }
    const invs = act.invoicesFrom.flatMap((x) => x.invoices.filter((i) => !i.status.startsWith("Overdue")).map((i) => ({ ...i, who: x.acra })));
    const product = act.id === "protect" ? "Accounts Receivable Purchase (non-recourse)" : "Invoice financing";
    return `<div class="box"><h4>Pre-filled request: ${product}</h4>
      <dl class="form-row"><dt>Applicant</dt><dd>${esc(D.client.name)}</dd><dt>Invoices</dt><dd>${invs.map((i) => `${i.no} ${esc(i.who.split(" ")[0])} ${money(i.amount)}`).join("<br>")}</dd>
      <dt>Amount requested</dt><dd>${money(act.amount)} (up to 90%)</dd><dt>Prepared by</dt><dd>${esc(D.client.maker)}</dd><dt>Next step</dt><dd>Director approves with Digital Token, then DBS credit decides and prices it</dd></dl>
      <div class="actions"><button class="btn primary small" data-do="request" data-b="${b.id}" data-a="${act.id}" data-amt="${act.amount}" data-product="${product}">Send to director for approval</button><button class="btn small" data-do="close">Close</button></div></div>`;
  }

  function renderCard(t) {
    const r = t.rows.find((x) => x.b.id === S.sel);
    const b = r.b, a = r.a;
    if (!S.ai) {
      $("#buyerCard").innerHTML = `<h2>${esc(b.acra)}</h2><div class="body">
        <div class="msg grey">Buyer Watch is switched off, so this is what IDEAL shows today: incoming-funds alerts only, with no view of whether this customer can keep paying.</div>
        <ul class="tl">${b.payments.slice(-6).reverse().map((p) => `<li><span class="d">${monthName(p.m)} ${p.m.slice(0, 4)}</span><span>Incoming funds ${money(p.paid)} from ${esc(p.payer)}</span></li>`).join("")}</ul></div>`;
      return;
    }
    const acts = actionsFor(b, a);
    const ttl = a.band === "high" ? "High risk: may not pay within 90 days" : a.band === "watch" ? "Watch: early signs of strain" : "Low risk: paying normally";
    $("#buyerCard").innerHTML = `<h2>${esc(b.acra)}</h2><div class="body">
      <div class="head"><div><h3>${esc(b.acra)}</h3><div class="sub">UEN ${b.uen} (fictional) · terms ${b.terms} days · ${esc(b.project)}</div></div>
        <div style="text-align:right"><div class="big">${money(r.total)}</div><div class="sub">${pct(r.share)} of what you're owed</div></div></div>
      <div class="verdict ${a.band}"><div class="head"><span class="ttl">${ttl}</span><span class="pct">${pct(a.p)}</span></div>
        <div class="meter"><span style="width:${(a.p * 100).toFixed(0)}%"></span></div>
        <span class="s">Chance of not being paid in the next 90 days, from your own receipts and public records. ${a.band === "high" ? (S.rmConfirmed[b.id] ? "Confirmed by your RM on a call." : "Your RM will call to confirm before you act.") : ""}</span></div>
      <dl class="facts"><dt>Unpaid invoices</dt><dd>${money(b.exposure.invoices)} (${b.invoices.map((i) => `${i.no}: ${i.status.toLowerCase()}`).join(", ")})</dd>
        <dt>Work done, not yet billed</dt><dd>${money(b.exposure.unbilled + (S.extraUnbilled[b.id] || 0))}${S.extraUnbilled[b.id] ? ` (includes ${money(S.extraUnbilled[b.id])} just approved)` : ""}</dd>
        <dt>Retention they hold</dt><dd>${money(b.exposure.retention)}</dd></dl>
      <div class="figure">${trendSVG(b)}<div class="cap">Days taken to pay each month. Red bars were only part-paid. Blue dashed line = agreed terms (${b.terms} days).</div></div>
      <div><div class="label">Evidence</div>${timeline(b, a)}</div>
      ${whyBlock(a)}
      <details class="why"><summary>How the payer names were recognised</summary>${payerTable(b)}</details>
      ${a.band !== "low" ? journey(b, a) : ""}
      <div><div class="label">${acts.length ? "Suggested next steps (you decide)" : "Next step"}</div>
        ${acts.length ? `<div class="acts">${acts.map((x, i) => {
          const key = b.id + ":" + x.id, done = S.done[key] || (x.id === "rm" && S.rmConfirmed[b.id]) || (x.id === "hold" && S.payments["PAY-7781"]);
          return `<div class="act${done ? " doneact" : ""}" data-key="${key}"><span class="n">${done ? "✓" : i + 1}</span><span class="t">${x.t}</span>
            <span class="btns">${x.state ? `<span class="status">${esc(x.state)}</span>` : ""}${!done && x.btn ? `<button class="btn ${["finance", "protect"].includes(x.id) ? "primary" : "outline"} small" data-do="open" data-b="${b.id}" data-a="${x.id}">${x.btn}</button>` : ""}${done && S.done[key] ? `<span class="status">${esc(S.done[key])}</span>` : ""}</span>
            <span class="s">${x.s}</span>${S.open === key ? `<div style="grid-column:1/-1">${openBox(b, x)}</div>` : ""}</div>`;
        }).join("")}</div>` : `<div class="msg low">No action needed. Buyer Watch checks again on ${NEXT_SCAN}.</div>`}</div>
      <p class="note">${S.err.fb === b.id ? "Thanks. Your feedback was sent to the DBS model team and logged." : `<button class="btn small" data-do="feedback" data-b="${b.id}">This alert looks wrong</button> Feedback goes to the DBS model team.`}</p>
    </div>`;
  }

  function renderBuyers() {
    const t = assessAll();
    if (!S.sel) S.sel = [...t.rows].sort((a, b) => b.a.p - a.a.p)[0].b.id;
    $("#killSlot").innerHTML = S.ai ? "" : `<div class="killbar">Kill switch is on: Buyer Watch AI is off. IDEAL falls back to plain incoming-funds alerts.</div>`;
    renderSummary(t); renderList(t); renderCard(t);
  }

  // ------------------------------------------------------------------ approvals (maker-checker)
  function briefing(p) {
    if (!S.ai) return `<div class="brief"><span class="h">No briefing</span>Buyer Watch is switched off.</div>`;
    if (!p.buyer) return `<div class="brief low"><span class="h">Buyer Watch briefing</span>Not linked to any customer project. Nothing to add.</div>`;
    const b = byId(p.buyer), a = BW.assess(b), now = exposureOf(b.id);
    if (a.band === "low") return `<div class="brief low"><span class="h">Buyer Watch briefing</span>Funds work for ${esc(b.acra)} (Low risk, paying normally). Nothing unusual.</div>`;
    const overdue = b.invoices.filter((i) => i.status.startsWith("Overdue")).reduce((s, i) => s + i.amount, 0);
    return `<div class="brief ${a.band}"><span class="h">Buyer Watch briefing</span>
      <span>This payment funds work for <b>${esc(b.acra)}</b>, rated <b>${BAND[a.band]} (${pct(a.p)})</b>.</span>
      <span>If they do not pay, what you could lose rises from <b>${money(now)}</b> to <b>${money(now + p.amount)}</b>. ${money(overdue)} of their invoices are already overdue.</span>
      <span>RM call: ${S.rmConfirmed[b.id] ? "done, alert confirmed" : "scheduled"}. Consider holding until they pay or give payment security. You decide.</span></div>`;
  }
  function renderApprovals() {
    const pays = D.pendingPayments.map((p) => {
      const st = S.payments[p.id];
      const linkedHigh = p.buyer && BW.assess(byId(p.buyer)).band === "high" && S.ai;
      return `<div class="payrow"><div class="top"><div><b>${esc(p.payee)}</b><div class="sub note">${p.id} · ${esc(p.purpose)} · prepared by ${esc(p.maker)}</div></div><div class="big">${money(p.amount)}</div></div>
        ${briefing(p)}
        ${st ? `<div class="msg ${st.status === "Approved" ? "grey" : "low"}">${esc(st.status)}${st.note ? `: "${esc(st.note)}"` : ""}</div>` : `
        ${linkedHigh ? `<label class="note" for="note-${p.id}">Approving a payment linked to a High-risk buyer needs a short reason (kept in the audit trail).</label><textarea id="note-${p.id}" placeholder="Reason for approving"></textarea>` : ""}
        ${S.err[p.id] ? `<div class="msg high">${esc(S.err[p.id])}</div>` : ""}
        <div class="actions"><button class="btn primary small" data-pay="${p.id}" data-st="Approved">Approve with Digital Token</button><button class="btn outline small" data-pay="${p.id}" data-st="On hold">Hold</button><button class="btn small" data-pay="${p.id}" data-st="Rejected">Reject</button></div>`}</div>`;
    }).join("");
    const reqs = S.requests.filter((r) => r.status === "pending").map((r) => `<div class="payrow"><div class="top"><div><b>${esc(r.product)}</b><div class="sub note">${r.ref} · prepared by ${esc(D.client.maker)} from Buyer Watch (${esc(byId(r.buyer).acra)} alert)</div></div><div class="big">${money(r.amount)}</div></div>
      <div class="actions"><button class="btn primary small" data-req="${r.ref}" data-st="approve">Approve and submit to DBS</button><button class="btn small" data-req="${r.ref}" data-st="reject">Reject</button></div></div>`).join("");
    $("#approvals").innerHTML = `<div class="panel"><h2>Payments (${D.pendingPayments.filter((p) => !S.payments[p.id]).length} waiting)</h2>${pays}</div>
      ${reqs ? `<div class="panel" style="margin-top:16px"><h2>Financing requests waiting for you</h2>${reqs}</div>` : ""}`;
  }

  function renderFinancing() {
    if (!S.requests.length) { $("#financing").innerHTML = `<div class="panel"><div class="empty">No requests yet. Prepare one from a Buyer Watch alert.</div></div>`; return; }
    const step = (on, t) => `<li class="${on ? "ok" : ""}">${on ? "✓ " : ""}${t}</li>`;
    $("#financing").innerHTML = `<div class="panel"><h2>Requests</h2><div class="pad">${S.requests.map((r) => `
      <div class="box"><h4>${r.ref} · ${esc(r.product)} · ${money(r.amount)}</h4><span class="note">From the ${esc(byId(r.buyer).acra)} alert</span>
        <ul class="plain ok-list">${step(true, "Prepared by " + D.client.maker)}${step(r.status !== "pending" && r.status !== "rejected", "Approved by " + D.client.approver)}${step(r.status === "submitted", "Submitted to DBS")}
        <li>${r.status === "submitted" ? "DBS credit review in progress. DBS decides and prices it; nothing is automatic." : r.status === "rejected" ? "Rejected by the director." : "Waiting for the director."}</li></ul></div>`).join("")}</div></div>`;
  }

  // ------------------------------------------------------------------ RM view
  function renderRM() {
    const nor = BW.assess(byId("NOR"));
    const t = assessAll(), share = t.rows.find((r) => r.b.id === "NOR").share;
    const rows = D.rmClients.map((c) => {
      const live = c.live, band = live ? nor.band : c.band, sh = live ? share : c.share, ex = live ? exposureOf("NOR") : c.exposure;
      return `<tr><td>${esc(c.client)}</td><td>${esc(c.topBuyer)}</td><td class="n">${pct(sh)}</td><td><span class="pill ${band}">${BAND[band]}</span></td><td class="n">${money(ex)}</td></tr>`;
    }).join("");
    $("#rm").innerHTML = `<div class="grid2">
      <div class="panel pad"><h2>Call-backs before clients act on High alerts</h2>
        <div class="box"><h4>${esc(D.client.name)}: ${esc(byId("NOR").acra)} (${pct(nor.p)})</h4>
          <span>Call ${esc(D.client.maker.split(" (")[0])} to confirm the alert, check nothing is wrong (for example a payment we could not see), and talk through options.</span>
          ${S.rmConfirmed.NOR ? `<div class="msg low">Call done: client confirmed the alert.</div>` : S.rmFlagged.NOR ? `<div class="msg grey">Sent to the model team as a possible false alarm.</div>` : `<div class="actions"><button class="btn primary small" data-rm="confirm">Mark call done: client confirmed</button><button class="btn small" data-rm="flag">Alert looks wrong</button></div>`}</div>
        <div class="box"><h4>Pasir Ris Tiling Works Pte Ltd: Ironbark Construction</h4><span class="status">Call scheduled for tomorrow</span></div>
        <p class="note">This is the "human sees it, DBS calls the customer" guardrail. High alerts are never acted on by AI alone.</p></div>
      <div class="panel pad"><h2>Clients sharing Buyer Watch alerts</h2>
        <div class="tw"><table><tr><th>Client</th><th>Largest buyer</th><th>Share</th><th>Rating</th><th>At stake</th></tr>${rows}</table></div>
        <div class="private"><b>Banking secrecy.</b> Each client's alert uses only that client's own receipts and public records. One client's alert is never shown to another client, even if they share a buyer.</div></div></div>`;
  }

  // ------------------------------------------------------------------ results
  function renderResults() {
    const m = W.risk.metrics, mm = W.matcher.metrics, P = D.pricing;
    const bar = (label, v, max, ai, fmt) => `<div class="cbar"><span>${label}</span><span class="track"><span class="fill${ai ? " ai" : ""}" style="width:${(v / max * 100).toFixed(0)}%"></span></span><span class="v">${fmt(v)}</span></div>`;
    const cost = (P.tokensPerMonth / 1000) * P.costPer1kTokens;
    const sumAct = (act, dflt) => S.requests.filter((r) => r.act === act && r.status !== "rejected").reduce((s, r) => s + r.amount, 0) || dflt;
    const fin = sumAct("finance", 394200), prot = sumAct("protect", 246600);
    $("#results").innerHTML = `<div class="grid2">
      <div class="panel pad"><h2>Early warning vs today</h2><p class="lead">Test on ${m.test_buyers.toLocaleString()} synthetic buyers. "Today" means chasing a buyer once it is 60 days late.</p>
        <div class="kpis"><div class="kpi"><b>${pct1(m.failures_flagged_before_default)}</b><span>of failing buyers flagged before they stop paying (today: ${pct1(m.failures_flagged_by_60_day_rule)})</span></div>
          <div class="kpi"><b>${m.median_warning_days_ai} days</b><span>median warning before default (today: ${m.median_warning_days_60_day_rule} days)</span></div>
          <div class="kpi"><b>${pct1(m.healthy_buyers_falsely_flagged)}</b><span>of healthy buyers wrongly flagged High</span></div></div>
        <div class="cmp"><div><div class="t">Failing buyers flagged in time</div>${bar("60-days-late rule", m.failures_flagged_by_60_day_rule, 1, false, pct1)}${bar("Buyer Watch", m.failures_flagged_before_default, 1, true, pct1)}</div>
          <div><div class="t">Payer names recognised correctly</div>${bar("Exact-name rule", mm.exact_rule_recall, 1, false, pct1)}${bar("Buyer Watch matcher", mm.model_recall_at_0_8, 1, true, pct1)}</div>
          <div><div class="t">Public notices read correctly (new wording)</div>${bar("Buyer Watch reader", W.reader.metrics.accuracy_completely_new_wording, 1, true, pct1)}</div></div></div>
      <div class="panel pad"><h2>Value in this demo</h2><div class="tw"><table>
        <tr><th>For</th><th>What changes</th><th class="n">Amount</th></tr>
        <tr><td>Client</td><td>Extra exposure avoided by holding the Norbridge supplier payment</td><td class="n">${money(180000)}</td></tr>
        <tr><td>Client</td><td>Cash freed now from healthy customers' invoices (90%)</td><td class="n">${money(fin)}</td></tr>
        <tr><td>Client</td><td>Halcyon invoices protected early with non-recourse purchase (90%)</td><td class="n">${money(prot)}</td></tr>
        <tr><td>Client</td><td>Overdue Norbridge invoices chased with a security request</td><td class="n">${money(595000)}</td></tr>
        <tr><td>DBS</td><td>Interest and fees on ${money(fin + prot)} of financing over 90 days (6% a year, assumed)</td><td class="n">${money((fin + prot) * 0.06 * 90 / 365)}</td></tr>
        <tr><td>DBS</td><td>Safer SME loan: the client's biggest bad-debt risk is handled early</td><td class="n">n/a</td></tr></table></div>
        <h2>Who pays for the AI</h2><div class="tw"><table>
        <tr><td>Language model tokens per client per month (about ${P.notMonthly} public items read)</td><td class="n">${(P.tokensPerMonth / 1000).toFixed(0)}k</td></tr>
        <tr><td>Token cost at S$${P.costPer1kTokens} per 1,000 tokens (assumed)</td><td class="n">S$${cost.toFixed(2)}</td></tr>
        <tr><td>Buyer Watch add-on fee per month (assumed; free with DBS receivables financing)</td><td class="n">${money(P.addOnPerMonth)}</td></tr>
        <tr><td><b>Fee covers the token cost</b></td><td class="n"><b>${(P.addOnPerMonth / cost).toFixed(0)}x</b></td></tr></table></div>
        <p class="note">The risk model and payer matcher are small and cheap to run. The language model is only used when a public item mentions one of your buyers.</p></div></div>`;
  }

  // ------------------------------------------------------------------ governance
  function renderGovernance() {
    const m = W.risk.metrics;
    $("#governance").innerHTML = `<div class="grid2">
      <div class="panel pad"><h2>Kill switch</h2>
        <label class="switch"><input type="checkbox" id="aiToggle" ${S.ai ? "checked" : ""}> Buyer Watch AI is ${S.ai ? "on" : "off (fallback active)"}</label>
        <p class="lead">Turning it off removes all ratings, briefings and suggestions. IDEAL goes back to today's incoming-funds alerts, so nothing breaks.</p>
        <h2>Data Buyer Watch may use</h2><div class="tw"><table>
        <tr class="okrow"><td>✓ Allowed</td><td>Your incoming payments in IDEAL (payer name, date, amount, paying bank)</td></tr>
        <tr class="okrow"><td>✓ Allowed</td><td>Invoices you upload or connect from your accounting system</td></tr>
        <tr class="okrow"><td>✓ Allowed</td><td>Public notices (MinLaw Insolvency Office, court winding-up notices) and news</td></tr>
        <tr class="okrow"><td>✓ Allowed</td><td>ACRA company records (officers, status, related companies), with your consent</td></tr>
        <tr class="lockrow"><td>✗ Never</td><td>Other DBS customers' accounts or payments, including your buyers' (banking secrecy, Banking Act s47)</td></tr>
        <tr class="lockrow"><td>✗ Never</td><td>Sharing your alerts with other clients, or DBS lending using them against your buyer (information wall)</td></tr></table></div></div>
      <div class="panel pad"><h2>Safety nets for DBS's review board</h2><div class="tw"><table>
        <tr><th>Safety net</th><th>Status</th></tr>
        <tr><td>3-month shadow run: alerts logged but not shown to clients</td><td>Before launch</td></tr>
        <tr><td>False-alarm limit: at most 2% of healthy buyers flagged High</td><td>${pct1(m.healthy_buyers_falsely_flagged)} in test</td></tr>
        <tr><td>RM calls the client before a High alert is acted on</td><td>On</td></tr>
        <tr><td>Every action needs people: maker prepares, director approves, DBS credit decides</td><td>On</td></tr>
        <tr><td>Graded alerts and no "stop dealing" advice, so alerts cannot snowball into a buyer's collapse</td><td>On</td></tr>
        <tr><td>"This alert looks wrong" button goes to the model team</td><td>On</td></tr>
        <tr><td>Monthly model check for drift and fairness</td><td>Scheduled</td></tr>
        <tr><td>PDPA and MAS FEAT review (Fairness, Ethics, Accountability, Transparency)</td><td>Required</td></tr></table></div></div>
      <div class="panel pad"><h2>Model card</h2><div class="tw"><table><tr><th>Part</th><th>What it does</th><th>Test result (synthetic)</th></tr>
        <tr><td>Payer matcher</td><td>Links payer names in bank records to ACRA companies (logistic regression on name-similarity features)</td><td>${pct1(W.matcher.metrics.model_recall_at_0_8)} recognised, ${(W.matcher.metrics.false_match_rate_at_0_8 * 100).toFixed(2)}% wrong matches</td></tr>
        <tr><td>Notice reader</td><td>Sorts public notices and news into types of warning sign (text classifier; a language model in production)</td><td>${pct1(W.reader.metrics.accuracy_completely_new_wording)} correct on new wording</td></tr>
        <tr><td>Risk model</td><td>Chance a buyer fails to pay within 90 days, with reasons (logistic regression)</td><td>AUC ${m.auc}, ${pct1(m.precision_at_high)} of High alerts correct</td></tr></table></div>
        <p class="note">Limits: trained on synthetic data only. A real pilot needs consented client data, a shadow run and independent model validation.</p></div>
      <div class="panel pad"><h2>Audit trail</h2><div class="tw"><table><tr><th>Time</th><th>Who</th><th>What</th></tr>
        ${S.audit.map((x) => `<tr><td>${x.t}</td><td>${esc(x.who)}</td><td>${esc(x.what)}</td></tr>`).join("")}</table></div></div></div>`;
  }

  // ------------------------------------------------------------------ render + events
  function render() {
    renderNav();
    if (S.view === "buyers") renderBuyers();
    if (S.view === "approvals") renderApprovals();
    if (S.view === "financing") renderFinancing();
    if (S.view === "rm") renderRM();
    if (S.view === "results") renderResults();
    if (S.view === "governance") renderGovernance();
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("button");
    if (!el) return;
    const d = el.dataset;
    if (d.nav) return show(d.nav);
    if (d.buyer) { S.sel = d.buyer; S.open = null; return render(); }
    if (d.do === "open") {
      if (d.a === "hold") return show("approvals");
      S.open = d.b + ":" + d.a; return render();
    }
    if (d.do === "close") { S.open = null; return render(); }
    if (d.do === "sent") {
      S.done[d.b + ":" + d.a] = "Letter sent"; S.open = null;
      log(D.client.maker.split(" (")[0], `Sent ${d.a === "letter" ? "overdue payment and security request" : "new payment terms"} letter to ${byId(d.b).acra}`);
      return render();
    }
    if (d.do === "request") {
      const ref = "FIN-" + (2401 + S.requests.length);
      S.requests.push({ ref, buyer: d.b, act: d.a, amount: +d.amt, product: d.product, status: "pending" });
      S.done[d.b + ":" + d.a] = "Sent to director (" + ref + ")"; S.open = null;
      log(D.client.maker.split(" (")[0], `Prepared ${d.product} request ${ref} for ${money(+d.amt)} and sent it for approval`);
      return render();
    }
    if (d.do === "feedback") { S.err.fb = d.b; log(D.client.maker.split(" (")[0], `Flagged the ${byId(d.b).acra} alert as possibly wrong`); return render(); }
    if (d.pay) {
      const p = D.pendingPayments.find((x) => x.id === d.pay);
      const ta = document.getElementById("note-" + p.id);
      const note = ta ? ta.value.trim() : "";
      if (d.st === "Approved" && ta && !note) { S.err[p.id] = "Please add a reason before approving."; return render(); }
      delete S.err[p.id];
      S.payments[p.id] = { status: d.st, note };
      if (d.st === "Approved" && p.buyer) S.extraUnbilled[p.buyer] = (S.extraUnbilled[p.buyer] || 0) + p.amount;
      log(D.client.approver.split(" (")[0], `${d.st} ${p.id} to ${p.payee} (${money(p.amount)})${note ? `, reason: ${note}` : ""}`);
      return render();
    }
    if (d.req) {
      const r = S.requests.find((x) => x.ref === d.req);
      r.status = d.st === "approve" ? "submitted" : "rejected";
      log(D.client.approver.split(" (")[0], `${d.st === "approve" ? "Approved and submitted" : "Rejected"} ${r.ref} (${money(r.amount)})`);
      if (r.status === "submitted") log("DBS", `${r.ref} received. Credit review started`);
      return render();
    }
    if (d.rm === "confirm") { S.rmConfirmed.NOR = true; log(D.client.rm.split(" (")[0], "Called client: Norbridge alert confirmed"); return render(); }
    if (d.rm === "flag") { S.rmFlagged.NOR = true; log(D.client.rm.split(" (")[0], "Sent Norbridge alert to model team as possible false alarm"); return render(); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "aiToggle") {
      S.ai = e.target.checked;
      log("DBS model owner", S.ai ? "Kill switch off: Buyer Watch AI back on" : "Kill switch on: Buyer Watch AI off, fallback to incoming-funds alerts");
      render();
    }
  });

  show("buyers");
})();
