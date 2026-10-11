# AGENTS.md

## Project Context

This is a Base44 app repository. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for local setup, environment variables, and publish workflow.

## Base44 References

- CLI overview: https://docs.base44.com/developers/references/cli/get-started/overview.md
- Agent skills: https://docs.base44.com/developers/backend/overview/skills.md

If your agent supports Agent Skills, install or update Base44 skills before Base44-specific work:

```bash
npx skills add base44/skills
```

## Key Files

- `src/`: frontend application source.
- `src/api/base44Client.js`: frontend Base44 SDK client.
- `vite.config.js`: Vite config and Base44 Vite plugin setup.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `base44 dev` as the default local development command when you need the local Base44 backend. It can run the backend and frontend together.
- When docs or code mention the frontend being started automatically, that usually means the Base44 project config includes `site.serveCommand`, for example `"serveCommand": "npm run dev"` in `base44/config.jsonc`.
- Use `npm run dev` only for frontend-only work against the hosted Base44 backend.
- Prefer the existing Base44 CLI workflow over adding new npm scripts for Base44-specific tasks.
- Reuse the existing SDK client and Vite plugin patterns before adding new Base44 integration paths.
- Run the relevant checks from `package.json` before finishing code changes.

## Running in the Base44 sandbox (`docker-compose.base44.yml`)

The sandbox runs this app with `docker compose -f docker-compose.base44.yml up -d --build`,
which serves the UI at `http://localhost:3000`.

- The service is a plain `node:22` image with the repo bind-mounted at `/app`; startup runs
  `npm install` (there is no lockfile in the repo, so install rather than `ci`) and then
  `npm run dev -- --host 0.0.0.0 --port 5173`. Vite runs from the cloned source, so edits
  hot-reload; dependency or `vite.config.js` changes need `docker compose -f
  docker-compose.base44.yml restart web` (startup reinstalls on each boot).
- `base44 dev` (the README's default) is NOT usable here: it needs `base44 login` +
  `base44 link` (interactive) and Deno, and it needs the app published. The compose file
  therefore runs the frontend-only path described in `README.md`.
- Host allowlist: Vite blocks unknown hosts. The platform sets
  `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.e2b.app` in the sandbox and compose passes it
  through, which covers the preview proxy host. No `vite.config.js` change is needed for
  this; do not add `server.allowedHosts: true`.
- This frontend has no local backend: it talks to the hosted Base44 app through the SDK.
  It needs `VITE_BASE44_APP_ID` and `VITE_BASE44_APP_BASE_URL` (delivered by the platform
  in `/run/base44/app.env`, the last `env_file:` entry in compose). Without them Vite logs
  `[base44] No Base44 backend configured` and every `/api` request (e.g.
  `/api/apps/public/prod/public-settings/by-id/undefined`) returns 404, so the app can only
  render the login screen. With them, `/api` is proxied to the hosted app and the ERP works.
- Verify a boot with: `docker compose -f docker-compose.base44.yml ps`,
  `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/`, and
  `docker compose -f docker-compose.base44.yml logs -f web` (a healthy boot shows
  `VITE v8.x ready`; a configured backend additionally logs `[base44] Proxy enabled: /api -> ...`).
- The two env values above are necessary but not sufficient: the hosted backend only answers
  once the app has been deployed. The SDK always calls
  `/api/apps/public/prod/public-settings/by-id/<app-id>` (the `prod` segment is hardcoded, and
  there is no dev/staging variant), and for an app that has never been published it answers
  `403` with `extra_data.reason = "not_deployed"` ("This app is not yet available"). Check with
  `curl -s https://app.base44.com/api/apps/public/prod/public-settings/by-id/<app-id>`. So a
  usable sandbox preview needs the two secrets **and** at least one deploy from the dashboard
  (`base44 dashboard open`, see `README.md`); before that the app can only render the login
  screen and the console shows `Request failed with status code 404`.
