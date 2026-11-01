const axios = require("axios");
const moment = require("moment-timezone");

const API_ENDPOINT = "https://darkgpt-api.vercel.app/api/chat";

const nix = {
  name: "darkgpt",
  version: "1.0.0",
  aliases: ["dark"],
  description: "Chat with Dark AI (unfiltered responses)",
  author: "Christus",
  prefix: false,
  category: "ai",
  type: "anyone",
  cooldown: 5,
  guide: "{p}dark <your message>",
};

async function onStart({ bot, message, chatId, args, event }) {
  const input = args.join(" ").trim();
  const userId = event?.senderID || chatId;

  if (!input) {
    return message.reply("🌑 Ask Dark a question...");
  }

  const timestamp = moment()
    .tz("Asia/Manila")
    .format("MMMM D, YYYY h:mm A");

  const waitMsg = await message.reply(
    `🌑 Dark is thinking...\n━━━━━━━━━━━━━━━\n📅 ${timestamp}`
  );

  try {
    const res = await axios.post(
      API_ENDPOINT,
      {
        uid: userId,
        message: input,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      }
    );

    const reply = res.data?.reply || res.data?.response || "✅ Dark has responded.";
    const safeReply = reply.length > 4000 ? reply.slice(0, 4000) + "…" : reply;

    await bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});

    await message.reply(
      `🌑 *Dark AI*\n━━━━━━━━━━━━━━━\n${safeReply}`,
      { parse_mode: "Markdown" }
    ).catch(() => message.reply(safeReply));

  } catch (err) {
    console.error("Dark AI Error:", err.message);

    await bot.editMessageText(
      "❌ Dark is temporarily unavailable.",
      {
        chat_id: chatId,
        message_id: waitMsg.message_id,
      }
    ).catch(() => {});
  }
}

module.exports = { nix, onStart };
