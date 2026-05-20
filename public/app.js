const state = {
  defaults: null,
  samplePortfolio: null,
  sampleNews: [],
  sampleNewsVisible: false,
  config: {
    projectEndpoint: "",
    deployment: "",
    apiKey: "",
    maxOutputTokens: 8000,
    reasoningEffort: "medium",
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
  chatHistory: [],
  history: {},
  ticks: 0,
  charts: {
    selectedSymbol: "",
    historyPoints: 90,
    projectionMinutes: 120,
    noiseLevel: "medium",
    autoUpdate: true
  }
};

const elements = {
  connectionStatus: document.getElementById("connectionStatus"),
  deskStatus: document.getElementById("deskStatus"),
  newsAnalysis: document.getElementById("newsAnalysis"),
  rawOutput: document.getElementById("rawOutput"),
  proposalSummary: document.getElementById("proposalSummary"),
  chartStatus: document.getElementById("chartStatus"),
  chartLegend: document.getElementById("chartLegend"),
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
  loadSampleNewsButton: document.getElementById("loadSampleNewsButton"),
  clearNewsButton: document.getElementById("clearNewsButton"),
  analyzeNewsButton: document.getElementById("analyzeNewsButton"),
  runDeskButton: document.getElementById("runDeskButton"),
  nextTickButton: document.getElementById("nextTickButton"),
  sendChatButton: document.getElementById("sendChatButton"),
  renderChartButton: document.getElementById("renderChartButton"),
  autoUpdateChartButton: document.getElementById("autoUpdateChartButton"),
  chartSymbol: document.getElementById("chartSymbol"),
  historyPoints: document.getElementById("historyPoints"),
  projectionMinutes: document.getElementById("projectionMinutes"),
  noiseLevel: document.getElementById("noiseLevel"),
  priceChart: document.getElementById("priceChart")
};

const AGENT_META = {
  market: { title: "Market View", icon: "fi fi-br-algorithm", color: "#7dd3fc" },
  fundamental: { title: "Fundamental", icon: "fi fi-sr-earnings", color: "#63d2ff" },
  sentiment: { title: "Sentiment", icon: "fi fi-sr-messages", color: "#f472b6" },
  technical: { title: "Technical", icon: "fi fi-rr-stats", color: "#a78bfa" },
  risk: { title: "Risk Manager", icon: "fi fi-sr-shield", color: "#f59e0b" },
  trader: { title: "Trader", icon: "fi fi-ts-trading", color: "#5fe1a3" }
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

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function colorForSym(symbol) {
  const palette = ["#63d2ff", "#5fe1a3", "#ffcf73", "#ff8b7c", "#a78bfa", "#f472b6", "#22d3ee", "#84cc16"];
  let hash = 0;
  for (const char of String(symbol || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return palette[hash % palette.length];
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
  state.charts.historyPoints = Number(elements.historyPoints.value || 90);
  state.charts.projectionMinutes = Number(elements.projectionMinutes.value || 120);
  state.charts.noiseLevel = elements.noiseLevel.value;
  state.charts.selectedSymbol = elements.chartSymbol.value;
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

function ensureHistoryForHolding(symbol, price) {
  if (!symbol || !Number.isFinite(price) || price <= 0) {
    return;
  }

  const normalized = String(symbol).toUpperCase();
  if (state.history[normalized]?.length) {
    return;
  }

  const points = [];
  let current = price;
  for (let index = 0; index < 72; index += 1) {
    const drift = 0.00015 * Math.sin(index / 8);
    const noise = (Math.random() - 0.5) * 0.0035;
    current *= 1 + drift + noise;
    points.push({ x: index, price: current });
  }
  state.history[normalized] = points;
}

function syncHistoryFromPortfolio() {
  for (const holding of state.portfolio) {
    ensureHistoryForHolding(holding.symbol, Number(holding.price));
  }
}

function getLastPrice(symbol) {
  const normalized = String(symbol || "").toUpperCase();
  const history = state.history[normalized];
  if (history?.length) {
    return Number(history[history.length - 1].price);
  }
  const holding = state.portfolio.find((item) => item.symbol === normalized);
  return holding ? Number(holding.price) : null;
}

function advanceSyntheticMarketTick() {
  syncStateFromInputs();
  state.ticks += 1;

  for (const holding of state.portfolio) {
    const symbol = holding.symbol;
    const history = state.history[symbol] || [];
    const previous = history.length ? Number(history[history.length - 1].price) : Number(holding.price) || 100;
    const influence = getAgentInfluence(symbol);
    const macro = (Math.random() - 0.5) * 0.003;
    const agentDrift = influence.dir * 0.001 * influence.strength;
    const nextPrice = previous * (1 + macro + agentDrift);
    holding.price = Number(nextPrice.toFixed(2));

    history.push({
      x: history.length ? history[history.length - 1].x + 1 : 0,
      price: holding.price
    });
    state.history[symbol] = history.slice(-240);
  }
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

  syncHistoryFromPortfolio();
  updateChartSymbols();
}

function renderNews() {
  if (!state.sampleNewsVisible) {
    elements.newsCards.innerHTML = `
      <div class="empty-state">
        No sample news loaded. Use <b>Load sample news</b> to display the parked articles, or type your own new market news below.
      </div>
    `;
    return;
  }

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

function buildAgentCard(key, title, body, confidence, metaText) {
  const info = AGENT_META[key] || { title, icon: "fi fi-br-analytics", color: "#63d2ff" };
  const safeConfidence = clamp(Number(confidence || 0.45), 0.05, 1);
  return `
    <article class="agent-card" style="--agent-color:${info.color}">
      <header class="agent-header">
        <div class="agent-icon"><i class="${info.icon}"></i></div>
        <div>
          <h3>${escapeHtml(title || info.title)}</h3>
          <div class="tag">${escapeHtml(info.title)}</div>
        </div>
      </header>
      <p>${escapeWithBreaks(body)}</p>
      <div class="confidence-bar"><span style="width:${safeConfidence * 100}%"></span></div>
      <div class="agent-meta">
        <span>conf ${fmtNumber(safeConfidence, 2)}</span>
        <span>${escapeHtml(metaText || "active")}</span>
      </div>
    </article>
  `;
}

function renderAgentCards() {
  const parsed = state.latestDeskOutput;
  if (!parsed) {
    elements.agentCards.innerHTML = `<div class="empty-state">Run the desk to generate agent output and execution recommendations.</div>`;
    elements.rawOutput.textContent = "";
    return;
  }

  const cards = [];
  if (parsed.market_view) {
    cards.push(buildAgentCard(
      "market",
      "Market view",
      `${parsed.market_view.regime || "mixed"}\n${(parsed.market_view.key_drivers || []).join(", ")}`,
      parsed.market_view.confidence,
      "routing context"
    ));
  }

  for (const key of ["fundamental", "sentiment", "technical", "risk"]) {
    const item = parsed.agents?.[key];
    if (!item) {
      continue;
    }
    const detail = key === "technical" && Array.isArray(item.signals)
      ? `${item.summary || ""}\nSignals: ${item.signals.map((signal) => `${signal.symbol} ${signal.signal}`).join(", ")}`
      : `${item.summary || item.notes || ""}`;
    cards.push(buildAgentCard(key, AGENT_META[key].title, detail, item.confidence, "desk agent"));
  }

  if (parsed.trader) {
    const orders = Array.isArray(parsed.trader.orders) ? parsed.trader.orders.length : 0;
    cards.push(buildAgentCard(
      "trader",
      "Trader",
      `${parsed.trader.strategy || "hold"}\n${parsed.trader.rationale || ""}`,
      parsed.meta?.confidence || 0.6,
      `${orders} order${orders === 1 ? "" : "s"}`
    ));
  }

  elements.agentCards.innerHTML = cards.join("");
  elements.rawOutput.textContent = JSON.stringify(parsed, null, 2);
}

function renderProposal() {
  const orders = state.proposal?.orders || [];
  elements.proposalBody.innerHTML = orders.map((order) => {
    const sliceText = order.slice
      ? `${order.slice.pieces || 1}x / ${order.slice.interval_seconds || 0}s`
      : "";
    return `
      <tr>
        <td>${escapeHtml(order.symbol || "")}</td>
        <td>${escapeHtml(order.side || "")}</td>
        <td>${fmtNumber(order.quantity || 0, 0)}</td>
        <td>${escapeHtml(order.type || "")}</td>
        <td>${order.limit_price == null ? "" : fmtNumber(order.limit_price)}</td>
        <td>${escapeHtml(order.urgency || "")}</td>
        <td>${escapeHtml(sliceText)}</td>
        <td>${escapeHtml(order.rationale || state.proposal?.rationale || "")}</td>
      </tr>
    `;
  }).join("");

  elements.executeProposalButton.disabled = !orders.length;
  elements.proposalSummary.textContent = orders.length
    ? state.proposal.rationale || `${orders.length} proposed orders ready for simulation.`
    : "No proposal yet.";
}

function tradeSliceLabel(trade) {
  if (!trade?.sliceCount || trade.sliceCount <= 1) {
    return trade?.orderIndex ? `order ${trade.orderIndex}` : "single fill";
  }
  return `order ${trade.orderIndex || 1} · slice ${trade.sliceIndex || 1}/${trade.sliceCount}`;
}

function renderTrades() {
  elements.tradesBody.innerHTML = state.trades.map((trade) => {
    return `
      <tr>
        <td>
          ${escapeHtml(trade.symbol)}
          <div class="cell-note">${escapeHtml(tradeSliceLabel(trade))}</div>
        </td>
        <td>
          ${escapeHtml(trade.side)}
          <div class="cell-note">${trade.sliceCount > 1 ? "sliced execution" : "single execution"}</div>
        </td>
        <td>${fmtNumber(trade.quantity, 0)}</td>
        <td>${fmtNumber(trade.fillPrice)}</td>
        <td>${fmtCurrency((trade.fee || 0) + (trade.slipCost || 0))}</td>
        <td>${fmtCurrency(trade.cashDelta)}</td>
      </tr>
    `;
  }).join("");
}

function renderChatProposal(proposal, messageIndex) {
  const orders = proposal?.orders || [];
  if (!orders.length) {
    return "";
  }

  const rows = orders.slice(0, 4).map((order) => {
    const sliceText = order.slice?.pieces > 1 ? `${order.slice.pieces}x slices` : "single";
    return `
      <div class="chat-order-row">
        <div>
          <strong>${escapeHtml(order.side?.toUpperCase() || "")}</strong> ${fmtNumber(order.quantity || 0, 0)} ${escapeHtml(order.symbol || "")}
        </div>
        <div class="cell-note">${escapeHtml(order.urgency || "medium")} · ${escapeHtml(sliceText)}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="chat-proposal">
      <div class="chat-proposal-head">
        <strong>Proposed trade</strong>
        <span class="tag">${proposal.executed ? "executed" : `${orders.length} order${orders.length === 1 ? "" : "s"}`}</span>
      </div>
      <div class="chat-order-list">${rows}</div>
      <div class="cell-note">${escapeHtml(proposal.rationale || "")}</div>
      <div class="chat-action-row">
        <button class="button success" data-action="execute-chat-proposal" data-message-index="${messageIndex}" ${proposal.executed ? "disabled" : ""}>
          ${proposal.executed ? "Already executed" : "Execute from chat"}
        </button>
      </div>
    </div>
  `;
}

function renderChat() {
  elements.chatMessages.innerHTML = state.chatHistory.map((message, index) => {
    const tag = message.agent ? `<div class="tag">${escapeHtml(message.agent)}</div>` : "";
    const proposalMarkup = message.tradeProposal ? renderChatProposal(message.tradeProposal, index) : "";
    return `
      <div class="message ${message.role}">
        <div class="bubble">
          ${tag}
          <div>${escapeWithBreaks(message.text)}</div>
          ${proposalMarkup}
        </div>
      </div>
    `;
  }).join("");
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function setStatus(target, message) {
  target.textContent = message;
}

function humanizeUnfilledReason(reason) {
  const labels = {
    invalid_order: "invalid order shape",
    missing_quote: "missing portfolio quote",
    no_position: "no position available to sell",
    limit_below_market: "buy limit was below market",
    limit_above_market: "sell limit was above market",
    insufficient_cash: "insufficient cash",
    insufficient_position: "insufficient position size",
    not_filled: "order did not fill"
  };
  return labels[reason] || "order did not fill";
}

function replaceLastPendingAssistantMessage(message) {
  for (let index = state.chatHistory.length - 1; index >= 0; index -= 1) {
    if (state.chatHistory[index].role === "assistant" && state.chatHistory[index].pending) {
      state.chatHistory[index] = message;
      return;
    }
  }
  state.chatHistory.push(message);
}

function countMatches(text, pattern) {
  const matches = String(text || "").match(pattern);
  return matches ? matches.length : 0;
}

function getSelectedNewsArticles() {
  return state.sampleNews.filter((article) => state.selectedNewsIds.has(article.id));
}

function buildNewsCorpus() {
  const selectedArticles = getSelectedNewsArticles();
  const snippets = [
    ...selectedArticles.map((article) => `${article.title} ${article.summary} ${article.market_impact} ${article.body}`),
    state.freeformNews
  ].filter(Boolean);

  return {
    selectedArticles,
    snippets,
    joined: snippets.join(" ").toLowerCase()
  };
}

function hasFoundryConfig() {
  const endpoint = (state.config.projectEndpoint || state.defaults?.projectEndpoint || "").trim();
  const key = (state.config.apiKey || "").trim() || Boolean(state.defaults?.hasServerKey);
  return Boolean(endpoint && key);
}

function inferNewsBias() {
  const { selectedArticles, joined } = buildNewsCorpus();
  const aiScore = countMatches(joined, /ai|capex|compute|semiconductor|cloud|infrastructure|hyperscaler|gpu|datacenter|silicon|networking/g);
  const oilScore = countMatches(joined, /oil|opec|energy|brent|crude|shipping disruption|supply disruption/g);
  const inflationScore = countMatches(joined, /inflation|yield|treasury|higher-for-longer|rates|fed/g);
  const regulatoryScore = countMatches(joined, /antitrust|regulator|dominance|investigation|probe|fine|policy risk/g);
  const positiveScore = countMatches(joined, /supportive|constructive|growth|winner|benefit|resilient|strong|bullish|expand|leadership/g);
  const negativeScore = countMatches(joined, /risk|pressure|negative|bearish|overhang|stress|sticky|caution|disruption|slower/g);

  const aiPositive = aiScore >= 2;
  const oilInflation = oilScore + inflationScore >= 2;
  const regulatory = regulatoryScore >= 1;

  return {
    aiPositive,
    oilInflation,
    regulatory,
    aiScore,
    oilScore,
    inflationScore,
    regulatoryScore,
    positiveScore,
    negativeScore,
    selectedArticles,
    joined
  };
}

function analyzeNewsLocally(portfolio = state.portfolio) {
  const bias = inferNewsBias();
  const articleCount = bias.selectedArticles.length;
  const positiveTilt = bias.aiScore * 0.2 + bias.positiveScore * 0.05;
  const negativeTilt = (bias.oilScore + bias.inflationScore) * 0.12 + bias.regulatoryScore * 0.18 + bias.negativeScore * 0.04;
  const netScore = positiveTilt - negativeTilt;

  let sentiment = "mixed";
  if (netScore >= 0.32) {
    sentiment = "bullish";
  } else if (netScore <= -0.22) {
    sentiment = "bearish";
  }

  const themes = [];
  if (bias.aiPositive) {
    themes.push("AI capex remains supportive for compute, cloud, and networking leaders");
  }
  if (bias.oilScore || bias.inflationScore) {
    themes.push("oil and yield pressure keep inflation hedges and rate discipline relevant");
  }
  if (bias.regulatory) {
    themes.push("regulatory headlines argue for lighter sizing in platform-heavy positions");
  }
  if (!themes.length) {
    themes.push("headline flow is balanced, so the desk leans on portfolio structure and concentration control");
  }

  const impactedSymbols = portfolio
    .filter((holding) => {
      const symbol = holding.symbol;
      return (
        (bias.aiPositive && ["NVDA", "MSFT", "AMZN", "GOOGL", "AVGO"].includes(symbol)) ||
        ((bias.oilScore || bias.inflationScore) && ["XOM", "GLD", "JPM"].includes(symbol)) ||
        (bias.regulatory && ["GOOGL", "MSFT"].includes(symbol))
      );
    })
    .map((holding) => holding.symbol);

  const summaryPrefix = articleCount
    ? `${articleCount} selected article${articleCount === 1 ? "" : "s"}`
    : "No selected sample articles";
  const customSuffix = state.freeformNews ? " plus custom news" : "";
  const summary = `${summaryPrefix}${customSuffix} suggest a ${sentiment} but selective backdrop. ${themes.join(". ")}.`;
  const confidence = clamp(
    0.46
      + Math.min(0.18, articleCount * 0.05)
      + Math.min(0.14, (bias.aiScore + bias.oilScore + bias.inflationScore + bias.regulatoryScore) * 0.025)
      + Math.min(0.12, Math.abs(netScore) * 0.22),
    0.45,
    0.88
  );

  return {
    sentiment,
    confidence: Number(confidence.toFixed(2)),
    summary,
    themes,
    impactedSymbols
  };
}

function formatNewsAnalysis(analysis) {
  if (!analysis) {
    return "No news analysis yet.";
  }

  const symbols = analysis.impactedSymbols?.length
    ? ` Impacted: ${analysis.impactedSymbols.join(", ")}.`
    : "";
  return `${analysis.sentiment || "mixed"} · conf ${fmtNumber(analysis.confidence || 0, 2)} · ${analysis.summary || ""}${symbols}`;
}

function buildFallbackOrders(portfolio, settings) {
  const bias = inferNewsBias();
  const analysis = analyzeNewsLocally(portfolio);
  const summary = portfolioSummary(portfolio, state.cash);
  const totalEquity = Math.max(summary.totalEquity, 1);
  const holdings = portfolio
    .filter((item) => item.symbol && Number.isFinite(item.price) && item.price > 0)
    .map((item) => {
      const marketValue = item.quantity * item.price;
      return {
        ...item,
        marketValue,
        weight: marketValue / totalEquity
      };
    });
  const symbolMap = new Map(holdings.map((item) => [item.symbol, item]));
  const signalMap = new Map();
  const positiveGroups = {
    ai: new Set(["NVDA", "MSFT", "AMZN", "GOOGL", "AVGO"]),
    hedge: new Set(["XOM", "GLD"]),
    rate: new Set(["JPM"]),
    platform: new Set(["GOOGL", "MSFT"])
  };

  function addSignal(symbol, score, reason) {
    const holding = symbolMap.get(symbol);
    if (!holding) {
      return;
    }

    const current = signalMap.get(symbol) || { holding, score: 0, reasons: [] };
    current.score += score;
    current.reasons.push(reason);
    signalMap.set(symbol, current);
  }

  for (const holding of holdings) {
    const { symbol, weight } = holding;

    if (bias.aiPositive && positiveGroups.ai.has(symbol)) {
      const aiBoost = symbol === "NVDA" ? 1.35 : symbol === "AVGO" ? 1.05 : 0.92;
      addSignal(symbol, aiBoost, "AI capex headlines still favor infrastructure-heavy exposure");
    }

    if (bias.oilScore || bias.inflationScore) {
      if (positiveGroups.hedge.has(symbol)) {
        addSignal(symbol, 1.05, "Energy and gold improve the macro hedge if oil and yields stay elevated");
      }
      if (positiveGroups.rate.has(symbol)) {
        addSignal(symbol, 0.74, "Higher-for-longer rates can support money-center bank earnings power");
      }
      if (positiveGroups.ai.has(symbol) && !positiveGroups.hedge.has(symbol)) {
        addSignal(symbol, -0.24, "Higher yields argue for smaller adds in long-duration growth");
      }
    }

    if (bias.regulatory && symbol === "GOOGL") {
      addSignal(symbol, -1.08, "Platform regulation adds policy risk and trims near-term conviction");
    }
    if (bias.regulatory && symbol === "MSFT") {
      addSignal(symbol, -0.42, "Software dominance scrutiny argues for disciplined sizing, not a hard exit");
    }

    if (weight > 0.18) {
      addSignal(symbol, -0.28, "The name is already one of the portfolio's largest lines");
    } else if (weight < 0.085 && signalMap.get(symbol)?.score > 0) {
      addSignal(symbol, 0.18, "The position is relatively light versus the rest of the book");
    }
  }

  const candidates = [...signalMap.values()]
    .sort((left, right) => Math.abs(right.score) - Math.abs(left.score))
    .slice(0, Math.max(settings.maxOrders * 2, 6));

  const orders = [];
  let buyBudget = Math.max(0, state.cash) * (settings.riskLevel >= 7 ? 0.52 : 0.38);

  function buildSlice(quantity, estimatedNotional) {
    if (settings.orderSlicing === "off") {
      return { pieces: 1, interval_seconds: 0 };
    }

    if (estimatedNotional >= 40000 || quantity >= 120) {
      return { pieces: 4, interval_seconds: 60 };
    }
    if (estimatedNotional >= 18000 || quantity >= 60) {
      return { pieces: 3, interval_seconds: 45 };
    }
    return { pieces: 2, interval_seconds: 30 };
  }

  for (const candidate of candidates) {
    if (orders.length >= settings.maxOrders) {
      break;
    }

    const conviction = Math.abs(candidate.score);
    if (conviction < 0.28) {
      continue;
    }

    const side = candidate.score >= 0 ? "buy" : "sell";
    const baseNotional = totalEquity * clamp(0.008 + conviction * 0.013, 0.008, 0.03);
    let targetNotional = baseNotional;

    if (side === "buy") {
      targetNotional = Math.min(targetNotional, buyBudget);
    } else {
      targetNotional = Math.min(targetNotional, Math.abs(candidate.holding.marketValue) * 0.16);
    }

    if (targetNotional <= 0) {
      continue;
    }

    const quantity = Math.floor(targetNotional / candidate.holding.price);
    if (quantity < 1) {
      continue;
    }

    const estimatedNotional = quantity * candidate.holding.price;
    if (side === "buy") {
      buyBudget = Math.max(0, buyBudget - estimatedNotional);
    }

    orders.push({
      symbol: candidate.holding.symbol,
      side,
      quantity,
      type: conviction >= 0.9 ? "market" : "limit",
      limit_price: conviction >= 0.9
        ? null
        : Number((candidate.holding.price * (side === "buy" ? 1.002 : 0.998)).toFixed(2)),
      urgency: conviction >= 1 ? "high" : conviction >= 0.55 ? "medium" : "low",
      slice: buildSlice(quantity, estimatedNotional),
      rationale: candidate.reasons.slice(0, 2).join(". ")
    });
  }

  if (!orders.length) {
    const first = holdings[0];
    if (first) {
      const quantity = Math.max(1, Math.floor((totalEquity * 0.01) / first.price));
      orders.push({
        symbol: first.symbol,
        side: "buy",
        quantity,
        type: "market",
        limit_price: null,
        urgency: "low",
        slice: buildSlice(quantity, quantity * first.price),
        rationale: "No dominant headline shock was detected, so the local desk keeps a small rebalance into the lead conviction name."
      });
    }
  }

  let strategy = "core_rebalance";
  let rationale = "The local desk is rebalancing core positions while keeping turnover contained.";

  if (bias.aiPositive && (bias.oilInflation || bias.regulatory)) {
    strategy = "barbell_rebalance";
    rationale = "The local desk adds to AI infrastructure strength while keeping hedges and trimming policy-sensitive concentration.";
  } else if (bias.aiPositive) {
    strategy = "accumulate_ai_leaders";
    rationale = "The local desk leans into AI infrastructure leadership with measured adds to core compute and cloud exposure.";
  } else if (bias.oilInflation) {
    strategy = "rotate_to_hedges";
    rationale = "The local desk rotates toward energy, gold, and rate beneficiaries while reducing stretch in duration-sensitive growth.";
  } else if (bias.regulatory) {
    strategy = "trim_policy_risk";
    rationale = "The local desk trims platform-policy risk and reallocates toward steadier quality exposure already in the book.";
  }

  if (analysis.sentiment === "bearish" && !bias.aiPositive) {
    strategy = "defensive_rebalance";
    rationale = "Headline flow is skewing defensive, so the local desk prefers hedges, quality, and smaller order sizes.";
  }

  return {
    strategy,
    rationale,
    orders: orders.slice(0, settings.maxOrders)
  };
}

function buildFallbackDeskOutput() {
  syncStateFromInputs();
  const portfolio = state.portfolio;
  const settings = state.settings;
  const bias = inferNewsBias();
  const news = analyzeNewsLocally(portfolio);

  const techSignals = portfolio.slice(0, 6).map((holding, index) => {
    let signal = index % 2 === 0 ? "bullish" : "neutral";
    let strength = 0.48 + index * 0.05;

    if (bias.aiPositive && ["NVDA", "MSFT", "AMZN", "GOOGL", "AVGO"].includes(holding.symbol)) {
      signal = "bullish";
      strength = 0.72;
    }
    if (bias.oilInflation && ["XOM", "GLD", "JPM"].includes(holding.symbol)) {
      signal = "bullish";
      strength = Math.max(strength, 0.66);
    }
    if (bias.regulatory && ["GOOGL", "MSFT"].includes(holding.symbol)) {
      signal = "bearish";
      strength = 0.57;
    }

    return {
      symbol: holding.symbol,
      signal,
      strength: Number(clamp(strength, 0.2, 0.9).toFixed(2))
    };
  });

  const traderPlan = buildFallbackOrders(portfolio, settings);

  return {
    market_view: {
      regime: bias.aiPositive && !bias.oilInflation ? "risk_on" : bias.oilInflation || bias.regulatory ? "barbell" : "mixed",
      key_drivers: [
        bias.aiPositive ? "AI infrastructure spending remains a primary equity driver." : "AI leadership matters, but headline support is less forceful right now.",
        bias.oilInflation ? "Oil and yield pressure keep macro hedges relevant." : "Macro pressure is present but not dominant in the local read.",
        bias.regulatory ? "Large-cap platform regulation is a live sentiment drag." : "Policy headlines are not the main local driver."
      ],
      confidence: Math.max(0.56, news.confidence)
    },
    agents: {
      fundamental: {
        summary: bias.aiPositive
          ? "The fundamental backdrop still favors AI compute, cloud, and infrastructure leaders, but sizing should respect rate and policy cross-currents."
          : "The local desk keeps a balanced fundamental view and leans on existing portfolio leaders plus hedges.",
        confidence: Math.max(0.61, news.confidence - 0.02)
      },
      sentiment: {
        summary: news.summary,
        confidence: news.confidence
      },
      technical: {
        summary: "Local fallback technical view derived from portfolio leaders and current news bias.",
        signals: techSignals,
        confidence: 0.59
      },
      risk: {
        limits: {
          max_position_per_symbol_pct: 18,
          max_gross_exposure_pct: 135,
          stop_loss_pct: 6
        },
        notes: "The local desk keeps sizing moderate, trims oversized lines first, and prefers sliced orders for larger tickets.",
        confidence: 0.74
      }
    },
    trader: {
      strategy: traderPlan.strategy,
      orders: traderPlan.orders,
      rationale: traderPlan.orders.length
        ? traderPlan.rationale
        : "No actionable order was generated from the current portfolio and news mix."
    },
    meta: {
      confidence: news.confidence,
      horizon_minutes: settings.horizonMinutes
    }
  };
}

function detectRoutedAgent(preferredAgent, userText = "") {
  if (preferredAgent && preferredAgent !== "auto") {
    return preferredAgent;
  }

  const text = String(userText || "").toLowerCase();
  if (/trade|order|execute|buy|sell|rebalance|proposal/.test(text)) {
    return "trader";
  }
  if (/risk|hedge|drawdown|exposure|stop/.test(text)) {
    return "risk";
  }
  if (/technical|chart|trend|signal|momentum/.test(text)) {
    return "technical";
  }
  if (/sentiment|headline|news|tone/.test(text)) {
    return "sentiment";
  }
  if (/fundamental|valuation|earnings|thesis/.test(text)) {
    return "fundamental";
  }
  return "trader";
}

function buildLocalChatReply({ preferredAgent, userText }) {
  const routedAgent = detectRoutedAgent(preferredAgent, userText);
  const desk = state.latestDeskOutput || buildFallbackDeskOutput();
  const proposal = state.proposal?.orders?.length
    ? state.proposal
    : { orders: desk.trader?.orders || [], rationale: desk.trader?.rationale || "" };
  const totalOrders = proposal.orders?.length || 0;

  if (routedAgent === "trader") {
    const orderPreview = totalOrders
      ? proposal.orders
        .slice(0, 3)
        .map((order) => `${order.side.toUpperCase()} ${order.quantity} ${order.symbol}`)
        .join(", ")
      : "No immediate order is justified from the current setup.";

    return {
      agent: "trader",
      confidence: desk.meta?.confidence || 0.62,
      content: totalOrders
        ? `Trader route is active. Strategy: ${desk.trader?.strategy || "execution"}. Proposed ${totalOrders} order${totalOrders === 1 ? "" : "s"} for execution: ${orderPreview}.`
        : `Trader route is active. ${desk.trader?.rationale || "No immediate trade proposal is available."}`,
      trade_proposal: totalOrders
        ? {
          orders: proposal.orders,
          rationale: `Trader route proposed ${totalOrders} order${totalOrders === 1 ? "" : "s"} for execution. ${proposal.rationale || desk.trader?.rationale || ""}`.trim()
        }
        : {
          orders: [],
          rationale: desk.trader?.rationale || "Trader reviewed the setup and kept a no-trade stance."
        }
    };
  }

  if (routedAgent === "risk") {
    return {
      agent: "risk",
      confidence: desk.agents?.risk?.confidence || 0.7,
      content: `${desk.agents?.risk?.notes || "Risk view unavailable."} Current trader plan carries ${totalOrders} proposed order${totalOrders === 1 ? "" : "s"}${totalOrders ? " into the execution blotter" : ""}.`
    };
  }

  if (routedAgent === "technical") {
    const signals = (desk.agents?.technical?.signals || [])
      .slice(0, 4)
      .map((signal) => `${signal.symbol} ${signal.signal}`)
      .join(", ");
    return {
      agent: "technical",
      confidence: desk.agents?.technical?.confidence || 0.6,
      content: `${desk.agents?.technical?.summary || "Technical view unavailable."}${signals ? ` Signals: ${signals}.` : ""}`
    };
  }

  if (routedAgent === "sentiment") {
    return {
      agent: "sentiment",
      confidence: state.newsAnalysis?.confidence || desk.agents?.sentiment?.confidence || 0.6,
      content: state.newsAnalysis?.summary || desk.agents?.sentiment?.summary || "Sentiment view unavailable."
    };
  }

  return {
    agent: "fundamental",
    confidence: desk.agents?.fundamental?.confidence || 0.62,
    content: desk.agents?.fundamental?.summary || "Fundamental view unavailable."
  };
}

function applyTraderProposal(tradeProposal, sourceLabel = "Trader") {
  const normalized = {
    orders: Array.isArray(tradeProposal?.orders) ? tradeProposal.orders : [],
    rationale: tradeProposal?.rationale || `${sourceLabel} updated the proposal.`,
    executed: Boolean(tradeProposal?.executed)
  };
  state.proposal = normalized;

  const desk = state.latestDeskOutput || buildFallbackDeskOutput();
  state.latestDeskOutput = {
    ...desk,
    trader: {
      ...(desk.trader || {}),
      strategy: normalized.orders.length ? (desk.trader?.strategy || "execution") : (desk.trader?.strategy || "hold"),
      orders: normalized.orders,
      rationale: normalized.rationale
    }
  };
  return normalized;
}

function proposalSignature(proposal) {
  return JSON.stringify({
    orders: (proposal?.orders || []).map((order) => ({
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      type: order.type,
      limit_price: order.limit_price,
      urgency: order.urgency,
      slice: order.slice
    })),
    rationale: proposal?.rationale || ""
  });
}

function markMatchingChatProposalsExecuted(proposal) {
  const signature = proposalSignature(proposal);
  for (const message of state.chatHistory) {
    if (message.tradeProposal && proposalSignature(message.tradeProposal) === signature) {
      message.tradeProposal = {
        ...message.tradeProposal,
        executed: true
      };
    }
  }
}

async function executeProposalFlow(proposal = state.proposal, sourceLabel = "proposal") {
  const orders = proposal?.orders || [];
  if (!orders.length) {
    return { ok: false, reason: "no_orders" };
  }

  elements.executeProposalButton.disabled = true;
  setStatus(elements.deskStatus, `Executing ${sourceLabel}...`);
  syncStateFromInputs();
  const data = await apiFetch("/api/simulate/execute", {
    portfolio: state.portfolio,
    cash: state.cash,
    costs: state.costs,
    orders
  });

  state.portfolio = data.portfolio;
  state.cash = data.cash;
  state.trades = data.trades;
  elements.cash.value = state.cash;

  for (const trade of state.trades) {
    ensureHistoryForHolding(trade.symbol, Number(trade.fillPrice));
    const history = state.history[trade.symbol] || [];
    history.push({
      x: history.length ? history[history.length - 1].x + 1 : 0,
      price: Number(trade.fillPrice)
    });
    state.history[trade.symbol] = history.slice(-240);
  }

  renderPortfolio();
  renderTrades();
  markMatchingChatProposalsExecuted(proposal);
  state.proposal = {
    orders: [],
    rationale: data.trades.length
      ? `Last execution completed with ${data.trades.length} simulated fill${data.trades.length === 1 ? "" : "s"}.`
      : "No trades executed."
  };
  renderProposal();
  renderChat();
  if (state.charts.autoUpdate) {
    renderChart();
  }

  if (data.trades.length) {
    setStatus(elements.deskStatus, `Executed ${data.trades.length} simulated fill${data.trades.length === 1 ? "" : "s"} from ${sourceLabel}.`);
    return { ok: true, trades: data.trades };
  }

  const reasons = Array.isArray(data.unfilledOrders)
    ? [...new Set(data.unfilledOrders.map((item) => humanizeUnfilledReason(item.reason)).filter(Boolean))]
    : [];
  setStatus(
    elements.deskStatus,
    reasons.length
      ? `No trades executed from ${sourceLabel}. ${reasons.join(", ")}.`
      : `No trades executed from ${sourceLabel}.`
  );
  return { ok: false, unfilledOrders: data.unfilledOrders || [] };
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
  state.history = {};
  state.trades = [];
  state.proposal = null;

  elements.cash.value = state.cash;
  elements.txnCostBps.value = state.costs.txnCostBps;
  elements.slippageBps.value = state.costs.slippageBps;

  renderPortfolio();
  state.latestDeskOutput = buildFallbackDeskOutput();
  state.proposal = {
    orders: state.latestDeskOutput?.trader?.orders || [],
    rationale: state.latestDeskOutput?.trader?.rationale || "Local fallback proposal"
  };
  renderAgentCards();
  renderProposal();
  renderTrades();
  if (state.charts.autoUpdate) {
    renderChart();
  }
}

function loadSampleNews() {
  state.sampleNewsVisible = true;
  state.selectedNewsIds = new Set();
  renderNews();
}

function clearNews() {
  state.sampleNewsVisible = false;
  state.selectedNewsIds = new Set();
  state.freeformNews = "";
  elements.freeformNews.value = "";
  state.newsAnalysis = null;
  elements.newsAnalysis.textContent = "No news analysis yet.";
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

function updateChartSymbols() {
  const symbols = new Set();
  for (const holding of state.portfolio) {
    if (holding.symbol) {
      symbols.add(holding.symbol);
    }
  }
  for (const symbol of Object.keys(state.history)) {
    symbols.add(symbol);
  }

  const list = [...symbols];
  elements.chartSymbol.innerHTML = "";
  if (!list.length) {
    elements.chartSymbol.innerHTML = `<option value="">No symbols</option>`;
    state.charts.selectedSymbol = "";
    return;
  }

  for (const symbol of list) {
    const option = document.createElement("option");
    option.value = symbol;
    option.textContent = symbol;
    elements.chartSymbol.appendChild(option);
  }

  if (!state.charts.selectedSymbol || !symbols.has(state.charts.selectedSymbol)) {
    state.charts.selectedSymbol = list[0];
  }
  elements.chartSymbol.value = state.charts.selectedSymbol;
}

function buildHistorySeries(symbol, maxPoints) {
  const color = colorForSym(symbol);
  const history = state.history[symbol];
  const points = [];

  if (history?.length) {
    const start = Math.max(0, history.length - maxPoints);
    for (let index = start; index < history.length; index += 1) {
      points.push({ x: index - start, y: Number(history[index].price) });
    }
  } else {
    const base = getLastPrice(symbol) || 100;
    let price = base;
    const count = Math.max(20, Math.min(maxPoints, 80));
    for (let index = 0; index < count; index += 1) {
      price *= 1 + 0.0002 * Math.sin(index / 9) + (Math.random() - 0.5) * 0.002;
      points.push({ x: index, y: price });
    }
  }

  return { label: `${symbol} history`, color, dash: [], points };
}

function getAgentInfluence(symbol) {
  const agent = state.latestDeskOutput || {};
  let dir = 0;
  let strength = 0.35;
  let confidence = 0.55;

  const technical = agent?.agents?.technical;
  if (Array.isArray(technical?.signals)) {
    const signal = technical.signals.find((item) => String(item.symbol).toUpperCase() === symbol.toUpperCase());
    if (signal) {
      if (signal.signal === "bullish") {
        dir += 1;
      }
      if (signal.signal === "bearish") {
        dir -= 1;
      }
      strength = Math.max(strength, Number(signal.strength) || 0.35);
      confidence = Math.max(confidence, Number(technical.confidence) || 0.55);
    }
  }

  const orders = agent?.trader?.orders || [];
  for (const order of orders.filter((item) => item.symbol?.toUpperCase() === symbol.toUpperCase())) {
    dir += order.side === "buy" ? 0.5 : -0.5;
    if (order.urgency === "high") {
      strength += 0.15;
    }
  }

  const sentiment = agent?.agents?.sentiment;
  if (sentiment?.summary) {
    const summary = String(sentiment.summary).toLowerCase();
    if (/bull|optim|constructive/.test(summary)) {
      dir += 0.25;
    }
    if (/bear|pess|fragile|weak/.test(summary)) {
      dir -= 0.25;
    }
    confidence = Math.max(confidence, Number(sentiment.confidence) || 0.55);
  }

  return {
    dir: clamp(dir, -1, 1),
    strength: clamp(strength, 0.05, 1),
    confidence: clamp(confidence, 0.1, 1)
  };
}

function computeProjectionSeries(symbol, minutes, noiseLevel) {
  const last = getLastPrice(symbol) || 100;
  const { dir, strength, confidence } = getAgentInfluence(symbol);
  const color = colorForSym(symbol);
  const riskFactor = state.settings.riskLevel / 10;
  const baseDrift = dir * 0.0008 * strength * (0.5 + riskFactor / 2);
  const noiseAmplitude = noiseLevel === "high" ? 0.003 : noiseLevel === "medium" ? 0.0015 : 0.0007;

  const orders = (state.latestDeskOutput?.trader?.orders || []).filter((item) => item.symbol?.toUpperCase() === symbol.toUpperCase());
  const urgencyBoost = orders.some((item) => item.urgency === "high") ? 0.0006 : 0.0002;
  const sideBoost = orders.reduce((sum, item) => sum + (item.side === "buy" ? 1 : -1), 0) * urgencyBoost;

  const mid = [];
  const upper = [];
  const lower = [];
  let priceMid = last;
  const steps = Math.max(10, Math.min(120, minutes));

  for (let index = 0; index <= steps; index += 1) {
    const micro = index < 5 ? sideBoost * (1 - index / 5) : 0;
    const drift = baseDrift + micro + (Math.random() - 0.5) * noiseAmplitude;
    priceMid *= 1 + drift;
    const band = (0.0008 + 0.0008 * strength) * (1 + index / steps) * (0.5 + confidence / 2);
    mid.push({ x: index, y: priceMid });
    upper.push({ x: index, y: priceMid * (1 + band) });
    lower.push({ x: index, y: priceMid * (1 - band) });
  }

  return {
    mid: { label: `${symbol} projection`, color, dash: [6, 4], points: mid },
    upper: { label: "upper", color: "#5fe1a3", dash: [3, 3], points: upper },
    lower: { label: "lower", color: "#ff8b7c", dash: [3, 3], points: lower }
  };
}

function drawChart(canvas, datasets) {
  const context = canvas.getContext("2d");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.max(600, Math.floor(width));
  canvas.height = Math.max(240, Math.floor(height));

  context.clearRect(0, 0, canvas.width, canvas.height);
  const margin = { left: 50, right: 20, top: 20, bottom: 30 };
  const plotWidth = canvas.width - margin.left - margin.right;
  const plotHeight = canvas.height - margin.top - margin.bottom;

  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;

  for (const dataset of datasets) {
    for (const point of dataset.points) {
      if (point.x < xMin) {
        xMin = point.x;
      }
      if (point.x > xMax) {
        xMax = point.x;
      }
      if (point.y < yMin) {
        yMin = point.y;
      }
      if (point.y > yMax) {
        yMax = point.y;
      }
    }
  }

  if (!Number.isFinite(xMin) || !Number.isFinite(yMin)) {
    return;
  }

  const pad = (yMax - yMin) * 0.08 || 1;
  yMin -= pad;
  yMax += pad;

  const xToPx = (value) => margin.left + (plotWidth * (value - xMin)) / (xMax - xMin || 1);
  const yToPx = (value) => margin.top + plotHeight - (plotHeight * (value - yMin)) / (yMax - yMin || 1);

  context.strokeStyle = "#1f2937";
  context.lineWidth = 1;
  context.setLineDash([]);
  context.beginPath();
  for (let index = 0; index <= 8; index += 1) {
    const x = margin.left + (plotWidth * index) / 8;
    context.moveTo(x, margin.top);
    context.lineTo(x, margin.top + plotHeight);
  }
  for (let index = 0; index <= 5; index += 1) {
    const y = margin.top + (plotHeight * index) / 5;
    context.moveTo(margin.left, y);
    context.lineTo(margin.left + plotWidth, y);
  }
  context.stroke();

  context.fillStyle = "#95a4bf";
  context.font = "12px Aptos, sans-serif";
  context.fillText("Price", 8, margin.top + 12);
  context.fillText("Time", margin.left + plotWidth - 40, margin.top + plotHeight + 24);

  for (let index = 0; index <= 5; index += 1) {
    const value = yMax - (yMax - yMin) * (index / 5);
    const y = margin.top + (plotHeight * index) / 5;
    context.fillText(fmtNumber(value), 6, y + 4);
  }

  for (const dataset of datasets) {
    context.lineWidth = 2;
    context.strokeStyle = dataset.color || "#63d2ff";
    context.setLineDash(dataset.dash || []);
    context.beginPath();
    dataset.points.forEach((point, index) => {
      const x = xToPx(point.x);
      const y = yToPx(point.y);
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();
  }

  const first = datasets[0];
  if (first?.points?.length) {
    const lastPoint = first.points[first.points.length - 1];
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(xToPx(lastPoint.x), yToPx(lastPoint.y), 3, 0, Math.PI * 2);
    context.fill();
  }
}

function renderLegend(datasets) {
  elements.chartLegend.innerHTML = datasets.map((dataset) => {
    const dashed = dataset.dash?.length ? "dashed" : "";
    return `
      <div class="legend-item" style="color:${dataset.color}">
        <span class="legend-dot ${dashed}"></span>
        <span>${escapeHtml(dataset.label)}</span>
      </div>
    `;
  }).join("");
}

function renderChart() {
  syncStateFromInputs();
  elements.chartStatus.textContent = "";
  const symbol = elements.chartSymbol.value;
  if (!symbol) {
    elements.chartStatus.textContent = "Select a symbol.";
    return;
  }

  const historySeries = buildHistorySeries(symbol, Math.max(20, state.charts.historyPoints));
  const projection = computeProjectionSeries(
    symbol,
    Math.min(state.charts.projectionMinutes, state.settings.horizonMinutes),
    state.charts.noiseLevel
  );

  const lastX = historySeries.points.length ? historySeries.points[historySeries.points.length - 1].x : 0;
  const projectionDatasets = ["mid", "upper", "lower"].map((key) => ({
    label: projection[key].label,
    color: projection[key].color,
    dash: projection[key].dash,
    points: projection[key].points.map((point, index) => ({ x: lastX + index, y: point.y }))
  }));

  const datasets = [historySeries, ...projectionDatasets];
  drawChart(elements.priceChart, datasets);
  renderLegend(datasets);
  elements.chartStatus.textContent = `Chart rendered for ${symbol}.`;
}

async function runDeskFlow(prefix = "") {
  setStatus(elements.deskStatus, `${prefix}Running desk...`);

  if (!hasFoundryConfig()) {
    state.latestDeskOutput = buildFallbackDeskOutput();
    state.proposal = {
      orders: state.latestDeskOutput?.trader?.orders || [],
      rationale: state.latestDeskOutput?.trader?.rationale || "Local fallback proposal"
    };
    renderAgentCards();
    renderProposal();
    if (state.charts.autoUpdate) {
      renderChart();
    }
    setStatus(elements.deskStatus, `${prefix}Desk run complete via local demo engine. Add Foundry config to replace this with live model output.`);
    return;
  }

  const payload = collectPayload();
  const data = await apiFetch("/api/desk/run", payload);
  const fallbackOutput = buildFallbackDeskOutput();
  const liveOutput = data.parsed;
  const hasLiveOrders = Array.isArray(liveOutput?.trader?.orders) && liveOutput.trader.orders.length > 0;

  state.latestDeskOutput = liveOutput
    ? {
      ...fallbackOutput,
      ...liveOutput,
      agents: {
        ...fallbackOutput.agents,
        ...(liveOutput.agents || {})
      },
      trader: hasLiveOrders
        ? { ...fallbackOutput.trader, ...liveOutput.trader }
        : fallbackOutput.trader,
      market_view: { ...fallbackOutput.market_view, ...(liveOutput.market_view || {}) },
      meta: { ...fallbackOutput.meta, ...(liveOutput.meta || {}) }
    }
    : fallbackOutput;

  state.proposal = {
    orders: state.latestDeskOutput?.trader?.orders || [],
    rationale: state.latestDeskOutput?.trader?.rationale || fallbackOutput.trader.rationale
  };
  renderAgentCards();
  renderProposal();
  if (state.charts.autoUpdate) {
    renderChart();
  }
  setStatus(
    elements.deskStatus,
    hasLiveOrders
      ? `${prefix}Desk run complete via ${data.transport}.`
      : `${prefix}Desk run complete via ${data.transport}. Proposal updated with the local execution plan.`
  );
}

async function bootstrap() {
  const [health, bootstrapData] = await Promise.all([
    fetch("/api/health").then((response) => response.json()),
    fetch("/api/bootstrap").then((response) => response.json())
  ]);

  state.defaults = bootstrapData.defaults;
  state.samplePortfolio = bootstrapData.samplePortfolio;
  state.sampleNews = bootstrapData.sampleNews;

  elements.projectEndpoint.value = bootstrapData.defaults.projectEndpoint || "";
  elements.deployment.value = bootstrapData.defaults.deployment || "";
  elements.maxOutputTokens.value = bootstrapData.defaults.maxOutputTokens || 8000;
  elements.reasoningEffort.value = bootstrapData.defaults.reasoningEffort || "medium";
  elements.verbosity.value = bootstrapData.defaults.verbosity || "low";
  elements.strategy.value = state.settings.strategy;
  elements.riskLevel.value = state.settings.riskLevel;
  elements.horizonMinutes.value = state.settings.horizonMinutes;
  elements.orderSlicing.value = state.settings.orderSlicing;
  elements.maxOrders.value = state.settings.maxOrders;
  elements.urgencyBias.value = state.settings.urgencyBias;
  elements.historyPoints.value = state.charts.historyPoints;
  elements.projectionMinutes.value = state.charts.projectionMinutes;
  elements.noiseLevel.value = state.charts.noiseLevel;

  loadSamplePortfolio();
  renderNews();
  renderAgentCards();
  renderProposal();
  renderTrades();
  renderChat();
  renderChart();
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
  if (field === "symbol") {
    state.portfolio[index].symbol = String(value).trim().toUpperCase();
  }
  renderPortfolio();
  if (state.charts.autoUpdate) {
    renderChart();
  }
});

elements.portfolioBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-remove]");
  if (!button) {
    return;
  }

  const index = Number(button.dataset.remove);
  const removed = state.portfolio[index];
  state.portfolio.splice(index, 1);
  if (removed?.symbol) {
    delete state.history[removed.symbol];
  }
  renderPortfolio();
  if (state.charts.autoUpdate) {
    renderChart();
  }
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

elements.loadSampleNewsButton.addEventListener("click", () => {
  loadSampleNews();
  setStatus(elements.deskStatus, "Sample news loaded. Select the articles you want to include.");
});

elements.clearNewsButton.addEventListener("click", () => {
  clearNews();
  setStatus(elements.deskStatus, "News selections and custom news input cleared.");
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
  syncStateFromInputs();
  elements.newsAnalysis.textContent = "Analyzing selected and custom news...";
  try {
    setStatus(elements.deskStatus, "Analyzing news...");
    if (!hasFoundryConfig()) {
      state.newsAnalysis = analyzeNewsLocally(state.portfolio);
      elements.newsAnalysis.textContent = formatNewsAnalysis(state.newsAnalysis);
      setStatus(elements.deskStatus, "News analyzed via local demo engine. Add Foundry config for live model analysis.");
      return;
    }

    const payload = collectPayload();
    const data = await apiFetch("/api/news/analyze", payload);
    state.newsAnalysis = data.parsed || analyzeNewsLocally(state.portfolio);
    elements.newsAnalysis.textContent = data.parsed
      ? formatNewsAnalysis(data.parsed)
      : formatNewsAnalysis(state.newsAnalysis);
    setStatus(elements.deskStatus, `News analyzed via ${data.transport}.`);
  } catch (error) {
    state.newsAnalysis = analyzeNewsLocally(state.portfolio);
    elements.newsAnalysis.textContent = formatNewsAnalysis(state.newsAnalysis);
    setStatus(elements.deskStatus, `News API unavailable. Showing local analysis instead. ${error.message}`);
  }
});

elements.runDeskButton.addEventListener("click", async () => {
  try {
    await runDeskFlow();
  } catch (error) {
    setStatus(elements.deskStatus, error.message);
  }
});

elements.nextTickButton.addEventListener("click", async () => {
  try {
    advanceSyntheticMarketTick();
    elements.cash.value = state.cash;
    renderPortfolio();
    if (state.charts.autoUpdate) {
      renderChart();
    }
    if (state.config.projectEndpoint || state.defaults?.projectEndpoint) {
      await runDeskFlow("Tick advanced. ");
    } else {
      setStatus(elements.deskStatus, "Tick advanced. Configure Foundry if you want the agents to rerun.");
    }
  } catch (error) {
    setStatus(elements.deskStatus, error.message);
  }
});

elements.executeProposalButton.addEventListener("click", async () => {
  try {
    await executeProposalFlow(state.proposal, "the blotter proposal");
  } catch (error) {
    setStatus(elements.deskStatus, error.message);
  } finally {
    elements.executeProposalButton.disabled = !(state.proposal?.orders?.length);
  }
});

elements.renderChartButton.addEventListener("click", () => {
  try {
    renderChart();
  } catch (error) {
    setStatus(elements.deskStatus, error.message);
  }
});

elements.autoUpdateChartButton.addEventListener("click", () => {
  state.charts.autoUpdate = !state.charts.autoUpdate;
  elements.autoUpdateChartButton.textContent = state.charts.autoUpdate ? "Auto-update on" : "Auto-update off";
  elements.chartStatus.textContent = state.charts.autoUpdate ? "Chart auto-update enabled." : "Chart auto-update disabled.";
});

elements.chartSymbol.addEventListener("change", () => {
  state.charts.selectedSymbol = elements.chartSymbol.value;
  renderChart();
});

elements.historyPoints.addEventListener("change", renderChart);
elements.projectionMinutes.addEventListener("change", renderChart);
elements.noiseLevel.addEventListener("change", renderChart);

elements.sendChatButton.addEventListener("click", async () => {
  const originalLabel = elements.sendChatButton.textContent;
  try {
    const userText = elements.chatInput.value.trim();
    if (!userText) {
      return;
    }

    syncStateFromInputs();
    state.chatHistory.push({ role: "user", text: userText });
    state.chatHistory.push({ role: "assistant", text: "Writing response...", agent: "desk", pending: true });
    renderChat();
    elements.chatInput.value = "";
    elements.sendChatButton.disabled = true;
    elements.sendChatButton.textContent = "Writing...";
    setStatus(elements.deskStatus, "Desk is writing a response...");

    const payload = {
      ...collectPayload(),
      chatHistory: state.chatHistory.filter((message) => !message.pending),
      preferredAgent: elements.chatAgent.value,
      userText,
      latestDeskOutput: state.latestDeskOutput
    };

    if (!hasFoundryConfig()) {
      const localReply = buildLocalChatReply({
        preferredAgent: elements.chatAgent.value,
        userText
      });
      replaceLastPendingAssistantMessage({
        role: "assistant",
        text: localReply.content,
        agent: localReply.agent || "desk",
        tradeProposal: localReply.trade_proposal || null
      });
      if (localReply.trade_proposal) {
        applyTraderProposal(localReply.trade_proposal, "Trader route");
        renderProposal();
        renderAgentCards();
        setStatus(
          elements.deskStatus,
          localReply.trade_proposal.orders?.length
            ? `Chat updated the execution blotter with ${localReply.trade_proposal.orders.length} proposed order${localReply.trade_proposal.orders.length === 1 ? "" : "s"}.`
            : "Chat generated a local desk response."
        );
      } else {
        setStatus(elements.deskStatus, "Chat generated a local desk response.");
      }
      renderChat();
      return;
    }

    const data = await apiFetch("/api/chat", payload);
    const parsed = data.parsed || buildLocalChatReply({
      preferredAgent: elements.chatAgent.value,
      userText
    });
    replaceLastPendingAssistantMessage({
      role: "assistant",
      text: parsed.content || data.rawText || "No chat response returned.",
      agent: parsed.agent || "desk",
      tradeProposal: parsed.trade_proposal || null
    });

    if (parsed.trade_proposal) {
      applyTraderProposal(parsed.trade_proposal, "Trader route");
      renderProposal();
      renderAgentCards();
      setStatus(
        elements.deskStatus,
        parsed.trade_proposal.orders?.length
          ? `Trader route proposed ${parsed.trade_proposal.orders.length} order${parsed.trade_proposal.orders.length === 1 ? "" : "s"} for execution.`
          : `Desk chat responded via ${data.transport}.`
      );
    } else {
      setStatus(elements.deskStatus, `Desk chat responded via ${data.transport}.`);
    }
    renderChat();
  } catch (error) {
    replaceLastPendingAssistantMessage({
      role: "assistant",
      text: "The desk could not return a live chat response. Try again or use the local desk controls.",
      agent: "desk"
    });
    renderChat();
    setStatus(elements.deskStatus, error.message);
  } finally {
    elements.sendChatButton.disabled = false;
    elements.sendChatButton.textContent = originalLabel;
  }
});

elements.chatMessages.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action='execute-chat-proposal']");
  if (!button) {
    return;
  }

  const messageIndex = Number(button.dataset.messageIndex);
  const message = state.chatHistory[messageIndex];
  if (!message?.tradeProposal?.orders?.length) {
    setStatus(elements.deskStatus, "No chat proposal is available to execute.");
    return;
  }

  try {
    button.disabled = true;
    await executeProposalFlow(message.tradeProposal, "the chat proposal");
  } catch (error) {
    setStatus(elements.deskStatus, error.message);
  } finally {
    button.disabled = false;
    renderChat();
  }
});

elements.chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.sendChatButton.click();
  }
});

bootstrap().catch((error) => {
  setStatus(elements.connectionStatus, error.message);
});
