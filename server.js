import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadDotEnv, getServerDefaults } from "./lib/env.js";
import { callFoundryModel, extractFirstJson } from "./lib/foundry.js";
import { buildChatPrompt, buildDeskPrompt, buildNewsPrompt } from "./lib/prompts.js";
import { simulateExecution, summarizePortfolio } from "./lib/simulation.js";
import {
  mergeConnectionConfig,
  sanitizeCash,
  sanitizeChatHistory,
  sanitizeCosts,
  sanitizePortfolio,
  sanitizeRiskSettings
} from "./lib/validators.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadDotEnv(__dirname);

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const serverDefaults = getServerDefaults();
const samplePortfolio = JSON.parse(await readFile(path.join(rootDir, "data", "sample-portfolio.json"), "utf8"));
const sampleNews = JSON.parse(await readFile(path.join(rootDir, "data", "sample-news.json"), "utf8"));

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function parseBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw new Error("Request body too large.");
    }
    chunks.push(chunk);
  }

  const rawText = Buffer.concat(chunks).toString("utf8");
  return rawText ? JSON.parse(rawText) : {};
}

function toSelectedNews(ids) {
  if (!Array.isArray(ids)) {
    return [];
  }

  const idSet = new Set(ids.map((item) => String(item)));
  return sampleNews.filter((item) => idSet.has(item.id));
}

async function runPrompt(builder, payload) {
  const config = mergeConnectionConfig(payload.config, serverDefaults);
  const portfolio = sanitizePortfolio(payload.portfolio);
  const cash = sanitizeCash(payload.cash);
  const costs = sanitizeCosts(payload.costs);
  const settings = sanitizeRiskSettings(payload.settings);
  const newsItems = toSelectedNews(payload.newsIds);
  const freeformNews = String(payload.freeformNews ?? "").trim();

  const prompt = builder({
    portfolio,
    cash,
    costs,
    settings,
    newsItems,
    freeformNews,
    chatHistory: sanitizeChatHistory(payload.chatHistory),
    preferredAgent: payload.preferredAgent,
    userText: payload.userText,
    latestDeskOutput: payload.latestDeskOutput
  });

  const modelResult = await callFoundryModel({
    config,
    instructions: prompt.instructions,
    userText: prompt.userText
  });

  return {
    config,
    portfolio,
    cash,
    costs,
    settings,
    newsItems,
    freeformNews,
    modelResult,
    parsed: extractFirstJson(modelResult.text)
  };
}

async function serveStatic(request, response, pathname) {
  const filePath = pathname === "/"
    ? path.join(publicDir, "index.html")
    : path.join(publicDir, pathname.replace(/^\/+/, ""));

  if (!filePath.startsWith(publicDir)) {
    json(response, 403, { ok: false, error: "Forbidden." });
    return;
  }

  try {
    const file = await readFile(filePath);
    const extension = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream"
    });
    response.end(file);
  } catch {
    json(response, 404, { ok: false, error: "Not found." });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      json(response, 200, {
        ok: true,
        defaultDeployment: serverDefaults.deployment,
        hasServerKey: Boolean(serverDefaults.apiKey),
        hasProjectEndpoint: Boolean(serverDefaults.projectEndpoint)
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      json(response, 200, {
        ok: true,
        defaults: {
          projectEndpoint: serverDefaults.projectEndpoint,
          deployment: serverDefaults.deployment,
          maxOutputTokens: serverDefaults.maxOutputTokens,
          reasoningEffort: serverDefaults.reasoningEffort,
          verbosity: serverDefaults.verbosity,
          hasServerKey: Boolean(serverDefaults.apiKey)
        },
        samplePortfolio,
        sampleNews
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/ping") {
      const payload = await parseBody(request);
      const config = mergeConnectionConfig(payload.config, serverDefaults);
      const result = await callFoundryModel({
        config,
        instructions: "Return strict JSON only in the form {\"status\":\"ok\",\"model\":\"string\"}.",
        userText: "Health check. Confirm the deployment is reachable."
      });

      json(response, 200, {
        ok: true,
        transport: result.transport,
        rawText: result.text,
        parsed: extractFirstJson(result.text)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/news/analyze") {
      const payload = await parseBody(request);
      const result = await runPrompt(buildNewsPrompt, payload);
      json(response, 200, {
        ok: true,
        transport: result.modelResult.transport,
        rawText: result.modelResult.text,
        parsed: result.parsed
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/desk/run") {
      const payload = await parseBody(request);
      const result = await runPrompt(buildDeskPrompt, payload);
      const summary = summarizePortfolio({
        portfolio: result.portfolio,
        cash: result.cash
      });

      json(response, 200, {
        ok: true,
        transport: result.modelResult.transport,
        rawText: result.modelResult.text,
        parsed: result.parsed,
        portfolioSummary: summary
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      const payload = await parseBody(request);
      const result = await runPrompt(buildChatPrompt, payload);
      json(response, 200, {
        ok: true,
        transport: result.modelResult.transport,
        rawText: result.modelResult.text,
        parsed: result.parsed
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/simulate/execute") {
      const payload = await parseBody(request);
      const portfolio = sanitizePortfolio(payload.portfolio);
      const cash = sanitizeCash(payload.cash);
      const costs = sanitizeCosts(payload.costs);
      const execution = simulateExecution({
        portfolio,
        cash,
        costs,
        orders: Array.isArray(payload.orders) ? payload.orders : []
      });

      json(response, 200, {
        ok: true,
        ...execution
      });
      return;
    }

    await serveStatic(request, response, url.pathname);
  } catch (error) {
    json(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected server error."
    });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Agentic Trading Platform Demo listening on http://127.0.0.1:${port}`);
});
