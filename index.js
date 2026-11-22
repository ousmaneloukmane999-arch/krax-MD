const express = require("express");
const pino = require("pino");
const path = require("path");
const fs = require("fs");

const baileys = require("@whiskeysockets/baileys");
const makeWASocket = baileys.default || baileys;

const {
  useMultiFileAuthState,
  DisconnectReason
} = baileys;

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_NAME = "KraX-MD";
const OWNER_NAME = "𝖑𝖊 𝖌𝖆𝖔𝖙";

const OWNER_NUMBER = process.env.OWNER_NUMBER || "";
const PAIRING_ADMIN_KEY = process.env.PAIRING_ADMIN_KEY || "";

const SESSION_DIR = process.env.AUTH_DIR || "./sessions";

const PREFIXES = [".", "!", "/", "#"];

const sessions = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

fs.mkdirSync(SESSION_DIR, { recursive: true });

// HEALTH
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    bot: BOT_NAME,
    sessions: sessions.size
  });
});

// Vérification clé admin
function checkAdmin(req) {
  return (
    PAIRING_ADMIN_KEY &&
    req.headers["x-admin-key"] === PAIRING_ADMIN_KEY
  );
}

// PAIRING MULTI-SESSION
app.post("/api/pair", async (req, res) => {
  try {
    if (!checkAdmin(req)) {
      return res.status(401).json({
        success: false,
        message: "Clé admin incorrecte"
      });
    }

    let number = String(req.body.number || "")
      .replace(/\D/g, "");

    if (!/^\d{8,15}$/.test(number)) {
      return res.status(400).json({
        success: false,
        message: "Numéro invalide"
      });
    }

    let session = sessions.get(number);

    if (session?.sock?.authState?.creds?.registered) {
      return res.json({
        success: true,
        message: "Ce numéro est déjà connecté"
      });
    }

    if (session?.pairing) {
      return res.status(429).json({
        success: false,
        message: "Pairing déjà en cours"
      });
    }

    if (!session) {
      session = {
        sock: null,
        pairing: false,
        reconnecting: false
      };

      sessions.set(number, session);
    }

    session.pairing = true;

    await startSession(number);

    const sock = session.sock;

    if (!sock) {
      throw new Error("Socket non disponible");
    }

    const code = await sock.requestPairingCode(number);

    session.pairing = false;

    res.json({
      success: true,
      number,
      pairingCode: code,
      message: "Entre ce code dans WhatsApp"
    });

  } catch (error) {
    console.error("Pairing error:", error.message);

    res.status(500).json({
      success: false,
      message: "Erreur de pairing"
    });
  }
});

// DÉMARRER UNE SESSION
async function startSession(number) {
  let session = sessions.get(number);

  if (!session) {
    session = {
      sock: null,
      pairing: false,
      reconnecting: false
    };

    sessions.set(number, session);
  }

  const authPath = path.join(SESSION_DIR, number);

  fs.mkdirSync(authPath, { recursive: true });

  const { state, saveCreds } =
    await useMultiFileAuthState(authPath);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  session.sock = sock;

  sock.authState = state;

  sock.ev.on("creds.update", saveCreds);

  // CONNECTION
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log(`KraX-MD connected: ${number}`);
      session.reconnecting = false;
    }

    if (connection === "close") {
      const status =
        lastDisconnect?.error?.output?.statusCode;

      if (status === DisconnectReason.loggedOut) {
        console.log(`Session logged out: ${number}`);
        sessions.delete(number);
        return;
      }

      if (!session.reconnecting) {
        session.reconnecting = true;

        setTimeout(async () => {
          try {
            await startSession(number);
          } catch (error) {
            console.error(error.message);
          }

          session.reconnecting = false;
        }, 5000);
      }
    }
  });

  // MESSAGES
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;

        const jid = msg.key.remoteJid;

        if (!jid || jid === "status@broadcast") continue;

        const message = msg.message;

        const text =
          message.conversation ||
          message.extendedTextMessage?.text ||
          message.imageMessage?.caption ||
          message.videoMessage?.caption ||
          "";

        if (!text) continue;

        const body = text.trim();

        const prefix = PREFIXES.find(p =>
          body.startsWith(p)
        );

        if (!prefix) continue;

        const args = body
          .slice(prefix.length)
          .trim()
          .split(/\s+/);

        const command = args.shift()?.toLowerCase();

        if (command === "ping") {
          await sock.sendMessage(jid, {
            text: "🏓 KraX-MD is online!"
          });
        }

        else if (command === "alive") {
          await sock.sendMessage(jid, {
            text: "✅ KraX-MD is alive!"
          });
        }

        else if (command === "owner") {
          await sock.sendMessage(jid, {
            text:
`╭━━〔 𝐊𝐑𝐀𝐗-𝐌𝐃 〕━━╮
┃ 👑 Owner: ${OWNER_NAME}
┃ 📞 Number: ${OWNER_NUMBER ? "+" + OWNER_NUMBER : "Not configured"}
╰━━━━━━━━━━━━━━━━╯`
          });
        }

        else if (command === "info") {
          await sock.sendMessage(jid, {
            text:
`🤖 Bot: ${BOT_NAME}
👑 Creator: ${OWNER_NAME}
⚙️ Prefixes: . ! / #
📡 Status: Online`
          });
        }

        else if (
          command === "menu" ||
          command === "help"
        ) {
          await sock.sendMessage(jid, {
            text:
`╭━━〔 𝐊𝐑𝐀𝐗-𝐌𝐃 〕━━╮
┃ 👑 Owner: ${OWNER_NAME}
┃ ⚙️ Prefix: . ! / #
┣━━〔 COMMANDS 〕
┃ .menu
┃ .ping
┃ .alive
┃ .owner
┃ .info
┃ .help
╰━━━━━━━━━━━━━━━━╯`
          });
        }

      } catch (error) {
        console.error("Message error:", error.message);
      }
    }
  });
}

// SERVER
app.listen(PORT, () => {
  console.log(`${BOT_NAME} server started on port ${PORT}`);
});