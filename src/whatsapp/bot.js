import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import { AUTH_DIR } from '../config.js';
import { handleMessage } from '../core/brain.js';

function extractText(msg) {
  const m = msg.message;
  if (!m) return null;
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || null;
}

/**
 * Starts the WhatsApp connection. Scan the printed QR once; the session is then
 * persisted under data/whatsapp-auth so future runs reconnect automatically.
 * By default only replies in 1:1 chats (skips groups, JIDs ending in @g.us) so it
 * doesn't turn into an unsolicited group bot.
 */
export async function startWhatsApp({ replyInGroups = false } = {}) {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Androg', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\nScan this QR code with WhatsApp (Linked Devices):\n');
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log(`WhatsApp connection closed (code ${statusCode}).${loggedOut ? ' Logged out — delete data/whatsapp-auth and re-scan.' : ' Reconnecting...'}`);
      if (!loggedOut) startWhatsApp({ replyInGroups });
    } else if (connection === 'open') {
      console.log('WhatsApp connected.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid) continue;
      if (jid.endsWith('@g.us') && !replyInGroups) continue;

      const text = extractText(msg);
      if (!text) continue;

      try {
        await sock.sendPresenceUpdate('composing', jid);
        const replies = await handleMessage(jid, text, 'whatsapp');
        for (const reply of replies) {
          await sock.sendMessage(jid, { text: reply });
        }
      } catch (err) {
        console.error('Error handling WhatsApp message:', err);
        await sock.sendMessage(jid, { text: `⚠️ Something went wrong: ${err.message}` }).catch(() => {});
      }
    }
  });

  return sock;
}
