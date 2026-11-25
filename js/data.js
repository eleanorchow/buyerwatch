// Fictional demo data. All companies, people, UENs, amounts, notices and news are made up.
window.BW_DATA = {
  asOf: "2026-11-24",
  client: {
    name: "Tembusu Civil Works Pte Ltd",
    segment: "SME, civil works subcontractor",
    maker: "Rachel Ong (Finance Manager, maker)",
    approver: "David Koh (Director, approver)",
    rm: "Jason Tan (DBS Relationship Manager)",
  },

  // Buyers = the client's own customers. ACRA name is what the payer matcher compares against.
  buyers: [
    {
      id: "NOR", acra: "Norbridge Construction Pte Ltd", uen: "201300001N", terms: 30, project: "Punggol housing package",
      relatedCompanies: [{ name: "NBC Holdings Pte Ltd", link: "ACRA: shareholder of Norbridge Construction (100%)" }],
      exposure: { invoices: 905000, unbilled: 215000, retention: 98000 },
      invoices: [
        { no: "INV-2026-0912", amount: 310000, due: "2026-10-15", status: "Overdue 40 days" },
        { no: "INV-2026-1004", amount: 285000, due: "2026-11-04", status: "Overdue 20 days" },
        { no: "INV-2026-1101", amount: 310000, due: "2026-12-01", status: "Not yet due" },
      ],
      payments: [
        { m: "2026-02", invoice: 280000, paid: 280000, days: 38, payer: "NORBRIDGE CONSTRUCTION PTE LTD", bank: "Bank A" },
        { m: "2026-03", invoice: 295000, paid: 295000, days: 37, payer: "NORBRIDGE CONSTR PTE", bank: "Bank A" },
        { m: "2026-04", invoice: 260000, paid: 260000, days: 39, payer: "NORBRIDGE CONSTR PTE", bank: "Bank A" },
        { m: "2026-05", invoice: 300000, paid: 300000, days: 41, payer: "NORBRIDGE CONST. P/L", bank: "Bank A" },
        { m: "2026-06", invoice: 290000, paid: 290000, days: 44, payer: "NORBRIDGE CONSTR PTE", bank: "Bank A" },
        { m: "2026-07", invoice: 305000, paid: 305000, days: 49, payer: "NORBRIDGE CONST. P/L", bank: "Bank A" },
        { m: "2026-08", invoice: 300000, paid: 300000, days: 55, payer: "NORBRIDGE CONSTR PTE", bank: "Bank A" },
        { m: "2026-09", invoice: 310000, paid: 200000, days: 60, payer: "NORBRIDGE CONSTR PTE", bank: "Bank A" },
        { m: "2026-10", invoice: 295000, paid: 150000, days: 66, payer: "NORBRIDGE CONST. P/L", bank: "Bank A" },
        { m: "2026-11", invoice: 300000, paid: 120000, days: 71, payer: "NBC HOLDINGS PTE LTD", bank: "Bank C" },
      ],
    },
    {
      id: "HAL", acra: "Halcyon Build Pte Ltd", uen: "201500002H", terms: 45, project: "Jurong industrial fit-out",
      relatedCompanies: [],
      exposure: { invoices: 412000, unbilled: 160000, retention: 64000 },
      invoices: [
        { no: "INV-2026-0950", amount: 138000, due: "2026-11-10", status: "Overdue 14 days" },
        { no: "INV-2026-1022", amount: 146000, due: "2026-12-06", status: "Not yet due" },
        { no: "INV-2026-1110", amount: 128000, due: "2026-12-25", status: "Not yet due" },
      ],
      payments: [
        { m: "2026-02", invoice: 120000, paid: 120000, days: 44, payer: "HALCYON BUILD PTE LTD", bank: "Bank B" },
        { m: "2026-03", invoice: 135000, paid: 135000, days: 45, payer: "HALCYON BUILD", bank: "Bank B" },
        { m: "2026-04", invoice: 128000, paid: 128000, days: 46, payer: "HALCYON BUILD PTE LTD", bank: "Bank B" },
        { m: "2026-05", invoice: 140000, paid: 140000, days: 45, payer: "HALCYON BUILD", bank: "Bank B" },
        { m: "2026-06", invoice: 132000, paid: 132000, days: 47, payer: "HALCYON BUILD PTE LTD", bank: "Bank B" },
        { m: "2026-07", invoice: 126000, paid: 126000, days: 49, payer: "HALCYON BUILD", bank: "Bank B" },
        { m: "2026-08", invoice: 144000, paid: 144000, days: 52, payer: "HALCYON BUILD PTE LTD", bank: "Bank B" },
        { m: "2026-09", invoice: 139000, paid: 100000, days: 57, payer: "HALCYON BUILD", bank: "Bank B" },
        { m: "2026-10", invoice: 141000, paid: 141000, days: 61, payer: "HALCYON BUILD PTE LTD", bank: "Bank B" },
        { m: "2026-11", invoice: 136000, paid: 96000, days: 65, payer: "HALCYON BLDRS", bank: "Bank B" },
      ],
    },
    {
      id: "TES", acra: "Tessera Engineering Pte Ltd", uen: "201100003T", terms: 30, project: "Changi drainage upgrade",
      relatedCompanies: [],
      exposure: { invoices: 288000, unbilled: 95000, retention: 41000 },
      invoices: [
        { no: "INV-2026-1012", amount: 142000, due: "2026-12-02", status: "Not yet due" },
        { no: "INV-2026-1105", amount: 146000, due: "2026-12-15", status: "Not yet due" },
      ],
      payments: [31, 33, 32, 30, 34, 31, 33, 32, 31, 33].map((d, i) => ({
        m: `2026-${String(i + 2).padStart(2, "0")}`, invoice: 140000 + i * 1000, paid: 140000 + i * 1000, days: d,
        payer: i % 2 ? "TESSERA ENGG PTE LTD" : "TESSERA ENGINEERING PTE. LTD.", bank: "Bank A" })),
    },
    {
      id: "COR", acra: "Corvane Contractors Pte Ltd", uen: "201900004C", terms: 45, project: "Tuas road works",
      relatedCompanies: [],
      exposure: { invoices: 196000, unbilled: 70000, retention: 30000 },
      invoices: [
        { no: "INV-2026-1030", amount: 98000, due: "2026-12-14", status: "Not yet due" },
        { no: "INV-2026-1112", amount: 98000, due: "2026-12-27", status: "Not yet due" },
      ],
      payments: [46, 44, 47, 45, 46, 48, 45, 47, 46, 44].map((d, i) => ({
        m: `2026-${String(i + 2).padStart(2, "0")}`, invoice: 95000, paid: 95000, days: d,
        payer: i % 3 ? "CORVANE CONTRS PTE LTD" : "CORVANE CONTRACTORS", bank: "Bank D" })),
    },
    {
      id: "LUM", acra: "Lumen Civil Pte Ltd", uen: "202000005L", terms: 30, project: "Bukit Batok footpaths",
      relatedCompanies: [],
      exposure: { invoices: 150000, unbilled: 85000, retention: 22000 },
      invoices: [
        { no: "INV-2026-1108", amount: 150000, due: "2026-12-08", status: "Not yet due" },
      ],
      payments: [28, 29, 30, 27, 29, 28, 30, 29, 28, 29].map((d, i) => ({
        m: `2026-${String(i + 2).padStart(2, "0")}`, invoice: 72000, paid: 72000, days: d,
        payer: "LUMEN CIVIL PTE. LTD.", bank: "Bank E", uenRef: true })),
    },
  ],

  // Public notices and news picked up in the last 90 days. "subject" is the company named in the text.
  notices: [
    { date: "2026-10-28", source: "ACRA", subject: "Norbridge Construction Pte Ltd",
      text: "Two directors of Norbridge Construction Pte Ltd ceased their appointments" },
    { date: "2026-11-12", source: "Court notice", subject: "Norbridge Construction Pte Ltd",
      text: "Notice of winding up application filed against Norbridge Construction Pte Ltd" },
    { date: "2026-11-19", source: "News", subject: "Norbridge Construction Pte Ltd",
      text: "Work stops at Norbridge Construction Pte Ltd site as workers report unpaid wages" },
    { date: "2026-11-03", source: "News", subject: "Halcyon Build Pte Ltd",
      text: "Halcyon Build Pte Ltd reports net loss as margins shrink" },
    { date: "2026-11-15", source: "ACRA", subject: "Halcyon Build Pte Ltd",
      text: "Halcyon Build Pte Ltd chief financial officer resigns" },
    { date: "2026-11-10", source: "News", subject: "Tessera Engineering Pte Ltd",
      text: "Tessera Engineering Pte Ltd awarded tender for drainage works" },
    { date: "2026-11-18", source: "Court notice", subject: "Corvane Holdings Ltd",
      text: "Notice of winding up application filed against Corvane Holdings Ltd" },
  ],

  // Outgoing payments waiting for the director's approval (maker-checker)
  pendingPayments: [
    { id: "PAY-7781", payee: "Kim Seng Rebar Supplies Pte Ltd", amount: 180000, buyer: "NOR",
      purpose: "Rebar for Punggol housing package (Norbridge)", maker: "Rachel Ong" },
    { id: "PAY-7782", payee: "Ah Lek Equipment Rental Pte Ltd", amount: 42500, buyer: "TES",
      purpose: "Excavator hire for Changi drainage upgrade (Tessera)", maker: "Rachel Ong" },
    { id: "PAY-7783", payee: "Staff payroll (November)", amount: 268000, buyer: null,
      purpose: "Monthly salaries", maker: "Rachel Ong" },
  ],

  // RM view: other (fictional) clients who switched Buyer Watch on and agreed to share alerts with their RM
  rmClients: [
    { client: "Tembusu Civil Works Pte Ltd", topBuyer: "Norbridge Construction", share: null, live: true },
    { client: "Kallang Steel Fabricators Pte Ltd", topBuyer: "Westbay Builders", share: 0.31, band: "watch", exposure: 540000 },
    { client: "Sengkang M&E Services Pte Ltd", topBuyer: "Oakridge Contractors", share: 0.22, band: "low", exposure: 310000 },
    { client: "Pasir Ris Tiling Works Pte Ltd", topBuyer: "Ironbark Construction", share: 0.48, band: "high", exposure: 690000 },
  ],

  pricing: { addOnPerMonth: 30, tokensPerMonth: 60000, costPer1kTokens: 0.02, notMonthly: 40 },
};
