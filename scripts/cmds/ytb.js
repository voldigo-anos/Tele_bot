const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");

const API_BASE = "https://azadx69x.is-a.dev";

const nix = {
  name: "yt",
  version: "1.0.1",
  aliases: ["ytb"],
  author: "Christus",
  prefix: true,
  category: "media",
  role: 0,
  cooldown: 5,
  description: "YouTube search + download fix API"
};

async function onStart({ bot, msg, chatId, args }) {
  const flag = args[0];
  const query = args.slice(1).join(" ");

  if (!flag || !query) {
    return bot.sendMessage(chatId,
      "Usage: yt -a <song> | yt -v <video>",
      { reply_to_message_id: msg.message_id }
    );
  }

  const type = flag === "-a" ? "audio" : flag === "-v" ? "video" : null;
  if (!type) {
    return bot.sendMessage(chatId,
      "❌ Type invalide (-a / -v)",
      { reply_to_message_id: msg.message_id }
    );
  }

  const loading = await bot.sendMessage(chatId,
    "🔍 Searching YouTube...",
    { reply_to_message_id: msg.message_id }
  );

  try {
    const apiUrl =
      `${API_BASE}/api/youtube-search?query=${encodeURIComponent(query)}&type=${type}`;

    const { data } = await axios.get(apiUrl, {
      timeout: 15000
    });

    // 🔴 FIX PRINCIPAL ICI
    if (!data) {
      throw new Error("Empty API response");
    }

    if (data.status === false || !data.results) {
      throw new Error(data.message || "No results from API");
    }

    const results = data.results.slice(0, 8);

    if (results.length === 0) {
      throw new Error("No videos found");
    }

    await bot.deleteMessage(chatId, loading.message_id);

    let text = `🎬 YouTube Results\n\n`;

    results.forEach((r, i) => {
      text += `${i + 1}. ${r.title}\n`;
    });

    const sent = await bot.sendMessage(chatId, {
      body: text
    });

    global.teamnix.replies.set(sent.message_id, {
      nix,
      type: "yt",
      results,
      mode: type,
      authorId: msg.from.id
    });

  } catch (err) {
    console.log("YT ERROR DETAILS:", err);

    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});

    return bot.sendMessage(chatId,
      `❌ API Error:\n${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function onReply({ bot, msg, chatId, userId, data }) {
  if (!data || data.type !== "yt") return;
  if (userId !== data.authorId) return;

  const index = parseInt(msg.text);

  if (!index || index < 1 || index > data.results.length) {
    return bot.sendMessage(chatId,
      "❌ Invalid number",
      { reply_to_message_id: msg.message_id }
    );
  }

  const selected = data.results[index - 1];

  try {
    const dlUrl =
      `${API_BASE}/api/ytdown?url=${encodeURIComponent(selected.url)}&type=${data.mode}`;

    const { data: dl } = await axios.get(dlUrl, { timeout: 30000 });

    if (!dl || !dl.success) {
      throw new Error(dl?.message || "Download API failed");
    }

    const media =
      dl.result?.api?.mediaItems?.[0]?.mediaUrl;

    if (!media) {
      throw new Error("No media URL found");
    }

    const file = path.join(os.tmpdir(), `yt_${Date.now()}.mp4`);

    const stream = await axios({
      url: media,
      responseType: "stream"
    });

    const writer = fs.createWriteStream(file);
    stream.data.pipe(writer);

    await new Promise((r, e) => {
      writer.on("finish", r);
      writer.on("error", e);
    });

    await bot.sendVideo(chatId, file, {
      caption: selected.title
    });

    fs.unlinkSync(file);

  } catch (err) {
    console.log("YT DOWNLOAD ERROR:", err.message);

    return bot.sendMessage(chatId,
      `❌ Download failed:\n${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

module.exports = { nix, onStart, onReply };
