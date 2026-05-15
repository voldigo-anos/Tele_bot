const axios = require("axios");

const nix = {
  name: "alldl",
  version: "1.0.0",
  aliases: ["dl", "download"],
  author: "Christus",
  prefix: true,
  category: "media",
  role: 0,
  cooldown: 3,
  description: "Fast universal downloader (FB, TikTok, IG, YouTube)",
  guide: "{p}alldl <url> ou envoyer un lien directement"
};

async function downloadVideo(bot, msg, chatId, url) {
  try {
    const wait = await bot.sendMessage(chatId, "📥 Téléchargement en cours...", {
      reply_to_message_id: msg.message_id
    });

    const apiUrl =
      `https://azadx69x-alldl-cdi-bai.vercel.app/alldl?url=${encodeURIComponent(url)}&quality=sd`;

    const res = await axios.get(apiUrl, {
      responseType: "stream",
      timeout: 60000
    });

    if (!res.data) throw new Error("Empty response");

    const text =
`╭〔 𝗔𝗟𝗟𝗗𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘 〕
├‣ ✅ Download finished
╰‣ ⚡ NIX BOT`;

    await bot.sendMessage(chatId, {
      body: text,
      attachment: res.data
    }, {
      reply_to_message_id: msg.message_id
    });

    await bot.deleteMessage(chatId, wait.message_id);

  } catch (err) {
    console.log("ALDL ERROR:", err.message);

    return bot.sendMessage(chatId,
      "❌ Download failed",
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function onStart({ bot, msg, chatId, args }) {
  let url = args.join(" ").trim();

  if (!url) {
    return bot.sendMessage(chatId,
      "❌ Veuillez fournir un lien valide.",
      { reply_to_message_id: msg.message_id }
    );
  }

  const valid = ["facebook", "fb.watch", "tiktok", "instagram", "youtu"];

  if (!valid.some(v => url.includes(v))) {
    return bot.sendMessage(chatId,
      "❌ Lien non supporté.",
      { reply_to_message_id: msg.message_id }
    );
  }

  await downloadVideo(bot, msg, chatId, url);
}

async function onChat({ bot, msg, chatId }) {
  const text = msg.text || "";
  const match = text.match(/https?:\/\/\S+/i);

  if (!match) return;

  const url = match[0];

  const valid = ["facebook", "fb.watch", "tiktok", "instagram", "youtu"];

  if (!valid.some(v => url.includes(v))) return;

  await downloadVideo(bot, msg, chatId, url);
}

module.exports = { nix, onStart, onChat };
