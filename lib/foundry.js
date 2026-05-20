function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildBaseUrl(projectEndpoint) {
  return `${projectEndpoint}/openai/v1`;
}

function buildHeaders(apiKey) {
  if (!apiKey) {
    throw new Error("An API key is required. Set FOUNDRY_API_KEY or provide a request override.");
  }

  return {
    "Content-Type": "application/json",
    "api-key": apiKey
  };
}

function stripCodeFence(text) {
  return String(text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export function extractFirstJson(text) {
  const cleaned = stripCodeFence(text);
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace < 0) {
    return null;
  }

  let depth = 0;
  for (let index = firstBrace; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return safeJsonParse(cleaned.slice(firstBrace, index + 1));
      }
    }
  }

  return safeJsonParse(cleaned);
}

export function extractModelText(payload) {
  if (!payload) {
    return "";
  }

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (Array.isArray(payload.output)) {
    const chunks = [];
    for (const item of payload.output) {
      if (Array.isArray(item?.content)) {
        for (const content of item.content) {
          if (typeof content?.text === "string") {
            chunks.push(content.text);
          }
        }
      }
    }
    if (chunks.length) {
      return chunks.join("\n").trim();
    }
  }

  if (Array.isArray(payload.choices)) {
    return String(payload.choices[0]?.message?.content ?? "").trim();
  }

  return "";
}

function shouldFallback(status, bodyText) {
  if (![400, 404, 405].includes(status)) {
    return false;
  }

  const haystack = bodyText.toLowerCase();
  return [
    "responses",
    "not found",
    "route",
    "unsupported",
    "unknown path"
  ].some((token) => haystack.includes(token));
}

function shouldRetryWithoutOptionalControls(status, bodyText) {
  if (status !== 400) {
    return false;
  }

  const haystack = bodyText.toLowerCase();
  return [
    "reasoning",
    "verbosity",
    "\"text\"",
    "unrecognized request argument"
  ].some((token) => haystack.includes(token));
}

async function postJson(url, headers, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const bodyText = await response.text();
  const bodyJson = safeJsonParse(bodyText);

  return {
    ok: response.ok,
    status: response.status,
    bodyText,
    bodyJson
  };
}

export async function callFoundryModel({
  config,
  instructions,
  userText
}) {
  const headers = buildHeaders(config.apiKey);
  const baseUrl = buildBaseUrl(config.projectEndpoint);

  const responsesBody = {
    model: config.deployment,
    instructions,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: userText
          }
        ]
      }
    ],
    max_output_tokens: config.maxOutputTokens
  };

  if (config.reasoningEffort && config.reasoningEffort !== "off") {
    responsesBody.reasoning = { effort: config.reasoningEffort };
  }

  if (config.verbosity && config.verbosity !== "off") {
    responsesBody.text = { verbosity: config.verbosity };
  }

  let responsesResult = await postJson(`${baseUrl}/responses`, headers, responsesBody);
  if (
    shouldRetryWithoutOptionalControls(responsesResult.status, responsesResult.bodyText) &&
    (responsesBody.reasoning || responsesBody.text)
  ) {
    delete responsesBody.reasoning;
    delete responsesBody.text;
    responsesResult = await postJson(`${baseUrl}/responses`, headers, responsesBody);
  }

  if (responsesResult.ok) {
    return {
      transport: "responses",
      raw: responsesResult.bodyJson,
      text: extractModelText(responsesResult.bodyJson)
    };
  }

  if (!shouldFallback(responsesResult.status, responsesResult.bodyText)) {
    throw new Error(`Foundry responses call failed (${responsesResult.status}): ${responsesResult.bodyText}`);
  }

  const chatBody = {
    model: config.deployment,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: userText }
    ],
    max_completion_tokens: config.maxOutputTokens
  };

  const chatResult = await postJson(`${baseUrl}/chat/completions`, headers, chatBody);
  if (!chatResult.ok) {
    throw new Error(`Foundry chat fallback failed (${chatResult.status}): ${chatResult.bodyText}`);
  }

  return {
    transport: "chat_completions",
    raw: chatResult.bodyJson,
    text: extractModelText(chatResult.bodyJson)
  };
}
