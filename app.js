"use strict";

const STORAGE_KEY = "study-wheel-state-v1";
const SPIN_COST = 50;

const prizes = [
  { id: "supply50", name: "应急补给", icon: "🎁", description: "立即到账 50 积分", weight: 12, color: "#ff8da1", rare: true },
  { id: "supply20", name: "小额补给", icon: "✨", description: "立即到账 20 积分", weight: 18, color: "#ffbb72" },
  { id: "focus", name: "专注加持", icon: "🎯", description: "下一项学习任务额外 +10 积分", weight: 15, color: "#ffe171" },
  { id: "boost", name: "积分加成", icon: "📈", description: "下一项学习任务积分 ×1.2", weight: 12, color: "#7edba5" },
  { id: "double", name: "双倍星币", icon: "🌟", description: "下一项学习任务积分 ×2", weight: 5, color: "#65c9d7", rare: true },
  { id: "free", name: "免费单抽", icon: "🎟️", description: "获得 1 次免费抽奖机会", weight: 8, color: "#6eaeef", rare: true },
  { id: "insight", name: "难点顿悟", icon: "💡", description: "完成 1 项高难度任务后领取 100 积分", weight: 4, color: "#9e8cf1", rare: true },
  { id: "rest", name: "小小懒虫", icon: "☕", description: "休息 5 分钟后再记录学习任务", weight: 12, color: "#c79bea" },
  { id: "cooldown", name: "卡池冷却", icon: "⏳", description: "1 小时内不能再次抽奖", weight: 6, color: "#e5a0c4" },
  { id: "lucky5", name: "幸运鼓励", icon: "🍀", description: "立即到账 5 积分", weight: 8, color: "#f69cbc" }
];

const defaultState = {
  points: 300,
  freeSpins: 0,
  pity: 0,
  rotation: 0,
  cooldownUntil: 0,
  restUntil: 0,
  effects: { focusBonus: 0, multiplier: 1, insightTokens: 0 },
  history: []
};

let state = loadState();
let spinning = false;
let toastTimer = null;
let clockTimer = null;

const $ = (selector) => document.querySelector(selector);
const pointsValue = $("#pointsValue");
const wheel = $("#wheel");
const spinButton = $("#spinButton");
const wheelTip = $("#wheelTip");
const statusList = $("#statusList");
const pityText = $("#pityText");
const historyList = $("#historyList");
const resultDialog = $("#resultDialog");
const pointsDialog = $("#pointsDialog");
const customTaskDialog = $("#customTaskDialog");

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed) return structuredClone(defaultState);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      effects: { ...defaultState.effects, ...(parsed.effects || {}) },
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 50) : []
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function secureRandom() {
  if (globalThis.crypto?.getRandomValues) {
    const data = new Uint32Array(1);
    crypto.getRandomValues(data);
    return data[0] / 4294967296;
  }
  return Math.random();
}

function selectWeightedPrize() {
  const pool = state.pity >= 5 ? prizes.filter((prize) => prize.rare) : prizes;
  const total = pool.reduce((sum, prize) => sum + prize.weight, 0);
  let roll = secureRandom() * total;
  for (const prize of pool) {
    roll -= prize.weight;
    if (roll < 0) return prize;
  }
  return pool[pool.length - 1];
}

function buildWheel() {
  let cursor = 0;
  const gradientParts = [];
  wheel.innerHTML = "";
  prizes.forEach((prize) => {
    const angle = prize.weight * 3.6;
    const center = cursor + angle / 2;
    gradientParts.push(`${prize.color} ${cursor}deg ${cursor + angle}deg`);
    const label = document.createElement("span");
    label.className = "wheel-label";
    label.textContent = prize.icon;
    label.style.transform = `translate(-50%, -50%) rotate(${center}deg) translateY(-41%) translateY(-135px) rotate(${-center}deg)`;
    label.dataset.prizeId = prize.id;
    wheel.append(label);
    prize.startAngle = cursor;
    prize.centerAngle = center;
    cursor += angle;
  });
  wheel.style.background = `conic-gradient(from 0deg, ${gradientParts.join(", ")})`;
  wheel.style.transform = `rotate(${state.rotation}deg)`;
}

function renderPrizeList() {
  $("#prizeList").innerHTML = prizes.map((prize) => `
    <div class="prize-item">
      <span class="prize-icon" style="--prize-bg:${prize.color}33">${prize.icon}</span>
      <div>
        <div class="prize-name">${prize.name}${prize.rare ? '<span class="rare-mark">稀有</span>' : ""}</div>
        <p class="prize-desc">${prize.description}</p>
      </div>
      <span class="prize-probability">${prize.weight}%</span>
    </div>
  `).join("");
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}小时${minutes % 60}分`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function render() {
  const now = Date.now();
  pointsValue.textContent = state.points;
  pityText.textContent = `幸运值 ${state.pity}/5`;

  const statuses = [];
  if (state.freeSpins > 0) statuses.push(`🎟️ 免费抽 ×${state.freeSpins}`);
  if (state.effects.focusBonus > 0) statuses.push(`🎯 下个任务 +${state.effects.focusBonus}`);
  if (state.effects.multiplier > 1) statuses.push(`📈 下个任务 ×${state.effects.multiplier}`);
  if (state.effects.insightTokens > 0) statuses.push(`💡 难点顿悟 ×${state.effects.insightTokens}`);
  if (state.restUntil > now) statuses.push(`☕ 休息 ${formatRemaining(state.restUntil - now)}`);
  if (state.cooldownUntil > now) statuses.push(`⏳ 冷却 ${formatRemaining(state.cooldownUntil - now)}`);
  statusList.innerHTML = statuses.length
    ? statuses.map((item) => `<span class="status-chip active">${item}</span>`).join("")
    : '<span class="status-chip">暂无效果，去抽一张幸运卡吧</span>';

  const hasFreeSpin = state.freeSpins > 0;
  const inCooldown = state.cooldownUntil > now;
  const insufficient = state.points < SPIN_COST && !hasFreeSpin;
  spinButton.disabled = spinning || inCooldown || insufficient;
  spinButton.querySelector("span").textContent = hasFreeSpin ? "免费抽奖" : `${SPIN_COST} 积分`;
  if (spinning) wheelTip.textContent = "转盘正在揭晓奖励…";
  else if (inCooldown) wheelTip.textContent = `卡池冷却中，还剩 ${formatRemaining(state.cooldownUntil - now)}`;
  else if (insufficient) wheelTip.textContent = `还差 ${SPIN_COST - state.points} 积分，完成任务后再来抽奖`;
  else if (hasFreeSpin) wheelTip.textContent = "你有免费抽奖机会，本次不扣积分";
  else wheelTip.textContent = "积分足够，点击中心按钮开始抽奖";

  const resting = state.restUntil > now;
  document.querySelectorAll(".task-button").forEach((button) => { button.disabled = resting; });
  $("#customTaskButton").disabled = resting;
  $("#claimInsightButton").classList.toggle("hidden", state.effects.insightTokens < 1 || resting);
  renderHistory();
  saveState();
}

function renderHistory() {
  if (!state.history.length) {
    historyList.innerHTML = '<div class="empty-state">还没有记录，先完成一个学习任务吧。</div>';
    return;
  }
  historyList.innerHTML = state.history.slice(0, 12).map((item) => `
    <div class="history-item">
      <div>
        <div class="history-title">${escapeHtml(item.title)}</div>
        <p class="history-time">${escapeHtml(item.time)}</p>
      </div>
      <span class="history-delta ${item.delta > 0 ? "positive" : item.delta < 0 ? "negative" : ""}">${item.delta > 0 ? "+" : ""}${item.delta || "—"}</span>
    </div>
  `).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function addHistory(title, delta = 0) {
  state.history.unshift({ title, delta, time: new Date().toLocaleString("zh-CN", { hour12: false }) });
  state.history = state.history.slice(0, 50);
}

function applyPrize(prize) {
  let delta = 0;
  switch (prize.id) {
    case "supply50": delta = 50; state.points += 50; break;
    case "supply20": delta = 20; state.points += 20; break;
    case "lucky5": delta = 5; state.points += 5; break;
    case "focus": state.effects.focusBonus += 10; break;
    case "boost": state.effects.multiplier = Math.max(state.effects.multiplier, 1.2); break;
    case "double": state.effects.multiplier = 2; break;
    case "free": state.freeSpins += 1; break;
    case "insight": state.effects.insightTokens += 1; break;
    case "rest": state.restUntil = Math.max(state.restUntil, Date.now()) + 5 * 60 * 1000; break;
    case "cooldown": state.cooldownUntil = Math.max(state.cooldownUntil, Date.now()) + 60 * 60 * 1000; break;
  }
  addHistory(`抽中：${prize.name}`, delta);
  if (prize.rare) state.pity = 0;
  else state.pity = Math.min(5, state.pity + 1);
}

function spin() {
  if (spinning) return;
  const now = Date.now();
  if (state.cooldownUntil > now) return showToast("卡池还在冷却中");
  const useFreeSpin = state.freeSpins > 0;
  if (!useFreeSpin && state.points < SPIN_COST) return showToast("积分不足，完成任务后再来抽奖");

  if (useFreeSpin) {
    state.freeSpins -= 1;
    addHistory("使用免费抽奖", 0);
  } else {
    state.points -= SPIN_COST;
    addHistory("幸运转盘抽奖", -SPIN_COST);
  }

  const prize = selectWeightedPrize();
  spinning = true;
  const currentMod = ((state.rotation % 360) + 360) % 360;
  const targetMod = (360 - prize.centerAngle) % 360;
  const extra = (targetMod - currentMod + 360) % 360;
  state.rotation += 360 * 6 + extra;
  wheel.style.transform = `rotate(${state.rotation}deg)`;
  render();

  window.setTimeout(() => {
    spinning = false;
    applyPrize(prize);
    render();
    showResult(prize);
  }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 350 : 4300);
}

function addTaskPoints(name, basePoints) {
  if (state.restUntil > Date.now()) return showToast("先休息一下，倒计时结束后再记录任务");
  const multiplier = state.effects.multiplier;
  const focusBonus = state.effects.focusBonus;
  const earned = Math.round(basePoints * multiplier + focusBonus);
  state.points += earned;
  state.effects.multiplier = 1;
  state.effects.focusBonus = 0;
  const effectText = earned !== basePoints ? `（加成后 ${earned}）` : "";
  addHistory(`完成：${name}${effectText}`, earned);
  render();
  showToast(`${name}完成，+${earned} 积分`);
}

function showResult(prize) {
  $("#resultIcon").textContent = prize.icon;
  $("#resultIcon").style.background = `${prize.color}33`;
  $("#resultTitle").textContent = prize.name;
  $("#resultDescription").textContent = prize.description;
  resultDialog.showModal();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
}

spinButton.addEventListener("click", spin);

$("#taskGrid").addEventListener("click", (event) => {
  const button = event.target.closest(".task-button");
  if (!button) return;
  addTaskPoints(button.dataset.name, Number(button.dataset.points));
});

$("#adjustButton").addEventListener("click", () => {
  $("#pointsInput").value = state.points;
  pointsDialog.showModal();
});

$("#pointsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const nextValue = Math.max(0, Math.floor(Number($("#pointsInput").value)));
  if (!Number.isFinite(nextValue)) return;
  const delta = nextValue - state.points;
  state.points = nextValue;
  addHistory("手动调整积分", delta);
  pointsDialog.close();
  render();
  showToast("积分已更新");
});

$("#customTaskButton").addEventListener("click", () => customTaskDialog.showModal());

$("#customTaskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#taskNameInput").value.trim();
  const points = Math.floor(Number($("#taskPointsInput").value));
  if (!name || !Number.isFinite(points) || points < 1) return;
  customTaskDialog.close();
  addTaskPoints(name, points);
  event.target.reset();
  $("#taskPointsInput").value = 30;
});

$("#claimInsightButton").addEventListener("click", () => {
  if (state.effects.insightTokens < 1) return;
  state.effects.insightTokens -= 1;
  state.points += 100;
  addHistory("难点顿悟：高难度任务通关", 100);
  render();
  showToast("高难度任务通关，+100 积分");
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

$("#clearHistoryButton").addEventListener("click", () => {
  state.history = [];
  render();
  showToast("记录已清空");
});

$("#resetButton").addEventListener("click", () => {
  if (!confirm("确定重置积分、效果和全部记录吗？")) return;
  state = structuredClone(defaultState);
  saveState();
  wheel.style.transition = "none";
  wheel.style.transform = "rotate(0deg)";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { wheel.style.transition = ""; });
  });
  render();
  showToast("全部数据已重置");
});

function startClock() {
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const now = Date.now();
    if (state.cooldownUntil && state.cooldownUntil <= now) state.cooldownUntil = 0;
    if (state.restUntil && state.restUntil <= now) state.restUntil = 0;
    render();
  }, 1000);
}

buildWheel();
renderPrizeList();
render();
startClock();

