function clampNumber(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, numeric));
}

export function normalizeProjectEndpoint(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw new Error("Project endpoint is required.");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const normalized = withProtocol.replace(/\/+$/, "");
  const parsed = new URL(normalized);

  if (!/services\.ai\.azure\.com$/i.test(parsed.hostname)) {
    throw new Error("Use a Microsoft Foundry project endpoint hosted on services.ai.azure.com.");
  }

  if (!/\/api\/projects\/[^/]+$/i.test(parsed.pathname)) {
    throw new Error("Project endpoint must look like https://<resource>.services.ai.azure.com/api/projects/<project-name>.");
  }

  return normalized;
}

export function mergeConnectionConfig(inputConfig, serverDefaults) {
  const projectEndpoint = inputConfig?.projectEndpoint || serverDefaults.projectEndpoint;
  const apiKey = inputConfig?.apiKey || serverDefaults.apiKey;
  const deployment = String(inputConfig?.deployment || serverDefaults.deployment || "").trim();

  if (!deployment) {
    throw new Error("Model deployment is required.");
  }

  return {
    projectEndpoint: normalizeProjectEndpoint(projectEndpoint),
    apiKey: String(apiKey ?? "").trim(),
    deployment,
    maxOutputTokens: clampNumber(
      inputConfig?.maxOutputTokens ?? serverDefaults.maxOutputTokens,
      1400,
      128,
      4000
    ),
    reasoningEffort: String(inputConfig?.reasoningEffort || serverDefaults.reasoningEffort || "minimal").trim(),
    verbosity: String(inputConfig?.verbosity || serverDefaults.verbosity || "low").trim()
  };
}

export function sanitizePortfolio(holdings) {
  if (!Array.isArray(holdings) || !holdings.length) {
    throw new Error("At least one portfolio row is required.");
  }

  return holdings.map((row, index) => {
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    const quantity = Number(row.quantity);
    const price = Number(row.price);

    if (!symbol) {
      throw new Error(`Holding ${index + 1} is missing a symbol.`);
    }
    if (!Number.isFinite(quantity)) {
      throw new Error(`Holding ${symbol} has an invalid quantity.`);
    }
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Holding ${symbol} has an invalid price.`);
    }

    return {
      symbol,
      quantity,
      price
    };
  });
}

export function sanitizeCosts(costs) {
  return {
    txnCostBps: clampNumber(costs?.txnCostBps, 2, 0, 100),
    slippageBps: clampNumber(costs?.slippageBps, 6, 0, 250)
  };
}

export function sanitizeCash(value) {
  return clampNumber(value, 0, -1000000000, 1000000000);
}

export function sanitizeRiskSettings(settings) {
  return {
    strategy: String(settings?.strategy || "multi_agent").trim() || "multi_agent",
    riskLevel: clampNumber(settings?.riskLevel, 6, 1, 10),
    horizonMinutes: clampNumber(settings?.horizonMinutes, 120, 5, 1440),
    orderSlicing: String(settings?.orderSlicing || "auto").trim() || "auto",
    maxOrders: clampNumber(settings?.maxOrders, 8, 1, 25),
    urgencyBias: String(settings?.urgencyBias || "medium").trim() || "medium"
  };
}

export function sanitizeChatHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .slice(-12)
    .map((item) => ({
      role: item.role,
      text: String(item.text ?? "").trim(),
      agent: item.agent ? String(item.agent).trim().toLowerCase() : ""
    }))
    .filter((item) => item.text);
}
