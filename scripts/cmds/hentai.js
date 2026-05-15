const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const moment = require("moment-timezone");

const nix = {
  name: "hentai",
  version: "13.0.0",
  aliases: [],
  description: "Recherche et téléchargement vidéo",
  author: "Christus",
  prefix: true,
  category: "media",
  role: 0,
  cooldown: 10,
  guide: "{p}x"
};

async function streamFromURL(url) {
  const response = await axios({
    url,
    responseType: "stream"
  });

  return response.data;
}

function buildMessage(list, userName) {
  const time = moment()
    .tz("Africa/Abidjan")
    .format("DD/MM/YYYY HH:mm:ss");

  let text =
`🔞 𝗫 𝗩𝗶𝗱𝗲𝗼𝘀
━━━━━━━━━━━━━━

👤 ${userName}
🕒 ${time}

🎬 Résultats disponibles :

`;

  for (let i = 0; i < list.length; i++) {
    const item = list[i];

    text +=
`${i + 1}. ${item.title}
👁️ ${item.views_count || "Inconnue"}

`;
  }

  text +=
`━━━━━━━━━━━━━━
💬 Répondez avec un nombre entre 1 et ${list.length}`;

  return text;
}

async function onStart({
  bot,
  msg,
  chatId
}) {
  const userId = msg.from.id;

  const userName =
    msg.from.first_name ||
    msg.from.username ||
    "Utilisateur";

  let loadingMsg;

  try {
    loadingMsg = await bot.sendMessage(
      chatId,
      "🔍 Chargement des vidéos...",
      {
        reply_to_message_id: msg.message_id
      }
    );

    const res = await axios.get(
      "https://uraryanapi.onrender.com/api/hentai"
    );

    const rawData = res.data;

    const results = Object.keys(rawData)
      .filter(key => !isNaN(key))
      .map(key => rawData[key])
      .filter(item => item.video_1);

    const list = results.slice(0, 10);

    if (list.length === 0) {
      await bot.deleteMessage(
        chatId,
        loadingMsg.message_id
      );

      return bot.sendMessage(
        chatId,
        "❌ Aucun résultat trouvé.",
        {
          reply_to_message_id: msg.message_id
        }
      );
    }

    const cacheDir = path.join(
      __dirname,
      "cache"
    );

    await fs.ensureDir(cacheDir);

    const mediaGroup = [];

    for (let i = 0; i < list.length; i++) {
      try {
        const thumbUrl =
          `https://picsum.photos/seed/${i}/500/300`;

        const imgPath = path.join(
          cacheDir,
          `thumb_${Date.now()}_${i}.jpg`
        );

        const stream = await streamFromURL(
          thumbUrl
        );

        const writer = fs.createWriteStream(
          imgPath
        );

        stream.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
        });

        mediaGroup.push({
          type: "photo",
          media: imgPath
        });

      } catch (e) {}
    }

    await bot.deleteMessage(
      chatId,
      loadingMsg.message_id
    );

    if (mediaGroup.length > 0) {
      await bot.sendMediaGroup(
        chatId,
        mediaGroup,
        {
          reply_to_message_id:
            msg.message_id
        }
      );
    }

    const sentMsg = await bot.sendMessage(
      chatId,
      buildMessage(list, userName),
      {
        reply_to_message_id:
          msg.message_id
      }
    );

    mediaGroup.forEach(media => {
      try {
        if (
          fs.existsSync(media.media)
        ) {
          fs.unlinkSync(media.media);
        }
      } catch {}
    });

    global.teamnix.replies.set(
      sentMsg.message_id,
      {
        nix,
        type: "x_reply",
        authorId: userId,
        list
      }
    );

    setTimeout(() => {
      if (
        global.teamnix.replies.has(
          sentMsg.message_id
        )
      ) {
        global.teamnix.replies.delete(
          sentMsg.message_id
        );

        bot.sendMessage(
          chatId,
          "⏰ Temps écoulé.",
          {
            reply_to_message_id:
              sentMsg.message_id
          }
        );
      }
    }, 60000);

  } catch (error) {
    console.error(error);

    if (loadingMsg) {
      await bot
        .deleteMessage(
          chatId,
          loadingMsg.message_id
        )
        .catch(() => {});
    }

    return bot.sendMessage(
      chatId,
      "❌ Erreur API.",
      {
        reply_to_message_id:
          msg.message_id
      }
    );
  }
}

async function onReply({
  bot,
  msg,
  chatId,
  userId,
  data,
  replyMsg
}) {
  if (data.type !== "x_reply") return;

  if (userId !== data.authorId) return;

  const index = parseInt(msg.text);

  if (
    isNaN(index) ||
    index < 1 ||
    index > data.list.length
  ) {
    return bot.sendMessage(
      chatId,
      `❌ Choisissez un nombre entre 1 et ${data.list.length}.`,
      {
        reply_to_message_id:
          msg.message_id
      }
    );
  }

  const selected =
    data.list[index - 1];

  const loadingMsg =
    await bot.sendMessage(
      chatId,
      `⏳ Téléchargement de "${selected.title}"...`,
      {
        reply_to_message_id:
          msg.message_id
      }
    );

  try {
    const filePath = path.join(
      __dirname,
      `xvideo_${Date.now()}.mp4`
    );

    const writer =
      fs.createWriteStream(filePath);

    const stream = await axios({
      url:
        selected.video_1 ||
        selected.video_2,
      method: "GET",
      responseType: "stream"
    });

    stream.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    await bot.sendVideo(
      chatId,
      filePath,
      {
        caption:
`🎬 ${selected.title}

📂 ${selected.category || "Inconnue"}
👁️ ${selected.views_count || "Inconnue"}`,
        reply_to_message_id:
          msg.message_id
      }
    );

    await bot.deleteMessage(
      chatId,
      loadingMsg.message_id
    );

    global.teamnix.replies.delete(
      replyMsg.message_id
    );

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

  } catch (error) {
    console.error(error);

    await bot
      .deleteMessage(
        chatId,
        loadingMsg.message_id
      )
      .catch(() => {});

    return bot.sendMessage(
      chatId,
      "❌ Échec du téléchargement.",
      {
        reply_to_message_id:
          msg.message_id
      }
    );
  }
}

module.exports = {
  nix,
  onStart,
  onReply
};
