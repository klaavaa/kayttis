// Jääkaappini: käyttöliittymä. Päiväyslogiikka ja kategoriat ovat tiedostossa data.js.
(() => {
  "use strict";

  const KEYS = {
    products: "jaakaappini-tuotteet",
    log: "jaakaappini-historia",
    settings: "jaakaappini-asetukset",
  };
  const DEFAULT_SETTINGS = { theme: "auto", soonDays: 3, lastNotified: null };
  const HASH = { products: "", add: "lisaa", stats: "tilastot", settings: "asetukset" };

  const $ = sel => document.querySelector(sel);

  // Pieni apufunktio elementtien luomiseen.
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else if (key in node && !key.includes("-")) node[key] = value;
      else node.setAttribute(key, value);
    }
    node.append(...children.filter(c => c !== null && c !== undefined && c !== false));
    return node;
  }

  // ------------------------------------------------------------- tallennus

  function readJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function loadProducts() {
    const raw = readJSON(KEYS.products, []);
    return Array.isArray(raw) ? raw.filter(p => p && typeof p === "object").map(normalizeProduct) : [];
  }

  function loadLog() {
    const raw = readJSON(KEYS.log, []);
    return Array.isArray(raw)
      ? raw.filter(h => h && h.name && (h.outcome === "eaten" || h.outcome === "wasted") && isDateString(h.at))
      : [];
  }

  function loadSettings() {
    const s = { ...DEFAULT_SETTINGS, ...readJSON(KEYS.settings, {}) };
    if (!["auto", "light", "dark"].includes(s.theme)) s.theme = "auto";
    s.soonDays = [1, 2, 3, 5, 7].includes(Number(s.soonDays)) ? Number(s.soonDays) : 3;
    return s;
  }

  let products = loadProducts();
  let eatLog = loadLog();
  let settings = loadSettings();

  const ui = {
    view: "products",
    search: "",
    filter: "all",
    sort: "date",
    editingId: null,
    pendingPhoto: undefined, // undefined = ei muutosta, null = poista kuva, merkkijono = uusi kuva
    touched: { category: false, dateType: false, openedDays: false },
    dismissed: new Set(), // suljetut ilmoitukset pysyvät piilossa sivun uudelleenlataukseen asti
    installPrompt: null,
    today: localDateString(),
  };

  function persist(nextProducts, nextLog = eatLog) {
    try {
      localStorage.setItem(KEYS.products, JSON.stringify(nextProducts));
      localStorage.setItem(KEYS.log, JSON.stringify(nextLog));
    } catch (error) {
      try {
        localStorage.setItem(KEYS.products, JSON.stringify(products));
        localStorage.setItem(KEYS.log, JSON.stringify(eatLog));
      } catch {}
      showToast(
        error?.name === "QuotaExceededError"
          ? "Selaimen tallennustila on täynnä. Poista vanhoja kuvallisia tuotteita tai lisää tuote ilman kuvaa."
          : `Tallennus epäonnistui: ${error?.message || "tuntematon virhe"}`,
        { error: true }
      );
      return false;
    }
    products = nextProducts;
    eatLog = nextLog;
    render();
    return true;
  }

  // Tallentaa muutoksen ja näyttää ilmoituksen, jossa on Kumoa-painike.
  function commit(nextProducts, nextLog, message, undoable = true) {
    const before = { products, eatLog };
    if (!persist(nextProducts, nextLog)) return false;
    if (message) {
      showToast(message, undoable ? {
        action: "Kumoa",
        onAction: () => persist(before.products, before.eatLog) && showToast("Muutos kumottu."),
      } : {});
    }
    return true;
  }

  function saveSettings(changes) {
    settings = { ...settings, ...changes };
    try {
      localStorage.setItem(KEYS.settings, JSON.stringify(settings));
    } catch {}
  }

  function logEntry(product, outcome, count = 1) {
    return { name: product.name, category: product.category, outcome, at: localDateString(), count };
  }

  // ------------------------------------------------------------- toast

  let toastTimer = null;
  function showToast(text, { action, onAction, error = false } = {}) {
    const toast = $("#toast");
    clearTimeout(toastTimer);
    toast.hidden = true;
    toast.classList.toggle("error", error);
    toast.replaceChildren(el("span", { textContent: text }));
    if (action) {
      toast.append(el("button", {
        type: "button",
        textContent: action,
        onclick: () => {
          clearTimeout(toastTimer);
          toast.hidden = true;
          onAction();
        },
      }));
    }
    void toast.offsetWidth; // käynnistää animaation uudelleen
    toast.hidden = false;
    toastTimer = setTimeout(() => (toast.hidden = true), action ? 6000 : 3500);
  }

  // ------------------------------------------------------------- näkymät

  function navigate(view) {
    const hash = HASH[view] ?? "";
    if (location.hash.slice(1) === hash) showView(view);
    else location.hash = hash;
  }

  function viewFromHash() {
    const hash = location.hash.slice(1);
    return Object.keys(HASH).find(v => HASH[v] === hash) || "products";
  }

  function showView(view) {
    ui.view = view;
    document.querySelectorAll("[data-view-panel]").forEach(panel => {
      panel.hidden = panel.dataset.viewPanel !== view;
    });
    document.querySelectorAll(".navigation [data-view]").forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (view === "stats") renderStats();
    if (view === "settings") renderSettings();
    renderNotifications();
    window.scrollTo({ top: 0 });
  }

  document.querySelectorAll(".navigation [data-view]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.dataset.view === "add" && ui.editingId) resetForm();
      navigate(button.dataset.view);
    });
  });
  window.addEventListener("hashchange", () => showView(viewFromHash()));

  // ------------------------------------------------------------- apufunktiot

  function urgentProducts() {
    return products
      .filter(p => isUrgent(p, settings.soonDays))
      .sort((a, b) => effectiveDate(a).localeCompare(effectiveDate(b)));
  }

  function openedAgo(openedAt) {
    const daysAgo = -daysUntil(openedAt);
    if (daysAgo <= 0) return "Avattu tänään";
    if (daysAgo === 1) return "Avattu eilen";
    return `Avattu ${daysAgo} päivää sitten`;
  }

  function listNames(names) {
    if (names.length <= 3) return names.length > 1 ? `${names.slice(0, -1).join(", ")} ja ${names.at(-1)}` : names[0];
    return `${names.slice(0, 3).join(", ")} ja ${names.length - 3} muuta`;
  }

  function createProductImage(product, forNotification = false) {
    if (product.photo) {
      return el("img", {
        src: product.photo,
        alt: `Kuva tuotteesta ${product.name}`,
        class: forNotification ? "notification-image" : null,
      });
    }
    return el("div", {
      class: forNotification ? "notification-image notification-placeholder" : "placeholder",
      "aria-hidden": "true",
      textContent: categoryById(product.category).emoji,
    });
  }

  // Pienennetään kamerasta tai galleriasta valittu kuva ennen tallennusta.
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.onload = () => {
        try {
          const maxSize = 300;
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Kuvan käsittely epäonnistui.");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.5));
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Kuvaa ei voitu lukea."));
      };
      image.src = objectUrl;
    });
  }

  // ------------------------------------------------------------- tuotelista

  function visibleProducts() {
    const q = ui.search.trim().toLowerCase();
    let list = products.filter(p =>
      !q || p.name.toLowerCase().includes(q) || categoryById(p.category).name.toLowerCase().includes(q));

    if (ui.filter === "urgent") list = list.filter(p => isUrgent(p, settings.soonDays));
    else if (ui.filter === "opened") list = list.filter(p => p.openedAt);
    else if (ui.filter.startsWith("cat:")) list = list.filter(p => p.category === ui.filter.slice(4));

    const byDate = (a, b) => effectiveDate(a).localeCompare(effectiveDate(b)) || a.name.localeCompare(b.name, "fi");
    const sorters = {
      date: byDate,
      name: (a, b) => a.name.localeCompare(b.name, "fi") || byDate(a, b),
      added: (a, b) => b.addedAt - a.addedAt || byDate(a, b),
    };
    return list.sort(sorters[ui.sort] || byDate);
  }

  function renderFilters() {
    const present = CATEGORIES.filter(c => products.some(p => p.category === c.id));
    const options = [
      { id: "all", label: `Kaikki ${products.length}` },
      { id: "urgent", label: `🔔 Syö pian ${urgentProducts().length}` },
      { id: "opened", label: `Avatut ${products.filter(p => p.openedAt).length}` },
      ...present.map(c => ({ id: `cat:${c.id}`, label: `${c.emoji} ${c.name}` })),
    ];
    if (!options.some(o => o.id === ui.filter)) ui.filter = "all";

    $("#filters").replaceChildren(...options.map(o => el("button", {
      type: "button",
      class: "chip",
      textContent: o.label,
      "aria-pressed": String(o.id === ui.filter),
      onclick: () => {
        ui.filter = o.id;
        renderProducts();
        renderFilters();
      },
    })));
  }

  function renderProducts() {
    const container = $("#products");
    const urgent = urgentProducts();

    $("#productCount").textContent = products.length ? `(${products.length})` : "";
    $("#toolbar").hidden = products.length === 0;
    $("#notice").textContent = products.length === 0 ? ""
      : urgent.length ? `🔔 Syö ensin: ${listNames(urgent.map(p => p.name))}.`
      : "✅ Ei pian vanhenevia tuotteita.";

    if (products.length === 0) {
      container.replaceChildren(el("div", { class: "empty" },
        el("span", { class: "big", "aria-hidden": "true", textContent: "🧊" }),
        el("p", { textContent: "Jääkaappi on vielä tyhjä." }),
        el("button", { type: "button", textContent: "Lisää ensimmäinen tuote", onclick: () => navigate("add") }),
        " ",
        el("button", { type: "button", class: "secondary-button", textContent: "Kokeile esimerkeillä", onclick: addExamples }),
      ));
      return;
    }

    const list = visibleProducts();
    if (list.length === 0) {
      container.replaceChildren(el("div", { class: "empty" },
        el("span", { class: "big", "aria-hidden": "true", textContent: "🔍" }),
        el("p", { textContent: "Ei hakua vastaavia tuotteita." }),
        el("button", {
          type: "button",
          class: "secondary-button",
          textContent: "Näytä kaikki",
          onclick: () => {
            ui.search = "";
            ui.filter = "all";
            $("#search").value = "";
            render();
          },
        }),
      ));
      return;
    }

    container.replaceChildren(...list.map(productCard));
  }

  function productCard(product) {
    const status = productStatus(product, settings.soonDays);
    const cat = categoryById(product.category);
    const card = el("article", { class: "product", dataset: { id: product.id } });
    if (status.level !== "ok") card.classList.add(`${status.level}-product`);
    if (product.openedAt) card.classList.add("has-opened-badge");

    const statusClass = { expired: "expired", check: "check", soon: "soon", ok: "status-line" }[status.level];
    const details = el("div", { class: "details" },
      el("div", {},
        el("strong", { textContent: product.name }),
        product.quantity > 1 ? el("span", { class: "qty", textContent: `× ${product.quantity}`, title: `${product.quantity} kpl` }) : null,
      ),
      el("p", { class: "meta", textContent: `${cat.emoji} ${cat.name}` }),
      el("p", { class: statusClass, textContent: status.text }),
      el("p", { textContent: `${DATE_TYPES[product.dateType]} ${formatDate(product.date)}` }),
      product.openedAt ? el("p", {
        class: "opened-date",
        textContent: openedAgo(product.openedAt) + (status.limit ? ` · syö viimeistään ${formatDate(status.limit)}` : ""),
      }) : null,
      status.hint ? el("p", { class: `food-hint ${status.level}`, textContent: status.hint }) : null,
    );

    const actions = el("div", { class: "product-actions" },
      el("button", {
        type: "button",
        class: product.openedAt ? "secondary-button" : null,
        textContent: product.openedAt ? "Peru avaus" : "Merkitse avatuksi",
        "aria-label": product.openedAt ? `Peru tuotteen ${product.name} avausmerkintä` : `Merkitse ${product.name} avatuksi`,
        onclick: () => toggleOpened(product.id),
      }),
      product.quantity > 1 ? el("button", {
        type: "button",
        class: "secondary-button",
        textContent: "Käytä 1",
        "aria-label": `Käytä yksi ${product.name}`,
        onclick: () => useOne(product.id),
      }) : null,
      el("button", {
        type: "button",
        class: "secondary-button",
        textContent: "Muokkaa",
        "aria-label": `Muokkaa tuotetta ${product.name}`,
        onclick: () => startEdit(product.id),
      }),
      el("button", {
        type: "button",
        class: "delete",
        textContent: "Poista",
        "aria-label": `Poista ${product.name}`,
        onclick: () => askRemove(product.id),
      }),
    );
    details.append(actions);
    card.append(createProductImage(product), details);

    if (product.openedAt) {
      card.append(el("span", { class: "opened-badge", title: "Tuote on avattu" },
        el("img", { src: "avattu-purkki.png", alt: "Tuote on avattu" })));
    }
    return card;
  }

  // ------------------------------------------------------------- tuotetoiminnot

  function find(id) {
    return products.find(p => p.id === id);
  }

  function toggleOpened(id) {
    const product = find(id);
    if (!product) return;
    const openedAt = product.openedAt ? null : localDateString();
    const next = products.map(p => (p.id === id ? { ...p, openedAt } : p));
    const keeps = product.openedDays ? ` Avattuna säilyy n. ${product.openedDays} pv.` : "";
    commit(next, eatLog, openedAt ? `${product.name} merkitty avatuksi.${keeps}` : `${product.name}: avausmerkintä peruttu.`);
  }

  function useOne(id) {
    const product = find(id);
    if (!product || product.quantity < 2) return;
    const next = products.map(p => (p.id === id ? { ...p, quantity: p.quantity - 1 } : p));
    commit(next, [...eatLog, logEntry(product, "eaten")], `${product.name}: 1 käytetty, ${product.quantity - 1} jäljellä.`);
  }

  function askRemove(id) {
    const product = find(id);
    if (!product) return;
    const dialog = $("#removeDialog");
    const status = productStatus(product, settings.soonDays);
    const qty = product.quantity > 1 ? ` (${product.quantity} kpl)` : "";
    $("#removeTitle").textContent = `Mihin ${product.name}${qty} meni?`;
    $("#removeText").textContent = "Valintasi kerryttää tilastoja ruokahävikistä.";

    if (typeof dialog.showModal !== "function") {
      if (confirm(`Poistetaanko ${product.name}?`)) removeProduct(id, "none");
      return;
    }
    dialog.returnValue = "";
    dialog.onclose = () => {
      if (["eaten", "wasted", "none"].includes(dialog.returnValue)) removeProduct(id, dialog.returnValue);
    };
    dialog.showModal();
    // Vanhentunut tuote menee todennäköisesti roskiin, joten tarjotaan se ensin.
    dialog.querySelector(status.level === "expired" ? "[value=wasted]" : "[value=eaten]").focus();
  }

  function removeProduct(id, outcome) {
    const product = find(id);
    if (!product) return;
    const next = products.filter(p => p.id !== id);
    const nextLog = outcome === "none" ? eatLog : [...eatLog, logEntry(product, outcome, product.quantity)];
    const how = { eaten: " (syöty)", wasted: " (roskiin)", none: "" }[outcome];
    commit(next, nextLog, `${product.name} poistettu${how}.`);
  }

  function addExamples() {
    const ids = new Set(products.map(p => p.id));
    const missing = exampleProducts().filter(p => !ids.has(p.id));
    if (missing.length === 0) {
      showToast("Kaikki esimerkkituotteet on jo lisätty.");
      return;
    }
    if (commit([...products, ...missing], eatLog, `${missing.length} esimerkkituotetta lisätty.`)) navigate("products");
  }

  function updateExamplesButton() {
    const ids = new Set(products.map(p => p.id));
    const missing = exampleProducts().filter(p => !ids.has(p.id)).length;
    const button = $("#addExamplesButton");
    button.disabled = missing === 0;
    button.textContent = missing ? `Lisää ${missing} esimerkkituotetta` : "Esimerkit on jo lisätty";
  }

  $("#addExamplesButton").addEventListener("click", addExamples);

  // ------------------------------------------------------------- haku ja järjestys

  $("#search").addEventListener("input", event => {
    ui.search = event.target.value;
    renderProducts();
  });
  $("#sort").addEventListener("change", event => {
    ui.sort = event.target.value;
    renderProducts();
  });

  // ------------------------------------------------------------- ilmoitukset sovelluksessa

  function renderNotifications() {
    const container = $("#notifications");
    container.replaceChildren();
    if (ui.view !== "products") return;

    // Enintään kolme ilmoitusta kerrallaan, loput kootaan yhdelle riville.
    const urgent = urgentProducts().filter(p => !ui.dismissed.has(p.id));
    const MAX_SHOWN = 3;
    for (const product of urgent.slice(0, MAX_SHOWN)) {
      container.append(el("article", { class: "notification" },
        createProductImage(product, true),
        el("div", { class: "notification-content" },
          el("span", { class: "notification-app", textContent: "JÄÄKAAPPINI · NYT" }),
          el("strong", { textContent: product.name }),
          el("p", { textContent: notificationText(product, settings.soonDays) }),
        ),
        el("button", {
          type: "button",
          class: "notification-close",
          textContent: "×",
          "aria-label": `Sulje tuotteen ${product.name} ilmoitus`,
          onclick: () => {
            ui.dismissed.add(product.id);
            renderNotifications();
          },
        }),
      ));
    }

    if (urgent.length > 1) {
      const rest = urgent.length - MAX_SHOWN;
      container.append(el("div", { class: "notification more" },
        el("p", { textContent: rest > 0 ? `+ ${rest} muuta pian vanhenevaa tuotetta` : "" }),
        el("button", {
          type: "button",
          class: "dismiss-all secondary-button",
          textContent: "Sulje kaikki",
          onclick: () => {
            urgent.forEach(p => ui.dismissed.add(p.id));
            renderNotifications();
          },
        }),
      ));
    }
  }

  // ------------------------------------------------------------- puhelimen ilmoitukset

  const canNotify = "Notification" in window;

  async function sendSystemNotification(force = false) {
    if (!canNotify || Notification.permission !== "granted") return;
    const today = localDateString();
    if (!force && settings.lastNotified === today) return;

    const urgent = urgentProducts();
    if (!urgent.length && !force) return;

    const title = urgent.length === 0 ? "Jääkaappini"
      : urgent.length === 1 ? "1 tuote kannattaa käyttää pian"
      : `${urgent.length} tuotetta kannattaa käyttää pian`;
    const lines = urgent.slice(0, 4).map(p => `${p.name}: ${notificationText(p, settings.soonDays)}`);
    if (urgent.length > 4) lines.push(`…ja ${urgent.length - 4} muuta`);
    const options = {
      body: lines.join("\n") || "Ilmoitukset toimivat! Muistutamme, kun jokin tuote vanhenee pian.",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "jaakaappini-paivays",
      lang: "fi",
    };

    try {
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (registration) await registration.showNotification(title, options);
      else new Notification(title, options);
      if (!force) saveSettings({ lastNotified: today });
    } catch {
      if (force) showToast("Ilmoitusta ei voitu näyttää tässä selaimessa.", { error: true });
    }
  }

  function renderNotificationSettings() {
    const status = $("#notifStatus");
    const button = $("#notifButton");
    const test = $("#notifTest");
    button.hidden = true;
    test.hidden = true;

    if (!canNotify) {
      status.textContent = "Tämä selain ei tue ilmoituksia. Sovelluksen sisäiset muistutukset toimivat silti.";
    } else if (Notification.permission === "granted") {
      status.textContent = "Ilmoitukset ovat päällä. Saat kerran päivässä muistutuksen pian vanhenevista tuotteista, kun avaat sovelluksen.";
      test.hidden = false;
    } else if (Notification.permission === "denied") {
      status.textContent = "Ilmoitukset on estetty. Voit sallia ne selaimen sivustoasetuksista.";
    } else {
      status.textContent = "Salli ilmoitukset, niin saat muistutuksen myös puhelimen ilmoituksena.";
      button.hidden = false;
    }
  }

  $("#notifButton").addEventListener("click", async () => {
    try {
      await Notification.requestPermission();
    } catch {}
    renderNotificationSettings();
    if (Notification.permission === "granted") sendSystemNotification(true);
  });
  $("#notifTest").addEventListener("click", () => sendSystemNotification(true));

  // ------------------------------------------------------------- lomake

  const form = $("#productForm");
  const fields = {
    name: $("#name"),
    category: $("#category"),
    date: $("#date"),
    quantity: $("#quantity"),
    openedDays: $("#openedDays"),
    openedNow: $("#openedNow"),
    openedAt: $("#openedAt"),
    photo: $("#photo"),
  };

  fields.category.append(...CATEGORIES.map(c => el("option", { value: c.id, textContent: `${c.emoji} ${c.name}` })));

  function dateTypeValue() {
    return form.querySelector("input[name=dateType]:checked")?.value || "parasta";
  }

  function setDateType(value) {
    form.querySelectorAll("input[name=dateType]").forEach(r => (r.checked = r.value === value));
    updateDateTypeHint();
  }

  function updateDateTypeHint() {
    $("#dateTypeHint").textContent = dateTypeValue() === "viimeinen"
      ? "Viimeinen käyttöpäivä: älä syö päiväyksen jälkeen (esim. tuore liha ja kala)."
      : "Parasta ennen: tuote on usein hyvää vielä päiväyksen jälkeen. Katso, haista, maista.";
  }

  // Kategorian oletukset, ellei käyttäjä ole jo itse valinnut arvoja.
  function applyCategoryDefaults() {
    const cat = categoryById(fields.category.value);
    if (!ui.touched.dateType) setDateType(cat.dateType);
    if (!ui.touched.openedDays) fields.openedDays.value = cat.openedDays ?? "";
    fields.openedDays.placeholder = cat.openedDays ? String(cat.openedDays) : "ei rajaa";
  }

  // Aiemmin käytetyn nimen kategoria muistetaan.
  function knownCategory(name) {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    const fromProducts = products.find(p => p.name.toLowerCase() === n)?.category;
    const fromLog = [...eatLog].reverse().find(h => h.name.trim().toLowerCase() === n)?.category;
    return fromProducts || fromLog || null;
  }

  fields.name.addEventListener("input", () => {
    showFieldError("name", false);
    if (ui.touched.category) return;
    fields.category.value = knownCategory(fields.name.value) || guessCategory(fields.name.value);
    applyCategoryDefaults();
  });

  fields.category.addEventListener("change", () => {
    ui.touched.category = true;
    applyCategoryDefaults();
  });

  form.querySelectorAll("input[name=dateType]").forEach(radio => radio.addEventListener("change", () => {
    ui.touched.dateType = true;
    updateDateTypeHint();
  }));

  fields.openedDays.addEventListener("input", () => (ui.touched.openedDays = true));
  fields.date.addEventListener("input", () => showFieldError("date", false));

  form.querySelectorAll(".quick-dates [data-days]").forEach(button => button.addEventListener("click", () => {
    fields.date.value = addDays(localDateString(), Number(button.dataset.days));
    showFieldError("date", false);
  }));

  form.querySelectorAll(".stepper [data-step]").forEach(button => button.addEventListener("click", () => {
    const value = Math.round(Number(fields.quantity.value) || 1) + Number(button.dataset.step);
    fields.quantity.value = Math.max(1, Math.min(99, value));
  }));

  fields.photo.addEventListener("change", async () => {
    const file = fields.photo.files[0];
    if (!file) return;
    try {
      ui.pendingPhoto = await resizeImage(file);
      showPhotoPreview(ui.pendingPhoto);
    } catch (error) {
      fields.photo.value = "";
      showToast(error.message || "Kuvaa ei voitu lukea.", { error: true });
    }
  });

  $("#removePhoto").addEventListener("click", () => {
    ui.pendingPhoto = null;
    fields.photo.value = "";
    showPhotoPreview(null);
  });

  function showPhotoPreview(src) {
    $("#photoPreview").hidden = !src;
    if (src) $("#photoPreviewImg").src = src;
  }

  function showFieldError(field, show) {
    $(`#${field}Error`).hidden = !show;
    fields[field].setAttribute("aria-invalid", String(show));
  }

  function updateSuggestions() {
    const names = new Map();
    for (const name of [...products.map(p => p.name), ...[...eatLog].reverse().map(h => h.name)]) {
      const key = name.trim().toLowerCase();
      if (key && !names.has(key)) names.set(key, name.trim());
    }
    $("#nameSuggestions").replaceChildren(...[...names.values()].slice(0, 40).map(n => el("option", { value: n })));
  }

  function setFormMode(editing) {
    $("#addHeading").textContent = editing ? "Muokkaa tuotetta" : "Lisää tuote";
    $("#addHint").hidden = editing;
    $("#submitButton").textContent = editing ? "Tallenna muutokset" : "Lisää jääkaappiin";
    $("#cancelEdit").hidden = !editing;
    $("#examplesPanel").hidden = editing;
    $("#openedRow").hidden = editing;
    $("#openedAtRow").hidden = !editing;
  }

  function resetForm() {
    form.reset();
    ui.editingId = null;
    ui.pendingPhoto = undefined;
    ui.touched = { category: false, dateType: false, openedDays: false };
    fields.category.value = "muu";
    fields.quantity.value = 1;
    showPhotoPreview(null);
    showFieldError("name", false);
    showFieldError("date", false);
    setFormMode(false);
    applyCategoryDefaults();
  }

  function startEdit(id) {
    const product = find(id);
    if (!product) return;
    resetForm();
    ui.editingId = id;
    ui.touched = { category: true, dateType: true, openedDays: true };
    fields.name.value = product.name;
    fields.category.value = product.category;
    fields.date.value = product.date;
    setDateType(product.dateType);
    fields.quantity.value = product.quantity;
    fields.openedDays.value = product.openedDays ?? "";
    fields.openedDays.placeholder = "ei rajaa";
    fields.openedAt.value = product.openedAt || "";
    showPhotoPreview(product.photo);
    setFormMode(true);
    navigate("add");
    fields.name.focus();
  }

  $("#cancelEdit").addEventListener("click", () => {
    resetForm();
    navigate("products");
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = fields.name.value.trim();
    const date = fields.date.value;
    showFieldError("name", !name);
    showFieldError("date", !date);
    if (!name) return fields.name.focus();
    if (!date) return fields.date.focus();

    const editing = ui.editingId ? find(ui.editingId) : null;
    const base = editing || { id: `tuote-${Date.now()}-${Math.random().toString(36).slice(2)}`, addedAt: Date.now() };
    const openedAt = editing ? fields.openedAt.value || null : fields.openedNow.checked ? localDateString() : null;
    const product = normalizeProduct({
      ...base,
      name,
      date,
      dateType: dateTypeValue(),
      category: fields.category.value,
      quantity: fields.quantity.value,
      openedDays: fields.openedDays.value === "" ? null : fields.openedDays.value,
      openedAt,
      photo: ui.pendingPhoto === undefined ? base.photo ?? null : ui.pendingPhoto,
    });

    let next;
    let message;
    if (editing) {
      next = products.map(p => (p.id === editing.id ? product : p));
      message = `${product.name}: muutokset tallennettu.`;
    } else {
      // Sama avaamaton tuote samalla päiväyksellä: kasvatetaan määrää uuden kortin sijaan.
      const twin = products.find(p => !p.openedAt && !product.openedAt && p.name.toLowerCase() === product.name.toLowerCase()
        && p.date === product.date && p.dateType === product.dateType && !product.photo);
      if (twin) {
        const quantity = Math.min(99, twin.quantity + product.quantity);
        next = products.map(p => (p.id === twin.id ? { ...p, quantity } : p));
        message = `${twin.name}: määrä nyt ${quantity} kpl.`;
      } else {
        next = [...products, product];
        message = `${product.name} lisätty jääkaappiin.`;
      }
    }

    if (commit(next, eatLog, message)) {
      resetForm();
      navigate("products");
    }
  });

  // ------------------------------------------------------------- tilastot

  function statTile(value, label, kind = "") {
    return el("div", { class: `stat ${kind}` }, el("b", { textContent: value }), el("span", { textContent: label }));
  }

  function renderStats() {
    const container = $("#stats");
    const month = summarize(eatLog, monthStart());
    const all = summarize(eatLog);
    const monthName = new Date().toLocaleDateString("fi-FI", { month: "long", year: "numeric" });
    const levels = products.map(p => productStatus(p, settings.soonDays).level);

    const fridge = el("div", { class: "panel" },
      el("h3", { textContent: "Jääkaapissa nyt" }),
      el("div", { class: "stat-grid" },
        statTile(String(products.length), "tuotetta"),
        statTile(String(levels.filter(l => l === "soon").length), "syö pian", "bad"),
        statTile(String(levels.filter(l => l === "expired" || l === "check").length), "vanhentunut", "bad"),
      ),
    );

    if (!all.total) {
      container.replaceChildren(fridge, el("div", { class: "empty" },
        el("span", { class: "big", "aria-hidden": "true", textContent: "📊" }),
        el("p", { textContent: "Tilastot kertyvät, kun poistat tuotteita ja kerrot, syötiinkö ne vai menivätkö ne roskiin." }),
      ));
      return;
    }

    const period = (title, s) => {
      const panel = el("div", { class: "panel" }, el("h3", { textContent: title }));
      if (!s.total) {
        panel.append(el("p", { class: "hint", textContent: "Ei vielä merkintöjä tältä ajalta." }));
        return panel;
      }
      const verdict = s.savedPct >= 90 ? "Erinomaista! Lähes kaikki ruoka päätyi syötäväksi. 🌱"
        : s.savedPct >= 70 ? "Hyvää työtä! Suurin osa ruoasta syötiin."
        : s.savedPct >= 50 ? "Yli puolet pelastettu. Muistutukset auttavat syömään ajoissa."
        : "Paljon meni roskiin. Kokeile pienempiä pakkauksia ja pidempää muistutusaikaa.";
      panel.append(
        el("div", { class: "stat-grid" },
          statTile(String(s.eaten), "syöty", "good"),
          statTile(String(s.wasted), "roskiin", "bad"),
          statTile(`${s.savedPct} %`, "pelastettu", "good"),
        ),
        el("div", { class: "bar", role: "img", "aria-label": `${s.savedPct} prosenttia syöty` },
          el("i", { style: `width: ${s.savedPct}%` })),
        el("p", { class: "hint small", textContent: verdict }),
      );
      return panel;
    };

    const parts = [fridge, period(monthName[0].toUpperCase() + monthName.slice(1), month), period("Kaikki yhteensä", all)];

    if (all.topWasted.length) {
      parts.push(el("div", { class: "panel" },
        el("h3", { textContent: "Useimmin roskiin" }),
        el("ol", { class: "rank" }, ...all.topWasted.map(w => el("li", {},
          el("span", { textContent: `${categoryById(w.category).emoji} ${w.name}` }),
          el("b", { textContent: `${w.count} kpl` }),
        ))),
        el("p", { class: "hint small", textContent: "Vinkki: osta näitä pienempiä pakkauksia tai merkitse ne avatuiksi, niin muistutamme ajoissa." }),
      ));
    }
    container.replaceChildren(...parts);
  }

  // ------------------------------------------------------------- asetukset

  function applyTheme() {
    if (settings.theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = settings.theme;
  }

  function renderSettings() {
    document.querySelectorAll("input[name=theme]").forEach(r => (r.checked = r.value === settings.theme));
    $("#soonDays").value = String(settings.soonDays);
    renderNotificationSettings();
    renderInstall();
  }

  document.querySelectorAll("input[name=theme]").forEach(radio => radio.addEventListener("change", () => {
    saveSettings({ theme: radio.value });
    applyTheme();
  }));

  $("#soonDays").addEventListener("change", event => {
    saveSettings({ soonDays: Number(event.target.value), lastNotified: null });
    ui.dismissed.clear();
    render();
    showToast(`Muistutus ${event.target.selectedOptions[0].textContent} ennen päiväystä.`);
  });

  // Asennus kotinäytölle
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  function renderInstall() {
    const show = !isStandalone() && (ui.installPrompt || isIOS);
    $("#installPanel").hidden = !show;
    $("#installButton").hidden = !ui.installPrompt;
    if (isIOS && !ui.installPrompt) {
      $("#installHint").textContent = "Safarissa: napauta Jaa-painiketta ja valitse ”Lisää Koti-valikkoon”.";
    }
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    ui.installPrompt = event;
    renderInstall();
  });

  $("#installButton").addEventListener("click", async () => {
    if (!ui.installPrompt) return;
    ui.installPrompt.prompt();
    await ui.installPrompt.userChoice.catch(() => null);
    ui.installPrompt = null;
    renderInstall();
  });

  window.addEventListener("appinstalled", () => {
    ui.installPrompt = null;
    renderInstall();
    showToast("Jääkaappini asennettu kotinäytölle! 🎉");
  });

  // Varmuuskopio
  $("#exportButton").addEventListener("click", () => {
    const data = {
      app: "jaakaappini",
      version: 2,
      exportedAt: new Date().toISOString(),
      products,
      history: eatLog,
      settings: { theme: settings.theme, soonDays: settings.soonDays },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = el("a", { href: URL.createObjectURL(blob), download: `jaakaappini-${localDateString()}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast("Varmuuskopio ladattu.");
  });

  $("#importButton").addEventListener("click", () => $("#importFile").click());

  $("#importFile").addEventListener("change", async event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const rawProducts = Array.isArray(data) ? data : data?.products;
      if (!Array.isArray(rawProducts)) throw new Error("Tiedosto ei ole Jääkaappinin varmuuskopio.");
      const imported = rawProducts.filter(p => p && typeof p === "object").map(normalizeProduct);
      const importedLog = Array.isArray(data?.history)
        ? data.history.filter(h => h && h.name && ["eaten", "wasted"].includes(h.outcome) && isDateString(h.at))
        : eatLog;
      const question = `Tuodaanko ${imported.length} tuotetta? Nykyiset ${products.length} tuotetta korvataan.`;
      if (!confirm(question)) return;
      if (data?.settings) {
        saveSettings(loadSettingsFrom(data.settings));
        applyTheme();
        renderSettings();
      }
      commit(imported, importedLog, `${imported.length} tuotetta tuotu.`);
    } catch (error) {
      showToast(error instanceof SyntaxError ? "Tiedostoa ei voitu lukea." : error.message, { error: true });
    }
  });

  function loadSettingsFrom(raw) {
    return {
      theme: ["auto", "light", "dark"].includes(raw.theme) ? raw.theme : settings.theme,
      soonDays: [1, 2, 3, 5, 7].includes(Number(raw.soonDays)) ? Number(raw.soonDays) : settings.soonDays,
    };
  }

  $("#clearProducts").addEventListener("click", () => {
    if (!products.length) return showToast("Jääkaappi on jo tyhjä.");
    if (confirm(`Poistetaanko kaikki ${products.length} tuotetta?`)) commit([], eatLog, "Kaikki tuotteet poistettu.");
  });

  $("#clearHistory").addEventListener("click", () => {
    if (!eatLog.length) return showToast("Tilastoja ei vielä ole.");
    if (confirm("Nollataanko tilastot?")) commit(products, [], "Tilastot nollattu.");
  });

  // ------------------------------------------------------------- piirto ja käynnistys

  function render() {
    renderFilters();
    renderProducts();
    renderNotifications();
    updateExamplesButton();
    updateSuggestions();
    if (ui.view === "stats") renderStats();
  }

  // Toisessa välilehdessä tehdyt muutokset näkyvät heti.
  window.addEventListener("storage", event => {
    if (!Object.values(KEYS).includes(event.key)) return;
    products = loadProducts();
    eatLog = loadLog();
    settings = loadSettings();
    applyTheme();
    render();
  });

  // Päivän vaihtuessa päiväykset lasketaan uudelleen.
  function refreshIfNewDay() {
    const today = localDateString();
    if (today === ui.today) return;
    ui.today = today;
    ui.dismissed.clear();
    render();
    sendSystemNotification();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshIfNewDay();
      sendSystemNotification();
    }
  });
  setInterval(refreshIfNewDay, 60_000);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  applyTheme();
  resetForm();
  render();
  showView(viewFromHash());
  sendSystemNotification();
})();
