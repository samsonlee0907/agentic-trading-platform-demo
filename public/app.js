const state = {
  defaults: null,
  samplePortfolio: null,
  sampleNews: [],
  config: {
    projectEndpoint: "",
    deployment: "",
    apiKey: "",
    maxOutputTokens: 1400,
    reasoningEffort: "minimal",
    verbosity: "low"
  },
  portfolio: [],
  cash: 0,
  costs: {
    txnCostBps: 2,
    slippageBps: 6
  },
  settings: {
    strategy: "multi_agent",
    riskLevel: 6,
    horizonMinutes: 120,
    orderSlicing: "auto",
    maxOrders: 8,
    urgencyBias: "medium"
  },
  selectedNewsIds: new Set(),
  freeformNews: "",
  newsAnalysis: null,
  latestDeskOutput: null,
  proposal: null,
  trades: [],
  chatHistory: []
};

const elements = {
  healthBadge: document.getElementById("healthBadge"),
  connectionStatus: document.getElementById("connectionStatus"),
  deskStatus: document.getElementById("deskStatus"),
  newsAnalysis: document.getElementById("newsAnalysis"),
  rawOutput: document.getElementById("rawOutput"),
  proposalSummary: document.getElementById("proposalSummary"),
  projectEndpoint: document.getElementById("projectEndpoint"),
  deployment: document.getElementById("deployment"),
  apiKey: document.getElementById("apiKey"),
  maxOutputTokens: document.getElementById("maxOutputTokens"),
  reasoningEffort: document.getElementById("reasoningEffort"),
  verbosity: document.getElementById("verbosity"),
  cash: document.getElementById("cash"),
  txnCostBps: document.getElementById("txnCostBps"),
  slippageBps: document.getElementById("slippageBps"),
  strategy: document.getElementById("strategy"),
  riskLevel: document.getElementById("riskLevel"),
  horizonMinutes: document.getElementById("horizonMinutes"),
  orderSlicing: document.getElementById("orderSlicing"),
  maxOrders: document.getElementById("maxOrders"),
  urgencyBias: document.getElementById("urgencyBias"),
  freeformNews: document.getElementById("freeformNews"),
  portfolioBody: document.getElementById("portfolioBody"),
  portfolioSummary: document.getElementById("portfolioSummary"),
  newsCards: document.getElementById("newsCards"),
  agentCards: document.getElementById("agentCards"),
  proposalBody: document.getElementById("proposalBody"),
  tradesBody: document.getElementById("tradesBody"),
  chatMessages: document.getElementById("chatMessages"),
  chatAgent: document.getElementById("chatAgent"),
  chatInput: document.getElementById("chatInput"),
  executeProposalButton: document.getElementById("executeProposalButton"),
  pingButton: document.getElementById("pingButton"),
  loadSampleButton: document.getElementById("loadSampleButton"),
  addRowButton: document.getElementById("addRowButton"),
  analyzeNewsButton: document.getElementById("analyzeNewsButton"),
  runDeskButton: document.getElementById("runDeskButton"),
  sendChatButton: document.getElementById("sendChatButton")
};

function fmtCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function fmtNumber(value, digits = 2) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeWithBreaks(value) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function portfolioSummary(portfolio, cash) {
  const holdingsValue = portfolio.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const grossExposure = portfolio.reduce((sum, item) => sum + Math.abs(item.quantity * item.price), 0);
  const totalEquity = holdingsValue + cash;
  const largestPosition = portfolio.reduce((best, item) => {
    const marketValue = Math.abs(item.quantity * item.price);
    return marketValue > best.marketValue ? { symbol: item.symbol, marketValue } : best;
  }, { symbol: "-", marketValue: 0 });

  return {
    holdingsValue,
    grossExposure,
    totalEquity,
    largestPosition
  };
}

function currentConfig() {
  return {
    projectEndpoint: elements.projectEndpoint.value.trim(),
    deployment: elements.deployment.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    maxOutputTokens: Number(elements.maxOutputTokens.value),
    reasoningEffort: elements.reasoningEffort.value,
    verbosity: elements.verbosity.value
  };
}

function currentSettings() {
  return {
    strategy: elements.strategy.value,
    riskLevel: Number(elements.riskLevel.value),
    horizonMinutes: Number(elements.horizonMinutes.value),
    orderSlicing: elements.orderSlicing.value,
    maxOrders: Number(elements.maxOrders.value),
    urgencyBias: elements.urgencyBias.value
  };
}

function syncStateFromInputs() {
  state.config = currentConfig();
  state.settings = currentSettings();
  state.cash = Number(elements.cash.value || 0);
  state.costs = {
    txnCostBps: Number(elements.txnCostBps.value || 0),
    slippageBps: Number(elements.slippageBps.value || 0)
  };
  state.freeformNews = elements.freeformNews.value.trim();
}

async function apiFetch(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function renderPortfolio() {
  elements.portfolioBody.innerHTML = "";

  state.portfolio.forEach((holding, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input data-field="symbol" data-index="${index}" value="${escapeHtml(holding.symbol)}" /></td>
      <td><input data-field="quantity" data-index="${index}" type="number" step="1" value="${holding.quantity}" /></td>
      <td><input data-field="price" data-index="${index}" type="number" step="0.01" value="${holding.price}" /></td>
      <td><button data-remove="${index}" class="button">Remove</button></td>
    `;
    elements.portfolioBody.appendChild(row);
  });

  const summary = portfolioSummary(state.portfolio, state.cash);
  const metrics = [
    { label: "Holdings value", value: fmtCurrency(summary.holdingsValue) },
    { label: "Total equity", value: fmtCurrency(summary.totalEquity) },
    { label: "Gross exposure", value: fmtCurrency(summary.grossExposure) },
    { label: "Largest line", value: `${summary.largestPosition.symbol} · ${fmtCurrency(summary.largestPosition.marketValue)}` }
  ];

  elements.portfolioSummary.innerHTML = metrics.map((metric) => {
    return `
      <div class="metric">
        <div class="label">${metric.label}</div>
        <div class="value">${metric.value}</div>
      </div>
    `;
  }).join("");
}

function renderNews() {
  elements.newsCards.innerHTML = state.sampleNews.map((article) => {
    const selected = state.selectedNewsIds.has(article.id);
    return `
      <article class="news-card">
        <header>
          <div>
            <h3>${escapeHtml(article.title)}</h3>
            <p>${escapeHtml(article.date)} · ${escapeHtml(article.source)}</p>
          </div>
          <label class="tag">
            <input data-news-id="${article.id}" type="checkbox" ${selected ? "checked" : ""} />
            <span>Use</span>
          </label>
        </header>
        <p>${escapeHtml(article.summary)}</p>
        <p class="callout muted">${escapeHtml(article.market_impact)}</p>
      </article>
    `;
  }).join("");
}

function renderAgentCards() {
  const parsed = state.latestDeskOutput;
  if (!parsed) {
    elements.agentCards.innerHTML = `<div class="callout muted">Run the desk to generate analyst output.</div>`;
    elements.rawOutput.textContent = "";
    return;
  }

  const cards = [];
  if (parsed.market_view) {
    cards.push({
      title: "Market view",
      body: `${parsed.market_view.regime || "mixed"} · conf ${fmtNumber(parsed.market_view.confidence || 0, 2)}\n${(parsed.market_view.key_drivers || []).join(", ")}`
    });
  }

  for (const key of ["fundamental", "sentiment", "technical", "risk"]) {
    const item = parsed.agents?.[key];
    if (!item) {
      continue;
    }
    cards.push({
      title: key,
      body: `${item.summary || item.notes || ""}\nconf ${fmtNumber(item.confidence || 0, 2)}`
    });
  }

  if (parsed.trader) {
    cards.push({
      title: "trader",
      body: `${parsed.trader.strategy || "hold"}\n${parsed.trader.rationale || ""}`
    });
  }

  elements.agentCards.innerHTML = cards.map((card) => {
    return `
      <article class="agent-card">
        <header>
          <h3>${escapeHtml(card.title)}</h3>
          <span class="tag">desk</span>
        </header>
        <p>${escapeWithBreaks(card.body)}</p>
      </article>
    `;
  }).join("");

  elements.rawOutput.textContent = JSON.stringify(parsed, null, 2);
}

function renderProposal() {
  const orders = state.proposal?.orders || [];
  elements.proposalBody.innerHTML = orders.map((order) => {
    return `
      <tr>
        <td>${escapeHtml(order.symbol || "")}</td>
        <td>${escapeHtml(order.side || "")}</td>
        <td>${fmtNumber(order.quantity || 0, 0)}</td>
        <td>${escapeHtml(order.type || "")}</td>
        <td>${order.limit_price == null ? "" : fmtNumber(order.limit_price)}</td>
        <td>${escapeHtml(order.urgency || "")}</td>
      </tr>
    `;
  }).join("");

  elements.executeProposalButton.disabled = !orders.length;
  elements.proposalSummary.textContent = orders.length
    ? state.proposal.rationale || `${orders.length} proposed orders ready for simulation.`
    : "No proposal yet.";
}

function renderTrades() {
  elements.tradesBody.innerHTML = state.trades.map((trade) => {
    return `
      <tr>
        <td>${escapeHtml(trade.symbol)}</td>
        <td>${escapeHtml(trade.side)}</td>
        <td>${fmtNumber(trade.quantity, 0)}</td>
        <td>${fmtNumber(trade.fillPrice)}</td>
        <td>${fmtCurrency((trade.fee || 0) + (trade.slipCost || 0))}</td>
        <td>${fmtCurrency(trade.cashDelta)}</td>
      </tr>
    `;
  }).join("");
}

function renderChat() {
  elements.chatMessages.innerHTML = state.chatHistory.map((message) => {
    const tag = message.agent ? `<div class="tag">${escapeHtml(message.agent)}</div>` : "";
    return `
      <div class="message ${message.role}">
        <div class="bubble">
          ${tag}
          <div>${escapeWithBreaks(message.text)}</div>
        </div>
      </div>
    `;
  }).join("");
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function setStatus(target, message) {
  target.textContent = message;
}

function loadSamplePortfolio() {
  const sample = state.samplePortfolio;
  state.portfolio = sample.holdings.map((item) => ({
    symbol: item.symbol,
    quantity: item.quantity,
    price: item.price
  }));
  state.cash = sample.cash;
  state.costs = { ...sample.costs };
  state.selectedNewsIds = new Set(state.sampleNews.slice(0, 3).map((item) => item.id));
  state.freeformNews = sample.notes;

  elements.cash.value = state.cash;
  elements.txnCostBps.value = state.costs.txnCostBps;
  elements.slippageBps.value = state.costs.slippageBps;
  elements.freeformNews.value = state.freeformNews;

  renderPortfolio();
  renderNews();
}

function collectPayload() {
  syncStateFromInputs();
  return {
    config: state.config,
    portfolio: state.portfolio,
    cash: state.cash,
    costs: state.costs,
    settings: state.settings,
    newsIds: [...state.selectedNewsIds],
    freeformNews: state.freeformNews
  };
}

async function bootstrap() {
  const [health, bootstrapData] = await Promise.all([
    fetch("/api/health").then((res) => res.json()),
    fetch("/api/bootstrap").then((res) => res.json())
  ]);

  state.defaults = bootstrapData.defaults;
  state.samplePortfolio = bootstrapData.samplePortfolio;
  state.sampleNews = bootstrapData.sampleNews;

  elements.healthBadge.textContent = health.hasServerKey
    ? "Server env key detected"
    : "No server key loaded";

  elements.projectEndpoint.value = bootstrapData.defaults.projectEndpoint || "";
  elements.deployment.value = bootstrapData.defaults.deployment || "";
  elements.maxOutputTokens.value = bootstrapData.defaults.maxOutputTokens || 1400;
  elements.reasoningEffort.value = bootstrapData.defaults.reasoningEffort || "minimal";
  elements.verbosity.value = bootstrapData.defaults.verbosity || "low";
  elements.strategy.value = state.settings.strategy;
  elements.riskLevel.value = state.settings.riskLevel;
  elements.horizonMinutes.value = state.settings.horizonMinutes;
  elements.orderSlicing.value = state.settings.orderSlicing;
  elements.maxOrders.value = state.settings.maxOrders;
  elements.urgencyBias.value = state.settings.urgencyBias;

  loadSamplePortfolio();
  renderAgentCards();
  renderProposal();
  renderTrades();
  renderChat();
}

elements.portfolioBody.addEventListener("input", (event) => {
  const target = event.target;
  const field = target.dataset.field;
  const index = Number(target.dataset.index);
  if (!field || !Number.isInteger(index)) {
    return;
  }

  const value = field === "symbol" ? target.value.toUpperCase() : Number(target.value);
  state.portfolio[index][field] = value;
  renderPortfolio();
});

elements.portfolioBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-remove]");
  if (!button) {
    return;
  }

  const index = Number(button.dataset.remove);
  state.portfolio.splice(index, 1);
  renderPortfolio();
});

elements.newsCards.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[data-news-id]");
  if (!checkbox) {
    return;
  }

  const id = checkbox.dataset.newsId;
  if (checkbox.checked) {
    state.selectedNewsIds.add(id);
  } else {
    state.selectedNewsIds.delete(id);
  }
});

elements.addRowButton.addEventListener("click", () => {
  state.portfolio.push({ symbol: "", quantity: 0, price: 0 });
  renderPortfolio();
});

elements.loadSampleButton.addEventListener("click", () => {
  loadSamplePortfolio();
  setStatus(elements.deskStatus, "Sample portfolio loaded.");
});

elements.pingButton.addEventListener("click", async () => {
  try {
    syncStateFromInputs();
    const data = await apiFetch("/api/ping", { config: state.config });
    setStatus(elements.connectionStatus, `Connected via ${data.transport}.`);
  } catch (error) {
    setStatus(elements.connectionStatus, error.message);
  }
});

elements.analyzeNewsButton.addEventListener("click", async () => {
  try {
    setStatus(elements.deskStatus, "Analyzing news...");
    const payload = collectPayload();
    const data = await apiFetch("/api/news/analyze", payload);
    state.newsAnalysis = data.parsed;
    elements.newsAnalysis.textContent = data.parsed
      ? `${data.parsed.sentiment || "neutral"} · conf ${fmtNumber(data.parsed.confidence || 0, 2)} · ${data.parsed.summary || ""}`
      : data.rawText;
    setStatus(elements.deskStatus, `News analyzed via ${data.transport}.`);
  } catch (error) {
    setStatus(elements.deskStatus, error.message);
  }
});

elements.runDeskButton.addEventListener("click", async () => {
  try {
    setStatus(elements.deskStatus, "Running desk...");
    const payload = collectPayload();
    const data = await apiFetch("/api/desk/run", payload);
    state.latestDeskOutput = data.parsed;
    const orders = data.parsed?.trader?.orders || [];
    state.proposal = {
      orders,
      rationale: data.parsed?.trader?.rationale || "Desk proposal"
    };
    renderAgentCards();
    renderProposal();
    setStatus(elements.deskStatus, `Desk run complete via ${data.transport}.`);
  } catch (error) {
    setStatus(elements.deskStatus, error.message);
  }
});

elements.executeProposalButton.addEventListener("click", async () => {
  try {
    if (!state.proposal?.orders?.length) {
      return;
    }
    syncStateFromInputs();
    const data = await apiFetch("/api/simulate/execute", {
      portfolio: state.portfolio,
      cash: state.cash,
      costs: state.costs,
      orders: state.proposal.orders
    });
    state.portfolio = data.portfolio;
    state.cash = data.cash;
    state.trades = data.trades;
    elements.cash.value = state.cash;
    renderPortfolio();
    renderTrades();
    setStatus(elements.deskStatus, `Executed ${data.trades.length} simulated fills.`);
  } catch (error) {
    setStatus(elements.deskStatus, error.message);
  }
});

elements.sendChatButton.addEventListener("click", async () => {
  try {
    const userText = elements.chatInput.value.trim();
    if (!userText) {
      return;
    }

    state.chatHistory.push({ role: "user", text: userText });
    renderChat();
    elements.chatInput.value = "";

    const payload = {
      ...collectPayload(),
      chatHistory: state.chatHistory,
      preferredAgent: elements.chatAgent.value,
      userText,
      latestDeskOutput: state.latestDeskOutput
    };

    const data = await apiFetch("/api/chat", payload);
    const parsed = data.parsed || {};
    state.chatHistory.push({
      role: "assistant",
      text: parsed.content || data.rawText,
      agent: parsed.agent || "desk"
    });

    if (parsed.trade_proposal?.orders?.length) {
      state.proposal = parsed.trade_proposal;
      renderProposal();
    }

    renderChat();
  } catch (error) {
    setStatus(elements.deskStatus, error.message);
  }
});

elements.chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.sendChatButton.click();
  }
});

bootstrap().catch((error) => {
  elements.healthBadge.textContent = "Bootstrap failed";
  setStatus(elements.connectionStatus, error.message);
});
