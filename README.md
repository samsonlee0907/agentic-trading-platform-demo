# Agentic Trading Platform Demo

This repo turns the original downloaded single-file trading demo into a share-ready project:

- static frontend plus local Node backend
- Microsoft Foundry project endpoint configuration
- GPT-5-series support through `responses` first and `chat/completions` fallback
- richer market fixtures for portfolio and news testing
- environment-based secrets instead of browser-side direct Azure calls

## Quick start

1. Copy `.env.example` to `.env`
2. Set your Foundry values
3. Start the app

```bash
npm start
```

4. Open `http://127.0.0.1:3000`

## Required environment

```text
FOUNDRY_PROJECT_ENDPOINT=https://<resource>.services.ai.azure.com/api/projects/<project-name>
FOUNDRY_API_KEY=<key>
FOUNDRY_MODEL_DEPLOYMENT=gpt-5-mini
```

The server appends `/openai/v1` to the project endpoint and uses:

- `/responses` when available
- `/chat/completions` as a compatibility fallback

## Scripts

- `npm start`
- `npm run dev`
- `npm run lint`
- `npm test`

## Notes

- This is a simulator, not a brokerage integration.
- Bundled articles are paraphrased fixtures intended for testing prompt behavior.
- The UI can use server-side env secrets or request-scoped overrides from the form.
