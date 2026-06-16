/* seed.js — generates demo data matching the POC success criteria:
 *   ~10 investor profiles, 2 investment records each, plus categorized
 *   documents (KYC, Subscription Agreement, Tax Slip) that can be retrieved. */
(function (global) {
  "use strict";

  const FUNDS = [
    "eCapital Growth Fund I",
    "eCapital Income Fund II",
    "eCapital Real Estate Trust",
    "eCapital Private Credit Fund",
    "eCapital Venture Opportunities",
  ];

  const PEOPLE = [
    { name: "Margaret Chen", type: "Individual", email: "m.chen@example.com", phone: "+1 416 555 0142", country: "Canada", city: "Toronto, ON" },
    { name: "Harrison Wealth Holdings", type: "Entity", email: "ir@harrisonwh.example.com", phone: "+1 212 555 0198", country: "United States", city: "New York, NY" },
    { name: "Devon Okafor", type: "Individual", email: "d.okafor@example.com", phone: "+44 20 7946 0321", country: "United Kingdom", city: "London" },
    { name: "Sakura Capital LP", type: "Entity", email: "admin@sakuracap.example.com", phone: "+81 3 5555 0177", country: "Japan", city: "Tokyo" },
    { name: "Isabella Romano", type: "Individual", email: "i.romano@example.com", phone: "+39 02 5555 0163", country: "Italy", city: "Milan" },
    { name: "Northbridge Family Office", type: "Entity", email: "ops@northbridge.example.com", phone: "+1 604 555 0119", country: "Canada", city: "Vancouver, BC" },
    { name: "Liam O'Sullivan", type: "Individual", email: "l.osullivan@example.com", phone: "+353 1 555 0188", country: "Ireland", city: "Dublin" },
    { name: "Aurora Pension Trust", type: "Entity", email: "trustees@aurorapt.example.com", phone: "+61 2 5555 0144", country: "Australia", city: "Sydney" },
    { name: "Priya Nandakumar", type: "Individual", email: "p.nandakumar@example.com", phone: "+1 647 555 0156", country: "Canada", city: "Mississauga, ON" },
    { name: "Greaves Endowment Fund", type: "Entity", email: "finance@greaves.example.com", phone: "+1 312 555 0133", country: "United States", city: "Chicago, IL" },
  ];

  const KYC = ["Verified", "Pending", "Expiring Soon"];
  const ACCRED = ["Accredited", "Qualified Purchaser", "Eligible"];
  const INV_STATUS = ["Active", "Active", "Pending", "Redeemed"];

  function pick(arr, i) { return arr[i % arr.length]; }
  function money(min, max) { return Math.round((min + Math.random() * (max - min)) / 1000) * 1000; }
  function dateBack(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }

  /* Build a small text-file data URL so documents are real & downloadable. */
  function textDoc(title, lines) {
    const body = title + "\n" + "=".repeat(title.length) + "\n\n" + lines.join("\n") + "\n";
    return "data:text/plain;base64," + btoa(unescape(encodeURIComponent(body)));
  }

  function docsFor(investor) {
    const out = [];
    const mk = (category, fileName, lines, tags) => out.push({
      id: DB.uid("doc"),
      investorId: investor.id,
      category,
      fileName,
      mimeType: "text/plain",
      size: lines.join("\n").length + 80,
      dataUrl: textDoc(fileName.replace(/\.[a-z]+$/, ""), lines),
      tags: tags || [],
      uploadedAt: new Date(Date.now() - Math.random() * 1e10).toISOString(),
    });

    mk("KYC", "KYC_Package.txt", [
      "Investor: " + investor.name,
      "Type: " + investor.type,
      "Identity verification: COMPLETE",
      "Source of funds: Documented",
      "Sanctions / PEP screening: Clear",
      "Reviewed by: Investor Relations",
    ], ["identity", "aml"]);

    mk("Subscription Agreement", "Subscription_Agreement.txt", [
      "Subscriber: " + investor.name,
      "Status: Countersigned",
      "Effective date: " + dateBack(200 + (investor._i || 0) * 7),
      "Governing fund: " + pick(FUNDS, investor._i || 0),
    ], ["signed", "legal"]);

    mk("Tax Slip", "Tax_Slip_2025.txt", [
      "Recipient: " + investor.name,
      "Tax year: 2025",
      "Form: " + (investor.country === "United States" ? "K-1" : "T5013"),
      "Status: Issued",
    ], ["2025", "compliance"]);

    return out;
  }

  async function seedIfEmpty(force) {
    const existing = await DB.count("investors");
    if (existing > 0 && !force) return false;
    if (force) await DB.clearAll();

    const investors = [];
    const investments = [];
    let documents = [];

    PEOPLE.forEach((p, i) => {
      const inv = {
        id: DB.uid("inv"),
        _i: i,
        name: p.name,
        type: p.type,
        email: p.email,
        phone: p.phone,
        country: p.country,
        city: p.city,
        accreditation: pick(ACCRED, i),
        kycStatus: pick(KYC, i),
        onboardedAt: dateBack(420 - i * 15),
        notes: p.type === "Entity"
          ? "Institutional relationship. Primary contact via registered email."
          : "High-net-worth individual investor.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      investors.push(inv);

      // exactly 2 investment records per profile (per success criteria)
      for (let k = 0; k < 2; k++) {
        const amt = money(50000, 1500000);
        investments.push({
          id: DB.uid("invst"),
          investorId: inv.id,
          fund: pick(FUNDS, i + k),
          amount: amt,
          currency: p.country === "United Kingdom" ? "GBP" : p.country === "Japan" ? "JPY" : p.country === "Italy" || p.country === "Ireland" ? "EUR" : p.country === "Australia" ? "AUD" : p.country === "Canada" ? "CAD" : "USD",
          units: Math.round(amt / 100),
          status: pick(INV_STATUS, i + k),
          investmentDate: dateBack(380 - i * 12 - k * 60),
          notes: "",
        });
      }

      documents = documents.concat(docsFor(inv));
    });

    // strip helper field before persisting
    investors.forEach((inv) => delete inv._i);

    await DB.bulkPut("investors", investors);
    await DB.bulkPut("investments", investments);
    await DB.bulkPut("documents", documents);
    await DB.logAudit("seed", "system", null,
      `Seeded ${investors.length} investors, ${investments.length} investments, ${documents.length} documents`);
    return true;
  }

  global.Seed = { seedIfEmpty };
})(window);
