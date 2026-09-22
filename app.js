const STORAGE_KEY = "company-invoices-v1";
const COMPANY_KEY = "company-profile-v1";

const state = {
  template: "classic",
  logoDataUrl: "",
  invoiceId: "",
  items: [{ description: "Professional services", qty: 1, unit: 0 }],
};

const $ = (id) => document.getElementById(id);

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveHistory(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function generateInvoiceId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const seq = String(loadHistory().length + 1).padStart(3, "0");
  return `INV-${y}${m}${day}-${seq}${rand}`;
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
  const subtotal = data.items.reduce((s, i) => s + i.qty * i.unit, 0);
  const discount = subtotal * (data.discountRate / 100);
  const taxable = subtotal - discount;
  const tax = taxable * (data.taxRate / 100);
  const total = taxable + tax;
  return { subtotal, discount, tax, total };
}

function renderItems(editable) {
  const body = $("itemsBody");
  body.innerHTML = "";
  state.items.forEach((item, idx) => {
    const tr = document.createElement("tr");
    const amount = (Number(item.qty) || 0) * (Number(item.unit) || 0);
    if (editable) {
      tr.innerHTML = `
        <td><input data-k="description" data-i="${idx}" value="${escapeAttr(item.description)}" /></td>
        <td><input type="number" min="0" step="0.01" data-k="qty" data-i="${idx}" value="${item.qty}" /></td>
        <td><input type="number" min="0" step="0.01" data-k="unit" data-i="${idx}" value="${item.unit}" /></td>
        <td class="amt"></td>
        <td class="no-print"><button type="button" class="ghost" data-del="${idx}">✕</button></td>`;
    } else {
      tr.innerHTML = `
        <td>${escapeHtml(item.description)}</td>
        <td>${item.qty}</td>
        <td></td>
        <td class="amt"></td>
        <td class="no-print"></td>`;
    }
    body.appendChild(tr);
    const data = collectForm();
    tr.querySelector(".amt").textContent = money(amount, data.currency);
    if (editable) {
      const unitCell = tr.children[2].querySelector("input");
      if (unitCell) unitCell.value = item.unit;
    } else {
      tr.children[2].textContent = money(item.unit, data.currency);
    }
  });
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;"
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

function applyTemplate(name) {
  state.template = name;
  const el = $("invoice");
  el.className = `invoice template-${name}`;
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
    escapeHtml(data.fromName),
    escapeHtml(data.fromAddress),
    escapeHtml(data.fromEmail),
    escapeHtml(data.fromPhone),
    data.fromTax ? `Tax ID: ${escapeHtml(data.fromTax)}` : ""
  ].filter(Boolean).join("<br>");
  $("previewToBlock").innerHTML = [
    escapeHtml(data.toName || "Client"),
    escapeHtml(data.toAddress),
    escapeHtml(data.toEmail),
    escapeHtml(data.toPhone)
  ].filter(Boolean).join("<br>");
  $("previewId").textContent = data.invoiceId || "Will be assigned on generate";
  $("previewDates").innerHTML = [
    data.issueDate ? `Issued: ${data.issueDate}` : "",
    data.dueDate ? `Due: ${data.dueDate}` : ""
  ].filter(Boolean).join("<br>");
  $("previewNotes").textContent = data.notes || "Payment due as stated. Please include the invoice ID on your transfer.";
  $("previewPo").textContent = data.poNumber ? `PO: ${data.poNumber}` : "";
  $("subtotal").textContent = money(totals.subtotal, data.currency);
  $("discount").textContent = money(totals.discount, data.currency);
  $("tax").textContent = money(totals.tax, data.currency);
  $("total").textContent = money(totals.total, data.currency);

  const logo = $("logoPreview");
  if (state.logoDataUrl) {
    logo.src = state.logoDataUrl;
    logo.hidden = false;
  } else {
    logo.hidden = true;
  }
  renderItems(true);
}

function fillForm(data) {
  ["fromName","fromAddress","fromEmail","fromPhone","fromTax","toName","toAddress","toEmail","toPhone","issueDate","dueDate","poNumber","notes","taxRate","discountRate","currency"].forEach((k) => {
    if ($(k) && data[k] !== undefined) $(k).value = data[k];
  });
  state.items = data.items && data.items.length ? data.items : [{ description: "", qty: 1, unit: 0 }];
  state.logoDataUrl = data.logoDataUrl || "";
  state.invoiceId = data.invoiceId || "";
  applyTemplate(data.template || "classic");
  updatePreview();
}

function persistCompanyProfile() {
  const data = collectForm();
  localStorage.setItem(COMPANY_KEY, JSON.stringify({
    fromName: data.fromName,
    fromAddress: data.fromAddress,
    fromEmail: data.fromEmail,
    fromPhone: data.fromPhone,
    fromTax: data.fromTax,
    logoDataUrl: data.logoDataUrl,
    taxRate: data.taxRate,
    currency: data.currency,
    template: data.template,
  }));
}

function restoreCompanyProfile() {
  try {
    const raw = localStorage.getItem(COMPANY_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    fillForm({ ...collectForm(), ...p, items: state.items, invoiceId: "" });
  } catch { /* ignore */ }
}

function renderHistory(filter = "") {
  const list = loadHistory().slice().reverse();
  const q = filter.toLowerCase();
  const rows = list.filter((inv) =>
    [inv.invoiceId, inv.fromName, inv.toName].join(" ").toLowerCase().includes(q)
  );
  const body = $("historyBody");
  body.innerHTML = "";
  $("historyEmpty").style.display = rows.length ? "none" : "block";
  rows.forEach((inv) => {
    const totals = calc(inv);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(inv.invoiceId)}</strong></td>
      <td>${escapeHtml(inv.issueDate || "")}</td>
      <td>${escapeHtml(inv.fromName || "")}</td>
      <td>${escapeHtml(inv.toName || "")}</td>
      <td>${money(totals.total, inv.currency)}</td>
      <td class="no-print">
        <button class="secondary" data-open="${escapeAttr(inv.invoiceId)}">Open</button>
        <button class="primary" data-print="${escapeAttr(inv.invoiceId)}">Print</button>
      </td>`;
    body.appendChild(tr);
  });
}

function findInvoice(id) {
  return loadHistory().find((i) => i.invoiceId === id);
}

function saveCurrentInvoice() {
  const data = collectForm();
  if (!data.fromName || !data.toName) {
    alert("Enter your company name and the client company name.");
    return;
  }
  if (!data.invoiceId) data.invoiceId = generateInvoiceId();
  state.invoiceId = data.invoiceId;
  const list = loadHistory();
  const idx = list.findIndex((i) => i.invoiceId === data.invoiceId);
  const record = { ...data, savedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  saveHistory(list);
  persistCompanyProfile();
  updatePreview();
  renderHistory($("historySearch").value);
  alert(`Invoice ${data.invoiceId} saved. You can print it now or find it in History.`);
}

function showView(name) {
  $("view-create").classList.toggle("hidden", name !== "create");
  $("view-history").classList.toggle("hidden", name !== "history");
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  if (name === "history") renderHistory($("historySearch").value);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function init() {
  $("issueDate").value = todayISO();
  $("dueDate").value = plusDays(14);
  restoreCompanyProfile();
  updatePreview();
  renderHistory();

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
  document.querySelectorAll(".tpl").forEach((btn) => {
    btn.addEventListener("click", () => { applyTemplate(btn.dataset.template); persistCompanyProfile(); });
  });
  ["fromName","fromAddress","fromEmail","fromPhone","fromTax","toName","toAddress","toEmail","toPhone","issueDate","dueDate","poNumber","notes","taxRate","discountRate","currency"].forEach((id) => {
    $(id).addEventListener("input", updatePreview);
  });
  $("logoFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { state.logoDataUrl = reader.result; updatePreview(); persistCompanyProfile(); };
    reader.readAsDataURL(file);
  });
  $("clearLogo").addEventListener("click", () => {
    state.logoDataUrl = ""; $("logoFile").value = ""; updatePreview(); persistCompanyProfile();
  });
  $("addItem").addEventListener("click", () => {
    state.items.push({ description: "", qty: 1, unit: 0 });
    updatePreview();
  });
  $("itemsBody").addEventListener("input", (e) => {
    const i = e.target.dataset.i;
    const k = e.target.dataset.k;
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
  $("saveInvoice").addEventListener("click", saveCurrentInvoice);
  $("printInvoice").addEventListener("click", () => {
    if (!state.invoiceId) saveCurrentInvoice();
    showView("create");
    window.print();
  });
  $("historySearch").addEventListener("input", (e) => renderHistory(e.target.value));
  $("historyBody").addEventListener("click", (e) => {
    const openId = e.target.dataset.open;
    const printId = e.target.dataset.print;
    const id = openId || printId;
    if (!id) return;
    const inv = findInvoice(id);
    if (!inv) return;
    fillForm(inv);
    showView("create");
    if (printId) setTimeout(() => window.print(), 50);
  });
}

init();
