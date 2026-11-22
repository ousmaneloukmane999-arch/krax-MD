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
const SESSION_DIR = process.env.AUTH_DIR || "./session";

const PREFIXES = [".", "!", "/", "#"];

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    bot: BOT_NAME
  });
});

app.listen(PORT, () => {
  console.log(`${BOT_NAME} server started on port ${PORT}`);
});

let reconnecting = false;

async function startBot() {
  try {
    const { state, saveCreds } =
      await useMultiFileAuthState(SESSION_DIR);

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

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
          return;
        }

        if (!reconnecting) {
          reconnecting = true;

          setTimeout(() => {
            reconnecting = false;
            startBot();
          }, 5000);
        }
      }
    });

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
          const prefix = PREFIXES.find(p => body.startsWith(p));

          if (!prefix) continue;

          const args = body.slice(prefix.length).trim().split(/\s+/);
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
┃
┃ 👑 Owner: ${OWNER_NAME}
┃ 📞 Number: ${OWNER_NUMBER ? "+" + OWNER_NUMBER : "Not configured"}
┃
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

          else if (command === "menu" || command === "help") {
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
          console.error("Message error:", error.message);
        }
      }
    });

  } catch (error) {
    console.error("Bot startup error:", error.message);

    setTimeout(startBot, 10000);
  }
}

startBot();