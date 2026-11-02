/**
 * Dealer portal command palette (Ctrl/Cmd + K): jump between views, run portal
 * actions and open a vehicle editor directly from the keyboard.
 */
import { escapeHtml, qs } from "../utils.js?v=20261102e";
import { vehicleName } from "./helpers.js?v=20261102e";

export function initCommandPalette({ getVehicles, showView, isSuperAdmin }) {
  const dialog = qs("#commandDialog");
  const input = qs("#commandInput");
  const results = qs("#commandResults");
  if (!dialog || !input || !results) return;

  let items = [];
  let active = 0;

  const baseCommands = () => {
    const list = [
      { group: "Go to", label: "Overview", hint: "Dashboard and metrics", icon: "space_dashboard", run: () => showView("overview") },
      { group: "Go to", label: "Inventory", hint: "Manage stock, pricing and photos", icon: "directions_car", run: () => showView("inventory") },
      { group: "Go to", label: "Leads", hint: "Concierge, test drives and trade-ins", icon: "forum", run: () => showView("leads") },
      { group: "Actions", label: "Add a vehicle", hint: "Open the listing editor", icon: "add_box", run: () => qs("[data-add-vehicle]")?.click() },
      { group: "Actions", label: "Import Cars & Bids listings", hint: "Publish the 25 bundled auctions", icon: "library_add", run: () => qs("[data-import-auction]")?.click() },
      { group: "Actions", label: "Seed showcase vehicles", hint: "Restore the 49-vehicle catalogue", icon: "auto_awesome", run: () => qs("[data-seed-inventory]")?.click() },
      { group: "Actions", label: "Export leads CSV", hint: "Download the current lead list", icon: "download", run: () => { showView("leads"); qs("[data-export-leads]")?.click(); } },
      { group: "Actions", label: "Export inventory CSV", hint: "Download the current filtered stock", icon: "download", run: () => { showView("inventory"); qs("[data-export-inventory]")?.click(); } },
    ];
    if (isSuperAdmin()) {
      list.push({ group: "Actions", label: "Add a dealer admin", hint: "Super admin only", icon: "person_add", run: () => { showView("team"); qs("[data-add-admin]")?.click(); } });
      list.push({ group: "Go to", label: "Team", hint: "Admins and portal access", icon: "group", run: () => showView("team") });
    }
    return list;
  };

  const vehicleCommands = (query) =>
    getVehicles()
      .filter((vehicle) =>
        `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} ${vehicle.stockNumber} ${vehicle.vin}`
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 6)
      .map((vehicle) => ({
        group: "Vehicles",
        label: vehicleName(vehicle),
        hint: `${vehicle.stockNumber || "No stock #"} · ${vehicle.status || "available"}`,
        icon: "directions_car",
        run: () => {
          showView("inventory");
          requestAnimationFrame(() => {
            qs(`[data-edit-vehicle="${CSS.escape(String(vehicle.id))}"]`)?.click();
          });
        },
      }));

  const render = () => {
    if (!items.length) {
      results.innerHTML = `<p class="adm-palette__empty">No matches. Try a make, model, stock number or view name.</p>`;
      return;
    }
    let group = "";
    results.innerHTML = items
      .map((item, index) => {
        const heading = item.group !== group ? `<p class="adm-palette__group">${escapeHtml(item.group)}</p>` : "";
        group = item.group;
        return `${heading}
          <button type="button" class="adm-palette__item${index === active ? " is-active" : ""}" data-command-index="${index}">
            <span class="material-symbols-outlined" aria-hidden="true">${item.icon}</span>
            <span class="adm-palette__label"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.hint || "")}</small></span>
            <span class="material-symbols-outlined adm-palette__enter" aria-hidden="true">keyboard_return</span>
          </button>`;
      })
      .join("");
  };

  const build = () => {
    const query = input.value.trim().toLowerCase();
    const navigation = baseCommands().filter(
      (item) => !query || `${item.label} ${item.hint}`.toLowerCase().includes(query)
    );
    const vehicles = query.length >= 2 ? vehicleCommands(query) : [];
    items = [...vehicles, ...navigation].slice(0, 10);
    active = 0;
    render();
  };

  const run = (index) => {
    const item = items[index];
    if (!item) return;
    dialog.close();
    item.run();
  };

  const open = () => {
    if (dialog.open) return;
    input.value = "";
    build();
    dialog.showModal();
    input.focus({ preventScroll: true });
  };

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-command-open]")) {
      event.preventDefault();
      open();
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      open();
    }
  });

  input.addEventListener("input", build);

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      render();
      results.querySelector(".adm-palette__item.is-active")?.scrollIntoView({ block: "nearest" });
    }
    if (event.key === "Enter") {
      event.preventDefault();
      run(active);
    }
  });

  results.addEventListener("click", (event) => {
    const button = event.target.closest("[data-command-index]");
    if (button) run(Number(button.dataset.commandIndex));
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}
