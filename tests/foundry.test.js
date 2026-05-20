import test from "node:test";
import assert from "node:assert/strict";

import { extractFirstJson, extractModelText } from "../lib/foundry.js";
import { simulateExecution } from "../lib/simulation.js";
import { normalizeProjectEndpoint } from "../lib/validators.js";

test("normalizeProjectEndpoint enforces Microsoft Foundry project endpoint shape", () => {
  const value = normalizeProjectEndpoint("demo-resource.services.ai.azure.com/api/projects/trading-lab/");
  assert.equal(value, "https://demo-resource.services.ai.azure.com/api/projects/trading-lab");
});

test("extractFirstJson pulls the first JSON object out of model text", () => {
  const parsed = extractFirstJson("Here you go {\"agent\":\"risk\",\"confidence\":0.7} trailing text");
  assert.deepEqual(parsed, { agent: "risk", confidence: 0.7 });
});

test("extractModelText handles responses payloads", () => {
  const text = extractModelText({
    output: [
      {
        content: [
          { text: "{\"status\":\"ok\"}" }
        ]
      }
    ]
  });
  assert.equal(text, "{\"status\":\"ok\"}");
});

test("simulateExecution applies buys and cash changes", () => {
  const execution = simulateExecution({
    portfolio: [{ symbol: "NVDA", quantity: 10, price: 220 }],
    cash: 10000,
    costs: { txnCostBps: 2, slippageBps: 6 },
    orders: [{ symbol: "NVDA", side: "buy", quantity: 5, type: "market", urgency: "medium" }]
  });

  const updated = execution.portfolio.find((item) => item.symbol === "NVDA");
  assert.equal(updated.quantity, 15);
  assert.ok(execution.cash < 10000);
  assert.equal(execution.trades.length, 1);
});
