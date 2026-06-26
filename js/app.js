(() => {
  "use strict";

  const PROJECTS_KEY = "usglass_order_projects_v2";
  const CURRENT_KEY = "usglass_order_current_v2";

  const state = {
    id: null,
    name: "",
    deliveryDate: "",
    deliveryMethod: "配送",
    projectNote: "",
    items: [],
    editingId: null
  };

  const el = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindEvents();
    restoreCurrent();
    renderAll();
  }

  function cacheElements() {
    [
      "inputScreen", "previewScreen", "projectName", "deliveryDate", "deliveryMethod",
      "projectNote", "itemForm", "symbol", "glassType", "width", "height", "quantity",
      "process", "note", "submitItemBtn",
      "cancelEditBtn", "itemsBody", "itemCount", "showPreviewBtn",
      "backToInputBtn", "downloadPdfBtn", "saveProjectBtn", "loadProjectBtn",
      "importJsonBtn", "jsonFileInput", "newProjectBtn", "loadDialog", "savedProjectsList", "toast",
      "previewProjectName", "previewDeliveryDate", "previewDeliveryMethod",
      "previewProjectNoteWrap", "previewProjectNote", "previewTotalQty", "previewBody"
    ].forEach((id) => {
      el[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    el.projectName.addEventListener("input", () => {
      state.name = el.projectName.value.trim();
      persistCurrent();
      renderPreview();
    });

    el.deliveryDate.addEventListener("input", () => {
      state.deliveryDate = el.deliveryDate.value;
      persistCurrent();
      renderPreview();
    });

    el.deliveryMethod.addEventListener("change", () => {
      state.deliveryMethod = el.deliveryMethod.value;
      persistCurrent();
      renderPreview();
    });

    el.projectNote.addEventListener("input", () => {
      state.projectNote = el.projectNote.value.trim();
      persistCurrent();
      renderPreview();
    });

    el.itemForm.addEventListener("submit", onSubmitItem);
    el.cancelEditBtn.addEventListener("click", cancelEdit);
    el.showPreviewBtn.addEventListener("click", showPreview);
    el.backToInputBtn.addEventListener("click", showInput);
    el.downloadPdfBtn.addEventListener("click", downloadPdf);
    el.saveProjectBtn.addEventListener("click", saveProject);
    el.loadProjectBtn.addEventListener("click", openLoadDialog);
    el.importJsonBtn.addEventListener("click", () => el.jsonFileInput.click());
    el.jsonFileInput.addEventListener("change", importJsonFile);
    el.newProjectBtn.addEventListener("click", newProject);
  }

  function importJsonFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        importOrderJson(JSON.parse(String(reader.result || "")));
      } catch (error) {
        toast(`JSON読込に失敗しました: ${error.message}`);
      }
    };
    reader.readAsText(file);
  }

  function importOrderJson(json) {
    if (!json || !Array.isArray(json.items)) {
      toast("items配列があるJSONを選択してください");
      return;
    }

    const importedItems = json.items.map(convertImportItem).filter(Boolean);
    if (importedItems.length === 0) {
      toast("取込できる明細がありません");
      return;
    }

    Object.assign(state, {
      id: state.id || uid(),
      name: typeof json.projectName === "string" ? json.projectName : state.name,
      items: importedItems,
      editingId: null
    });

    resetItemForm();
    persistCurrent();
    saveImportedProject();
    renderAll();
    showInput();
    toast(`${importedItems.length}件をJSONから読み込みました`);
  }

  function convertImportItem(raw) {
    raw = raw || {};
    const width = toPositiveInt(raw.width_mm ?? raw.width ?? raw.w);
    const height = toPositiveInt(raw.height_mm ?? raw.height ?? raw.h);
    const glassType = String(raw.glass_type ?? raw.glassType ?? raw.glass ?? "").trim();
    if (!width || !height || !glassType) return null;

    return {
      id: uid(),
      symbol: String(raw.symbol ?? "").trim(),
      glassType,
      width,
      height,
      quantity: toPositiveInt(raw.qty ?? raw.quantity ?? raw.count) || 1,
      process: String(raw.process ?? raw.processing ?? "").trim(),
      note: String(raw.note ?? raw.notes ?? "").trim()
    };
  }

  function saveImportedProject() {
    const projects = getProjects();
    projects[state.id] = snapshot();
    setProjects(projects);
  }

  function onSubmitItem(event) {
    event.preventDefault();
    syncProjectFields();

    const item = readItemForm();
    if (!item) return;

    if (state.editingId) {
      const target = state.items.find((row) => row.id === state.editingId);
      if (target) Object.assign(target, item);
      toast("明細を更新しました");
    } else {
      state.items.push({ id: uid(), ...item });
      toast("明細を追加しました");
    }

    resetItemForm();
    persistCurrent();
    renderAll();
  }

  function readItemForm() {
    const symbol = el.symbol.value.trim();
    const glassType = el.glassType.value.trim();
    const width = toPositiveInt(el.width.value);
    const height = toPositiveInt(el.height.value);
    const quantity = toPositiveInt(el.quantity.value) || 1;
    const process = el.process.value.trim();
    const note = el.note.value.trim();

    if (!glassType) {
      toast("ガラス種類を入力してください");
      el.glassType.focus();
      return null;
    }

    if (!width || !height) {
      toast("幅と高さを入力してください");
      (!width ? el.width : el.height).focus();
      return null;
    }

    return { symbol, glassType, width, height, quantity, process, note };
  }

  function resetItemForm() {
    state.editingId = null;
    el.itemForm.reset();
    el.quantity.value = "1";
    el.submitItemBtn.textContent = "明細を追加";
    el.cancelEditBtn.hidden = true;
    el.glassType.focus();
  }

  function cancelEdit() {
    resetItemForm();
  }

  function editItem(id) {
    const item = state.items.find((row) => row.id === id);
    if (!item) return;
    state.editingId = id;
    el.symbol.value = item.symbol || "";
    el.glassType.value = item.glassType;
    el.width.value = item.width;
    el.height.value = item.height;
    el.quantity.value = item.quantity;
    el.process.value = item.process || "";
    el.note.value = item.note;
    el.submitItemBtn.textContent = "明細を更新";
    el.cancelEditBtn.hidden = false;
    el.glassType.focus();
  }

  function deleteItem(id) {
    state.items = state.items.filter((row) => row.id !== id);
    if (state.editingId === id) resetItemForm();
    persistCurrent();
    renderAll();
    toast("明細を削除しました");
  }

  function renderAll() {
    renderProjectFields();
    renderItems();
    renderPreview();
  }

  function renderProjectFields() {
    el.projectName.value = state.name || "";
    el.deliveryDate.value = state.deliveryDate || "";
    el.deliveryMethod.value = state.deliveryMethod || "配送";
    el.projectNote.value = state.projectNote || "";
  }

  function renderItems() {
    el.itemCount.textContent = `${state.items.length}件`;

    if (state.items.length === 0) {
      el.itemsBody.innerHTML = `<tr><td class="empty" colspan="7">明細がありません</td></tr>`;
      return;
    }

    el.itemsBody.innerHTML = state.items.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.symbol || "")}</td>
        <td>${escapeHtml(item.glassType)}</td>
        <td>${item.width} x ${item.height}</td>
        <td>${item.quantity}</td>
        <td>${escapeHtml(formatItemNote(item))}</td>
        <td>
          <div class="row-actions">
            <button class="btn secondary" type="button" data-edit="${item.id}">編集</button>
            <button class="btn danger" type="button" data-delete="${item.id}">削除</button>
          </div>
        </td>
      </tr>
    `).join("");

    el.itemsBody.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => editItem(button.dataset.edit));
    });
    el.itemsBody.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", () => deleteItem(button.dataset.delete));
    });
  }

  function renderPreview() {
    el.previewProjectName.textContent = state.name || "-";
    el.previewDeliveryDate.textContent = state.deliveryDate ? formatDate(state.deliveryDate) : "-";
    el.previewDeliveryMethod.textContent = state.deliveryMethod || "配送";
    el.previewProjectNote.textContent = state.projectNote || "";
    el.previewProjectNoteWrap.hidden = !state.projectNote;
    el.previewTotalQty.textContent = String(totalQuantity());

    if (state.items.length === 0) {
      el.previewBody.innerHTML = `<tr><td colspan="7">明細なし</td></tr>`;
      return;
    }

    el.previewBody.innerHTML = state.items.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.symbol || "")}</td>
        <td>${escapeHtml(item.glassType)}</td>
        <td>${item.width}</td>
        <td>${item.height}</td>
        <td>${item.quantity}</td>
        <td>${escapeHtml(formatItemNote(item))}</td>
      </tr>
    `).join("");
  }

  function showPreview() {
    syncProjectFields();
    persistCurrent();
    renderPreview();
    el.inputScreen.classList.remove("active");
    el.previewScreen.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showInput() {
    el.previewScreen.classList.remove("active");
    el.inputScreen.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function downloadPdf() {
    syncProjectFields();
    renderPreview();

    if (hasNonAsciiPdfText()) {
      toast("日本語を保持するため、ブラウザのPDF保存画面を開きます。");
      window.print();
      return;
    }

    const jspdf = window.jspdf;
    if (!jspdf?.jsPDF) {
      toast("PDFライブラリを読み込めません。印刷画面を開きます。");
      window.print();
      return;
    }

    const doc = new jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const title = "寸法注文票";
    const projectName = state.name || "未設定";
    const deliveryDate = state.deliveryDate ? formatDate(state.deliveryDate) : "-";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(title, pageWidth / 2, 18, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Project: ${projectName}`, 14, 31);
    doc.text(`Delivery: ${deliveryDate}`, 14, 38);
    doc.text(`Method: ${state.deliveryMethod || "Delivery"}`, 75, 38);
    doc.text(`Total Qty: ${totalQuantity()}`, 150, 38);
    if (state.projectNote) {
      doc.text(`Project Note: ${state.projectNote}`, 14, 45, { maxWidth: 180 });
    }

    const rows = state.items.map((item, index) => [
      index + 1,
      item.symbol || "",
      item.glassType,
      item.width,
      item.height,
      item.quantity,
      formatItemNote(item)
    ]);

    if (typeof doc.autoTable === "function") {
      doc.autoTable({
        startY: state.projectNote ? 55 : 46,
        head: [["No.", "Symbol", "Glass Type", "W", "H", "Qty", "Note"]],
        body: rows.length ? rows : [["", "", "No items", "", "", "", ""]],
        styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [20, 84, 156] },
        columnStyles: {
          0: { halign: "center", cellWidth: 12 },
          1: { cellWidth: 20 },
          3: { halign: "right", cellWidth: 18 },
          4: { halign: "right", cellWidth: 18 },
          5: { halign: "center", cellWidth: 16 }
        },
        margin: { left: 14, right: 14 }
      });
    } else {
      doc.text("PDF table plugin unavailable. Use browser PDF save from preview.", 14, 50);
    }

    doc.save(`${safeFileName(projectName)}_寸法注文票.pdf`);
    toast("PDFを保存しました");
  }

  function saveProject() {
    syncProjectFields();
    if (!state.name) {
      toast("案件名を入力してください");
      el.projectName.focus();
      return;
    }

    if (!state.id) state.id = uid();
    const projects = getProjects();
    projects[state.id] = snapshot();
    setProjects(projects);
    persistCurrent();
    toast("案件を保存しました");
  }

  function openLoadDialog() {
    renderSavedProjects();
    if (typeof el.loadDialog.showModal === "function") {
      el.loadDialog.showModal();
    }
  }

  function renderSavedProjects() {
    const projects = getProjects();
    const entries = Object.values(projects).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    if (entries.length === 0) {
      el.savedProjectsList.innerHTML = `<p class="small-muted">保存済み案件はありません</p>`;
      return;
    }

    el.savedProjectsList.innerHTML = entries.map((project) => `
      <div class="saved-item">
        <div>
          <strong>${escapeHtml(project.name || "無題")}</strong>
          <span>${project.deliveryDate ? formatDate(project.deliveryDate) : "納品日未設定"} / ${project.deliveryMethod || "配送"} / ${project.items.length}件</span>
        </div>
        <div class="saved-actions">
          <button class="btn secondary" type="button" data-load="${project.id}">読込</button>
          <button class="btn danger" type="button" data-remove="${project.id}">削除</button>
        </div>
      </div>
    `).join("");

    el.savedProjectsList.querySelectorAll("[data-load]").forEach((button) => {
      button.addEventListener("click", () => loadProject(button.dataset.load));
    });
    el.savedProjectsList.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => removeProject(button.dataset.remove));
    });
  }

  function loadProject(id) {
    const project = getProjects()[id];
    if (!project) return;
    Object.assign(state, normalizeProject(project), { editingId: null });
    el.loadDialog.close();
    resetItemForm();
    persistCurrent();
    renderAll();
    showInput();
    toast("案件を読み込みました");
  }

  function removeProject(id) {
    const projects = getProjects();
    delete projects[id];
    setProjects(projects);
    renderSavedProjects();
    toast("保存済み案件を削除しました");
  }

  function newProject() {
    if (state.items.length > 0 && !window.confirm("現在の入力内容をクリアしますか？")) return;
    Object.assign(state, {
      id: null,
      name: "",
      deliveryDate: "",
      deliveryMethod: "配送",
      projectNote: "",
      items: [],
      editingId: null
    });
    resetItemForm();
    persistCurrent();
    renderAll();
    showInput();
    toast("新規案件を開始しました");
  }

  function syncProjectFields() {
    state.name = el.projectName.value.trim();
    state.deliveryDate = el.deliveryDate.value;
    state.deliveryMethod = el.deliveryMethod.value || "配送";
    state.projectNote = el.projectNote.value.trim();
  }

  function persistCurrent() {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(snapshot()));
  }

  function restoreCurrent() {
    try {
      const raw = localStorage.getItem(CURRENT_KEY);
      if (!raw) return;
      Object.assign(state, normalizeProject(JSON.parse(raw)));
    } catch {
      localStorage.removeItem(CURRENT_KEY);
    }
  }

  function getProjects() {
    try {
      return JSON.parse(localStorage.getItem(PROJECTS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function setProjects(projects) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  }

  function snapshot() {
    return {
      id: state.id,
      name: state.name,
      deliveryDate: state.deliveryDate,
      deliveryMethod: state.deliveryMethod,
      projectNote: state.projectNote,
      items: state.items.map((item) => ({ ...item })),
      updatedAt: new Date().toISOString()
    };
  }

  function normalizeProject(project) {
    return {
      id: project.id || null,
      name: project.name || "",
      deliveryDate: project.deliveryDate || project.pickupDate || "",
      deliveryMethod: project.deliveryMethod || "配送",
      projectNote: project.projectNote || "",
      items: Array.isArray(project.items) ? project.items.map((item) => ({
        id: item.id || uid(),
        symbol: item.symbol || "",
        glassType: item.glassType || "",
        width: toPositiveInt(item.width),
        height: toPositiveInt(item.height),
        quantity: toPositiveInt(item.quantity) || 1,
        process: item.process || "",
        note: item.note || ""
      })).filter((item) => item.glassType && item.width && item.height) : []
    };
  }

  function totalQuantity() {
    return state.items.reduce((sum, item) => sum + (toPositiveInt(item.quantity) || 0), 0);
  }

  function formatItemNote(item) {
    return [item.process, item.note].map((value) => String(value || "").trim()).filter(Boolean).join(" / ");
  }

  function hasNonAsciiPdfText() {
    const values = [
      state.name,
      state.deliveryMethod,
      state.projectNote,
      ...state.items.flatMap((item) => [item.symbol, item.glassType, item.process, item.note])
    ];
    return values.some((value) => /[^\x00-\x7F]/.test(String(value || "")));
  }

  function toPositiveInt(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function safeFileName(value) {
    return String(value || "注文票").replace(/[\\/:*?"<>|]/g, "_");
  }

  function uid() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  let toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2400);
  }
})();
