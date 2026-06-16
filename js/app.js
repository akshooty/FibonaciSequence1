/* app.js — UI controller for the eCapital Investor Database POC. */
(function () {
  "use strict";

  const app = document.getElementById("app");
  const modalRoot = document.getElementById("modalRoot");

  const CATEGORIES = ["KYC", "Subscription Agreement", "Tax Slip", "Other"];
  const KYC_OPTIONS = ["Verified", "Pending", "Expiring Soon", "Expired"];
  const ACCRED_OPTIONS = ["Accredited", "Qualified Purchaser", "Eligible", "Not Verified"];
  const INV_STATUS_OPTIONS = ["Active", "Pending", "Redeemed", "Defaulted"];
  const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "JPY", "AUD"];

  const state = { view: "dashboard", currentInvestorId: null };

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  }
  const AV_COLORS = ["#3f8cff", "#2fbf71", "#f0a92b", "#9a7bff", "#e5546a", "#27b3c4", "#d97aa8"];
  function avatarColor(id) {
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return AV_COLORS[h % AV_COLORS.length];
  }
  function fmtMoney(amount, currency) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
    } catch { return currency + " " + amount.toLocaleString(); }
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }
  function fmtDateTime(iso) {
    return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }
  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }
  function kycBadge(s) {
    const map = { "Verified": "green", "Pending": "amber", "Expiring Soon": "amber", "Expired": "red" };
    return `<span class="badge ${map[s] || "gray"}">${esc(s)}</span>`;
  }
  function statusBadge(s) {
    const map = { "Active": "green", "Pending": "amber", "Redeemed": "blue", "Defaulted": "red" };
    return `<span class="badge ${map[s] || "gray"}">${esc(s)}</span>`;
  }
  function catBadge(c) {
    const map = { "KYC": "purple", "Subscription Agreement": "blue", "Tax Slip": "amber", "Other": "gray" };
    return `<span class="badge ${map[c] || "gray"}">${esc(c)}</span>`;
  }
  function docIcon(cat) {
    return { "KYC": "🪪", "Subscription Agreement": "✍️", "Tax Slip": "🧾", "Other": "📄" }[cat] || "📄";
  }

  let toastTimer;
  function toast(msg, isErr) {
    const t = document.createElement("div");
    t.className = "toast" + (isErr ? " err" : "");
    t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2600);
  }

  /* ---------- modal ---------- */
  function openModal(title, bodyHtml, footHtml, wide) {
    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal ${wide ? "wide" : ""}">
          <div class="modal-head"><h3>${esc(title)}</h3><button class="modal-close" data-close>&times;</button></div>
          <div class="modal-body">${bodyHtml}</div>
          ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ""}
        </div>
      </div>`;
    const backdrop = $(".modal-backdrop", modalRoot);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
    modalRoot.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
    return modalRoot;
  }
  function closeModal() { modalRoot.innerHTML = ""; }

  /* ---------- data cache ---------- */
  async function loadAll() {
    const [investors, investments, documents] = await Promise.all([
      DB.getAll("investors"), DB.getAll("investments"), DB.getAll("documents"),
    ]);
    return { investors, investments, documents };
  }

  /* =========================================================
     VIEWS
  ========================================================= */

  async function renderDashboard() {
    const { investors, investments, documents } = await loadAll();
    const totalAum = investments
      .filter((i) => i.status !== "Redeemed")
      .reduce((s, i) => s + (i.currency === "USD" ? i.amount : i.amount * 0.9), 0); // rough USD-equiv for demo
    const kycPending = investors.filter((i) => i.kycStatus !== "Verified").length;

    const byCat = CATEGORIES.map((c) => ({ c, n: documents.filter((d) => d.category === c).length }));
    const recent = [...investments]
      .sort((a, b) => (b.investmentDate || "").localeCompare(a.investmentDate || ""))
      .slice(0, 6);
    const invName = (id) => (investors.find((x) => x.id === id) || {}).name || "—";

    app.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-sub">Single source of truth for investor profiles, investment records, and documents.</p>
        </div>
        <button class="btn btn-primary" id="newInvestorBtn">+ New Investor</button>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Investor Profiles</div><div class="stat-value">${investors.length}</div><div class="stat-foot">${investors.filter((i) => i.type === "Entity").length} entities · ${investors.filter((i) => i.type === "Individual").length} individuals</div></div>
        <div class="stat-card"><div class="stat-label">Investment Records</div><div class="stat-value">${investments.length}</div><div class="stat-foot">${investments.filter((i) => i.status === "Active").length} active</div></div>
        <div class="stat-card"><div class="stat-label">Approx. AUM (USD-eq)</div><div class="stat-value">${fmtMoney(Math.round(totalAum), "USD")}</div><div class="stat-foot">Demo conversion, indicative</div></div>
        <div class="stat-card"><div class="stat-label">Documents Stored</div><div class="stat-value">${documents.length}</div><div class="stat-foot">${kycPending} profiles need KYC attention</div></div>
      </div>

      <div class="two-col">
        <div class="panel">
          <div class="panel-head"><h2 class="panel-title">Recent investments</h2><span class="back-link" data-view="investors">View all →</span></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Investor</th><th>Fund</th><th class="right">Amount</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                ${recent.map((i) => `
                  <tr class="clickable" data-investor="${i.investorId}">
                    <td>${esc(invName(i.investorId))}</td>
                    <td class="muted">${esc(i.fund)}</td>
                    <td class="right mono">${fmtMoney(i.amount, i.currency)}</td>
                    <td class="nowrap">${fmtDate(i.investmentDate)}</td>
                    <td>${statusBadge(i.status)}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2 class="panel-title">Documents by category</h2></div>
          ${byCat.map((row) => `
            <div style="margin-bottom:14px">
              <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                <span>${docIcon(row.c)} ${esc(row.c)}</span><span class="mono">${row.n}</span>
              </div>
              <div style="height:8px;background:var(--bg-elev);border-radius:5px;overflow:hidden">
                <div style="height:100%;width:${documents.length ? Math.round((row.n / documents.length) * 100) : 0}%;background:var(--accent)"></div>
              </div>
            </div>`).join("")}
          <button class="btn btn-ghost btn-sm" data-view="documents" style="margin-top:8px">Browse documents →</button>
        </div>
      </div>`;

    $("#newInvestorBtn").addEventListener("click", () => openInvestorForm());
    app.querySelectorAll("[data-investor]").forEach((el) =>
      el.addEventListener("click", () => goInvestor(el.dataset.investor)));
    app.querySelectorAll("[data-view]").forEach((el) =>
      el.addEventListener("click", () => switchView(el.dataset.view)));
  }

  async function renderInvestors() {
    const { investors, investments, documents } = await loadAll();
    const invCount = (id) => investments.filter((x) => x.investorId === id).length;
    const docCount = (id) => documents.filter((x) => x.investorId === id).length;

    app.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">Investors</h1>
          <p class="page-sub">${investors.length} profiles</p>
        </div>
        <button class="btn btn-primary" id="newInvestorBtn">+ New Investor</button>
      </div>

      <div class="filter-row">
        <input type="search" id="invFilter" placeholder="Filter by name, email, country…" />
        <select id="typeFilter"><option value="">All types</option><option>Individual</option><option>Entity</option></select>
        <select id="kycFilter"><option value="">All KYC</option>${KYC_OPTIONS.map((k) => `<option>${k}</option>`).join("")}</select>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Investor</th><th>Type</th><th>Location</th><th>KYC</th><th class="right">Investments</th><th class="right">Docs</th><th>Onboarded</th></tr></thead>
          <tbody id="invRows"></tbody>
        </table>
      </div>`;

    function draw() {
      const q = $("#invFilter").value.trim().toLowerCase();
      const tf = $("#typeFilter").value, kf = $("#kycFilter").value;
      const rows = investors
        .filter((i) => !tf || i.type === tf)
        .filter((i) => !kf || i.kycStatus === kf)
        .filter((i) => !q || [i.name, i.email, i.country, i.city].join(" ").toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));
      $("#invRows").innerHTML = rows.length ? rows.map((i) => `
        <tr class="clickable" data-investor="${i.id}">
          <td><div class="name-cell"><span class="avatar" style="background:${avatarColor(i.id)}">${initials(i.name)}</span><div><div style="font-weight:600">${esc(i.name)}</div><div class="muted" style="font-size:12px">${esc(i.email)}</div></div></div></td>
          <td><span class="badge ${i.type === "Entity" ? "blue" : "gray"}">${esc(i.type)}</span></td>
          <td class="muted">${esc(i.city || i.country)}</td>
          <td>${kycBadge(i.kycStatus)}</td>
          <td class="right mono">${invCount(i.id)}</td>
          <td class="right mono">${docCount(i.id)}</td>
          <td class="nowrap muted">${fmtDate(i.onboardedAt)}</td>
        </tr>`).join("") : `<tr><td colspan="7"><div class="empty">No investors match your filters.</div></td></tr>`;
      $("#invRows").querySelectorAll("[data-investor]").forEach((el) =>
        el.addEventListener("click", () => goInvestor(el.dataset.investor)));
    }

    $("#newInvestorBtn").addEventListener("click", () => openInvestorForm());
    ["invFilter", "typeFilter", "kycFilter"].forEach((id) =>
      $("#" + id).addEventListener("input", draw));
    draw();
  }

  async function renderInvestorDetail(id) {
    const investor = await DB.get("investors", id);
    if (!investor) { switchView("investors"); return; }
    const investments = (await DB.byIndex("investments", "investorId", id))
      .sort((a, b) => (b.investmentDate || "").localeCompare(a.investmentDate || ""));
    const documents = (await DB.byIndex("documents", "investorId", id))
      .sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));

    app.innerHTML = `
      <span class="back-link" id="backLink">← Back to investors</span>
      <div class="page-head">
        <div class="detail-head">
          <span class="avatar" style="background:${avatarColor(investor.id)}">${initials(investor.name)}</span>
          <div>
            <div class="detail-name">${esc(investor.name)}</div>
            <div class="detail-meta">${esc(investor.type)} · ${esc(investor.city || investor.country)} · ${kycBadge(investor.kycStatus)}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn" id="editInvestorBtn">Edit profile</button>
          <button class="btn btn-danger" id="deleteInvestorBtn">Delete</button>
        </div>
      </div>

      <div class="two-col">
        <div>
          <div class="panel">
            <div class="panel-head"><h2 class="panel-title">Investment records</h2><button class="btn btn-primary btn-sm" id="addInvestmentBtn">+ Add investment</button></div>
            ${investments.length ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Fund</th><th class="right">Amount</th><th class="right">Units</th><th>Date</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  ${investments.map((iv) => `
                    <tr>
                      <td style="font-weight:600">${esc(iv.fund)}</td>
                      <td class="right mono">${fmtMoney(iv.amount, iv.currency)}</td>
                      <td class="right mono">${iv.units.toLocaleString()}</td>
                      <td class="nowrap muted">${fmtDate(iv.investmentDate)}</td>
                      <td>${statusBadge(iv.status)}</td>
                      <td class="right nowrap">
                        <button class="btn btn-sm" data-edit-inv="${iv.id}">Edit</button>
                        <button class="btn btn-sm btn-danger" data-del-inv="${iv.id}">✕</button>
                      </td>
                    </tr>`).join("")}
                </tbody>
              </table>
            </div>` : `<div class="empty"><div class="big">💼</div>No investment records yet.</div>`}
          </div>

          <div class="panel">
            <div class="panel-head"><h2 class="panel-title">Documents <span class="muted" style="font-weight:400">(${documents.length})</span></h2><button class="btn btn-primary btn-sm" id="uploadDocBtn">⬆ Upload document</button></div>
            ${documents.length ? `<div class="doc-list">${documents.map(docItemHtml).join("")}</div>`
              : `<div class="empty"><div class="big">📄</div>No documents uploaded yet.</div>`}
          </div>
        </div>

        <div>
          <div class="panel">
            <div class="panel-head"><h2 class="panel-title">Profile</h2></div>
            <dl class="kv">
              <dt>Email</dt><dd>${esc(investor.email || "—")}</dd>
              <dt>Phone</dt><dd>${esc(investor.phone || "—")}</dd>
              <dt>Type</dt><dd>${esc(investor.type)}</dd>
              <dt>Accreditation</dt><dd>${esc(investor.accreditation || "—")}</dd>
              <dt>KYC status</dt><dd>${kycBadge(investor.kycStatus)}</dd>
              <dt>Country</dt><dd>${esc(investor.country || "—")}</dd>
              <dt>Location</dt><dd>${esc(investor.city || "—")}</dd>
              <dt>Onboarded</dt><dd>${fmtDate(investor.onboardedAt)}</dd>
              <dt>Last updated</dt><dd>${fmtDate(investor.updatedAt)}</dd>
            </dl>
            ${investor.notes ? `<div style="margin-top:14px"><div class="muted" style="font-size:12px;margin-bottom:4px">Notes</div><div>${esc(investor.notes)}</div></div>` : ""}
          </div>
        </div>
      </div>`;

    $("#backLink").addEventListener("click", () => switchView("investors"));
    $("#editInvestorBtn").addEventListener("click", () => openInvestorForm(investor));
    $("#deleteInvestorBtn").addEventListener("click", () => deleteInvestor(investor));
    $("#addInvestmentBtn").addEventListener("click", () => openInvestmentForm(investor.id));
    $("#uploadDocBtn").addEventListener("click", () => openUploadForm(investor.id));
    app.querySelectorAll("[data-edit-inv]").forEach((b) =>
      b.addEventListener("click", async () => openInvestmentForm(investor.id, await DB.get("investments", b.dataset.editInv))));
    app.querySelectorAll("[data-del-inv]").forEach((b) =>
      b.addEventListener("click", () => deleteInvestment(b.dataset.delInv, investor)));
    bindDocActions(app, investor);
  }

  function docItemHtml(d) {
    return `
      <div class="doc-item">
        <span class="doc-icon">${docIcon(d.category)}</span>
        <div class="doc-info">
          <div class="doc-name">${esc(d.fileName)}</div>
          <div class="doc-sub">${catBadge(d.category)} · ${fmtBytes(d.size)} · ${fmtDate(d.uploadedAt)} ${(d.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        </div>
        <div class="doc-actions">
          <button class="btn btn-sm" data-doc-view="${d.id}">View</button>
          <button class="btn btn-sm" data-doc-dl="${d.id}">Download</button>
          <button class="btn btn-sm btn-danger" data-doc-del="${d.id}">✕</button>
        </div>
      </div>`;
  }

  function bindDocActions(root, investorForReload) {
    root.querySelectorAll("[data-doc-view]").forEach((b) =>
      b.addEventListener("click", async () => viewDocument(await DB.get("documents", b.dataset.docView))));
    root.querySelectorAll("[data-doc-dl]").forEach((b) =>
      b.addEventListener("click", async () => downloadDocument(await DB.get("documents", b.dataset.docDl))));
    root.querySelectorAll("[data-doc-del]").forEach((b) =>
      b.addEventListener("click", () => deleteDocument(b.dataset.docDel, investorForReload)));
  }

  async function renderDocuments() {
    const { investors, documents } = await loadAll();
    const invName = (id) => (investors.find((x) => x.id === id) || {}).name || "Unknown";

    app.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">Document Library</h1>
          <p class="page-sub">${documents.length} documents across ${investors.length} investors. Search by name, category, tag, or investor.</p>
        </div>
      </div>
      <div class="filter-row">
        <input type="search" id="docSearch" placeholder="Search documents…" />
      </div>
      <div class="chip-row" id="catChips">
        <span class="chip active" data-cat="">All</span>
        ${CATEGORIES.map((c) => `<span class="chip" data-cat="${esc(c)}">${docIcon(c)} ${esc(c)}</span>`).join("")}
      </div>
      <div class="panel section-gap"><div class="doc-list" id="docResults"></div></div>`;

    let activeCat = "";
    function draw() {
      const q = $("#docSearch").value.trim().toLowerCase();
      const rows = documents
        .filter((d) => !activeCat || d.category === activeCat)
        .filter((d) => {
          if (!q) return true;
          const hay = [d.fileName, d.category, invName(d.investorId), (d.tags || []).join(" ")].join(" ").toLowerCase();
          return hay.includes(q);
        })
        .sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));
      $("#docResults").innerHTML = rows.length ? rows.map((d) => `
        <div class="doc-item">
          <span class="doc-icon">${docIcon(d.category)}</span>
          <div class="doc-info">
            <div class="doc-name">${esc(d.fileName)}</div>
            <div class="doc-sub">${catBadge(d.category)} · <span class="link" data-go="${d.investorId}" style="color:var(--accent);cursor:pointer">${esc(invName(d.investorId))}</span> · ${fmtBytes(d.size)} · ${fmtDate(d.uploadedAt)} ${(d.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
          </div>
          <div class="doc-actions">
            <button class="btn btn-sm" data-doc-view="${d.id}">View</button>
            <button class="btn btn-sm" data-doc-dl="${d.id}">Download</button>
          </div>
        </div>`).join("") : `<div class="empty"><div class="big">🔍</div>No documents match your search.</div>`;
      $("#docResults").querySelectorAll("[data-doc-view]").forEach((b) =>
        b.addEventListener("click", async () => viewDocument(await DB.get("documents", b.dataset.docView))));
      $("#docResults").querySelectorAll("[data-doc-dl]").forEach((b) =>
        b.addEventListener("click", async () => downloadDocument(await DB.get("documents", b.dataset.docDl))));
      $("#docResults").querySelectorAll("[data-go]").forEach((b) =>
        b.addEventListener("click", () => goInvestor(b.dataset.go)));
    }
    $("#docSearch").addEventListener("input", draw);
    $("#catChips").querySelectorAll(".chip").forEach((c) =>
      c.addEventListener("click", () => {
        $("#catChips .chip.active").classList.remove("active");
        c.classList.add("active");
        activeCat = c.dataset.cat;
        draw();
      }));
    draw();
  }

  async function renderAudit() {
    const entries = (await DB.getAll("audit")).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    app.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">Audit Trail</h1>
          <p class="page-sub">Chronological record of every change and document action — addressing the lack of audit history in the current process.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
          <tbody>
            ${entries.length ? entries.map((e) => `
              <tr>
                <td class="nowrap muted">${fmtDateTime(e.timestamp)}</td>
                <td><span class="badge ${actionColor(e.action)}">${esc(e.action)}</span></td>
                <td class="muted">${esc(e.entityType)}</td>
                <td>${esc(e.detail)}</td>
              </tr>`).join("") : `<tr><td colspan="4"><div class="empty">No audit entries yet.</div></td></tr>`}
          </tbody>
        </table>
      </div>`;
  }
  function actionColor(a) {
    if (/create|upload|seed/.test(a)) return "green";
    if (/update|edit/.test(a)) return "amber";
    if (/delete|remove/.test(a)) return "red";
    return "blue";
  }

  /* =========================================================
     FORMS / ACTIONS
  ========================================================= */

  function field(label, name, value, opts = {}) {
    const v = esc(value == null ? "" : value);
    if (opts.type === "select") {
      return `<div class="field ${opts.full ? "full" : ""}"><label>${label}</label><select name="${name}">${opts.options.map((o) => `<option ${o === value ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
    }
    if (opts.type === "textarea") {
      return `<div class="field ${opts.full ? "full" : ""}"><label>${label}</label><textarea name="${name}">${v}</textarea></div>`;
    }
    return `<div class="field ${opts.full ? "full" : ""}"><label>${label}</label><input name="${name}" type="${opts.type || "text"}" value="${v}" ${opts.required ? "required" : ""} placeholder="${esc(opts.placeholder || "")}" />${opts.hint ? `<span class="hint">${esc(opts.hint)}</span>` : ""}</div>`;
  }

  function openInvestorForm(investor) {
    const isEdit = !!investor;
    const i = investor || {};
    const body = `
      <form id="investorForm">
        <div class="form-grid">
          ${field("Full name / Entity name", "name", i.name, { required: true, full: true })}
          ${field("Type", "type", i.type || "Individual", { type: "select", options: ["Individual", "Entity"] })}
          ${field("KYC status", "kycStatus", i.kycStatus || "Pending", { type: "select", options: KYC_OPTIONS })}
          ${field("Email", "email", i.email, { type: "email" })}
          ${field("Phone", "phone", i.phone)}
          ${field("Accreditation", "accreditation", i.accreditation || "Not Verified", { type: "select", options: ACCRED_OPTIONS })}
          ${field("Country", "country", i.country)}
          ${field("Location (city/region)", "city", i.city)}
          ${field("Onboarded date", "onboardedAt", i.onboardedAt || new Date().toISOString().slice(0, 10), { type: "date" })}
          ${field("Notes", "notes", i.notes, { type: "textarea", full: true })}
        </div>
      </form>`;
    const foot = `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="saveInvestor">${isEdit ? "Save changes" : "Create investor"}</button>`;
    openModal(isEdit ? "Edit investor" : "New investor", body, foot, true);

    $("#saveInvestor").addEventListener("click", async () => {
      const form = $("#investorForm");
      if (!form.name.value.trim()) { toast("Name is required", true); return; }
      const now = new Date().toISOString();
      const record = Object.assign({}, i, {
        id: i.id || DB.uid("inv"),
        name: form.name.value.trim(),
        type: form.type.value,
        kycStatus: form.kycStatus.value,
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        accreditation: form.accreditation.value,
        country: form.country.value.trim(),
        city: form.city.value.trim(),
        onboardedAt: form.onboardedAt.value,
        notes: form.notes.value.trim(),
        createdAt: i.createdAt || now,
        updatedAt: now,
      });
      await DB.put("investors", record);
      await DB.logAudit(isEdit ? "update" : "create", "investor", record.id,
        `${isEdit ? "Updated" : "Created"} investor profile: ${record.name}`);
      closeModal();
      toast(isEdit ? "Investor updated" : "Investor created");
      if (isEdit && state.view === "investor") renderInvestorDetail(record.id);
      else goInvestor(record.id);
    });
  }

  async function deleteInvestor(investor) {
    const investments = await DB.byIndex("investments", "investorId", investor.id);
    const documents = await DB.byIndex("documents", "investorId", investor.id);
    const body = `<p>Delete <strong>${esc(investor.name)}</strong> and all associated data?</p>
      <p class="muted">This removes ${investments.length} investment record(s) and ${documents.length} document(s). This cannot be undone.</p>`;
    openModal("Delete investor", body,
      `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-danger" id="confirmDel">Delete permanently</button>`);
    $("#confirmDel").addEventListener("click", async () => {
      await Promise.all(investments.map((x) => DB.remove("investments", x.id)));
      await Promise.all(documents.map((x) => DB.remove("documents", x.id)));
      await DB.remove("investors", investor.id);
      await DB.logAudit("delete", "investor", investor.id, `Deleted investor: ${investor.name} (and ${investments.length} investments, ${documents.length} documents)`);
      closeModal();
      toast("Investor deleted");
      switchView("investors");
    });
  }

  function openInvestmentForm(investorId, investment) {
    const isEdit = !!investment;
    const v = investment || {};
    const body = `
      <form id="investmentForm">
        <div class="form-grid">
          ${field("Fund / vehicle", "fund", v.fund, { required: true, full: true, placeholder: "eCapital Growth Fund I" })}
          ${field("Amount", "amount", v.amount, { type: "number" })}
          ${field("Currency", "currency", v.currency || "USD", { type: "select", options: CURRENCIES })}
          ${field("Units", "units", v.units, { type: "number" })}
          ${field("Status", "status", v.status || "Active", { type: "select", options: INV_STATUS_OPTIONS })}
          ${field("Investment date", "investmentDate", v.investmentDate || new Date().toISOString().slice(0, 10), { type: "date" })}
          ${field("Notes", "notes", v.notes, { type: "textarea", full: true })}
        </div>
      </form>`;
    openModal(isEdit ? "Edit investment" : "Add investment", body,
      `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="saveInvestment">${isEdit ? "Save" : "Add"}</button>`, true);

    $("#saveInvestment").addEventListener("click", async () => {
      const f = $("#investmentForm");
      if (!f.fund.value.trim()) { toast("Fund is required", true); return; }
      const record = Object.assign({}, v, {
        id: v.id || DB.uid("invst"),
        investorId,
        fund: f.fund.value.trim(),
        amount: Number(f.amount.value) || 0,
        currency: f.currency.value,
        units: Number(f.units.value) || 0,
        status: f.status.value,
        investmentDate: f.investmentDate.value,
        notes: f.notes.value.trim(),
      });
      await DB.put("investments", record);
      const inv = await DB.get("investors", investorId);
      await DB.logAudit(isEdit ? "update" : "create", "investment", record.id,
        `${isEdit ? "Updated" : "Added"} investment ${fmtMoney(record.amount, record.currency)} in ${record.fund} for ${inv ? inv.name : investorId}`);
      closeModal();
      toast(isEdit ? "Investment updated" : "Investment added");
      renderInvestorDetail(investorId);
    });
  }

  async function deleteInvestment(id, investor) {
    const iv = await DB.get("investments", id);
    await DB.remove("investments", id);
    await DB.logAudit("delete", "investment", id, `Deleted investment ${iv ? fmtMoney(iv.amount, iv.currency) + " in " + iv.fund : ""} for ${investor.name}`);
    toast("Investment deleted");
    renderInvestorDetail(investor.id);
  }

  function openUploadForm(investorId) {
    const body = `
      <form id="uploadForm">
        <div class="form-grid one">
          <div class="field full">
            <label>File</label>
            <input name="file" type="file" required />
            <span class="hint">Stored locally in your browser. Any file type up to ~8 MB.</span>
          </div>
          ${field("Category", "category", "KYC", { type: "select", options: CATEGORIES, full: true })}
          ${field("Tags (comma separated)", "tags", "", { full: true, placeholder: "identity, 2025, signed" })}
        </div>
      </form>`;
    openModal("Upload document", body,
      `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="saveDoc">Upload</button>`);

    $("#saveDoc").addEventListener("click", async () => {
      const f = $("#uploadForm");
      const file = f.file.files[0];
      if (!file) { toast("Choose a file", true); return; }
      if (file.size > 8 * 1024 * 1024) { toast("File too large for demo (max 8 MB)", true); return; }
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const record = {
        id: DB.uid("doc"),
        investorId,
        category: f.category.value,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
        tags: f.tags.value.split(",").map((t) => t.trim()).filter(Boolean),
        uploadedAt: new Date().toISOString(),
      };
      await DB.put("documents", record);
      const inv = await DB.get("investors", investorId);
      await DB.logAudit("upload", "document", record.id,
        `Uploaded "${record.fileName}" (${record.category}) for ${inv ? inv.name : investorId}`);
      closeModal();
      toast("Document uploaded");
      renderInvestorDetail(investorId);
    });
  }

  async function deleteDocument(id, investor) {
    const d = await DB.get("documents", id);
    await DB.remove("documents", id);
    await DB.logAudit("delete", "document", id, `Deleted document "${d ? d.fileName : id}"${investor ? " for " + investor.name : ""}`);
    toast("Document deleted");
    if (state.view === "investor" && investor) renderInvestorDetail(investor.id);
    else if (state.view === "documents") renderDocuments();
  }

  function viewDocument(d) {
    if (!d) return;
    const isImage = (d.mimeType || "").startsWith("image/");
    const isText = (d.mimeType || "").startsWith("text/");
    const isPdf = d.mimeType === "application/pdf";
    let preview;
    if (isImage) preview = `<img src="${d.dataUrl}" style="max-width:100%;border-radius:8px" />`;
    else if (isPdf) preview = `<iframe src="${d.dataUrl}" style="width:100%;height:60vh;border:1px solid var(--border);border-radius:8px"></iframe>`;
    else if (isText) {
      let txt = "";
      try { txt = decodeURIComponent(escape(atob(d.dataUrl.split(",")[1]))); } catch { txt = "(unable to preview)"; }
      preview = `<pre style="white-space:pre-wrap;background:var(--bg-elev);padding:14px;border-radius:8px;max-height:60vh;overflow:auto">${esc(txt)}</pre>`;
    } else {
      preview = `<div class="empty"><div class="big">📄</div>No inline preview for this file type.<br/>Use Download to open it.</div>`;
    }
    openModal(d.fileName, `
      <div style="margin-bottom:12px">${catBadge(d.category)} <span class="muted">· ${fmtBytes(d.size)} · uploaded ${fmtDate(d.uploadedAt)}</span></div>
      ${preview}`,
      `<button class="btn btn-ghost" data-close>Close</button><button class="btn btn-primary" id="dlFromView">Download</button>`, true);
    $("#dlFromView").addEventListener("click", () => downloadDocument(d));
  }

  function downloadDocument(d) {
    if (!d) return;
    const a = document.createElement("a");
    a.href = d.dataUrl;
    a.download = d.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* =========================================================
     GLOBAL SEARCH
  ========================================================= */
  function setupGlobalSearch() {
    const input = $("#globalSearch");
    const box = $("#searchResults");
    let timer;

    async function run() {
      const q = input.value.trim().toLowerCase();
      if (!q) { box.hidden = true; return; }
      const { investors, investments, documents } = await loadAll();
      const invName = (id) => (investors.find((x) => x.id === id) || {}).name || "Unknown";

      const im = investors.filter((i) => [i.name, i.email, i.country, i.city].join(" ").toLowerCase().includes(q)).slice(0, 5);
      const dm = documents.filter((d) => [d.fileName, d.category, (d.tags || []).join(" "), invName(d.investorId)].join(" ").toLowerCase().includes(q)).slice(0, 5);
      const vm = investments.filter((iv) => [iv.fund, invName(iv.investorId)].join(" ").toLowerCase().includes(q)).slice(0, 5);

      let html = "";
      if (im.length) html += `<div class="search-group-label">Investors</div>` + im.map((i) => `
        <div class="search-item" data-go-inv="${i.id}"><span class="avatar" style="background:${avatarColor(i.id)};width:28px;height:28px;font-size:11px">${initials(i.name)}</span><div><div class="si-title">${esc(i.name)}</div><div class="si-sub">${esc(i.type)} · ${esc(i.city || i.country)}</div></div></div>`).join("");
      if (vm.length) html += `<div class="search-group-label">Investments</div>` + vm.map((iv) => `
        <div class="search-item" data-go-inv="${iv.investorId}"><span class="doc-icon" style="width:28px;height:28px">💼</span><div><div class="si-title">${esc(iv.fund)}</div><div class="si-sub">${esc(invName(iv.investorId))} · ${fmtMoney(iv.amount, iv.currency)}</div></div></div>`).join("");
      if (dm.length) html += `<div class="search-group-label">Documents</div>` + dm.map((d) => `
        <div class="search-item" data-doc="${d.id}"><span class="doc-icon" style="width:28px;height:28px">${docIcon(d.category)}</span><div><div class="si-title">${esc(d.fileName)}</div><div class="si-sub">${esc(d.category)} · ${esc(invName(d.investorId))}</div></div></div>`).join("");
      if (!html) html = `<div class="search-empty">No matches for “${esc(q)}”.</div>`;

      box.innerHTML = html;
      box.hidden = false;
      box.querySelectorAll("[data-go-inv]").forEach((el) => el.addEventListener("click", () => {
        box.hidden = true; input.value = ""; goInvestor(el.dataset.goInv);
      }));
      box.querySelectorAll("[data-doc]").forEach((el) => el.addEventListener("click", async () => {
        box.hidden = true; input.value = ""; viewDocument(await DB.get("documents", el.dataset.doc));
      }));
    }

    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 140); });
    document.addEventListener("click", (e) => {
      if (!box.contains(e.target) && e.target !== input) box.hidden = true;
    });
  }

  /* =========================================================
     ROUTER
  ========================================================= */
  function switchView(view) {
    state.view = view;
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.view === view));
    if (view === "dashboard") renderDashboard();
    else if (view === "investors") renderInvestors();
    else if (view === "documents") renderDocuments();
    else if (view === "audit") renderAudit();
  }

  function goInvestor(id) {
    state.view = "investor";
    state.currentInvestorId = id;
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.view === "investors"));
    renderInvestorDetail(id);
  }

  /* =========================================================
     BOOT
  ========================================================= */
  async function boot() {
    document.querySelectorAll(".tab").forEach((t) =>
      t.addEventListener("click", () => switchView(t.dataset.view)));

    $("#resetBtn").addEventListener("click", () => {
      openModal("Reset demo data",
        `<p>Reload the original demo dataset (10 investors, investments and documents)?</p><p class="muted">This replaces all current data in this browser.</p>`,
        `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-danger" id="confirmReset">Reset</button>`);
      $("#confirmReset").addEventListener("click", async () => {
        await Seed.seedIfEmpty(true);
        closeModal();
        toast("Demo data reset");
        switchView("dashboard");
      });
    });

    setupGlobalSearch();
    try { await Seed.seedIfEmpty(false); } catch (e) { console.error(e); }
    switchView("dashboard");
  }

  boot();
})();
