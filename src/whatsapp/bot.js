import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import { AUTH_DIR } from '../config.js';
import { handleMessage } from '../core/brain.js';
import { getWhatsAppSettings } from '../core/settings.js';

// WhatsApp JIDs carry a ":<deviceId>" suffix on multi-device accounts (e.g.
// "123@s.whatsapp.net" vs "123:5@s.whatsapp.net") — strip it so "is this me?" comparisons
// aren't fooled by which linked device sent/received the message.
function normalizeJid(jid) {
  return jid ? jid.replace(/:\d+(?=@)/, '') : jid;
}

function extractText(msg) {
  const m = msg.message;
  if (!m) return null;
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || null;
}

class WhatsAppManager extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
    this.state = 'disconnected'; // disconnected | connecting | qr_pending | pairing_code_pending | connected
    this.qrDataUrl = null;
    this.pairingCode = null;
    this.phoneNumber = null;
    this.lastError = null;
    this._starting = false;
    this._loggedUnlistedGroups = new Set();
  }

  hasExistingSession() {
    try {
      return fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
    } catch {
      return false;
    }
  }

  status() {
    return {
      state: this.state,
      qrDataUrl: this.qrDataUrl,
      pairingCode: this.pairingCode,
      phoneNumber: this.phoneNumber,
      lastError: this.lastError,
    };
  }

  setState(state, extra = {}) {
    this.state = state;
    Object.assign(this, extra);
    this.emit('update', this.status());
  }

  /** method: 'auto' (silent resume, only if a session is already saved) | 'qr' | 'pairing' (needs phoneNumber) */
  async start({ method = 'auto', phoneNumber } = {}) {
    if (this._starting) return this.status();
    if (method === 'auto' && !this.hasExistingSession()) return this.status();
    this._starting = true;
    this.lastError = null;
    this.setState('connecting', { qrDataUrl: null, pairingCode: null });

    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();
      const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Androg', 'Chrome', '1.0.0'],
      });
      this.sock = sock;
      sock.ev.on('creds.update', saveCreds);
      let pairingRequested = false;

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // The socket only accepts requestPairingCode() once it's reached this point in
        // the handshake (calling it right after makeWASocket fails with "Connection
        // Closed") — so we piggyback the request on the same signal that would
        // otherwise show a QR code, and just never render that QR in pairing mode.
        if (qr && method === 'pairing' && phoneNumber && !pairingRequested && !sock.authState.creds.registered) {
          pairingRequested = true;
          try {
            const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
            this.setState('pairing_code_pending', { pairingCode: code });
          } catch (err) {
            this._starting = false;
            this.lastError = `Couldn't request a pairing code: ${err.message}`;
            this.setState('disconnected');
          }
        } else if (qr && method !== 'pairing') {
          console.log('\nScan this QR code with WhatsApp (Linked Devices):\n');
          qrcodeTerminal.generate(qr, { small: true });
          const qrDataUrl = await QRCode.toDataURL(qr).catch(() => null);
          this.setState('qr_pending', { qrDataUrl });
        }

        if (connection === 'open') {
          this._starting = false;
          const me = sock.user?.id ? normalizeJid(sock.user.id).split('@')[0] : null;
          this.setState('connected', { qrDataUrl: null, pairingCode: null, phoneNumber: me });
          console.log('WhatsApp connected.');
        } else if (connection === 'close') {
          this._starting = false;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          this.setState('disconnected', { phoneNumber: null });
          console.log(`WhatsApp connection closed (code ${statusCode}).${loggedOut ? ' Logged out — link again from the web UI.' : ' Reconnecting...'}`);
          if (!loggedOut) setTimeout(() => this.start({ method: 'auto' }), 2000);
        }
      });

      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const ownJid = sock.user?.id ? normalizeJid(sock.user.id) : null;

        for (const msg of messages) {
          if (!msg.message) continue;
          const jid = msg.key.remoteJid;
          if (!jid) continue;

          const { mode, allowedGroups } = getWhatsAppSettings();
          const isGroup = jid.endsWith('@g.us');

          if (isGroup) {
            // Groups are opt-in only, and only ever reply to other people in them, never
            // to the owner's own messages (that would be a normal outgoing group message).
            if (msg.key.fromMe) continue;
            if (!allowedGroups.includes(jid)) {
              if (!this._loggedUnlistedGroups.has(jid)) {
                this._loggedUnlistedGroups.add(jid);
                console.log(`(group "${jid}" is not in the allowlist yet — add it in the web UI's WhatsApp tab to let the bot reply here)`);
              }
              continue;
            }
          } else if (mode === 'self') {
            // "Self" mode: this is the owner's everyday number. The bot must never
            // interject in a real conversation with a contact — it only ever responds
            // in the "Message Yourself" thread (remoteJid === the account's own JID,
            // sent by the account itself).
            const isSelfChat = normalizeJid(jid) === ownJid;
            if (!isSelfChat || !msg.key.fromMe) continue;
          } else {
            // "Dedicated" mode: this number exists only to be the bot, so anyone
            // messaging it 1:1 gets a reply; ignore its own outgoing messages.
            if (msg.key.fromMe) continue;
          }

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
    } catch (err) {
      this._starting = false;
      this.lastError = err.message;
      this.setState('disconnected');
    }

    return this.status();
  }

  async logout() {
    if (this.sock) await this.sock.logout().catch(() => {});
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    this.sock = null;
    this.setState('disconnected', { phoneNumber: null, qrDataUrl: null, pairingCode: null });
  }
}

export const whatsapp = new WhatsAppManager();

/** Called at boot: reconnects silently if a session was already linked, otherwise waits
 * for the web UI to kick off pairing (QR or phone code). */
export async function initWhatsApp() {
  if (whatsapp.hasExistingSession()) {
    await whatsapp.start({ method: 'auto' });
  }
}
