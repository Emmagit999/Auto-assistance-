# Androg

A code assistant that runs inside Termux. Chat with it over WhatsApp or a small local web UI.
Paste code (fenced or not) and it will:

1. detect the language,
2. save the snippet,
3. check if the runtime/compiler is already on the device,
4. if not, **web-search** how to install it and install it via Termux's package manager,
5. run or compile it,
6. paste back the raw output (success or error log),
7. have AI explain what happened.

Chat AI, code detection, install-package selection, and result explanations all go through
**OpenRouter**, rotating live across its free (`:free`) models — if one is rate-limited or down,
the next free model is tried automatically. The free model list is fetched from OpenRouter's API
at runtime (not hardcoded), so it stays current as free offerings change.

## Design notes

- **No native/compiled dependencies.** Everything (Baileys, Express, cheerio, pino) is pure JS, and
  snippet/session storage is a flat JSON file — not sqlite — specifically so a fresh Termux install
  doesn't need a C toolchain just to run `npm install`.
- **WhatsApp via Baileys** (unofficial, QR-login, free). This is a gray area under WhatsApp's ToS —
  fine for personal use, but heavy automated traffic risks the number getting flagged.
- **Web search via DuckDuckGo HTML scraping** — no API key, but can break if DuckDuckGo changes its
  markup; it's only used as a fallback for languages outside the built-in runtime map.
- **No API key is ever hardcoded or committed.** The web UI's setup screen is the intended way to
  configure your OpenRouter key — it's saved to `data/settings.json` (gitignored) at runtime, not
  baked into the repo, an env var, or install.sh. This means anyone can clone/install this exact
  repo and bring their own key.
- **Install commands are never AI-generated shell strings.** For known languages the package name
  comes from a static map in `src/config.js`. For unknown ones, the AI is only allowed to return a
  single package-name token (regex-validated), and it's passed to `pkg install` / `apt-get install`
  via `spawn()` with an argv array — never through a shell — so there's no command-injection path
  from search results or model output.

## Install (one command, in Termux)

```sh
curl -fsSL https://raw.githubusercontent.com/Emmagit999/Auto-assistance-/main/install.sh | bash
```

This installs Node/git/clang via `pkg`, clones the repo to `~/androg`, and runs `npm install`.
It does **not** ask for or store any API key — that happens in the app itself, on purpose, so no
one's personal key ever gets hardcoded or committed to this repo.

Then:

```sh
cd ~/androg
npm start
```

- The web UI comes up at `http://localhost:3000` (open it in the phone's browser, or from another
  device on the same network via the phone's LAN IP). **First run shows a one-time setup screen**
  asking for a free OpenRouter key (https://openrouter.ai/keys, no card required) — paste it in,
  it's tested live against OpenRouter and saved locally to `data/settings.json` (gitignored, never
  committed). From then on chat and code features "just work".
- A QR code also prints in the terminal for WhatsApp — open WhatsApp → **Linked Devices** → **Link
  a device** and scan it. The session is saved under `data/whatsapp-auth`, so you only do this
  once. If you message the bot before finishing the web setup, it'll just tell you to go do that.
- By default the bot only replies in 1:1 chats, not groups (see `replyInGroups` option in
  `src/whatsapp/bot.js`).

<details>
<summary>Manual setup instead</summary>

```sh
pkg update && pkg upgrade
pkg install nodejs git clang -y
git clone https://github.com/Emmagit999/Auto-assistance-.git androg
cd androg
npm install
npm start
```
</details>

## Supported languages out of the box

Python, JavaScript/Node, Bash, C, C++, Java, Go, Rust, Ruby, PHP — see `LANGUAGES` in
`src/config.js` to add more (just needs a check command, a Termux package name, and a run/compile
step).

## Project layout

```
src/
  config.js          language map, env, data paths
  ai/openrouter.js    free-model rotation client
  ai/prompts.js       system prompts
  core/brain.js        orchestrates detect -> save -> install -> run -> explain
  core/codeDetect.js   fenced-block + heuristic + AI code detection
  core/storage.js       flat JSON session/snippet store
  core/settings.js      runtime-writable API key store (web UI setup writes here)
  exec/envCheck.js      "is this runtime installed?" checks
  exec/installer.js     safe, argv-array package installs
  exec/runner.js         compile/run with timeout, isolated per-run workdir
  search/duckduckgo.js   no-key web search
  whatsapp/bot.js         Baileys connection + message loop
  web/server.js + public/  local chat UI + setup screen
install.sh             one-command Termux/Debian installer (no key handling)
```

## Notes / limits

- Free OpenRouter models are rate-limited (20 req/min, 50/day without $10+ in account credit) — if
  you hit that during a chat burst, add a small credit balance to OpenRouter to raise it, or wait.
- Code execution runs directly on the device with your Termux user's permissions — treat pasted
  code the same as any script you'd run yourself.
