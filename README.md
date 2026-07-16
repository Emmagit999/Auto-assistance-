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

It also has a personality in plain chat (warm, a little sassy) that drops away the moment code,
output, or an explanation is involved — accuracy over charm there.

Beyond the core loop, the web UI has:
- **Multiple chats** — a sidebar with "+ New chat", each thread with its own history/memory.
- **A dashboard** — messages sent, snippets run, success rate, a language breakdown, and a 14-day
  activity chart, all from real local usage stats.
- **Practice mode** — AI writes you a live coding challenge based on languages/snippets you've
  actually run before, you write the code in-browser, it runs and gets graded with feedback.
- **A WhatsApp tab** — connect via QR *or* a phone-number pairing code (WhatsApp → Linked Devices →
  Link with phone number), pick self vs. dedicated mode, and manage the group allowlist.

And the app **updates itself**: every 5 minutes it checks the GitHub repo for new commits, and if
one's there, pulls, reinstalls dependencies if `package.json` changed, and restarts itself in place.

## Design notes

- **No native/compiled dependencies.** Everything (Baileys, Express, cheerio, pino) is pure JS, and
  snippet/session storage is a flat JSON file — not sqlite — specifically so a fresh Termux install
  doesn't need a C toolchain just to run `npm install`.
- **WhatsApp via Baileys** (unofficial, free), pairing by QR *or* phone-number code. This is a gray
  area under WhatsApp's ToS — fine for personal use, but heavy automated traffic risks the number
  getting flagged.
- **WhatsApp defaults are strict on purpose.** "Self" mode (default) only ever replies in the
  account's own "Message Yourself" thread (`remoteJid === own JID && fromMe`) — it never talks to
  your real contacts. "Dedicated" mode is for a number that exists solely to be the bot. Groups are
  opt-in only, empty allowlist by default; an unlisted group's JID gets logged to the console (once)
  so you can copy it into the allowlist instead of the bot silently guessing consent.
- **Self-updating.** `src/core/updater.js` polls `git fetch` every 5 minutes; on a new commit it
  does a fast-forward-only pull (never force, never touches uncommitted local changes), reinstalls
  npm deps only if `package.json`/`package-lock.json` changed, then respawns itself detached and
  exits — the new process picks up right where the old one left off (WhatsApp/session state persists
  on disk). No-ops entirely if it's not running from a git checkout.
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
- Open the **WhatsApp tab** to link it: scan the QR code, or switch to "Enter phone number" for a
  pairing code instead (enter it under WhatsApp → Linked Devices → Link with phone number). The
  session is saved under `data/whatsapp-auth`, so you only pair once — it auto-reconnects on every
  future start. If you message the bot before finishing web setup, it'll just tell you to go do that.
- WhatsApp starts in **self mode** (only replies in your own "Message Yourself" thread) with groups
  off. Switch modes or allow specific groups from the same tab.

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
  ai/prompts.js       system prompts (chat personality, detection, install, explain, practice)
  core/brain.js         orchestrates detect -> save -> install -> run -> explain
  core/codeDetect.js    fenced-block + heuristic + AI code detection
  core/storage.js        flat JSON store: sessions/chats, snippets, clients, usage stats
  core/settings.js       runtime-writable API key + WhatsApp mode/group settings
  core/practice.js       generates + grades live-coding challenges from session history
  core/updater.js         git-poll auto-updater, self-respawn on new commits
  exec/envCheck.js      "is this runtime installed?" checks
  exec/installer.js     safe, argv-array package installs
  exec/runner.js         compile/run with timeout, isolated per-run workdir
  search/duckduckgo.js   no-key web search
  whatsapp/bot.js         Baileys connection manager: QR + pairing code, mode/group gating
  web/server.js + public/  chat UI (multi-chat, dashboard, practice, WhatsApp tab), setup screen
install.sh             one-command Termux/Debian installer (no key handling)
```

## Notes / limits

- Free OpenRouter models are rate-limited (20 req/min, 50/day without $10+ in account credit) — if
  you hit that during a chat burst, add a small credit balance to OpenRouter to raise it, or wait.
- Code execution runs directly on the device with your Termux user's permissions — treat pasted
  code the same as any script you'd run yourself.
- When the auto-updater restarts the app, it respawns as a detached background process and exits
  the one you started with `npm start` — so your terminal prompt may return even though Androg is
  still running. For long unattended sessions, run it inside `tmux`/`screen` so you can reattach.
