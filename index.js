const express = require("express");
const pino = require("pino");

const baileys = require("@whiskeysockets/baileys");

const makeWASocket = baileys.default || baileys;

const {
  useMultiFileAuthState,
  DisconnectReason
} = baileys;

const app = express();

const PORT = process.env.PORT || 3000;

// Informations du bot
const BOT_NAME = "KraX-MD";
const OWNER_NAME = "𝖑𝖊 𝖌𝖆𝖔𝖙";

// Numéro à configurer dans Render
const OWNER_NUMBER = process.env.OWNER_NUMBER || "";

// Numéro WhatsApp à connecter
const PAIRING_NUMBER = process.env.PAIRING_NUMBER || "";

// Dossier de session
const SESSION_DIR = process.env.AUTH_DIR || "./session";

// Serveur web
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>KraX-MD</title>
      </head>
      <body style="background:#111;color:white;text-align:center;padding:50px">
        <h1>𝐊𝐑𝐀𝐗-𝐌𝐃</h1>
        <p>WhatsApp Bot is running</p>
        <p>Created by ${OWNER_NAME}</p>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    bot: BOT_NAME
  });
});

app.listen(PORT, () => {
  console.log(`${BOT_NAME} web server started on port ${PORT}`);
});

// Préfixes autorisés
const PREFIXES = [".", "!", "/", "#"];

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

    let pairingRequested = false;

    // Sauvegarde de la session
    sock.ev.on("creds.update", saveCreds);

    // Connexion WhatsApp
    sock.ev.on("connection.update", async (update) => {
      const {
        connection,
        qr,
        lastDisconnect
      } = update;

      // Génération du code Pairing
      if (
        qr &&
        !state.creds.registered &&
        !pairingRequested
      ) {
        pairingRequested = true;

        if (!PAIRING_NUMBER) {
          console.log("PAIRING_NUMBER is missing in Render.");
          return;
        }

        try {
          await new Promise(resolve =>
            setTimeout(resolve, 1500)
          );

          const code =
            await sock.requestPairingCode(PAIRING_NUMBER);

          console.log("================================");
          console.log("KraX-MD Pairing Code:");
          console.log(code);
          console.log("================================");
        } catch (error) {
          console.error("Pairing error:", error.message);
          pairingRequested = false;
        }
      }

      // Connexion réussie
      if (connection === "open") {
        console.log("KraX-MD connected to WhatsApp!");
        reconnecting = false;
      }

      // Connexion fermée
      if (connection === "close") {
        const status =
          lastDisconnect?.error?.output?.statusCode;

        if (status === DisconnectReason.loggedOut) {
          console.log("WhatsApp logged out.");
          console.log("A new pairing is required.");
          return;
        }

        if (!reconnecting) {
          reconnecting = true;

          console.log("Connection closed.");
          console.log("Reconnecting in 5 seconds...");

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
          if (!msg.message) continue;
          if (msg.key.fromMe) continue;

          const jid = msg.key.remoteJid;

          if (!jid || jid === "status@broadcast") {
            continue;
          }

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

          const args = body.slice(prefix.length).trim().split(/\s+/);

          const command = args.shift()?.toLowerCase();

          // .ping
          if (command === "ping") {
            await sock.sendMessage(jid, {
              text: "🏓 KraX-MD is online!"
            });
          }

          // .alive
          else if (command === "alive") {
            await sock.sendMessage(jid, {
              text: "✅ KraX-MD is alive!"
            });
          }

          // .owner
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

          // .info
          else if (command === "info") {
            await sock.sendMessage(jid, {
              text:
`🤖 Bot: ${BOT_NAME}
👑 Creator: ${OWNER_NAME}
⚙️ Prefixes: . ! / #
📡 Status: Online`
            });
          }

          // .menu
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
          console.error("Message error:", error.message);
        }
      }
    });

  } catch (error) {
    console.error("Bot startup error:", error.message);

    setTimeout(() => {
      startBot();
    }, 10000);
  }
}

startBot();