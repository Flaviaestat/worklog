const SHIFT_LABELS = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

const SHIFT_ORDER = ["manha", "tarde", "noite"];

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateBR(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

let entries = [];

const form = document.getElementById("entry-form");
const dateInput = document.getElementById("entry-date");
const shiftInput = document.getElementById("entry-shift");
const textInput = document.getElementById("entry-text");
const listEl = document.getElementById("entries-list");
const searchInput = document.getElementById("search-input");
const exportStart = document.getElementById("export-start");
const exportEnd = document.getElementById("export-end");
const exportFormat = document.getElementById("export-format");
const exportBtn = document.getElementById("export-btn");

dateInput.value = todayISO();

async function fetchEntries() {
  const { data, error } = await supabaseClient
    .from("entries")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    listEl.innerHTML = '<p class="empty-state">Erro ao carregar registros.</p>';
    return;
  }
  entries = data;
  render();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text) return;

  const { error } = await supabaseClient.from("entries").insert({
    date: dateInput.value,
    shift: shiftInput.value,
    text,
  });

  if (error) {
    console.error(error);
    alert("Erro ao salvar registro.");
    return;
  }

  textInput.value = "";
  await fetchEntries();
});

searchInput.addEventListener("input", render);

exportBtn.addEventListener("click", () => {
  const start = exportStart.value;
  const end = exportEnd.value;
  const format = exportFormat.value;

  const filtered = entries
    .filter((e) => (!start || e.date >= start) && (!end || e.date <= end))
    .sort((a, b) => a.date.localeCompare(b.date) || SHIFT_ORDER.indexOf(a.shift) - SHIFT_ORDER.indexOf(b.shift));

  if (filtered.length === 0) {
    alert("Nenhum registro encontrado para o período selecionado.");
    return;
  }

  let content, mime, extension;
  if (format === "csv") {
    content = toCSV(filtered);
    mime = "text/csv";
    extension = "csv";
  } else if (format === "json") {
    content = JSON.stringify(filtered, null, 2);
    mime = "application/json";
    extension = "json";
  } else {
    content = toText(filtered);
    mime = "text/plain";
    extension = "txt";
  }

  const suffix = start || end ? `_${start || "inicio"}_a_${end || "fim"}` : "";
  downloadFile(`worklog${suffix}.${extension}`, content, mime);
});

function toCSV(list) {
  const header = ["data", "turno", "atividades"];
  const rows = list.map((e) => [
    e.date,
    SHIFT_LABELS[e.shift],
    `"${e.text.replace(/"/g, '""')}"`,
  ]);
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function toText(list) {
  let output = "";
  let currentDate = null;
  for (const e of list) {
    if (e.date !== currentDate) {
      currentDate = e.date;
      output += `\n=== ${formatDateBR(e.date)} ===\n`;
    }
    output += `\n[${SHIFT_LABELS[e.shift]}]\n${e.text}\n`;
  }
  return output.trim();
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function deleteEntry(id) {
  if (!confirm("Excluir este registro?")) return;
  const { error } = await supabaseClient.from("entries").delete().eq("id", id);
  if (error) {
    console.error(error);
    alert("Erro ao excluir registro.");
    return;
  }
  await fetchEntries();
}

async function editEntry(id) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  const updated = prompt("Editar atividades:", entry.text);
  if (updated === null) return;

  const { error } = await supabaseClient
    .from("entries")
    .update({ text: updated.trim() })
    .eq("id", id);

  if (error) {
    console.error(error);
    alert("Erro ao editar registro.");
    return;
  }
  await fetchEntries();
}

function render() {
  const query = searchInput.value.trim().toLowerCase();

  const filtered = query
    ? entries.filter((e) => e.text.toLowerCase().includes(query))
    : entries;

  const byDate = {};
  for (const e of filtered) {
    if (!byDate[e.date]) byDate[e.date] = {};
    if (!byDate[e.date][e.shift]) byDate[e.date][e.shift] = [];
    byDate[e.date][e.shift].push(e);
  }

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  if (dates.length === 0) {
    listEl.innerHTML = '<p class="empty-state">Nenhum registro ainda.</p>';
    return;
  }

  listEl.innerHTML = dates
    .map((date) => {
      const shifts = SHIFT_ORDER.filter((s) => byDate[date][s]);
      const shiftsHtml = shifts
        .map((shift) => {
          const items = byDate[date][shift]
            .map(
              (e) => `
              <div class="entry-item" data-id="${e.id}">
                <div class="entry-text">${escapeHtml(e.text)}</div>
                <div class="entry-actions">
                  <button class="edit-btn" data-id="${e.id}">Editar</button>
                  <button class="delete-btn" data-id="${e.id}">Excluir</button>
                </div>
              </div>`
            )
            .join("");
          return `
            <div class="shift-block">
              <div class="shift-label">${SHIFT_LABELS[shift]}</div>
              ${items}
            </div>`;
        })
        .join("");
      return `
        <div class="day-group">
          <h3>${formatDateBR(date)}</h3>
          ${shiftsHtml}
        </div>`;
    })
    .join("");

  listEl.querySelectorAll(".delete-btn").forEach((btn) =>
    btn.addEventListener("click", () => deleteEntry(btn.dataset.id))
  );
  listEl.querySelectorAll(".edit-btn").forEach((btn) =>
    btn.addEventListener("click", () => editEntry(btn.dataset.id))
  );
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

fetchEntries();
