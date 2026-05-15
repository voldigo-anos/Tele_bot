const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const moment = require("moment-timezone");

module.exports = {
  nix: {
    name: "x",
    aliases: ["xvid", "video"],
    version: "2.1.0",
    author: "Christus",
    role: 2,
    category: "media",
    description: "Recherche et téléchargement de vidéos.",
    cooldown: 5,
    guide: "{p}x <recherche>"
  },

  async onStart({ bot, chatId, args, msg }) {
    const query = args.join(" ");

    if (!query) {
      return bot.sendMessage(
        chatId,
        "❌ Veuillez entrer un texte de recherche."
      );
    }

    try {
      const waitMsg = await bot.sendMessage(
        chatId,
        "🔍 Recherche des vidéos en cours..."
      );

      const res = await axios.get(
        `https://x-search-api-sagor.vercel.app/sagor?apikey=sagor&q=${encodeURIComponent(query)}`,
        {
          timeout: 30000
        }
      );

      let results = res.data.data || [];

      results = results.filter(item => {
        const title = (item.title || "").toLowerCase();

        if (
          title.includes("sex") ||
          title.includes("porn") ||
          title.includes("xxx")
        ) return false;

        const duration = (item.duration || "").toLowerCase();

        if (duration.includes("min")) {
          const min = parseInt(duration);
          return min <= 10;
        }

        if (duration.includes("sec")) {
          return true;
        }

        return false;
      });

      const list = results.slice(0, 6);

      if (list.length === 0) {
        await bot.deleteMessage(
          chatId,
          waitMsg.message_id
        );

        return bot.sendMessage(
          chatId,
          "❌ Aucun résultat trouvé."
        );
      }

      const cacheDir = path.join(__dirname, "cache");
      fs.ensureDirSync(cacheDir);

      const time = moment()
        .tz("Africa/Abidjan")
        .format("DD/MM/YYYY HH:mm");

      const thumbs = [];

      for (const item of list) {
        if (!item.thumbnail) continue;

        try {
          const thumbPath = path.join(
            cacheDir,
            `thumb_${Date.now()}_${thumbs.length}.jpg`
          );

          const img = await axios({
            url: item.thumbnail,
            method: "GET",
            responseType: "stream",
            timeout: 30000
          });

          const writer = fs.createWriteStream(
            thumbPath
          );

          img.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
          });

          thumbs.push(thumbPath);

        } catch (e) {
          console.log(e);
        }
      }

      await bot.deleteMessage(
        chatId,
        waitMsg.message_id
      );

      if (thumbs.length > 0) {
        const mediaGroup = thumbs.map(thumb => ({
          type: "photo",
          media: thumb
        }));

        await bot.sendMediaGroup(
          chatId,
          mediaGroup
        );
      }

      let text =
        `📹 𝗫 𝗩𝗶𝗱𝗲𝗼 𝗦𝗲𝗮𝗿𝗰𝗵\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `👤 ${msg.from.first_name || "Utilisateur"}\n` +
        `🕒 ${time}\n` +
        `🔎 ${query}\n\n` +
        `🎯 Sélectionnez une vidéo\n\n`;

      for (let i = 0; i < list.length; i++) {
        const item = list[i];

        text +=
          `📍 ${i + 1}. ${item.title}\n` +
          `⏱️ ${item.duration}\n\n`;
      }

      text +=
        `━━━━━━━━━━━━━━\n` +
        `💬 Répondez avec un nombre entre 1 et ${list.length}\n` +
        `⏰ Temps : 30 secondes`;

      const replyMsg = await bot.sendMessage(
        chatId,
        text,
        {
          reply_to_message_id: msg.message_id
        }
      );

      thumbs.forEach(thumb => {
        try {
          fs.unlinkSync(thumb);
        } catch {}
      });

      global.teamnix = global.teamnix || {};
      global.teamnix.replies =
        global.teamnix.replies || new Map();

      global.teamnix.replies.set(
        replyMsg.message_id,
        {
          commandName: "x",
          type: "x_reply",
          authorId: msg.from.id,
          results: list,
          searchQuery: query
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
            "⏰ Temps écoulé ! Veuillez relancer la commande."
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
        data.type !== "x_reply" ||
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
          "❌ Sélection invalide."
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
        `🎬 ${selected.title}\n` +
        `⏱️ ${selected.duration}`
      );

      const res = await axios.get(
        `https://x-down-api-sagor.vercel.app/sagor?apikey=sagor&q=${encodeURIComponent(selected.url)}`,
        {
          timeout: 30000
        }
      );

      const videoData = res.data.data;

      const videoUrl =
        videoData?.downloads?.[0]?.url;

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
        `x_${Date.now()}.mp4`
      );

      const response = await axios({
        url: videoUrl,
        method: "GET",
        responseType: "stream",
        timeout: 30000
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
            `✅ Téléchargement réussi !\n\n` +
            `🎬 ${videoData.title}\n` +
            `⏱️ ${videoData.duration || "Inconnue"}`
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
