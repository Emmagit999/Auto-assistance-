import { config } from './config.js';
import { isConfigured } from './core/settings.js';
import { startAutoUpdateLoop } from './core/updater.js';
import { startWebServer } from './web/server.js';
import { initWhatsApp } from './whatsapp/bot.js';

if (!isConfigured()) {
  console.warn(
    `⚠️  No OpenRouter API key yet — open the web UI (http://localhost:${config.webPort}) and ` +
      'paste a free key from https://openrouter.ai/keys to finish setup.'
  );
}

startWebServer();
initWhatsApp().catch((err) => {
  console.error('Failed to resume WhatsApp connection:', err);
});
startAutoUpdateLoop();
