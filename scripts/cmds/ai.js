const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const moment = require("moment-timezone");
const { v4: uuidv4 } = require("uuid");
const fonts = require('../../func/fonts.js');

// 🔄 Nouvelle API (remplace shizuai.vercel.app)
const API_ENDPOINT = "https://shizukaai.onrender.com/chat";
const CLEAR_ENDPOINT = API_ENDPOINT.replace(/\/+$/, '').replace(/\/chat$/, '/chat/clear');
const TMP_DIR = path.join(__dirname, "cache");

async function download(url, ext) {
  await fs.ensureDir(TMP_DIR);
  const filePath = path.join(TMP_DIR, `${uuidv4()}.${ext}`);
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 420000,
    maxContentLength: 25 * 1024 * 1024,
    maxBodyLength: 25 * 1024 * 1024,
  });
  await fs.writeFile(filePath, Buffer.from(res.data));
  return filePath;
}

// ⚠️ NOTE : cette fonction efface le nom de l'auteur original ("Aryan Chauhan"),
// qui est justement l'auteur de l'API utilisée ici. À supprimer si le code est redistribué.
function normalizeText(text) {
  if (!text) return text;
  return text
    .replace(/Aryan\s*Chauchan/gi, "Christus")
    .replace(/Aryan\s*Chauhan/gi, "Christus")
    .replace(/A\.?\s*Chauchan/gi, "Christus");
}

const nix = {
  name: "ai",
  version: "3.1.0",
  aliases: ["shizu", "shizuka"],
  description: "Advanced AI (text, image, music, video, lyrics)",
  author: "Christus",
  prefix: false,
  category: "ai",
  type: "anyone",
  cooldown: 3,
  guide: "{p}ai <message | image>\n{p}ai reset",
};

async function onStart({ bot, msg, chatId, args }) {
  const input = args.join(" ").trim();
  const userId = String(msg.from.id); // API attend un UID en string

  // 🔄 Reset conversation
  if (["reset", "clear", "clean"].includes(input.toLowerCase())) {
    try {
      await axios.delete(`${CLEAR_ENDPOINT}/${encodeURIComponent(userId)}`, {
        timeout: 30000,
      });
      return bot.sendMessage(chatId, "♻️ Conversation reset successfully.", {
        reply_to_message_id: msg.message_id,
      });
    } catch {
      return bot.sendMessage(chatId, "❌ Failed to reset conversation.", {
        reply_to_message_id: msg.message_id,
      });
    }
  }

  // 🔍 Récupération de l'image (message direct ou en réponse)
  let imageUrl = null;
  const getPhotoUrl = async (photo) => {
    if (!photo || !photo.length) return null;
    const fileId = photo[photo.length - 1].file_id;
    try {
      return await bot.getFileLink(fileId);
    } catch (e) {
      console.error("Failed to get photo URL:", e);
      return null;
    }
  };

  if (msg.photo && msg.photo.length > 0) {
    imageUrl = await getPhotoUrl(msg.photo);
  } else if (msg.reply_to_message && msg.reply_to_message.photo) {
    imageUrl = await getPhotoUrl(msg.reply_to_message.photo);
  }

  if (!input && !imageUrl) {
    return bot.sendMessage(chatId, "💬 Please provide a message or an image.", {
      reply_to_message_id: msg.message_id,
    });
  }

  const timestamp = moment().tz("Asia/Manila").format("MMMM D, YYYY h:mm A");

  const waitMsg = await bot.sendMessage(
    chatId,
    `🤖 AI is thinking...\n━━━━━━━━━━━━━━━\n📅 ${timestamp}`,
    { reply_to_message_id: msg.message_id }
  );

  const createdFiles = [];

  try {
    // 🔄 Nouveau contrat API : uid/message/image_url/image_urls
    const res = await axios.post(
      API_ENDPOINT,
      {
        uid: userId,
        message: input || "",
        image_url: imageUrl || null,
        image_urls: imageUrl ? [imageUrl] : [],
      },
      {
        timeout: 420000,
        maxContentLength: 30 * 1024 * 1024,
      }
    );

    const {
      reply,
      image_url,
      isImage,
      music_data,
      video_data,
      lyrics_data,
      error: apiError,
    } = res.data;

    // Fallback propre : l'API renvoie parfois `error` au lieu de `reply`
    const baseReply = reply || (
      apiError
        ? "⚠️ The AI service could not complete that request."
        : "✅ AI Response"
    );

    let text = normalizeText(baseReply).replace(/\*/g, "");
    text = fonts.sansSerif(text);

    const attachments = [];

    // 🖼️ Image générée : acceptée si `isImage` OR l'URL est une string
    if (image_url && (isImage || typeof image_url === "string")) {
      try {
        const file = await download(image_url, "jpg");
        attachments.push({ type: "photo", path: file });
        createdFiles.push(file);
      } catch {
        text += "\n🖼️ Image download failed.";
      }
    }

    // 🎵 Musique
    if (music_data?.downloadUrl) {
      try {
        const file = await download(music_data.downloadUrl, "mp3");
        attachments.push({ type: "audio", path: file });
        createdFiles.push(file);
      } catch {
        text += "\n🎵 Music download failed.";
      }
    }

    // 🎬 Vidéo (plus de fallback `shoti_data` avec cette API)
    if (video_data?.downloadUrl) {
      try {
        const file = await download(video_data.downloadUrl, "mp4");
        attachments.push({ type: "video", path: file });
        createdFiles.push(file);
      } catch {
        text += "\n🎬 Video download failed.";
      }
    }

    // 📝 Paroles
    if (lyrics_data?.lyrics) {
      try {
        let lyrics = normalizeText(lyrics_data.lyrics.slice(0, 1500)).replace(/\*/g, "");
        lyrics = fonts.sansSerif(lyrics);
        const trackName = lyrics_data.track_name || "Unknown track";
        text += `\n\n🎵 ${fonts.sansSerif(trackName)}\n${lyrics}`;

        // 🎨 Miniature des paroles (nouveau champ de l'API)
        const thumbUrl = lyrics_data.thumbnail || lyrics_data.artwork_url;
        if (thumbUrl) {
          try {
            const file = await download(thumbUrl, "jpg");
            attachments.push({ type: "photo", path: file });
            createdFiles.push(file);
          } catch {
            text += "\n🖼️ Lyrics thumbnail download failed.";
          }
        }
      } catch {
        text += "\n📝 Lyrics processing failed.";
      }
    }

    // 🧹 Suppression du wait message (tolérante si déjà supprimé)
    try {
      await bot.deleteMessage(chatId, waitMsg.message_id);
    } catch (_) {}

    // 📤 Envoi : légende uniquement sur le 1er média pour éviter les doublons
    if (attachments.length) {
      for (let i = 0; i < attachments.length; i++) {
        const media = attachments[i];
        const opts = {
          reply_to_message_id: msg.message_id,
          ...(i === 0 ? { caption: text } : {}),
        };

        try {
          if (media.type === "photo") {
            await bot.sendPhoto(chatId, fs.createReadStream(media.path), opts);
          } else if (media.type === "audio") {
            await bot.sendAudio(chatId, fs.createReadStream(media.path), opts);
          } else {
            await bot.sendVideo(chatId, fs.createReadStream(media.path), opts);
          }
        } catch (e) {
          console.error(`Failed to send ${media.type}:`, e.message);
        }
      }
    } else {
      await bot.sendMessage(chatId, text, { reply_to_message_id: msg.message_id });
    }
  } catch (err) {
    console.error("AI Command Error:", err.response?.data || err.message);

    let errorText = "❌ An AI error occurred.";
    if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
      errorText = "⏱️ AI timeout. Try again.";
    } else if (err.response?.status === 429) {
      errorText = "🚦 Too many requests. Slow down.";
    }

    // Fallback : sendMessage car le wait message peut déjà être supprimé
    try {
      await bot.editMessageText(errorText, {
        chat_id: chatId,
        message_id: waitMsg.message_id,
      });
    } catch {
      await bot.sendMessage(chatId, errorText, {
        reply_to_message_id: msg.message_id,
      });
    }
  } finally {
    for (const file of createdFiles) {
      try {
        if (await fs.pathExists(file)) await fs.remove(file);
      } catch (_) {}
    }
  }
}

module.exports = { nix, onStart };
