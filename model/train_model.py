"""Buyer Watch: trains the three small models used by the prototype on synthetic data.

1. Payer matcher   - logistic regression on name-similarity features (bank payer name vs ACRA name)
2. Notice reader   - text classifier for public notices and news (type of distress signal)
3. Risk model      - logistic regression: chance a buyer fails to pay within 90 days

All data is synthetic. Run:  python model/train_model.py   (writes js/model-weights.js and model/weights.json)
"""
import json
import os
import random
import re

import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

SEED = 7
random.seed(SEED)
rng = np.random.default_rng(SEED)
HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- 1. payer matcher
ABBR = {"CONSTR": "CONSTRUCTION", "CONST": "CONSTRUCTION", "CONSTRN": "CONSTRUCTION", "ENGG": "ENGINEERING",
        "ENG": "ENGINEERING", "BLDRS": "BUILDERS", "BLDR": "BUILDERS", "CONTR": "CONTRACTORS", "CONTRS": "CONTRACTORS",
        "CIV": "CIVIL", "HLDGS": "HOLDINGS", "HLDG": "HOLDINGS", "INTL": "INTERNATIONAL", "DEVT": "DEVELOPMENT",
        "DEV": "DEVELOPMENT", "SPORE": "SINGAPORE", "SVCS": "SERVICES", "SVC": "SERVICES", "MGMT": "MANAGEMENT",
        "TRDG": "TRADING", "LOG": "LOGISTICS"}
LEGAL = {"PTE", "LTD", "LIMITED", "PRIVATE", "CO", "COMPANY", "LLP", "INC", "SDN", "BHD", "PL"}


def normalise(s):
    s = s.upper().replace("P/L", " PTE LTD ").replace("&", " AND ").replace("S'PORE", "SINGAPORE")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return [ABBR.get(t, t) for t in s.split()]


def core(tokens):
    return [t for t in tokens if t not in LEGAL]


def trigrams(s):
    s = "  " + s + " "
    return {s[i:i + 3] for i in range(len(s) - 2)}


def jac(a, b):
    a, b = set(a), set(b)
    return len(a & b) / len(a | b) if a | b else 0.0


TYPEWORDS = {"CONSTRUCTION", "ENGINEERING", "BUILDERS", "CONTRACTORS", "CIVIL", "HOLDINGS", "DEVELOPMENT",
             "MARINE", "LOGISTICS", "TRADING", "SERVICES", "MANAGEMENT"}


def type_match(rc, nc):
    rt, nt = {t for t in rc if t in TYPEWORDS}, {t for t in nc if t in TYPEWORDS}
    if not rt:
        return 0.5                                       # type word cut off or missing
    return 1.0 if rt <= nt else 0.0


def pair_features(raw, name, uen_ref=False):
    rc, nc = core(normalise(raw)), core(normalise(name))
    rs, ns = "".join(rc), "".join(nc)
    return [
        jac(trigrams(rs), trigrams(ns)),                     # character overlap (catches typos, truncation)
        1.0 if rc and nc and rc[0] == nc[0] else 0.0,        # same first word
        1.0 if len(rs) >= 6 and ns.startswith(rs) else 0.0,  # bank field cut short
        type_match(rc, nc),                                  # business type agrees (Construction vs Holdings)
        1.0 if uen_ref else 0.0,                             # PayNow / reference carries the UEN
    ]


PFX = ["Norbridge", "Halcyon", "Tessera", "Corvane", "Lumen", "Kestrel", "Aster", "Banyan", "Cobalt", "Driftwood",
       "Everline", "Fernhill", "Granite Peak", "Harbourlight", "Ironbark", "Jadeport", "Kinsley", "Larkspur",
       "Merlion Bay", "Northgate", "Oakridge", "Pinnacle Arc", "Quarry Hill", "Redwood", "Silverleaf", "Tanjong Arc",
       "Unity Ridge", "Vantage", "Westbay", "Yew Tree", "Zenith Line", "Tan Brothers", "Lim & Sons", "Ah Huat",
       "Seng Kee", "Hock Lee", "Bintang", "Sri Murni", "Mohan", "Rajan"]
TYPES = ["Construction", "Engineering", "Builders", "Contractors", "Civil", "Holdings", "Development", "Marine",
         "Logistics", "Trading", "Services", "Management"]
REV = {v: k for k, v in ABBR.items()}


def company():
    return f"{random.choice(PFX)} {random.choice(TYPES)} Pte Ltd"


def bank_style(name):
    """How a payer name might look in an incoming payment."""
    toks = name.upper().replace("PTE LTD", "").split()
    out = []
    for t in toks:
        if t in REV and random.random() < 0.6:
            t = random.choice([k for k, v in ABBR.items() if v == t])
        out.append(t)
    s = " ".join(out)
    r = random.random()
    if r < 0.25:
        s += random.choice([" PTE LTD", " PTE. LTD.", " P/L", " PTE"])
    if random.random() < 0.3:
        s = s[:20].strip()
    if random.random() < 0.2 and len(s) > 6:
        i = random.randrange(1, len(s) - 1)
        s = s[:i] + random.choice("AEIOUNRST") + s[i + 1:]
    if random.random() < 0.15:
        s = s.replace(" ", ".", 1)
    return s


Xm, ym = [], []
for _ in range(5000):
    name = company()
    Xm.append(pair_features(bank_style(name), name, uen_ref=random.random() < 0.2)); ym.append(1)
    # hard negative: same first word, different type, or different first word same type
    p, t = name.replace(" Pte Ltd", "").rsplit(" ", 1)
    if random.random() < 0.5:
        other = f"{p} {random.choice([x for x in TYPES if x != t])} Pte Ltd"
    else:
        other = f"{random.choice([x for x in PFX if x != p])} {t} Pte Ltd"
    Xm.append(pair_features(bank_style(other), name, uen_ref=random.random() < 0.03)); ym.append(0)
    Xm.append(pair_features(bank_style(company()), name)); ym.append(0)
Xm, ym = np.array(Xm), np.array(ym)
Xtr, Xte, ytr, yte = train_test_split(Xm, ym, test_size=0.25, random_state=SEED, stratify=ym)
matcher = LogisticRegression(max_iter=2000, C=1.0).fit(Xtr, ytr)
pm = matcher.predict_proba(Xte)[:, 1]
match_metrics = {"auc": round(roc_auc_score(yte, pm), 3),
                 "accuracy_at_0_8": round(float(((pm >= 0.8) == yte).mean()), 3),
                 "false_match_rate_at_0_8": round(float(((pm >= 0.8) & (yte == 0)).sum() / (yte == 0).sum()), 4)}
# exact-name rule baseline
exact = np.array([1.0 if f[0] == 1.0 else 0.0 for f in Xte])  # identical name after clean-up
match_metrics["exact_rule_recall"] = round(float(((exact == 1) & (yte == 1)).sum() / (yte == 1).sum()), 3)
match_metrics["model_recall_at_0_8"] = round(float(((pm >= 0.8) & (yte == 1)).sum() / (yte == 1).sum()), 3)

# ---------------------------------------------------------------- 2. notice reader
CLASSES = ["winding_up", "legal_claim", "project_halt", "officer_change", "financial_strain", "neutral"]
SEVERITY = {"winding_up": 1.0, "legal_claim": 0.6, "project_halt": 0.6, "officer_change": 0.4,
            "financial_strain": 0.3, "neutral": 0.0}
PHRASES = {
    "winding_up": ["notice of winding up application filed against {c}", "application to wind up {c} filed in court",
                   "{c} placed under provisional liquidation", "liquidators appointed for {c}",
                   "creditors petition to wind up {c}", "{c} enters judicial management",
                   "court orders {c} to be wound up", "{c} applies for judicial management to stave off creditors",
                   "official receiver appointed as liquidator of {c}", "winding up order made against {c}",
                   "{c} goes into creditors voluntary liquidation", "provisional liquidator takes control of {c}"],
    "legal_claim": ["subcontractor sues {c} for unpaid progress claims", "adjudication determination issued against {c}",
                    "{c} faces writ of summons from supplier", "statutory demand served on {c} for overdue sum",
                    "judgment entered against {c} for unpaid amounts", "supplier files claim against {c} in court",
                    "{c} ordered to pay subcontractor after adjudication", "lawsuit filed against {c} over unpaid invoices",
                    "security of payment claim lodged against {c}", "{c} loses court case over unpaid sums"],
    "project_halt": ["work stops at {c} site as workers report unpaid wages", "{c} halts construction at project",
                     "developer terminates contract with {c} over delays", "{c} pulls out of housing project",
                     "site idle for weeks as {c} fails to mobilise crews", "{c} abandons works midway",
                     "workers walk off {c} site over salary arrears", "project stalled after {c} stops work",
                     "{c} unable to continue with projects", "client takes over site after {c} stops work"],
    "officer_change": ["two directors of {c} ceased their appointments", "{c} chief financial officer resigns",
                       "auditor of {c} resigns", "{c} company secretary ceases to hold office",
                       "change in directors lodged with acra for {c}", "managing director of {c} steps down abruptly",
                       "{c} finance director quits with immediate effect", "board of {c} sees resignation of directors",
                       "independent director of {c} resigns citing concerns", "{c} replaces auditor midway through year"],
    "financial_strain": ["{c} reports net loss as margins shrink", "{c} delays payments to suppliers amid tight cash flow",
                         "credit rating of {c} downgraded on weak liquidity",
                         "auditors flag material uncertainty over going concern at {c}",
                         "{c} seeks extension from bank lenders", "{c} breaches loan covenants",
                         "{c} posts losses for second straight year", "cash crunch hits {c}",
                         "{c} asks suppliers to accept longer payment terms", "{c} misses bond coupon payment"],
    "neutral": ["{c} wins contract for new mrt station works", "{c} awarded tender for drainage works",
                "{c} celebrates 20 years in business", "{c} appoints new project director to expand team",
                "{c} completes community centre ahead of schedule", "{c} receives safety award",
                "{c} reports record revenue and higher profit", "{c} opens new office in jurong",
                "{c} signs partnership for green building materials", "{c} hires apprentices from ite",
                "{c} donates to community fund", "{c} upgrades fleet with electric excavators"],
}
TAILS = ["", "", " according to public records", " sources said", " on monday", " this week", " filings show",
         " in a statement", " reports say", " the straits times reported"]


def make(phrases, n):
    return [random.choice(phrases).format(c=company().lower()) + random.choice(TAILS) for _ in range(n)]


TERMS = {
    "winding_up": ["winding up application", "provisional liquidation", "liquidators appointed", "judicial management",
                   "winding up order", "creditors petition to wind up", "official receiver appointed", "voluntary liquidation"],
    "legal_claim": ["writ of summons", "adjudication determination", "statutory demand", "judgment for unpaid sums",
                    "lawsuit over unpaid invoices", "security of payment claim", "court claim by supplier", "demand letter from lawyers"],
    "project_halt": ["work stoppage", "site halted", "contract terminated", "workers unpaid wages", "project abandoned",
                     "site idle", "unable to continue with projects", "crews not mobilised"],
    "officer_change": ["director resigned", "directors ceased appointment", "cfo resigned", "auditor resigned",
                       "change of directors lodged", "company secretary ceased", "finance director quits", "board resignations"],
    "financial_strain": ["net loss", "going concern doubt", "credit rating downgrade", "covenant breach",
                         "cash flow tight", "loan extension sought", "losses widen", "payments to suppliers delayed"],
    "neutral": ["contract awarded", "tender won", "safety award", "record revenue", "new office opened",
                "new director appointed to expand", "project completed early", "fleet upgraded"],
}
FRAMES = ["{c} {k}", "public notice {k} {c}", "news {k} at {c}", "{k} reported for {c}", "acra filing {c} {k}",
          "update on {c} {k}", "{c} latest {k}", "report {k} involving {c}"]


def combos(lab):
    return [(f, k) for f in FRAMES for k in TERMS[lab]]


# test A: new sentences built from known terms (25% of frame-term combinations held out)
# test B: completely new wording (20% of the free-text phrasings held out)
trA, trL, teA, teL, teB, teBL = [], [], [], [], [], []
for lab in CLASSES:
    cb = combos(lab); random.shuffle(cb)
    cut = len(cb) // 4
    for f, k in cb[cut:]:
        for _ in range(4):
            trA.append(f.format(c=company().lower(), k=k) + random.choice(TAILS)); trL.append(lab)
    for f, k in cb[:cut]:
        teA.append(f.format(c=company().lower(), k=k) + random.choice(TAILS)); teL.append(lab)
    ph = PHRASES[lab][:]; random.shuffle(ph)
    kk = max(2, len(ph) // 5)
    for s in make(ph[kk:], 120):
        trA.append(s); trL.append(lab)
    for s in make(ph[:kk], 40):
        teB.append(s); teBL.append(lab)
vec = CountVectorizer(binary=True, ngram_range=(1, 2), min_df=2)
reader = LogisticRegression(max_iter=3000, C=0.5).fit(vec.fit_transform(trA), trL)
reader_acc = round(float((reader.predict(vec.transform(teA)) == np.array(teL)).mean()), 3)
reader_acc_new = round(float((reader.predict(vec.transform(teB)) == np.array(teBL)).mean()), 3)
lte = teL
# final model uses everything
allT = trA + teA + teB + [s for lab in CLASSES for s in make(PHRASES[lab], 60)]
allL = trL + teL + teBL + [lab for lab in CLASSES for _ in range(60)]
vec = CountVectorizer(binary=True, ngram_range=(1, 2), min_df=2)
reader = LogisticRegression(max_iter=3000, C=0.5).fit(vec.fit_transform(allT), allL)
vocab = vec.get_feature_names_out().tolist()
coef = {cls: dict(zip(vocab, np.round(reader.coef_[i], 4).tolist())) for i, cls in enumerate(reader.classes_)}
for cls in coef:  # keep only meaningful weights to keep the file small
    coef[cls] = {k: v for k, v in coef[cls].items() if abs(v) >= 0.05}
inter = dict(zip(reader.classes_, np.round(reader.intercept_, 4).tolist()))

# ---------------------------------------------------------------- 3. risk model (90-day non-payment)
FEATS = ["delay_trend", "late_vs_terms", "partial_share", "payer_change", "public_signal"]


def simulate(n):
    """Monthly snapshots of buyers. About 18% become distressed and fail to pay 3 to 6 months later."""
    rows, buyers = [], []
    for b in range(n):
        terms = random.choice([30, 30, 45, 60])
        habit = max(0, rng.normal(6, 9))          # some healthy buyers are always a bit late
        distressed = random.random() < 0.18
        start = random.randint(2, 8) if distressed else None
        fail = start + random.randint(3, 6) if distressed else None
        dtp, partials, change, public = [], [], 0, 0.0
        snaps = []
        for m in range(14):
            stress = 0 if not distressed or m < start else (m - start + 1)
            d = terms + habit + rng.normal(0, 6) + stress * rng.uniform(4, 12)
            if not distressed and random.random() < 0.06:
                d += rng.uniform(15, 35)              # one-off late payment (holiday, dispute)
            dtp.append(max(5, d))
            partials.append(1 if random.random() < (0.05 + 0.13 * stress if distressed else 0.06) else 0)
            if random.random() < (0.02 + 0.08 * stress if distressed else 0.02):
                change = 1                               # paid from another bank or a related company
            if distressed and stress >= 2 and random.random() < 0.3:
                public = max(public, random.choice([0.4, 0.6, 0.6, 1.0]))
            if not distressed and random.random() < 0.01:
                public = max(public, random.choice([0.3, 0.4]))   # news that turns out to be harmless
            if fail is not None and m >= fail:
                break
            if m >= 5:
                last3, prev3 = np.mean(dtp[-3:]), np.mean(dtp[-6:-3])
                x = [(last3 - prev3) / 30, max(0, last3 - terms) / 30, float(np.mean(partials[-6:])), change, public]
                y = 1 if fail is not None and fail - m <= 3 else 0
                snaps.append((m, x, y))
        buyers.append((distressed, fail, snaps))
        rows += [(x, y) for _, x, y in snaps]
    return rows, buyers


rows, _ = simulate(2500)
Xr = np.array([r[0] for r in rows]); yr = np.array([r[1] for r in rows])
risk = LogisticRegression(max_iter=2000, C=1.0).fit(Xr, yr)
test_rows, test_buyers = simulate(1200)
Xt = np.array([r[0] for r in test_rows]); yt = np.array([r[1] for r in test_rows])
pt = risk.predict_proba(Xt)[:, 1]
HIGH, WATCH = 0.6, 0.3


def first_alert(snaps, fn):
    for m, x, y in snaps:
        if fn(x):
            return m
    return None


leads_ai, leads_base, caught_ai, caught_base, false_ai, healthy = [], [], 0, 0, 0, 0
for distressed, fail, snaps in test_buyers:
    ai = first_alert(snaps, lambda x: risk.predict_proba([x])[0, 1] >= HIGH)
    base = first_alert(snaps, lambda x: x[1] * 30 >= 60)   # today: chase when 60+ days late
    if distressed and fail is not None and snaps:
        if ai is not None and ai < fail:
            caught_ai += 1; leads_ai.append((fail - ai) * 30)
        if base is not None and base < fail:
            caught_base += 1; leads_base.append((fail - base) * 30)
    elif not distressed:
        healthy += 1
        false_ai += 1 if ai is not None else 0
n_fail = sum(1 for d, f, s in test_buyers if d and s)
risk_metrics = {
    "auc": round(roc_auc_score(yt, pt), 3),
    "precision_at_high": round(float(((pt >= HIGH) & (yt == 1)).sum() / max((pt >= HIGH).sum(), 1)), 3),
    "recall_at_high": round(float(((pt >= HIGH) & (yt == 1)).sum() / (yt == 1).sum()), 3),
    "failures_flagged_before_default": round(caught_ai / n_fail, 3),
    "failures_flagged_by_60_day_rule": round(caught_base / n_fail, 3),
    "median_warning_days_ai": int(np.median(leads_ai)) if leads_ai else 0,
    "median_warning_days_60_day_rule": int(np.median(leads_base)) if leads_base else 0,
    "healthy_buyers_falsely_flagged": round(false_ai / healthy, 3),
    "test_buyers": len(test_buyers),
}

out = {
    "matcher": {"features": ["char_overlap", "same_first_word", "truncated_prefix",
                             "type_match", "uen_in_reference"],
                "coef": np.round(matcher.coef_[0], 4).tolist(), "intercept": round(float(matcher.intercept_[0]), 4),
                "abbr": ABBR, "legal": sorted(LEGAL), "types": sorted(TYPEWORDS), "metrics": match_metrics},
    "reader": {"classes": reader.classes_.tolist(), "coef": coef, "intercept": inter, "severity": SEVERITY,
               "metrics": {"accuracy_new_sentences": reader_acc, "accuracy_completely_new_wording": reader_acc_new, "test_notices": len(lte)}},
    "risk": {"features": FEATS, "coef": np.round(risk.coef_[0], 4).tolist(),
             "intercept": round(float(risk.intercept_[0]), 4), "high": HIGH, "watch": WATCH, "metrics": risk_metrics},
    "examples": {"pairs": [[r, n, pair_features(r, n)] for r, n in [
        ("NORBRIDGE CONSTR PTE", "Norbridge Construction Pte Ltd"),
        ("NORBRIDGE CONST. P/L", "Norbridge Construction Pte Ltd"),
        ("NBC HOLDINGS PTE LTD", "Norbridge Construction Pte Ltd"),
        ("TESSERA ENGG PTE LTD", "Tessera Engineering Pte Ltd"),
        ("CORVANE HLDGS LTD", "Corvane Contractors Pte Ltd")]]},
}
with open(os.path.join(HERE, "weights.json"), "w") as f:
    json.dump(out, f, indent=1)
with open(os.path.join(HERE, "..", "js", "model-weights.js"), "w") as f:
    f.write("// Generated by model/train_model.py from synthetic data. Do not edit by hand.\n")
    f.write("window.BW_MODEL = " + json.dumps(out) + ";\n")
print(json.dumps({"matcher": match_metrics, "reader_accuracy": reader_acc, "reader_new_wording": reader_acc_new, "risk": risk_metrics,
                  "risk_coef": dict(zip(FEATS, out["risk"]["coef"])), "risk_intercept": out["risk"]["intercept"],
                  "matcher_coef": out["matcher"]["coef"], "vocab_kept": {k: len(v) for k, v in coef.items()}}, indent=1))
