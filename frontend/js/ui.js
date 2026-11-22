(function () {
  const api = window.PerfumeriaAPI;
  const incomeCategories = [
    "Perfumes Originales",
    "Perfumes 1.1",
    "Replicas",
    "Otro",
  ];
  const expenseCategories = [
    "Reabastecimiento de Inventario / Fragancias",
    "Alquiler de Local / Sucursal",
    "Servicios Públicos (Luz, Agua, Internet)",
    "Nómina / Salarios",
    "Empaque y Presentación (Cajas, Bolsas)",
    "Publicidad y Marketing",
    "Otro",
  ];
  const expenseCategoryGroups = [
    { label: "Insumos y Esencias", categories: [expenseCategories[0]] },
    { label: "Empaque y Presentación", categories: [expenseCategories[4]] },
    { label: "Alquiler y Servicios", categories: [expenseCategories[1], expenseCategories[2]] },
    { label: "Otros Operativos", categories: [expenseCategories[3], expenseCategories[5], expenseCategories[6]] },
  ];
  const incomeState = { records: [], filtered: [], page: 0, request: 0 };
  const expenseState = { records: [], filtered: [], page: 0, request: 0, receiptFilter: "" };
  const pageSize = 10;
  const dashboardMovementState = { page: 0, total: 0, request: 0, loading: false, pageSize: 6, period: "todos" };
  const dashboardTimeSeriesState = { page: 0, totalPoints: 0 };
  let dashboardCharts = [];
  let dashboardChartsInitialized = false;

  function formatNumber(value) {
    return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function formatCop(value) {
    return "$ " + formatNumber(value);
  }

  function parseCop(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits ? Number(digits) : 0;
  }

  function currentColombiaDateTime() {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date()).replace(" ", "T");
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Fecha no disponible";
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  }

  function dateInColombia(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const part = function (type) {
      return parts.find(function (item) { return item.type === type; }).value;
    };
    return part("year") + "-" + part("month") + "-" + part("day");
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function addIcon(parent, name, className) {
    parent.appendChild(createElement("span", className || "material-symbols-outlined", name));
  }

  function showNotice(message, isError) {
    const notice = createElement(
      "div",
      "fixed bottom-6 right-6 z-50 max-w-sm rounded-xl px-4 py-3 text-white shadow-lg " +
        (isError ? "bg-rose-600" : "bg-primary-container"),
      message
    );
    notice.setAttribute("role", isError ? "alert" : "status");
    notice.setAttribute("aria-live", "polite");
    document.body.appendChild(notice);
    window.setTimeout(function () { notice.remove(); }, 4000);
  }

  function showLoginError(message) {
    const errorBox = document.getElementById("loginError");
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function reportError(error, fallback) {
    const message = error && error.message ? error.message : fallback;
    if (document.getElementById("loginForm")) showLoginError(message);
    else showNotice(message || fallback, true);
  }

  function requireApi() {
    if (!api || typeof api.apiFetch !== "function") {
      throw new Error("No se pudo inicializar el cliente de la API.");
    }
    return api;
  }

  async function fetchAll(endpoint, filters) {
    const results = [];
    let offset = 0;
    const limit = 500;
    while (true) {
      const params = new URLSearchParams(Object.assign({}, filters, {
        limit: String(limit),
        offset: String(offset),
      }));
      const page = await requireApi().apiFetch(endpoint + "?" + params.toString());
      if (!Array.isArray(page)) throw new Error("La API devolvió una lista de registros inválida.");
      results.push.apply(results, page);
      if (page.length < limit) return results;
      offset += page.length;
    }
  }

  function setTextNode(element, value) {
    if (!element) return;
    const textNode = Array.from(element.childNodes).find(function (node) {
      return node.nodeType === Node.TEXT_NODE;
    });
    if (textNode) textNode.nodeValue = value;
    else element.insertBefore(document.createTextNode(value), element.firstChild);
  }

  function setSelectOptions(select, values, placeholder) {
    if (!select) return;
    const options = [];
    if (placeholder !== null) {
      const emptyOption = createElement("option", "", placeholder);
      emptyOption.value = "";
      options.push(emptyOption);
    }
    values.forEach(function (value) {
      const option = createElement("option", "", value);
      option.value = value;
      options.push(option);
    });
    select.replaceChildren.apply(select, options);
  }

  function setSelectValue(select, value) {
    if (!select) return;
    const optionExists = Array.from(select.options).some(function (option) {
      return option.value === value;
    });
    if (value && !optionExists) {
      const option = createElement("option", "", value);
      option.value = value;
      select.appendChild(option);
    }
    select.value = value;
  }

  function initializeAuth() {
    const loginForm = document.getElementById("loginForm");
    const isLoginPage = Boolean(loginForm);
    const token = api && api.getAccessToken();

    if (isLoginPage) {
      if (token) {
        api.apiFetch("/auth/me").then(function () {
          window.location.replace("index.html");
        }).catch(function (error) {
          if (error.status !== 401 && error.status !== 0) reportError(error);
        });
      }

      loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!loginForm.reportValidity()) return;
        const button = document.getElementById("submitBtn");
        const errorBox = document.getElementById("loginError");
        const originalMarkup = button.innerHTML;
        errorBox.classList.add("hidden");
        button.disabled = true;
        button.textContent = "Validando acceso...";
        try {
          const response = await requireApi().apiFetch("/auth/login", {
            method: "POST",
            body: {
              email: document.getElementById("emailInput").value.trim(),
              password: document.getElementById("passwordInput").value,
            },
            skipUnauthorizedRedirect: true,
          });
          window.localStorage.setItem("access_token", response.access_token);
          if (response.refresh_token) window.localStorage.setItem("refresh_token", response.refresh_token);
          if (response.user) window.localStorage.setItem("current_user", JSON.stringify(response.user));
          window.location.replace("index.html");
        } catch (error) {
          reportError(error, "No fue posible iniciar sesión.");
          button.disabled = false;
          button.innerHTML = originalMarkup;
        }
      });
      return false;
    }

    if (!token) {
      window.location.replace("login.html");
      return false;
    }

    document.addEventListener("click", function (event) {
      const link = event.target.closest('a[data-path="login"]');
      if (!link) return;
      event.preventDefault();
      const apiClient = requireApi();
      apiClient.apiFetch("/auth/logout", { method: "POST" })
        .catch(function (error) {
          console.error("No se pudo cerrar la sesión en el servidor.", error);
        })
        .finally(function () {
          apiClient.clearSession();
          window.location.assign("login.html");
        });
    });
    return true;
  }

  function initializeMobileNavigation() {
    const menu = document.getElementById("mobile-menu");
    const toggle = document.getElementById("mobileMenuToggleBtn");
    const icon = document.getElementById("menu-icon");
    if (!menu || !toggle) return;

    function setMenuOpen(open) {
      menu.classList.toggle("hidden", !open);
      toggle.setAttribute("aria-expanded", String(open));
      if (icon) icon.textContent = open ? "close" : "menu";
    }
    window.toggleMobileNav = function () {
      setMenuOpen(menu.classList.contains("hidden"));
    };
    toggle.addEventListener("click", window.toggleMobileNav);
    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () { setMenuOpen(false); });
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setMenuOpen(false);
    });
  }

  function initializeCurrencyInputs() {
    document.querySelectorAll("#montoCOP, #monto-input, [data-currency]").forEach(function (input) {
      input.setAttribute("inputmode", "numeric");
      input.addEventListener("input", function () {
        const amount = parseCop(input.value);
        input.value = amount ? formatNumber(amount) : "";
      });
    });
  }

  function setResponsiveTableLabels() {
    document.querySelectorAll("table").forEach(function (table) {
      const labels = Array.from(table.querySelectorAll("thead th")).map(function (cell) {
        return cell.textContent.trim();
      });
      table.setAttribute("data-responsive", "");
      table.querySelectorAll("tbody tr").forEach(function (row) {
        Array.from(row.cells).forEach(function (cell, index) {
          if (labels[index]) cell.setAttribute("data-label", labels[index]);
        });
      });
    });
  }

  function setEmptyRow(tbody, colspan, message) {
    const row = createElement("tr", "");
    const cell = createElement("td", "px-4 py-6 text-center text-on-surface-variant", message);
    cell.colSpan = colspan;
    row.appendChild(cell);
    tbody.replaceChildren(row);
    setResponsiveTableLabels();
  }

  function appendCell(row, className, label, content) {
    const cell = createElement("td", className);
    if (label) cell.setAttribute("data-label", label);
    if (content instanceof Node) cell.appendChild(content);
    else cell.textContent = content === undefined || content === null ? "" : String(content);
    row.appendChild(cell);
    return cell;
  }

  function appendActionButtons(container, recordId) {
    const actions = createElement("div", "flex items-center justify-center gap-1");
    [
      ["edit", "Editar", "w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:bg-surface-container hover:text-on-surface transition-colors"],
      ["delete", "Eliminar", "w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:bg-error-container hover:text-error transition-colors"],
    ].forEach(function (action) {
      const button = createElement("button", action[2]);
      button.type = "button";
      button.title = action[1];
      button.dataset.action = action[0];
      button.dataset.recordId = recordId;
      addIcon(button, action[0], "material-symbols-outlined text-[18px]");
      actions.appendChild(button);
    });
    container.appendChild(actions);
  }

  function incomeRow(record) {
    const row = createElement("tr", "hover:bg-surface-container-low/50 transition-colors");
    row.dataset.recordId = record.id;
    const reference = record.comprobante || record.id.slice(0, 8).toUpperCase();
    appendCell(row, "py-4 px-space-md font-label-lg text-label-lg text-outline", "Folio", "#" + reference);
    appendCell(row, "py-4 px-space-md font-body-sm text-body-sm text-on-surface-variant", "Fecha", formatDate(record.fecha));

    const concept = createElement("div", "flex items-center gap-3");
    const iconBox = createElement("div", "w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary-container shrink-0");
    addIcon(iconBox, "sanitizer", "material-symbols-outlined text-[18px]");
    concept.appendChild(iconBox);
    const copy = createElement("div", "flex flex-col min-w-0");
    copy.appendChild(createElement("span", "font-title-sm text-title-sm text-on-surface", record.concepto));
    copy.appendChild(createElement("span", "font-body-sm text-body-sm text-on-surface-variant", record.cliente_referencia || record.comprobante || ""));
    concept.appendChild(copy);
    appendCell(row, "py-4 px-space-md", "Concepto / Fragancia", concept);

    appendCell(row, "py-4 px-space-md", "Categoría", createElement("span", "inline-flex items-center px-2.5 py-1 rounded-full font-label-md text-label-md bg-surface-container-high text-on-surface", record.categoria));
    const payment = createElement("span", "inline-flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant");
    addIcon(payment, "account_balance_wallet", "material-symbols-outlined text-[16px] text-primary");
    payment.appendChild(document.createTextNode(record.metodo_pago));
    appendCell(row, "py-4 px-space-md", "Método de Pago", payment);
    appendCell(row, "py-4 px-space-md text-right font-title-sm text-title-sm text-primary-container font-semibold whitespace-nowrap", "Monto (COP)", "+ " + formatCop(record.monto_cop));
    appendActionButtons(appendCell(row, "py-4 px-space-md", "Acciones", ""), record.id);
    return row;
  }

  function expenseRow(record) {
    const row = createElement("tr", "hover:bg-surface-container-low/60 transition-colors");
    row.dataset.recordId = record.id;
    const reference = record.comprobante || record.id.slice(0, 8).toUpperCase();
    appendCell(row, "py-4 px-space-lg font-semibold text-on-surface", "Folio", "#EGR-" + reference);
    appendCell(row, "py-4 px-space-md text-on-surface-variant", "Fecha", formatDate(record.fecha));
    const concept = createElement("div", "flex flex-col");
    concept.appendChild(createElement("span", "", record.concepto));
    concept.appendChild(createElement("span", "block font-body-sm text-outline", record.comprobante || ""));
    appendCell(row, "py-4 px-space-md font-medium text-on-surface", "Concepto / Detalle", concept);
    appendCell(row, "py-4 px-space-md text-on-surface-variant", "Proveedor", record.proveedor || "—");

    const category = createElement("span", "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-primary font-label-md text-label-md");
    category.appendChild(createElement("span", "w-1.5 h-1.5 rounded-full bg-primary"));
    category.appendChild(document.createTextNode(record.categoria));
    appendCell(row, "py-4 px-space-md", "Categoría", category);

    const payment = createElement("div", "flex items-center gap-1.5 text-on-surface-variant font-body-sm");
    addIcon(payment, "account_balance_wallet", "material-symbols-outlined text-[16px] text-outline");
    payment.appendChild(createElement("span", "", record.metodo_pago));
    appendCell(row, "py-4 px-space-md", "Pago", payment);
    appendCell(row, "py-4 px-space-lg text-right font-numeric-metric text-secondary-container font-bold", "Monto (COP)", "- " + formatCop(record.monto_cop));
    appendActionButtons(appendCell(row, "py-4 px-space-lg text-center", "Acciones", ""), record.id);
    return row;
  }

  function movementRow(movement) {
    const isIncome = movement.tipo === "ingreso";
    const row = createElement("tr", "hover:bg-surface-container-low/40 transition-colors");
    appendCell(row, "py-3.5 px-4", "Fecha y Hora", formatDate(movement.fecha));
    const type = createElement(
      "span",
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-md text-label-md " +
        (isIncome ? "bg-primary/10 text-primary-container" : "bg-secondary-fixed/50 text-secondary")
    );
    addIcon(type, isIncome ? "arrow_upward" : "arrow_downward", "material-symbols-outlined text-[14px]");
    type.appendChild(document.createTextNode(isIncome ? "Ingreso" : "Salida"));
    appendCell(row, "py-3.5 px-4", "Tipo", type);

    const concept = createElement("div", "flex items-center gap-3");
    const iconBox = createElement("div", "w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center flex-shrink-0 " + (isIncome ? "text-primary-container" : "text-secondary-container"));
    addIcon(iconBox, isIncome ? "sanitizer" : "inventory_2", "material-symbols-outlined text-[18px]");
    concept.appendChild(iconBox);
    const copy = createElement("div", "flex flex-col min-w-0");
    copy.appendChild(createElement("span", "font-body-md text-body-md font-semibold text-on-surface truncate", movement.concepto));
    copy.appendChild(createElement("span", "font-body-sm text-body-sm text-on-surface-variant", movement.referencia || movement.categoria));
    concept.appendChild(copy);
    appendCell(row, "py-3.5 px-4", "Concepto", concept);

    const payment = createElement("span", "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-surface-container text-on-surface-variant font-label-md text-label-md");
    addIcon(payment, "account_balance_wallet", "material-symbols-outlined text-[14px]");
    payment.appendChild(document.createTextNode(movement.metodo_pago));
    appendCell(row, "py-3.5 px-4", "Método de Pago", payment);
    appendCell(row, "py-3.5 px-4 text-right font-title-sm text-title-sm font-bold " + (isIncome ? "text-primary-container" : "text-secondary"), "Monto (COP)", (isIncome ? "+ " : "- ") + formatCop(movement.monto_cop));
    return row;
  }

  function paginationControls(footer, state, onPageChange, resultLabel) {
    if (!footer) return;
    const start = state.filtered.length ? state.page * pageSize + 1 : 0;
    const end = Math.min((state.page + 1) * pageSize, state.filtered.length);
    const pageCount = Math.max(1, Math.ceil(state.filtered.length / pageSize));
    const summary = createElement("span", "font-body-sm text-body-sm text-on-surface-variant");
    summary.appendChild(document.createTextNode("Mostrando "));
    summary.appendChild(createElement("strong", "text-on-surface", start + "–" + end));
    summary.appendChild(document.createTextNode(" de "));
    summary.appendChild(createElement("strong", "text-on-surface", state.filtered.length));
    summary.appendChild(document.createTextNode(" " + resultLabel));

    const controls = createElement("div", "flex items-center gap-1.5");
    const previous = createElement("button", "h-9 px-3 rounded-lg bg-surface-container-low text-on-surface-variant hover:text-on-surface flex items-center gap-1 text-label-md font-label-md disabled:opacity-40");
    previous.type = "button";
    previous.disabled = state.page === 0;
    addIcon(previous, "chevron_left", "material-symbols-outlined text-[16px]");
    previous.appendChild(document.createTextNode("Anterior"));
    previous.addEventListener("click", function () { if (state.page > 0) onPageChange(state.page - 1); });
    controls.appendChild(previous);

    const current = createElement("button", "h-9 w-9 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg flex items-center justify-center", (state.page + 1) + "/" + pageCount);
    current.type = "button";
    current.setAttribute("aria-label", "Página " + (state.page + 1) + " de " + pageCount);
    controls.appendChild(current);

    const next = createElement("button", "h-9 px-3 rounded-lg bg-surface-container-low text-on-surface-variant hover:text-on-surface flex items-center gap-1 text-label-md font-label-md");
    next.type = "button";
    next.disabled = state.page + 1 >= pageCount;
    next.appendChild(document.createTextNode("Siguiente"));
    addIcon(next, "chevron_right", "material-symbols-outlined text-[16px]");
    next.addEventListener("click", function () { if (state.page + 1 < pageCount) onPageChange(state.page + 1); });
    controls.appendChild(next);
    footer.replaceChildren(summary, controls);
  }

  function incomeFooter() {
    const body = document.getElementById("incomeTableBody");
    const wrapper = body && body.closest(".overflow-x-auto");
    return wrapper ? wrapper.parentElement.lastElementChild : null;
  }

  function expenseFooter() {
    const body = document.getElementById("expenseTableBody");
    const wrapper = body && body.closest(".overflow-x-auto");
    return wrapper ? wrapper.parentElement.lastElementChild : null;
  }

  function renderIncomePage() {
    const tbody = document.getElementById("incomeTableBody");
    if (!tbody) return;
    tbody.hidden = false;
    const records = incomeState.filtered.slice(incomeState.page * pageSize, (incomeState.page + 1) * pageSize);
    if (!records.length) setEmptyRow(tbody, 7, "No hay ingresos que coincidan con los filtros.");
    else {
      tbody.replaceChildren.apply(tbody, records.map(incomeRow));
      setResponsiveTableLabels();
    }
    paginationControls(incomeFooter(), incomeState, function (page) {
      incomeState.page = page;
      renderIncomePage();
    }, "ingresos");
  }

  function updateIncomeKPIs(records) {
    const total = records.reduce(function (sum, record) { return sum + Number(record.monto_cop || 0); }, 0);
    const cashRecords = records.filter(function (record) { return /efectivo/i.test(record.metodo_pago); });
    const cash = cashRecords
      .reduce(function (sum, record) { return sum + Number(record.monto_cop || 0); }, 0);
    const digitalRecords = records.filter(function (record) { return !/efectivo/i.test(record.metodo_pago); });
    const digital = digitalRecords
      .reduce(function (sum, record) { return sum + Number(record.monto_cop || 0); }, 0);
    const average = records.length ? Math.round(total / records.length) : 0;
    const values = {
      incomePeriodTotal: formatCop(total),
      incomeCashTotal: formatCop(cash) + " COP",
      incomeTransferTotal: formatCop(digital) + " COP",
      incomeAverage: formatCop(average) + " COP",
    };
    Object.keys(values).forEach(function (id) {
      const element = document.getElementById(id);
      if (element) element.textContent = values[id];
    });
    const cashMeta = document.getElementById("incomeCashTotal").parentElement.querySelector(".text-primary.flex");
    const digitalMeta = document.getElementById("incomeTransferTotal").parentElement.querySelector(".text-primary.flex");
    const averageMeta = document.getElementById("incomeAverage").parentElement.querySelector(".text-on-surface-variant.flex");
    const digitalLabel = document.getElementById("incomeTransferTotal").parentElement.querySelector(".font-label-md");
    if (cashMeta) setIconText(cashMeta, cashRecords.length + (cashRecords.length === 1 ? " movimiento" : " movimientos"));
    if (digitalMeta) setIconText(digitalMeta, digitalRecords.length + (digitalRecords.length === 1 ? " pago electrónico" : " pagos electrónicos"));
    if (averageMeta) setIconText(averageMeta, records.length + (records.length === 1 ? " venta" : " ventas"));
    if (digitalLabel) digitalLabel.textContent = "Pagos electrónicos y tarjeta";
  }

  function setIconText(element, text) {
    const icon = element.querySelector(".material-symbols-outlined");
    if (icon) element.replaceChildren(icon, document.createTextNode(" " + text));
    else element.textContent = text;
  }

  function getIncomeFilters() {
    const search = document.getElementById("searchInput").value.trim();
    const method = document.getElementById("incomePaymentFilter").value;
    const start = document.getElementById("incomeStartDate").value;
    const end = document.getElementById("incomeEndDate").value;
    if (start && end && start > end) throw new Error("La fecha inicial no puede ser posterior a la fecha final.");
    const filters = {};
    if (search) filters.search = search;
    if (method) filters.metodo_pago = method;
    if (start) filters.fecha_inicio = start;
    if (end) filters.fecha_fin = end;
    return filters;
  }

  async function loadIngresos(showErrors) {
    const requestId = ++incomeState.request;
    try {
      const records = await fetchAll("/ingresos", getIncomeFilters());
      if (requestId !== incomeState.request) return;
      incomeState.records = records;
      incomeState.filtered = records;
      incomeState.page = 0;
      updateIncomeKPIs(records);
      renderIncomePage();
    } catch (error) {
      if (requestId === incomeState.request && showErrors !== false) reportError(error, "No fue posible cargar los ingresos.");
    }
  }

  function currentMonthExpenses(records) {
    const currentMonth = dateInColombia(new Date()).slice(0, 7);
    return records.filter(function (record) { return dateInColombia(record.fecha).slice(0, 7) === currentMonth; });
  }

  function updateExpenseKPIs(records) {
    const monthlyRecords = currentMonthExpenses(records);
    const total = monthlyRecords.reduce(function (sum, record) { return sum + Number(record.monto_cop || 0); }, 0);
    const totalLabel = document.querySelector(".expense-summary-actions .font-numeric-metric");
    if (totalLabel) totalLabel.textContent = formatCop(total);

    const categoryGrid = document.querySelector(".expense-category-grid");
    const budgetCard = categoryGrid && categoryGrid.parentElement.children[0];
    if (!budgetCard) return;
    const limit = 16000000;
    const spent = budgetCard.querySelector(".font-display-lg");
    if (spent) spent.textContent = formatCop(total);
    const badge = budgetCard.querySelector(".rounded-full");
    if (badge) badge.textContent = Math.round(total / limit * 100) + "% de Límite";
    const remaining = budgetCard.querySelector("p strong");
    if (remaining) remaining.textContent = formatCop(Math.max(0, limit - total)) + " COP";

    const groupTotals = expenseCategoryGroups.map(function (group) {
      return monthlyRecords.reduce(function (sum, record) {
        return sum + (group.categories.includes(record.categoria) ? Number(record.monto_cop || 0) : 0);
      }, 0);
    });
    categoryGrid.querySelectorAll(":scope > div").forEach(function (card, index) {
      const group = expenseCategoryGroups[index];
      if (!group) return;
      const count = monthlyRecords.filter(function (record) {
        return group.categories.includes(record.categoria);
      }).length;
      const label = card.querySelector(".uppercase.block");
      const value = card.querySelector(".font-numeric-metric");
      const percent = card.querySelector(".font-semibold");
      const details = card.querySelector(".text-outline-variant");
      if (label) label.textContent = group.label;
      if (value) value.textContent = formatCop(groupTotals[index]);
      if (percent) percent.textContent = (total ? Math.round(groupTotals[index] / total * 100) : 0) + "%";
      if (details) details.textContent = count + (count === 1 ? " registro del mes" : " registros del mes");
    });
    const progress = budgetCard.querySelector(".mt-space-lg > div");
    if (progress) {
      progress.querySelectorAll(":scope > div").forEach(function (segment, index) {
        segment.style.width = (total ? groupTotals[index] / total * 100 : 0) + "%";
      });
      const legend = progress.nextElementSibling;
      if (legend) legend.querySelectorAll("span").forEach(function (item, index) {
        item.textContent = expenseCategoryGroups[index].label.split(" ")[0] + " " +
          (total ? Math.round(groupTotals[index] / total * 100) : 0) + "%";
      });
    }
  }

  function getExpenseFilters() {
    const search = document.getElementById("expenseSearch").value.trim();
    const category = document.getElementById("expenseCategoryFilter").value;
    const filters = {};
    if (search) filters.search = search;
    if (category) filters.categoria = category;
    return filters;
  }

  function applyReceiptFilter(records) {
    if (!expenseState.receiptFilter) return records;
    return records.filter(function (record) {
      return expenseState.receiptFilter === "with" ? Boolean(record.comprobante) : !record.comprobante;
    });
  }

  function renderExpensePage() {
    const tbody = document.getElementById("expenseTableBody");
    if (!tbody) return;
    tbody.hidden = false;
    const records = expenseState.filtered.slice(expenseState.page * pageSize, (expenseState.page + 1) * pageSize);
    if (!records.length) setEmptyRow(tbody, 8, "No hay salidas que coincidan con los filtros.");
    else {
      tbody.replaceChildren.apply(tbody, records.map(expenseRow));
      setResponsiveTableLabels();
    }
    paginationControls(expenseFooter(), expenseState, function (page) {
      expenseState.page = page;
      renderExpensePage();
    }, "salidas registradas");
  }

  async function loadSalidas(showErrors) {
    const requestId = ++expenseState.request;
    try {
      const records = await fetchAll("/salidas", getExpenseFilters());
      if (requestId !== expenseState.request) return;
      expenseState.records = records;
      expenseState.filtered = applyReceiptFilter(records);
      expenseState.page = 0;
      updateExpenseKPIs(expenseState.filtered);
      renderExpensePage();
    } catch (error) {
      if (requestId === expenseState.request && showErrors !== false) reportError(error, "No fue posible cargar las salidas.");
    }
  }

  function setDashboardCurrency(id, value) {
    const element = document.getElementById(id);
    if (element) setTextNode(element, formatCop(value) + " ");
  }

  function updateDashboardKPIs(summary) {
    const kpis = summary.kpis;
    setDashboardCurrency("dashboardIncome", kpis.total_ingresos_periodo);
    setDashboardCurrency("dashboardExpenses", kpis.total_salidas_periodo);
    setDashboardCurrency("dashboardBalance", kpis.balance_periodo_neto);
    const margin = document.getElementById("dashboardMargin");
    if (margin) margin.textContent = Number(kpis.margen_periodo_porcentaje).toLocaleString("es-CO", { maximumFractionDigits: 2 }) + "%";
    updateDashboardVariation("dashboardIncome", kpis.variacion_ingresos_porcentaje);
    updateDashboardVariation("dashboardExpenses", kpis.variacion_salidas_porcentaje);

    const comparisonLabel = dashboardMovementState.period === "hoy"
      ? "vs. ayer"
      : dashboardMovementState.period === "semana"
        ? "vs. semana anterior"
        : dashboardMovementState.period === "mes"
          ? "vs. período equivalente del mes anterior"
          : "sin comparación previa";
    ["dashboardIncomeComparisonLabel", "dashboardExpenseComparisonLabel"].forEach(function (id) {
      const label = document.getElementById(id);
      if (label) label.textContent = comparisonLabel;
    });

    const balanceContext = document.getElementById("dashboardBalanceContext");
    if (balanceContext) {
      balanceContext.textContent = dashboardMovementState.period === "todos"
        ? "Balance histórico acumulado"
        : "Balance del período seleccionado";
    }

    const chartTitle = document.getElementById("dashboardTimeSeriesTitle");
    const chartDescription = document.getElementById("dashboardTimeSeriesDescription");
    const chartCopy = {
      hoy: ["Comparativa por hora", "Ingresos y salidas por hora (hoy)"],
      semana: ["Comparativa semanal", "Ingresos y salidas por día (esta semana)"],
      mes: ["Comparativa diaria", "Ingresos y salidas por día (este mes)"],
      todos: ["Comparativa histórica", "Ingresos y salidas por mes (todo el historial)"],
    }[dashboardMovementState.period];
    if (chartTitle) chartTitle.textContent = chartCopy[0];
    if (chartDescription) chartDescription.textContent = chartCopy[1];
  }

  function updateDashboardVariation(valueId, variation) {
    const value = document.getElementById(valueId);
    const badge = value && value.parentElement.querySelector(".inline-flex");
    if (!badge) return;
    const text = variation === null ? "N/D" : (variation > 0 ? "+" : "") + variation + "%";
    const icon = badge.querySelector(".material-symbols-outlined");
    if (icon) {
      icon.textContent = variation === null ? "remove" : variation < 0 ? "trending_down" : "trending_up";
      badge.replaceChildren(icon, document.createTextNode(" " + text));
    } else {
      badge.textContent = text;
    }
  }

  function initializeTimeSeriesNavigation() {
    const previous = document.getElementById("timeSeriesPrevious");
    const next = document.getElementById("timeSeriesNext");
    if (!previous || !next) return;
    previous.addEventListener("click", function () {
      const maxPage = Math.floor(Math.max(0, dashboardTimeSeriesState.totalPoints - 1) / 6);
      if (dashboardTimeSeriesState.page < maxPage) {
        dashboardTimeSeriesState.page += 1;
        refreshTimeSeriesChart();
      }
    });
    next.addEventListener("click", function () {
      if (dashboardTimeSeriesState.page > 0) {
        dashboardTimeSeriesState.page -= 1;
        refreshTimeSeriesChart();
      }
    });
  }

  function refreshTimeSeriesChart() {
    if (!dashboardCharts[0] || !dashboardTimeSeriesState.labels) return;
    const labels = dashboardTimeSeriesState.labels;
    const incomes = dashboardTimeSeriesState.incomes;
    const expenses = dashboardTimeSeriesState.expenses;
    const windowSize = 6;
    const end = Math.min(labels.length, Math.max(windowSize, labels.length - dashboardTimeSeriesState.page * windowSize));
    const start = Math.max(0, end - windowSize);
    dashboardCharts[0].data.labels = labels.slice(start, end);
    dashboardCharts[0].data.datasets[0].data = incomes.slice(start, end);
    dashboardCharts[0].data.datasets[1].data = expenses.slice(start, end);
    dashboardCharts[0].update();
    const previous = document.getElementById("timeSeriesPrevious");
    const next = document.getElementById("timeSeriesNext");
    if (previous) previous.disabled = start === 0;
    if (next) next.disabled = end === labels.length;
  }

  function createDashboardCharts() {
    if (typeof window.Chart !== "function") throw new Error("Chart.js no está disponible para mostrar el dashboard.");
    const descriptions = [
      ["dashboardTimeSeriesTitle", "bar"],
      ["Distribución de Salidas", "doughnut"],
    ];
    dashboardCharts = descriptions.map(function (description, index) {
      const heading = index === 0
        ? document.getElementById(description[0])
        : Array.from(document.querySelectorAll("h2")).find(function (element) {
            return element.textContent.trim() === description[0];
          });
      if (!heading) return null;
      let container = heading.parentElement;
      while (container && !container.querySelector("svg")) container = container.parentElement;
      const svg = container && container.querySelector("svg");
      if (!svg) return null;
      const canvas = createElement("canvas", "financial-chart");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", description[0]);
      svg.replaceWith(canvas);
      const isDoughnut = index === 1;
      return new window.Chart(canvas, isDoughnut
        ? {
            type: "doughnut",
            data: {
              labels: [],
              datasets: [{ data: [], backgroundColor: ["#0f766e", "#80d5cb", "#64748b", "#e11d48", "#f59e0b", "#8b5cf6", "#94a3b8"], borderWidth: 0 }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: "68%",
              plugins: { legend: { display: false } },
            },
          }
        : {
            type: "bar",
            data: {
              labels: [],
              datasets: [
                { label: "Ingresos", data: [], backgroundColor: "#0f766e", borderRadius: 4 },
                { label: "Salidas", data: [], backgroundColor: "#e11d48", borderRadius: 4 },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { grid: { display: false }, border: { display: false } },
                y: {
                  beginAtZero: true,
                  grid: { color: "#eff4ff", borderDash: [4, 4] },
                  border: { display: false },
                  ticks: {
                    callback: function (value) {
                      return "$ " + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value / 1000) + "K";
                    },
                  },
                },
              },
            },
          });
    }).filter(Boolean);
  }

  function updateDashboardDistribution(summary) {
    const total = summary.distribucion_salidas.data.reduce(function (sum, value) { return sum + Number(value || 0); }, 0);
    const heading = Array.from(document.querySelectorAll("h2")).find(function (element) {
      return element.textContent.trim() === "Distribución de Salidas";
    });
    if (!heading) return;
    let container = heading.parentElement;
    while (container && !container.querySelector("canvas")) container = container.parentElement;
    if (!container) return;
    const chartArea = container.querySelector(".flex.flex-col.gap-2\\.5.w-full");
    if (chartArea) {
      const colors = ["bg-primary-container", "bg-primary-fixed-dim", "bg-tertiary", "bg-secondary-container", "bg-amber-500", "bg-violet-500", "bg-slate-400"];
      const entries = summary.distribucion_salidas.labels.map(function (label, index) {
        const row = createElement("div", "flex items-center justify-between p-2 rounded-lg bg-surface-container-low/50");
        const left = createElement("div", "flex items-center gap-2");
        left.appendChild(createElement("span", "w-3 h-3 rounded-full " + colors[index % colors.length]));
        left.appendChild(createElement("span", "font-body-sm text-body-sm text-on-surface", label));
        const right = createElement("div", "flex items-center gap-2");
        right.appendChild(createElement("span", "font-label-md text-label-md text-on-surface font-semibold", formatCop(summary.distribucion_salidas.data[index])));
        right.appendChild(createElement("span", "font-label-md text-label-md text-primary font-bold", (total ? Math.round(summary.distribucion_salidas.data[index] / total * 100) : 0) + "%"));
        row.append(left, right);
        return row;
      });
      chartArea.replaceChildren.apply(chartArea, entries);
    }
    const totalLabel = container.querySelector(".font-title-sm.font-bold");
    if (totalLabel) totalLabel.textContent = formatCop(total) + " COP";
  }

  function renderDashboardMovements(summary) {
    const tbody = document.querySelector(".recent-movements-table tbody");
    if (!tbody) return;
    const movements = summary.ultimos_movimientos || [];
    dashboardMovementState.total = Number(summary.total_movimientos) || 0;
    if (!movements.length) {
      setEmptyRow(tbody, 5, "Aún no hay movimientos registrados.");
    } else {
      tbody.replaceChildren.apply(tbody, movements.map(movementRow));
      setResponsiveTableLabels();
    }
    const section = tbody.closest("section");
    const footer = section && section.querySelector(".border-t");
    const countLabel = footer && footer.querySelector("span");
    const start = movements.length ? dashboardMovementState.page * dashboardMovementState.pageSize + 1 : 0;
    const end = dashboardMovementState.page * dashboardMovementState.pageSize + movements.length;
    if (countLabel) countLabel.textContent = movements.length
      ? "Mostrando movimientos " + start + "–" + end + " de " + dashboardMovementState.total
      : "Aún no hay movimientos recientes";
    updateDashboardPagination();
  }

  function updateDashboardPagination() {
    const tbody = document.querySelector(".recent-movements-table tbody");
    const section = tbody && tbody.closest("section");
    const buttons = section && section.querySelectorAll(".border-t button");
    if (!buttons || buttons.length < 2) return;
    buttons[0].disabled = dashboardMovementState.loading || dashboardMovementState.page === 0;
    buttons[1].disabled = dashboardMovementState.loading ||
      (dashboardMovementState.page + 1) * dashboardMovementState.pageSize >= dashboardMovementState.total;
  }

  function initializeDashboardPagination() {
    const tbody = document.querySelector(".recent-movements-table tbody");
    const section = tbody && tbody.closest("section");
    const buttons = section && section.querySelectorAll(".border-t button");
    if (!buttons || buttons.length < 2) return;
    buttons[0].addEventListener("click", function () {
      if (!dashboardMovementState.loading && dashboardMovementState.page > 0) {
        loadDashboard(dashboardMovementState.page - 1);
      }
    });
    buttons[1].addEventListener("click", function () {
      if (!dashboardMovementState.loading &&
          (dashboardMovementState.page + 1) * dashboardMovementState.pageSize < dashboardMovementState.total) {
        loadDashboard(dashboardMovementState.page + 1);
      }
    });
    updateDashboardPagination();
  }

  function setActiveDashboardPeriod(period) {
    const activeClass = "px-space-md py-2 rounded-lg font-label-md text-label-md bg-surface-container-lowest text-primary shadow-sm font-semibold transition-all";
    const inactiveClass = "px-space-md py-2 rounded-lg font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors";
    document.querySelectorAll("[data-dashboard-period]").forEach(function (button) {
      const isActive = button.dataset.dashboardPeriod === period;
      button.className = isActive ? activeClass : inactiveClass;
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function addDaysToIsoDate(value, days) {
    const parts = value.split("-").map(Number);
    const shifted = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
    return shifted.toISOString().slice(0, 10);
  }

  function dashboardReportDateRange() {
    const today = dateInColombia(new Date());
    const period = dashboardMovementState.period;
    if (period === "hoy") return { fecha_inicio: today, fecha_fin: today };
    if (period === "mes") return { fecha_inicio: today.slice(0, 7) + "-01", fecha_fin: today };
    if (period === "semana") {
      const weekday = new Date(today + "T00:00:00Z").getUTCDay();
      const daysSinceMonday = (weekday + 6) % 7;
      return {
        fecha_inicio: addDaysToIsoDate(today, -daysSinceMonday),
        fecha_fin: today,
      };
    }
    return {};
  }

  function reportDateFilters() {
    const page = document.body.dataset.page;
    if (page === "ingresos") {
      const start = document.getElementById("incomeStartDate").value;
      const end = document.getElementById("incomeEndDate").value;
      if (start && end && start > end) {
        throw new Error("La fecha inicial no puede ser posterior a la fecha final.");
      }
      return { fecha_inicio: start, fecha_fin: end };
    }
    if (page === "dashboard") return dashboardReportDateRange();
    return {};
  }

  function initializeReportExport() {
    document.querySelectorAll("[data-export-report]").forEach(function (button) {
      button.addEventListener("click", async function () {
        if (button.disabled) return;
        const originalMarkup = button.innerHTML;
        button.disabled = true;
        button.textContent = "Generando Excel...";
        try {
          const filters = reportDateFilters();
          const params = new URLSearchParams();
          Object.keys(filters).forEach(function (key) {
            if (filters[key]) params.set(key, filters[key]);
          });
          const query = params.toString();
          const result = await requireApi().downloadBlob(
            "/reportes/excel" + (query ? "?" + query : "")
          );
          const objectUrl = window.URL.createObjectURL(result.blob);
          const link = createElement("a");
          link.href = objectUrl;
          link.download = result.filename || "Reporte_Perfumeria_SC_" + dateInColombia(new Date()) + ".xlsx";
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(function () { window.URL.revokeObjectURL(objectUrl); }, 1000);
          showNotice("Reporte Excel descargado.", false);
        } catch (error) {
          reportError(error, "No fue posible generar el archivo Excel.");
        } finally {
          button.disabled = false;
          button.innerHTML = originalMarkup;
        }
      });
    });
  }

  function initializeDashboardPeriods() {
    document.querySelectorAll("[data-dashboard-period]").forEach(function (button) {
      button.addEventListener("click", function () {
        const period = button.dataset.dashboardPeriod;
        if (!period || period === dashboardMovementState.period || dashboardMovementState.loading) return;
        setActiveDashboardPeriod(period);
        loadDashboard(0, period);
      });
    });
    setActiveDashboardPeriod(dashboardMovementState.period);
  }

  async function loadDashboard(page, period) {
    const tbody = document.querySelector(".recent-movements-table tbody");
    const requestedPage = Number.isInteger(page) && page >= 0 ? page : 0;
    const previousPeriod = dashboardMovementState.period;
    if (period) dashboardMovementState.period = period;
    const requestId = ++dashboardMovementState.request;
    dashboardMovementState.loading = true;
    if (requestId === 1 && tbody) tbody.replaceChildren();
    updateDashboardPagination();
    try {
      if (!dashboardChartsInitialized) {
        createDashboardCharts();
        dashboardChartsInitialized = true;
      }
      const offset = requestedPage * dashboardMovementState.pageSize;
      const summary = await requireApi().apiFetch(
        "/dashboard/resumen?movimientos_offset=" + offset +
        "&movimientos_limit=" + dashboardMovementState.pageSize +
        "&periodo=" + encodeURIComponent(dashboardMovementState.period)
      );
      if (requestId !== dashboardMovementState.request) return;
      dashboardMovementState.page = requestedPage;
      updateDashboardKPIs(summary);
      renderDashboardMovements(summary);
      updateDashboardDistribution(summary);
      if (dashboardCharts[0]) {
        dashboardTimeSeriesState.labels = summary.serie_temporal.labels;
        dashboardTimeSeriesState.incomes = summary.serie_temporal.ingresos;
        dashboardTimeSeriesState.expenses = summary.serie_temporal.salidas;
        dashboardTimeSeriesState.totalPoints = summary.serie_temporal.labels.length;
        if (period) dashboardTimeSeriesState.page = 0;
        refreshTimeSeriesChart();
      }
      if (dashboardCharts[1]) {
        dashboardCharts[1].data.labels = summary.distribucion_salidas.labels;
        dashboardCharts[1].data.datasets[0].data = summary.distribucion_salidas.data;
        dashboardCharts[1].update();
      }
    } catch (error) {
      if (requestId === dashboardMovementState.request && period && previousPeriod !== period) {
        dashboardMovementState.period = previousPeriod;
        setActiveDashboardPeriod(previousPeriod);
      }
      reportError(error, "No fue posible cargar el resumen financiero.");
    } finally {
      if (requestId === dashboardMovementState.request) {
        dashboardMovementState.loading = false;
        updateDashboardPagination();
      }
    }
  }

  function colombiaDateTimeInput(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return currentColombiaDateTime();
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date).replace(" ", "T");
  }

  function resetModalForm(form, button, defaultTitle, defaultButtonMarkup) {
    form.reset();
    const dateInput = form.querySelector('input[type="datetime-local"]');
    if (dateInput) dateInput.value = currentColombiaDateTime();
    const modal = form.closest("[id$='Modal'], #modal-container");
    const title = modal && modal.querySelector("h2");
    if (title) title.textContent = defaultTitle;
    if (button) {
      button.disabled = false;
      button.innerHTML = defaultButtonMarkup;
    }
    form.dataset.recordId = "";
  }

  function initializeTransactionForm(configuration) {
    const modal = document.getElementById(configuration.modalId);
    const form = document.getElementById(configuration.formId);
    const submit = document.getElementById(configuration.submitId);
    const open = document.getElementById(configuration.openId);
    const tableBody = document.getElementById(configuration.tableBodyId);
    if (!modal || !form || !submit || !open || !tableBody) return;

    submit.type = "submit";
    submit.setAttribute("form", form.id);
    const defaultButtonMarkup = submit.innerHTML;
    function setModalVisible(visible) {
      modal.classList.toggle("hidden", !visible);
      modal.classList.toggle("flex", visible);
      modal.setAttribute("aria-hidden", String(!visible));
      document.body.classList.toggle("modal-open", visible);
    }
    open.addEventListener("click", function () {
      resetModalForm(form, submit, configuration.title, defaultButtonMarkup);
      setModalVisible(true);
      const firstInput = form.querySelector("input, select, textarea");
      if (firstInput) firstInput.focus();
    });
    configuration.closeIds.forEach(function (id) {
      const button = document.getElementById(id);
      if (button) button.addEventListener("click", function () {
        setModalVisible(false);
        resetModalForm(form, submit, configuration.title, defaultButtonMarkup);
      });
    });
    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        setModalVisible(false);
        resetModalForm(form, submit, configuration.title, defaultButtonMarkup);
      }
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const amount = parseCop(form.querySelector(configuration.amountSelector).value);
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        reportError(new Error("El monto debe ser un valor entero positivo en COP."));
        return;
      }
      const payload = configuration.buildPayload(form, amount);
      const recordId = form.dataset.recordId;
      const originalMarkup = submit.innerHTML;
      submit.disabled = true;
      submit.textContent = "Guardando...";
      try {
        await requireApi().apiFetch(
          configuration.endpoint + (recordId ? "/" + encodeURIComponent(recordId) : ""),
          { method: recordId ? "PUT" : "POST", body: payload }
        );
        setModalVisible(false);
        resetModalForm(form, submit, configuration.title, defaultButtonMarkup);
        showNotice(recordId ? "Registro actualizado correctamente." : "Registro creado correctamente.");
        await configuration.reload(false);
      } catch (error) {
        reportError(error, "No fue posible guardar el registro.");
        submit.disabled = false;
        submit.innerHTML = originalMarkup;
      }
    });

    function editRecord(record) {
      resetModalForm(form, submit, configuration.title, defaultButtonMarkup);
      form.dataset.recordId = record.id;
      form.querySelector(configuration.amountSelector).value = formatNumber(record.monto_cop);
      configuration.fillForm(form, record);
      const title = modal.querySelector("h2");
      if (title) title.textContent = configuration.editTitle;
      submit.innerHTML = configuration.editButtonMarkup;
      setModalVisible(true);
      form.querySelector(configuration.firstFocusSelector).focus();
    }

    tableBody.addEventListener("click", async function (event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const record = configuration.getRecords().find(function (item) {
        return item.id === button.dataset.recordId;
      });
      if (!record) return;
      if (button.dataset.action === "edit") {
        editRecord(record);
        return;
      }
      if (button.dataset.action !== "delete") return;
      if (!window.confirm("¿Confirmas que deseas eliminar este registro? Esta acción no se puede deshacer.")) return;
      button.disabled = true;
      try {
        await requireApi().apiFetch(configuration.endpoint + "/" + encodeURIComponent(record.id), { method: "DELETE" });
        showNotice("Registro eliminado correctamente.");
        await configuration.reload(false);
      } catch (error) {
        button.disabled = false;
        reportError(error, "No fue posible eliminar el registro.");
      }
    });
  }

  function initializeIncomePage() {
    const tbody = document.getElementById("incomeTableBody");
    tbody.replaceChildren();
    tbody.hidden = false;
    const search = document.getElementById("searchInput");
    const method = document.getElementById("incomePaymentFilter");
    const startDate = document.getElementById("incomeStartDate");
    const endDate = document.getElementById("incomeEndDate");
    let timer;
    function scheduleLoad() {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { loadIngresos(true); }, 250);
    }
    search.addEventListener("input", scheduleLoad);
    [method, startDate, endDate].forEach(function (control) {
      control.addEventListener("change", scheduleLoad);
    });

    initializeTransactionForm({
      modalId: "incomeModal",
      formId: "ingresoForm",
      openId: "openModalBtn",
      closeIds: ["closeModalBtn", "cancelModalBtn"],
      submitId: "saveIncomeBtn",
      endpoint: "/ingresos",
      tableBodyId: "incomeTableBody",
      amountSelector: "#montoCOP",
      firstFocusSelector: "#concepto",
      title: "Registrar Nuevo Ingreso",
      editTitle: "Editar Ingreso",
      editButtonMarkup: '<span class="material-symbols-outlined text-[20px]">save</span><span>Guardar Cambios</span>',
      buildPayload: function (form, amount) {
        return {
          concepto: form.elements.concepto.value.trim(),
          monto_cop: amount,
          fecha: form.elements.fechaHora.value,
          categoria: form.elements.categoriaVenta.value,
          metodo_pago: form.elements.metodoPago.value,
          comprobante: null,
          cliente_referencia: form.elements.clienteRef.value.trim() || null,
        };
      },
      fillForm: function (form, record) {
        form.elements.concepto.value = record.concepto;
        form.elements.fechaHora.value = colombiaDateTimeInput(record.fecha);
        setSelectValue(form.elements.categoriaVenta, record.categoria);
        setSelectValue(form.elements.metodoPago, record.metodo_pago);
        form.elements.clienteRef.value = record.cliente_referencia || "";
      },
      getRecords: function () { return incomeState.records; },
      reload: loadIngresos,
    });
    loadIngresos(true);
  }

  function initializeExpensePage() {
    const tbody = document.querySelector("table tbody");
    if (!tbody) return;
    tbody.id = "expenseTableBody";
    tbody.replaceChildren();
    tbody.hidden = false;
    setSelectOptions(document.getElementById("categoria-select"), expenseCategories, null);
    setSelectOptions(document.getElementById("expenseCategoryFilter"), expenseCategories, "Todas las categorías");
    const method = document.getElementById("metodo-pago");
    if (method) Array.from(method.options).forEach(function (option) { option.value = option.textContent.trim(); });

    const search = document.getElementById("expenseSearch");
    const category = document.getElementById("expenseCategoryFilter");
    let timer;
    function scheduleLoad() {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { loadSalidas(true); }, 250);
    }
    search.addEventListener("input", scheduleLoad);
    category.addEventListener("change", scheduleLoad);

    const receiptButtons = Array.from(document.querySelectorAll(".expense-history-filters > .flex button"));
    function setReceiptButtonActive(button, isActive) {
      button.classList.toggle("bg-surface-container-lowest", isActive);
      button.classList.toggle("text-on-surface", isActive);
      button.classList.toggle("shadow-sm", isActive);
      button.classList.toggle("text-on-surface-variant", !isActive);
      button.classList.toggle("hover:text-on-surface", !isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
    receiptButtons.forEach(function (button, index) {
      setReceiptButtonActive(button, index === 0);
      button.addEventListener("click", function () {
        receiptButtons.forEach(function (receiptButton) {
          setReceiptButtonActive(receiptButton, receiptButton === button);
        });
        expenseState.receiptFilter = index === 1 ? "with" : index === 2 ? "without" : "";
        expenseState.filtered = applyReceiptFilter(expenseState.records);
        expenseState.page = 0;
        updateExpenseKPIs(expenseState.filtered);
        renderExpensePage();
      });
    });

    updateExpenseKPIs([]);
    initializeTransactionForm({
      modalId: "modal-container",
      formId: "salida-form",
      openId: "btn-abrir-modal",
      closeIds: ["btn-cerrar-modal", "btn-cancelar-modal"],
      submitId: "btn-guardar-salida",
      endpoint: "/salidas",
      tableBodyId: "expenseTableBody",
      amountSelector: "#monto-input",
      firstFocusSelector: "#concepto-input",
      title: "Registrar Salida o Gasto Operativo",
      editTitle: "Editar Salida o Gasto Operativo",
      editButtonMarkup: '<span class="material-symbols-outlined text-[20px]">save</span><span>Guardar Cambios</span>',
      buildPayload: function (form, amount) {
        return {
          concepto: form.elements.concepto.value.trim(),
          monto_cop: amount,
          fecha: form.elements.fecha.value,
          categoria: form.elements.categoria.value,
          metodo_pago: form.elements.metodo_pago.value,
          proveedor: form.elements.proveedor.value.trim() || null,
          comprobante: form.elements.comprobante.value.trim() || null,
        };
      },
      fillForm: function (form, record) {
        form.elements.concepto.value = record.concepto;
        form.elements.fecha.value = colombiaDateTimeInput(record.fecha);
        form.elements.categoria.value = record.categoria;
        setSelectValue(form.elements.metodo_pago, record.metodo_pago);
        form.elements.proveedor.value = record.proveedor || "";
        form.elements.comprobante.value = record.comprobante || "";
      },
      getRecords: function () { return expenseState.records; },
      reload: loadSalidas,
    });
    loadSalidas(true);
  }

  function initializeTransactionForms() {
    const incomeCategorySelect = document.getElementById("categoriaVenta");
    setSelectOptions(incomeCategorySelect, incomeCategories, null);
  }

  document.addEventListener("DOMContentLoaded", function () {
    const isAuthenticated = initializeAuth();
    if (!isAuthenticated) return;
    initializeMobileNavigation();
    initializeReportExport();
    initializeCurrencyInputs();
    setResponsiveTableLabels();
    if (document.body.dataset.page === "dashboard") {
      initializeDashboardPeriods();
      initializeDashboardPagination();
      initializeTimeSeriesNavigation();
      loadDashboard(0);
    }
    if (document.body.dataset.page === "ingresos") {
      initializeTransactionForms();
      initializeIncomePage();
    }
    if (document.body.dataset.page === "salidas") initializeExpensePage();
  });
})();
