const express = require("express");
const pino = require("pino");
const path = require("path");

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
const PAIRING_NUMBER = process.env.PAIRING_NUMBER || "";
const PAIRING_ADMIN_KEY = process.env.PAIRING_ADMIN_KEY || "";

const SESSION_DIR = process.env.AUTH_DIR || "./session";

const PREFIXES = [".", "!", "/", "#"];

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Variables du bot
let sock = null;
let reconnecting = false;
let pairingInProgress = false;

// Page de santé
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    bot: BOT_NAME
  });
});

// Vérification de la clé secrète
function checkAdminKey(req) {
  const key = req.headers["x-admin-key"];

  if (!PAIRING_ADMIN_KEY || !key) {
    return false;
  }

  return key === PAIRING_ADMIN_KEY;
}

// Endpoint de pairing
app.post("/api/pair", async (req, res) => {
  try {
    if (!checkAdminKey(req)) {
      return res.status(401).json({
        success: false,
        message: "Clé secrète incorrecte."
      });
    }

    if (!PAIRING_NUMBER) {
      return res.status(400).json({
        success: false,
        message: "PAIRING_NUMBER non configuré."
      });
    }

    if (!sock) {
      return res.status(503).json({
        success: false,
        message: "Le bot démarre. Réessaie dans quelques secondes."
      });
    }

    if (sock.authState.creds.registered) {
      return res.status(400).json({
        success: false,
        message: "KraX-MD est déjà connecté."
      });
    }

    if (pairingInProgress) {
      return res.status(429).json({
        success: false,
        message: "Une demande de pairing est déjà en cours."
      });
    }

    pairingInProgress = true;

    const number = PAIRING_NUMBER.replace(/\D/g, "");

    const code = await sock.requestPairingCode(number);

    return res.json({
      success: true,
      bot: BOT_NAME,
      pairingCode: code,
      message: "Entre ce code dans WhatsApp."
    });

  } catch (error) {
    console.error("Pairing error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Impossible de générer le code de pairing."
    });

  } finally {
    pairingInProgress = false;
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`${BOT_NAME} server started on port ${PORT}`);
});

// Démarrage WhatsApp
async function startBot() {
  try {
    const { state, saveCreds } =
      await useMultiFileAuthState(SESSION_DIR);

    const socket = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

    sock = socket;

    // Permet à l'endpoint de vérifier l'état de connexion
    sock.authState = state;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        console.log(`${BOT_NAME} connected to WhatsApp`);

        reconnecting = false;
      }

      if (connection === "close") {
        const status =
          lastDisconnect?.error?.output?.statusCode;

        if (status === DisconnectReason.loggedOut) {
          console.log("WhatsApp logged out. Pairing required.");
          sock = null;
          return;
        }

        if (!reconnecting) {
          reconnecting = true;
          sock = null;

          setTimeout(() => {
            reconnecting = false;
            startBot();
          }, 5000);
        }
      }
    });

    // Réception des messages
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

          // PING
          if (command === "ping") {
            await sock.sendMessage(jid, {
              text: "🏓 KraX-MD is online!"
            });
          }

          // ALIVE
          else if (command === "alive") {
            await sock.sendMessage(jid, {
              text: "✅ KraX-MD is alive!"
            });
          }

          // OWNER
          else if (command === "owner") {
            await sock.sendMessage(jid, {
              text:
`╭━━〔 𝐊𝐑𝐀𝐗-𝐌𝐃 〕━━╮
┃
┃ 👑 Owner: ${OWNER_NAME}
┃ 📞 Number: ${OWNER_NUMBER ? "+" + OWNER_NUMBER : "Not configured"}
┃
╰━━━━━━━━━━━━━━━━╯`
            });
          }

          // INFO
          else if (command === "info") {
            await sock.sendMessage(jid, {
              text:
`🤖 Bot: ${BOT_NAME}
👑 Creator: ${OWNER_NAME}
⚙️ Prefixes: . ! / #
📡 Status: Online`
            });
          }

          // MENU
          else if (
            command === "menu" ||
            command === "help"
          ) {
            await sock.sendMessage(jid, {
              text:
`╭━━〔 𝐊𝐑𝐀𝐗-𝐌𝐃 〕━━╮
┃
┃ 👑 Owner: ${OWNER_NAME}
┃ ⚙️ Prefix: . ! / #
┃
┣━━〔 INFO 〕
┃ .menu
┃ .ping
┃ .alive
┃ .owner
┃ .info
┃ .help
┃
╰━━━━━━━━━━━━━━━━╯`
            });
          }

        } catch (error) {
          console.error(
            "Message error:",
            error.message
          );
        }
      }
    });

  } catch (error) {
    console.error(
      "Bot startup error:",
      error.message
    );

    setTimeout(startBot, 10000);
  }
}

startBot();