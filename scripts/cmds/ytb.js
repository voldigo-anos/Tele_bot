const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const API_BASE = "https://azadx69x.is-a.dev";

const nix = {
  name: "ytb",
  version: "1.0.0",
  aliases: [],
  description: "YouTube search + download (audio/video)",
  author: "Christus",
  prefix: true,
  category: "media",
  role: 0,
  cooldown: 5,
  guide: "{p}yt -a <query> | {p}yt -v <query>"
};

function formatViews(n) {
  if (!n) return "N/A";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n;
}

async function generateImage(results, query, type) {
  const width = 640;
  const rowH = 90;
  const headerH = 80;
  const height = headerH + results.length * rowH;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#181818";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("YouTube Search", 20, 40);

  ctx.fillStyle = "#aaa";
  ctx.font = "14px sans-serif";
  ctx.fillText(`${query} (${type})`, 20, 65);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const y = headerH + i * rowH;

    ctx.fillStyle = i % 2 ? "#1f1f1f" : "#222";
    ctx.fillRect(0, y, width, rowH);

    ctx.fillStyle = "#fff";
    ctx.font = "14px sans-serif";
    ctx.fillText(`${i + 1}. ${r.title.slice(0, 50)}`, 20, y + 30);

    ctx.fillStyle = "#aaa";
    ctx.fillText(`${r.duration} • ${formatViews(r.views)}`, 20, y + 55);
  }

  return canvas.toBuffer("image/jpeg");
}

async function onStart({ bot, msg, chatId, args }) {
  const flag = args[0];
  const query = args.slice(1).join(" ");

  if (!flag || !query) {
    return bot.sendMessage(chatId, "Usage: yt -a <query> | yt -v <query>", {
      reply_to_message_id: msg.message_id
    });
  }

  const type = flag === "-a" ? "audio" : flag === "-v" ? "video" : null;
  if (!type) return bot.sendMessage(chatId, "Invalid type (-a / -v)");

  const loading = await bot.sendMessage(chatId, "🔍 Searching...", {
    reply_to_message_id: msg.message_id
  });

  try {
    const { data } = await axios.get(
      `${API_BASE}/api/youtube-search?query=${encodeURIComponent(query)}&type=${type}`
    );

    if (!data?.results?.length) {
      return bot.editMessageText("No results found.", {
        chat_id: chatId,
        message_id: loading.message_id
      });
    }

    const results = data.results.slice(0, 8);

    const img = await generateImage(results, query, type);
    const tmp = path.join(os.tmpdir(), `yt_${Date.now()}.jpg`);
    fs.writeFileSync(tmp, img);

    const sent = await bot.sendMessage(chatId, {
      body: `Reply 1-${results.length} to download`,
      attachment: fs.createReadStream(tmp)
    });

    fs.unlinkSync(tmp);

    global.teamnix.replies.set(sent.message_id, {
      nix,
      type: "yt_reply",
      authorId: msg.from.id,
      results,
      mode: type
    });

    bot.deleteMessage(chatId, loading.message_id);

  } catch (e) {
    console.log(e);
    bot.sendMessage(chatId, "API error");
  }
}

async function onReply({ bot, msg, chatId, userId, data }) {
  if (data.type !== "yt_reply") return;
  if (userId !== data.authorId) return;

  const index = parseInt(msg.text);
  if (isNaN(index) || index < 1 || index > data.results.length) {
    return bot.sendMessage(chatId, "Invalid number");
  }

  const selected = data.results[index - 1];

  const loading = await bot.sendMessage(chatId, "⬇️ Downloading...");

  try {
    const url = `${API_BASE}/api/ytdown?url=${encodeURIComponent(selected.url)}&type=${data.mode}`;

    const { data: dl } = await axios.get(url);

    const media =
      dl?.result?.api?.mediaItems?.[0]?.mediaUrl ||
      dl?.result?.api?.mediaItems?.[0]?.mediaPreviewUrl;

    if (!media) throw new Error("No media");

    const file = path.join(os.tmpdir(), `yt_${Date.now()}.mp4`);

    const stream = await axios({ url: media, responseType: "stream" });

    const writer = fs.createWriteStream(file);
    stream.data.pipe(writer);

    await new Promise(r => writer.on("finish", r));

    await bot.sendVideo(chatId, file, {
      caption: selected.title
    });

    fs.unlinkSync(file);
    bot.deleteMessage(chatId, loading.message_id);

    global.teamnix.replies.delete(msg.message_id);

  } catch (e) {
    console.log(e);
    bot.sendMessage(chatId, "Download failed");
  }
}

module.exports = { nix, onStart, onReply };
