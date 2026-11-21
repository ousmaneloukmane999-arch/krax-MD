const express = require("express");
const pino = require("pino");
const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("KraX-MD is running!");
});

app.listen(PORT, () => {
  console.log("KraX-MD server started");
});

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("KraX-MD connected!");
    }

    if (connection === "close") {
      const status =
        lastDisconnect?.error?.output?.statusCode;

      if (status !== DisconnectReason.loggedOut) {
        console.log("Reconnecting...");
        startBot();
      } else {
        console.log("WhatsApp logged out.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;

      if (!jid || jid === "status@broadcast") continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      const command = text.trim().toLowerCase();

      if (command === ".ping") {
        await sock.sendMessage(jid, {
          text: "🏓 KraX-MD is online!"
        });
      }

      if (command === ".alive") {
        await sock.sendMessage(jid, {
          text: "✅ KraX-MD is alive!"
        });
      }

      if (command === ".owner") {
        await sock.sendMessage(jid, {
          text: "👑 Owner: 𝖑𝖊 𝖌𝖆𝖔𝖙\n📞 +22770246724"
        });
      }

      if (command === ".menu" || command === ".help") {
        await sock.sendMessage(jid, {
          text:
`╭━━〔 𝐊𝐑𝐀𝐗-𝐌𝐃 〕━━╮
┃
┃ 👑 Owner: 𝖑𝖊 𝖌𝖆𝖔𝖙
┃
┣━━〔 INFO 〕
┃ .menu
┃ .ping
┃ .alive
┃ .owner
┃ .help
┃
╰━━━━━━━━━━━━━━━━╯`
        });
      }
    }
  });
}

startBot();