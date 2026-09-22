const state = {
  template: "classic",
  logoDataUrl: "",
  invoiceId: "",
  items: [{ description: "Professional services", qty: 1, unit: 0 }],
};

const $ = (id) => document.getElementById(id);

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function generateLocalFallbackId() {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${stamp}-TMP${rand}`;
}

function money(n, currency) {
  const value = Number(n) || 0;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(value);
  } catch {
    return `${currency || "USD"} ${value.toFixed(2)}`;
  }
}

function collectForm() {
  return {
    template: state.template,
    logoDataUrl: state.logoDataUrl,
    invoiceId: state.invoiceId,
    fromName: $("fromName").value.trim(),
    fromAddress: $("fromAddress").value.trim(),
    fromEmail: $("fromEmail").value.trim(),
    fromPhone: $("fromPhone").value.trim(),
    fromTax: $("fromTax").value.trim(),
    toName: $("toName").value.trim(),
    toAddress: $("toAddress").value.trim(),
    toEmail: $("toEmail").value.trim(),
    toPhone: $("toPhone").value.trim(),
    issueDate: $("issueDate").value,
    dueDate: $("dueDate").value,
    poNumber: $("poNumber").value.trim(),
    notes: $("notes").value.trim(),
    taxRate: Number($("taxRate").value) || 0,
    discountRate: Number($("discountRate").value) || 0,
    currency: ($("currency").value.trim() || "USD").toUpperCase(),
    items: state.items.map((item) => ({
      description: item.description,
      qty: Number(item.qty) || 0,
      unit: Number(item.unit) || 0,
    })),
  };
}

function calc(data) {
  const items = data.items || [];
  const subtotal = data.subtotal != null
    ? Number(data.subtotal)
    : items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit) || 0), 0);
  const discount = subtotal * ((Number(data.discountRate ?? data.discount_rate) || 0) / 100);
  const tax = (subtotal - discount) * ((Number(data.taxRate ?? data.tax_rate) || 0) / 100);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;"
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

function renderItems() {
  const body = $("itemsBody");
  body.innerHTML = "";
  const currency = collectForm().currency;
  state.items.forEach((item, idx) => {
    const amount = (Number(item.qty) || 0) * (Number(item.unit) || 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input data-k="description" data-i="${idx}" value="${escapeAttr(item.description)}" /></td>
      <td><input type="number" min="0" step="0.01" data-k="qty" data-i="${idx}" value="${item.qty}" /></td>
      <td><input type="number" min="0" step="0.01" data-k="unit" data-i="${idx}" value="${item.unit}" /></td>
      <td>${money(amount, currency)}</td>
      <td class="no-print"><button type="button" class="ghost" data-del="${idx}">✕</button></td>`;
    body.appendChild(tr);
  });
}

function applyTemplate(name) {
  state.template = name;
  $("invoice").className = `invoice template-${name}`;
  document.querySelectorAll(".tpl").forEach((b) => {
    b.classList.toggle("selected", b.dataset.template === name);
  });
}

function updatePreview() {
  const data = collectForm();
  const totals = calc(data);
  $("previewFromName").textContent = data.fromName || "Your Company";
  $("previewFromMeta").textContent = [data.fromEmail, data.fromPhone].filter(Boolean).join(" · ");
  $("previewFromBlock").innerHTML = [
    escapeHtml(data.fromName), escapeHtml(data.fromAddress), escapeHtml(data.fromEmail), escapeHtml(data.fromPhone),
    data.fromTax ? `Tax ID: ${escapeHtml(data.fromTax)}` : ""
  ].filter(Boolean).join("<br>");
  $("previewToBlock").innerHTML = [
    escapeHtml(data.toName || "Client"), escapeHtml(data.toAddress), escapeHtml(data.toEmail), escapeHtml(data.toPhone)
  ].filter(Boolean).join("<br>");
  $("previewId").textContent = data.invoiceId || "Assigned when saved to SQLite";
  $("previewDates").innerHTML = [
    data.issueDate ? `Issued: ${data.issueDate}` : "",
    data.dueDate ? `Due: ${data.dueDate}` : ""
  ].filter(Boolean).join("<br>");
  $("previewNotes").textContent = data.notes || "Payment due as stated. Include the invoice ID on the transfer.";
  $("previewPo").textContent = data.poNumber ? `PO: ${data.poNumber}` : "";
  $("subtotal").textContent = money(totals.subtotal, data.currency);
  $("discount").textContent = money(totals.discount, data.currency);
  $("tax").textContent = money(totals.tax, data.currency);
  $("total").textContent = money(totals.total, data.currency);
  const logo = $("logoPreview");
  if (state.logoDataUrl) { logo.src = state.logoDataUrl; logo.hidden = false; }
  else { logo.hidden = true; }
  renderItems();
}

function fillForm(data) {
  ["fromName","fromAddress","fromEmail","fromPhone","fromTax","toName","toAddress","toEmail","toPhone","issueDate","dueDate","poNumber","notes","taxRate","discountRate","currency"].forEach((k) => {
    if ($(k) && data[k] !== undefined && data[k] !== null) $(k).value = data[k];
  });
  state.items = data.items && data.items.length ? data.items : [{ description: "", qty: 1, unit: 0 }];
  state.logoDataUrl = data.logoDataUrl || state.logoDataUrl || "";
  state.invoiceId = data.invoiceId || "";
  applyTemplate(data.template || "classic");
  updatePreview();
}

function fillCompany(company) {
  if (!company) return;
  fillForm({
    ...collectForm(),
    fromName: company.name, fromAddress: company.address, fromEmail: company.email,
    fromPhone: company.phone, fromTax: company.tax_id, logoDataUrl: company.logo,
    taxRate: company.tax_rate, currency: company.currency, template: company.template,
    invoiceId: "", items: state.items,
  });
}

function renderClientOptions(clients) {
  const sel = $("clientPick");
  const current = $("toName").value;
  sel.innerHTML = `<option value="">New client</option>` + clients.map((c) =>
    `<option value="${escapeAttr(c.name)}" ${c.name === current ? "selected" : ""}>${escapeHtml(c.name)}</option>`
  ).join("");
}

async function renderHistory(filter = "") {
  const q = encodeURIComponent(filter || "");
  let rows = [];
  try { rows = await api(`/api/invoices?q=${q}`); }
  catch {
    $("historyEmpty").textContent = "Start the SQLite server (python3 server.py) to load history.";
    $("historyEmpty").style.display = "block";
    $("historyBody").innerHTML = "";
    return;
  }
  const body = $("historyBody");
  body.innerHTML = "";
  $("historyEmpty").style.display = rows.length ? "none" : "block";
  $("historyEmpty").textContent = "No invoices saved yet.";
  rows.forEach((inv) => {
    const totals = calc({ subtotal: inv.subtotal, taxRate: inv.tax_rate, discountRate: inv.discount_rate });
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(inv.invoice_id)}</strong></td>
      <td>${escapeHtml(inv.issue_date || "")}</td>
      <td>${escapeHtml(inv.company_name || "")}</td>
      <td>${escapeHtml(inv.client_name || "")}</td>
      <td>${money(totals.total, inv.currency)}</td>
      <td class="no-print">
        <button class="secondary" data-open="${escapeAttr(inv.invoice_id)}">Open</button>
        <button class="primary" data-print="${escapeAttr(inv.invoice_id)}">Print</button>
      </td>`;
    body.appendChild(tr);
  });
}

async function saveCurrentInvoice() {
  const data = collectForm();
  if (!data.fromName || !data.toName) {
    alert("Enter your company name and the client company name.");
    return null;
  }
  try {
    const saved = await api("/api/invoices", { method: "POST", body: JSON.stringify(data) });
    fillForm(saved);
    await renderHistory($("historySearch").value);
    alert(`Invoice ${saved.invoiceId} saved in SQLite. Same template can reprint it anytime.`);
    return saved;
  } catch (err) {
    alert(err.message + "\nRun: python3 server.py");
    return null;
  }
}

async function loadInvoice(id) {
  const inv = await api(`/api/invoices/${encodeURIComponent(id)}`);
  fillForm(inv);
}

function showView(name) {
  $("view-create").classList.toggle("hidden", name !== "create");
  $("view-history").classList.toggle("hidden", name !== "history");
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  if (name === "history") renderHistory($("historySearch").value);
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function plusDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

async function bootstrap() {
  $("issueDate").value = todayISO();
  $("dueDate").value = plusDays(14);
  updatePreview();
  try {
    const data = await api("/api/bootstrap");
    fillCompany(data.company);
    renderClientOptions(data.clients || []);
    $("dbStatus").textContent = "SQLite connected · invoices.db";
  } catch {
    $("dbStatus").textContent = "SQLite offline — run python3 server.py";
    state.invoiceId = state.invoiceId || generateLocalFallbackId();
  }
  await renderHistory();
}

function init() {
  document.querySelectorAll(".tab").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
  document.querySelectorAll(".tpl").forEach((btn) => btn.addEventListener("click", () => applyTemplate(btn.dataset.template)));
  ["fromName","fromAddress","fromEmail","fromPhone","fromTax","toName","toAddress","toEmail","toPhone","issueDate","dueDate","poNumber","notes","taxRate","discountRate","currency"].forEach((id) => {
    $(id).addEventListener("input", updatePreview);
  });
  $("logoFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { state.logoDataUrl = reader.result; updatePreview(); };
    reader.readAsDataURL(file);
  });
  $("clearLogo").addEventListener("click", () => { state.logoDataUrl = ""; $("logoFile").value = ""; updatePreview(); });
  $("addItem").addEventListener("click", () => { state.items.push({ description: "", qty: 1, unit: 0 }); updatePreview(); });
  $("itemsBody").addEventListener("input", (e) => {
    const i = e.target.dataset.i; const k = e.target.dataset.k;
    if (i === undefined || !k) return;
    state.items[i][k] = k === "description" ? e.target.value : Number(e.target.value);
    updatePreview();
  });
  $("itemsBody").addEventListener("click", (e) => {
    if (e.target.dataset.del === undefined) return;
    state.items.splice(Number(e.target.dataset.del), 1);
    if (!state.items.length) state.items.push({ description: "", qty: 1, unit: 0 });
    updatePreview();
  });
  $("newInvoice").addEventListener("click", () => {
    state.invoiceId = "";
    state.items = [{ description: "Professional services", qty: 1, unit: 0 }];
    $("toName").value = $("toAddress").value = $("toEmail").value = $("toPhone").value = "";
    $("poNumber").value = $("notes").value = "";
    $("issueDate").value = todayISO();
    $("dueDate").value = plusDays(14);
    $("clientPick").value = "";
    updatePreview();
  });
  $("saveInvoice").addEventListener("click", () => saveCurrentInvoice());
  $("printInvoice").addEventListener("click", async () => {
    if (!state.invoiceId) await saveCurrentInvoice();
    showView("create");
    window.print();
  });
  $("historySearch").addEventListener("input", (e) => renderHistory(e.target.value));
  $("historyBody").addEventListener("click", async (e) => {
    const id = e.target.dataset.open || e.target.dataset.print;
    if (!id) return;
    await loadInvoice(id);
    showView("create");
    if (e.target.dataset.print) setTimeout(() => window.print(), 50);
  });
  $("clientPick").addEventListener("change", async () => {
    const name = $("clientPick").value;
    if (!name) return;
    const data = await api("/api/bootstrap");
    const client = (data.clients || []).find((c) => c.name === name);
    if (!client) return;
    $("toName").value = client.name;
    $("toAddress").value = client.address;
    $("toEmail").value = client.email;
    $("toPhone").value = client.phone;
    updatePreview();
  });
  bootstrap();
}

init();
