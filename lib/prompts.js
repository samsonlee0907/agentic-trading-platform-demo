function newsDigest(newsItems, freeformNews) {
  const selected = Array.isArray(newsItems) ? newsItems : [];
  const articleBlock = selected.map((item, index) => {
    return [
      `Article ${index + 1}`,
      `Title: ${item.title}`,
      `Date: ${item.date}`,
      `Tickers: ${(item.tickers || []).join(", ") || "none"}`,
      `Market impact: ${item.market_impact}`,
      `Summary: ${item.summary}`,
      `Body: ${item.body}`
    ].join("\n");
  }).join("\n\n");

  const freeform = String(freeformNews ?? "").trim();
  return [articleBlock, freeform ? `Freeform analyst note:\n${freeform}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

function buildSnapshot({ portfolio, cash, costs, settings, newsItems, freeformNews }) {
  return {
    portfolio,
    cash,
    costs_bps: costs,
    strategy: settings.strategy,
    risk_appetite: settings.riskLevel,
    horizon_minutes: settings.horizonMinutes,
    order_slicing: settings.orderSlicing,
    max_orders: settings.maxOrders,
    urgency_bias: settings.urgencyBias,
    available_symbols: portfolio.map((item) => item.symbol),
    latest_news_digest: newsDigest(newsItems, freeformNews)
  };
}

export function buildDeskPrompt(input) {
  const snapshot = buildSnapshot(input);
  const instructions = [
    "You are a disciplined multi-agent trading desk.",
    "You operate as: fundamental analyst, sentiment analyst, technical analyst, risk manager, and trader.",
    "Return strict JSON only. No markdown. No commentary outside the JSON.",
    "Respect risk constraints, portfolio context, market microstructure, and slippage.",
    "Use only symbols that already exist in available_symbols."
  ].join(" ");

  const schema = {
    market_view: {
      regime: "risk_on|risk_off|mixed",
      key_drivers: ["string"],
      confidence: "0-1"
    },
    agents: {
      fundamental: { summary: "string", confidence: "0-1" },
      sentiment: { summary: "string", confidence: "0-1" },
      technical: {
        summary: "string",
        signals: [{ symbol: "string", signal: "bullish|bearish|neutral", strength: "0-1" }],
        confidence: "0-1"
      },
      risk: {
        limits: {
          max_position_per_symbol_pct: "number",
          max_gross_exposure_pct: "number",
          stop_loss_pct: "number"
        },
        notes: "string"
      }
    },
    trader: {
      strategy: "execution|rebalance|risk_reduction|hold",
      orders: [{
        symbol: "string",
        side: "buy|sell",
        quantity: "integer",
        type: "market|limit",
        limit_price: "number|null",
        urgency: "low|medium|high",
        slice: {
          pieces: "integer",
          interval_seconds: "integer"
        },
        rationale: "string"
      }],
      rationale: "string"
    },
    meta: {
      confidence: "0-1",
      horizon_minutes: "integer"
    }
  };

  const userText = [
    "Market snapshot:",
    JSON.stringify(snapshot, null, 2),
    "",
    "Required output schema:",
    JSON.stringify(schema, null, 2)
  ].join("\n");

  return { instructions, userText };
}

export function buildNewsPrompt({ newsItems, freeformNews, settings }) {
  const instructions = [
    "You are a trading sentiment and catalyst parser.",
    "Return strict JSON only.",
    "Assess the combined news tape and infer directional bias for the tracked portfolio.",
    "Schema:",
    "{\"sentiment\":\"bullish|bearish|neutral\",\"confidence\":0.0,\"summary\":\"string\",\"watchlist\":[\"SYMBOL\"]}"
  ].join(" ");

  const userText = JSON.stringify({
    news_digest: newsDigest(newsItems, freeformNews),
    horizon_minutes: settings.horizonMinutes,
    risk_appetite: settings.riskLevel
  }, null, 2);

  return { instructions, userText };
}

export function buildChatPrompt({
  portfolio,
  cash,
  costs,
  settings,
  newsItems,
  freeformNews,
  chatHistory,
  preferredAgent,
  userText,
  latestDeskOutput
}) {
  const instructions = [
    "You are a multi-agent trading assistant with roles: fundamental, sentiment, technical, risk, trader.",
    "Respond in strict JSON.",
    "Envelope:",
    "{\"agent\":\"fundamental|sentiment|technical|risk|trader\",\"content\":\"string\",\"confidence\":0.0,\"trade_proposal\":{\"orders\":[],\"rationale\":\"string\"}}",
    "Only include trade_proposal when the selected or routed agent is trader."
  ].join(" ");

  const promptPayload = {
    preferred_agent: preferredAgent,
    context: buildSnapshot({ portfolio, cash, costs, settings, newsItems, freeformNews }),
    latest_desk_output: latestDeskOutput || null,
    history: chatHistory,
    user_request: userText
  };

  return {
    instructions,
    userText: JSON.stringify(promptPayload, null, 2)
  };
}
