/* ==========================================================
   やさしい家計簿 - app.js
   MVPプロトタイプ：ローカル保存（localStorage）のみで動作します。
   Gmail連携は本実装ではOAuth2.0＋Gmail APIで行いますが、
   ここでは「サンプルメールを取り込む」ボタンで、
   ①自動抽出 → ②ルールベース分類 → ③重複防止（Message ID／内容一致）
   の一連の流れを疑似体験できるようにしています。
   ========================================================== */

// ---------- カテゴリ定義（ルールベース分類） ----------
const CATEGORY_META = {
  "食費":   { icon: "lunch_dining",   cls: "" },
  "ガソリン": { icon: "local_gas_station", cls: "peach" },
  "通販":   { icon: "local_shipping", cls: "green" },
  "教育":   { icon: "school",         cls: "" },
  "日用品": { icon: "storefront",     cls: "peach" },
  "未分類": { icon: "help",           cls: "gray" }
};
const CATEGORY_ORDER = ["食費", "ガソリン", "通販", "教育", "日用品", "未分類"];

const CATEGORY_RULES = [
  { keywords: ["セブン", "ファミマ", "ローソン", "スーパー", "マルエツ"], category: "食費" },
  { keywords: ["イオン"], category: "食費" }, // 例: 食費・日用品にまたがる店は主要カテゴリを優先
  { keywords: ["ENEOS", "出光", "コスモ石油", "シェル"], category: "ガソリン" },
  { keywords: ["Amazon", "楽天市場", "Yahoo!ショッピング"], category: "通販" },
  { keywords: ["幼稚園", "保育園", "学童", "スクール"], category: "教育" },
  { keywords: ["ドラッグ", "ドンキ", "西松屋", "ダイソー"], category: "日用品" }
];

function categorize(storeName) {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => storeName.includes(k))) return rule.category;
  }
  return "未分類";
}

// ---------- ストレージ ----------
const STORAGE_KEY = "kakeibo_transactions_v1";
const BUDGET_KEY = "kakeibo_budget_v1";
const THEME_KEY = "kakeibo_theme_v1";

function loadTransactions() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  const seeded = seedTransactions();
  saveTransactions(seeded);
  return seeded;
}
function saveTransactions(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
function loadBudget() {
  const raw = localStorage.getItem(BUDGET_KEY);
  return raw ? Number(raw) : 150000;
}
function saveBudget(v) { localStorage.setItem(BUDGET_KEY, String(v)); }

function fmtDate(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmtDate(d);
}
function monthKey(dateStr) { return dateStr.slice(0, 7); }
function thisMonthKey() { return fmtDate(new Date()).slice(0, 7); }
function lastMonthKey() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return fmtDate(d).slice(0, 7);
}

function seedTransactions() {
  const lastMonthDate = (day) => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(day);
    return fmtDate(d);
  };
  return [
    { id: cuid(), gmailMessageId: "seed-1", date: daysAgo(0), store: "セブンイレブン", amount: 580, category: "食費", cardType: "本会員", cardLast4: "1234", source: "manual" },
    { id: cuid(), gmailMessageId: "seed-2", date: daysAgo(1), store: "ENEOS", amount: 4200, category: "ガソリン", cardType: "本会員", cardLast4: "1234", source: "gmail" },
    { id: cuid(), gmailMessageId: "seed-3", date: daysAgo(3), store: "Amazon", amount: 2980, category: "通販", cardType: "本会員", cardLast4: "1234", source: "gmail" },
    { id: cuid(), gmailMessageId: "seed-4", date: daysAgo(5), store: "イオン", amount: 6540, category: "食費", cardType: "家族カード", cardLast4: "5678", source: "gmail" },
    { id: cuid(), gmailMessageId: "seed-5", date: lastMonthDate(10), store: "ENEOS", amount: 3900, category: "ガソリン", cardType: "本会員", cardLast4: "1234", source: "gmail" },
    { id: cuid(), gmailMessageId: "seed-6", date: lastMonthDate(15), store: "セブンイレブン", amount: 620, category: "食費", cardType: "本会員", cardLast4: "1234", source: "manual" },
    { id: cuid(), gmailMessageId: "seed-7", date: lastMonthDate(20), store: "幼稚園こばと園", amount: 28000, category: "教育", cardType: "本会員", cardLast4: "1234", source: "manual" }
  ];
}
function cuid() { return "tx-" + Math.random().toString(36).slice(2, 10); }

// ---------- 状態 ----------
let transactions = loadTransactions();
let budget = loadBudget();
let currentRoute = "home";
let editingId = null;
let inputAmount = "0";
let selectedCategory = "食費";

// ---------- ルーティング ----------
function navigate(route) {
  currentRoute = route;
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + route).classList.add("active");
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.nav === route));

  const tabbar = document.getElementById("tabbar");
  const fab = document.getElementById("fabAdd");
  if (route === "input") {
    tabbar.style.display = "none";
    fab.style.display = "none";
  } else {
    tabbar.style.display = "flex";
    fab.style.display = (route === "settings") ? "none" : "flex";
  }

  if (route === "home") renderHome();
  if (route === "analysis") renderAnalysis();
  if (route === "settings") renderSettings();
}

document.querySelectorAll("[data-nav]").forEach(el => {
  el.addEventListener("click", () => navigate(el.dataset.nav));
});

// ---------- トースト ----------
let toastTimer = null;
function showToast(text) {
  const toast = document.getElementById("toast");
  document.getElementById("toastText").textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
}

// ---------- ホーム画面 ----------
function renderHome() {
  const now = new Date();
  document.getElementById("greetText").textContent = "こんにちは";
  document.getElementById("monthTitle").textContent = (now.getMonth() + 1) + "月の記録";

  const tk = thisMonthKey(), lk = lastMonthKey();
  const thisTotal = sumByMonth(tk);
  const lastTotal = sumByMonth(lk);

  document.getElementById("totalAmount").textContent = "¥" + thisTotal.toLocaleString();

  const diffPill = document.getElementById("diffPill");
  if (lastTotal > 0) {
    const diff = thisTotal - lastTotal;
    diffPill.textContent = diff <= 0
      ? `先月より ¥${Math.abs(diff).toLocaleString()} 少ない`
      : `先月より ¥${diff.toLocaleString()} 多い`;
    diffPill.className = "pill" + (diff <= 0 ? " down" : " warn");
  } else {
    diffPill.textContent = "先月のデータなし";
  }

  const budgetPill = document.getElementById("budgetPill");
  const rest = budget - thisTotal;
  budgetPill.textContent = rest >= 0 ? `予算まで ¥${rest.toLocaleString()}` : `予算を ¥${Math.abs(rest).toLocaleString()} 超過`;
  budgetPill.className = "pill" + (rest < 0 ? " warn" : "");

  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const list = document.getElementById("recentList");
  list.innerHTML = "";
  if (recent.length === 0) {
    list.innerHTML = `<div class="empty-note">まだ記録がありません。右下の＋から追加してみましょう。</div>`;
  }
  recent.forEach(tx => list.appendChild(txItemEl(tx)));
}

function sumByMonth(mk) {
  return transactions.filter(t => monthKey(t.date) === mk).reduce((s, t) => s + t.amount, 0);
}

function txItemEl(tx) {
  const meta = CATEGORY_META[tx.category] || CATEGORY_META["未分類"];
  const el = document.createElement("div");
  el.className = "tx-item";
  el.innerHTML = `
    <div class="tx-icon ${meta.cls}"><span class="material-symbols-rounded">${meta.icon}</span></div>
    <div class="tx-info">
      <div class="tx-name">${escapeHtml(tx.store)}</div>
      <div class="tx-meta">${tx.category}・${formatDateLabel(tx.date)}${tx.cardType ? "・" + tx.cardType : ""}</div>
    </div>
    <div class="tx-amount">¥${tx.amount.toLocaleString()}</div>
  `;
  el.addEventListener("click", () => openInput(tx.id));
  return el;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  const today = fmtDate(new Date());
  const yest = daysAgo(1);
  if (dateStr === today) return "今日";
  if (dateStr === yest) return "昨日";
  return (d.getMonth() + 1) + "/" + d.getDate();
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- 入力画面 ----------
function buildCategoryChips() {
  const wrap = document.getElementById("catScroll");
  wrap.innerHTML = "";
  CATEGORY_ORDER.filter(c => c !== "未分類").forEach(cat => {
    const meta = CATEGORY_META[cat];
    const chip = document.createElement("div");
    chip.className = "cat-chip" + (cat === selectedCategory ? " selected" : "");
    chip.dataset.cat = cat;
    chip.innerHTML = `<span class="material-symbols-rounded">${meta.icon}</span>${cat}`;
    chip.addEventListener("click", () => {
      selectedCategory = cat;
      wrap.querySelectorAll(".cat-chip").forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
    });
    wrap.appendChild(chip);
  });
}

function openInput(id) {
  editingId = id || null;
  const tx = id ? transactions.find(t => t.id === id) : null;

  inputAmount = tx ? String(tx.amount) : "0";
  selectedCategory = tx ? tx.category : (categorize(document.getElementById("storeInput").value || "") || "食費");
  document.getElementById("amountNum").textContent = Number(inputAmount).toLocaleString();
  document.getElementById("storeInput").value = tx ? tx.store : "";
  document.getElementById("dateInput").value = tx ? tx.date : fmtDate(new Date());
  document.getElementById("inputHeadTitle").textContent = tx ? "記録を編集" : "支出を記録";
  document.getElementById("deleteBtn").style.display = tx ? "block" : "none";

  buildCategoryChips();
  navigate("input");
}

document.getElementById("fabAdd").addEventListener("click", () => openInput(null));

document.getElementById("keypad").addEventListener("click", (e) => {
  const btn = e.target.closest(".key");
  if (!btn) return;
  const k = btn.dataset.k;
  if (k === "C") inputAmount = "0";
  else if (k === "back") inputAmount = inputAmount.length > 1 ? inputAmount.slice(0, -1) : "0";
  else {
    inputAmount = (inputAmount === "0") ? k : inputAmount + k;
    if (inputAmount.length > 7) inputAmount = inputAmount.slice(0, 7);
  }
  document.getElementById("amountNum").textContent = Number(inputAmount).toLocaleString();
});

document.getElementById("storeInput").addEventListener("input", (e) => {
  // 店舗名からカテゴリを自動提案（未編集時のみ）
  if (!editingId) {
    const guess = categorize(e.target.value);
    if (guess !== "未分類") {
      selectedCategory = guess;
      document.querySelectorAll("#catScroll .cat-chip").forEach(c => c.classList.toggle("selected", c.dataset.cat === guess));
    }
  }
});

document.getElementById("saveBtn").addEventListener("click", () => {
  const store = document.getElementById("storeInput").value.trim() || "未入力の店舗";
  const date = document.getElementById("dateInput").value || fmtDate(new Date());
  const amount = Number(inputAmount) || 0;

  if (editingId) {
    const tx = transactions.find(t => t.id === editingId);
    Object.assign(tx, { store, date, amount, category: selectedCategory });
  } else {
    transactions.push({
      id: cuid(), gmailMessageId: null, date, store, amount,
      category: selectedCategory, cardType: "本会員", cardLast4: null, source: "manual"
    });
  }
  saveTransactions(transactions);
  showToast("保存しました");
  setTimeout(() => navigate("home"), 500);
});

document.getElementById("deleteBtn").addEventListener("click", () => {
  if (!editingId) return;
  transactions = transactions.filter(t => t.id !== editingId);
  saveTransactions(transactions);
  showToast("削除しました");
  setTimeout(() => navigate("home"), 400);
});

// ---------- 分析画面 ----------
function renderAnalysis() {
  const tk = thisMonthKey();
  const monthTx = transactions.filter(t => monthKey(t.date) === tk);
  const total = monthTx.reduce((s, t) => s + t.amount, 0);
  document.getElementById("analysisTotal").textContent = "¥" + total.toLocaleString();

  const byCat = {};
  CATEGORY_ORDER.forEach(c => byCat[c] = 0);
  monthTx.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });

  const wrap = document.getElementById("categoryBars");
  wrap.innerHTML = "";
  CATEGORY_ORDER.forEach(cat => {
    const amt = byCat[cat] || 0;
    if (amt === 0) return;
    const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
    const meta = CATEGORY_META[cat];
    const row = document.createElement("div");
    row.className = "cat-bar-row";
    row.innerHTML = `
      <div class="cat-bar-head">
        <span class="name"><span class="material-symbols-rounded" style="font-size:16px;">${meta.icon}</span>${cat}</span>
        <span>¥${amt.toLocaleString()}（${pct}%）</span>
      </div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
    `;
    wrap.appendChild(row);
  });
  if (wrap.innerHTML === "") {
    wrap.innerHTML = `<div class="empty-note">今月の記録がまだありません。</div>`;
  }
}

// ---------- 設定画面 ----------
function renderSettings() {
  document.getElementById("budgetInput").value = budget;
  document.getElementById("darkToggle").checked = document.documentElement.getAttribute("data-theme") === "dark";
}

document.getElementById("budgetInput").addEventListener("change", (e) => {
  budget = Number(e.target.value) || 0;
  saveBudget(budget);
  showToast("予算を更新しました");
});

document.getElementById("darkToggle").addEventListener("change", (e) => {
  const theme = e.target.checked ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
});

document.getElementById("resetBtn").addEventListener("click", () => {
  if (!confirm("すべての記録を削除します。よろしいですか？")) return;
  transactions = [];
  saveTransactions(transactions);
  showToast("すべて削除しました");
  navigate("home");
});

// ---------- Gmail取り込みシミュレーション（重複防止・自動分類のデモ） ----------
const MOCK_EMAIL_POOL = [
  { gmailMessageId: "gm-201", store: "セブンイレブン", amount: 430, dayOffset: 0, cardType: "本会員", cardLast4: "1234" },
  { gmailMessageId: "gm-202", store: "ENEOS", amount: 3800, dayOffset: 2, cardType: "本会員", cardLast4: "1234" },
  // 同一利用を「本会員」と「家族カード」の双方から通知される想定（重複候補デモ）
  { gmailMessageId: "gm-203", store: "イオン", amount: 5200, dayOffset: 1, cardType: "本会員", cardLast4: "1234" },
  { gmailMessageId: "gm-204", store: "イオン", amount: 5200, dayOffset: 1, cardType: "家族カード", cardLast4: "5678" },
  { gmailMessageId: "gm-205", store: "Amazon", amount: 1580, dayOffset: 4, cardType: "本会員", cardLast4: "1234" },
  { gmailMessageId: "gm-206", store: "西松屋", amount: 2200, dayOffset: 3, cardType: "家族カード", cardLast4: "5678" }
];

document.getElementById("importBtn").addEventListener("click", () => {
  let added = 0, skippedById = 0, skippedAsDuplicateCandidate = 0;
  const seenThisBatch = [];

  MOCK_EMAIL_POOL.forEach(email => {
    // ③ 同一メールの重複防止：Gmail Message IDで判定
    if (transactions.some(t => t.gmailMessageId === email.gmailMessageId)) {
      skippedById++;
      return;
    }
    const date = daysAgo(email.dayOffset);

    // ⑥ 本会員・家族カードの重複排除（簡易版）：
    // 日付＋金額＋店舗名が一致する記録が既にある場合は「重複候補」として自動除外する。
    // 本実装では、ここでユーザーへの確認画面を表示し、「常に統合する／別取引として扱う」を選べるようにする。
    const isDuplicateCandidate =
      transactions.some(t => t.date === date && t.amount === email.amount && t.store === email.store) ||
      seenThisBatch.some(t => t.date === date && t.amount === email.amount && t.store === email.store);

    if (isDuplicateCandidate) {
      skippedAsDuplicateCandidate++;
      return;
    }

    const newTx = {
      id: cuid(),
      gmailMessageId: email.gmailMessageId,
      date, store: email.store, amount: email.amount,
      category: categorize(email.store),
      cardType: email.cardType, cardLast4: email.cardLast4,
      source: "gmail"
    };
    transactions.push(newTx);
    seenThisBatch.push(newTx);
    added++;
  });

  saveTransactions(transactions);

  let msg = `${added}件を取り込みました`;
  const skippedTotal = skippedById + skippedAsDuplicateCandidate;
  if (skippedTotal > 0) msg += `（重複 ${skippedTotal}件はスキップ）`;
  showToast(msg);
});

// ---------- 初期化 ----------
(function init() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  document.getElementById("dateInput").value = fmtDate(new Date());
  navigate("home");

  if ("serviceWorker" in navigator) {
    // file:// で開いた場合は登録に失敗するが、画面の動作には影響しない
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
})();
