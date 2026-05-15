const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const moment = require("moment-timezone");

module.exports = {
  nix: {
    name: "hentai",
    aliases: ["hnt", "sfm"],
    version: "1.0.0",
    author: "Christus",
    role: 0,
    category: "nsfw",
    description: "Vidéo hentai aléatoire.",
    cooldown: 5,
    guide: "{p}hentai"
  },

  async onStart({ bot, chatId, msg }) {
    try {
      const waitMsg = await bot.sendMessage(
        chatId,
        "🔞 Chargement des vidéos hentai..."
      );

      const res = await axios.get(
        "https://uraryanapi.onrender.com/api/hentai",
        {
          timeout: 30000
        }
      );

      const data = Object.values(res.data).filter(
        item =>
          typeof item === "object" &&
          item.title &&
          item.video_1
      );

      if (!data.length) {
        await bot.deleteMessage(
          chatId,
          waitMsg.message_id
        );

        return bot.sendMessage(
          chatId,
          "❌ Aucun résultat trouvé."
        );
      }

      const list = data.slice(0, 6);

      const time = moment()
        .tz("Africa/Abidjan")
        .format("DD/MM/YYYY HH:mm");

      let text =
        `🔞 𝗛𝗲𝗻𝘁𝗮𝗶 𝗩𝗶𝗱𝗲𝗼𝘀\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `👤 ${msg.from.first_name || "Utilisateur"}\n` +
        `🕒 ${time}\n\n` +
        `🎯 Sélectionnez une vidéo\n\n`;

      for (let i = 0; i < list.length; i++) {
        const item = list[i];

        text +=
          `📍 ${i + 1}. ${item.title}\n` +
          `👁️ ${item.views_count}\n` +
          `📂 ${item.category}\n\n`;
      }

      text +=
        `━━━━━━━━━━━━━━\n` +
        `💬 Répondez avec un nombre entre 1 et ${list.length}\n` +
        `⏰ Temps : 30 secondes`;

      await bot.deleteMessage(
        chatId,
        waitMsg.message_id
      );

      const replyMsg = await bot.sendMessage(
        chatId,
        text,
        {
          reply_to_message_id: msg.message_id
        }
      );

      global.teamnix = global.teamnix || {};
      global.teamnix.replies =
        global.teamnix.replies || new Map();

      global.teamnix.replies.set(
        replyMsg.message_id,
        {
          type: "hentai_reply",
          authorId: msg.from.id,
          results: list
        }
      );

      setTimeout(async () => {
        if (
          global.teamnix.replies.has(
            replyMsg.message_id
          )
        ) {
          global.teamnix.replies.delete(
            replyMsg.message_id
          );

          bot.sendMessage(
            chatId,
            "⏰ Temps écoulé."
          );
        }
      }, 30000);

    } catch (error) {
      console.error(error);

      bot.sendMessage(
        chatId,
        "❌ Erreur API."
      );
    }
  },

  async onReply({
    bot,
    chatId,
    msg,
    replyMsg,
    data
  }) {
    try {
      if (
        data.type !== "hentai_reply" ||
        msg.from.id !== data.authorId
      ) return;

      const choice = parseInt(msg.text);

      if (
        isNaN(choice) ||
        choice < 1 ||
        choice > data.results.length
      ) {
        return bot.sendMessage(
          chatId,
          "❌ Numéro invalide."
        );
      }

      const selected =
        data.results[choice - 1];

      global.teamnix.replies.delete(
        replyMsg.message_id
      );

      const loadingMsg = await bot.sendMessage(
        chatId,
        `⏳ Téléchargement de la vidéo...\n\n` +
        `🎬 ${selected.title}`
      );

      const videoUrl =
        selected.video_1 || selected.video_2;

      if (!videoUrl) {
        await bot.deleteMessage(
          chatId,
          loadingMsg.message_id
        );

        return bot.sendMessage(
          chatId,
          "❌ Impossible de récupérer la vidéo."
        );
      }

      const tempPath = path.join(
        __dirname,
        `hentai_${Date.now()}.mp4`
      );

      const response = await axios({
        url: videoUrl,
        method: "GET",
        responseType: "stream",
        timeout: 60000
      });

      const writer = fs.createWriteStream(
        tempPath
      );

      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      await bot.sendVideo(
        chatId,
        tempPath,
        {
          caption:
            `🔞 ${selected.title}\n` +
            `👁️ ${selected.views_count}\n` +
            `📂 ${selected.category}`
        }
      );

      await bot.deleteMessage(
        chatId,
        loadingMsg.message_id
      );

      try {
        await bot.deleteMessage(
          chatId,
          replyMsg.message_id
        );
      } catch {}

      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

    } catch (error) {
      console.error(error);

      bot.sendMessage(
        chatId,
        "❌ Échec du téléchargement."
      );
    }
  }
};
