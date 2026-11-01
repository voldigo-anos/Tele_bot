const axios = require('axios');
const fs = require('fs');
const path = require('path');

const nix = {
  name: "quiz",
  version: "4.0.0",
  aliases: ["q", "qz", "kuiz"],
  description: "Jeu de quiz avancé avec 6000+ questions, images, succès et classements",
  author: "Christus",
  prefix: true,
  category: "game",
  role: 0,
  cooldown: 0,
  guide: "{p}quiz <catégorie>\n{p}quiz rank - Voir votre profil\n{p}quiz leaderboard - Classement global\n{p}quiz category <cat> - Classement par catégorie\n{p}quiz daily - Défi quotidien\n{p}quiz torf - Vrai/Faux\n{p}quiz flag - Drapeaux\n{p}quiz anime - Quiz Anime\n{p}quiz cartoon - Dessins animés\n{p}quiz animaux - Animaux\n{p}quiz monument - Monuments\n{p}quiz sport - Sport\n{p}quiz cinema - Cinéma\n{p}quiz hard/medium/easy - Difficulté"
};

const BASE_URL = 'https://goatmart-bwom.vercel.app/api';

// ========== Gestion base de données JSON ==========
const getDatabasePath = (dbName) => {
  const dbPath = path.join(process.cwd(), 'database', `${dbName}.json`);
  const dbDir = path.join(process.cwd(), 'database');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({}));
  return dbPath;
};

const getDatabase = (dbName) => JSON.parse(fs.readFileSync(getDatabasePath(dbName), 'utf8'));
const saveDatabase = (dbName, data) => fs.writeFileSync(getDatabasePath(dbName), JSON.stringify(data, null, 2));

// ========== Traduction ==========
async function translate(text, targetLang = 'fr') {
  if (!text || text.includes('http')) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await axios.get(url);
    return res.data[0].map(segment => segment[0]).join("");
  } catch (e) {
    return text;
  }
}

async function translateQuestion(questionData, targetLang = 'fr') {
  try {
    if (questionData.category === 'flag' || questionData.question?.includes('http')) {
      return questionData;
    }

    const [translatedQuestion, translatedCategory, translatedDifficulty] = await Promise.all([
      translate(questionData.question, targetLang),
      translate(questionData.category || '', targetLang),
      translate(questionData.difficulty || '', targetLang)
    ]);

    return {
      ...questionData,
      question: translatedQuestion || questionData.question,
      options: questionData.options,
      category: translatedCategory || questionData.category,
      difficulty: translatedDifficulty || questionData.difficulty,
      originalAnswer: questionData.answer
    };
  } catch (error) {
    console.error("Translation error:", error);
    return questionData;
  }
}

// ========== Utilitaires d'affichage ==========
function generateProgressBar(percentile) {
  const filled = Math.round(percentile / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function getUserTitle(correct) {
  if (correct >= 50000) return '🌟 Quiz Omniscient';
  if (correct >= 25000) return '👑 Quiz Divinité';
  if (correct >= 15000) return '⚡ Quiz Titan';
  if (correct >= 10000) return '🏆 Quiz Légende';
  if (correct >= 7500) return '🎓 Grand Maître';
  if (correct >= 5000) return '👨‍🎓 Maître du Quiz';
  if (correct >= 2500) return '🔥 Expert Quiz';
  if (correct >= 1500) return '📚 Savant Quiz';
  if (correct >= 1000) return '🎯 Apprenti Quiz';
  if (correct >= 750) return '🌟 Chercheur de Connaissances';
  if (correct >= 500) return '📖 Apprenant Rapide';
  if (correct >= 250) return '🚀 Étoile Montante';
  if (correct >= 100) return '💡 Débutant';
  if (correct >= 50) return '🎪 Premiers Pas';
  if (correct >= 25) return '🌱 Nouveau Venu';
  if (correct >= 10) return '🔰 Débutant';
  if (correct >= 1) return '👶 Recrue';
  return '🆕 Nouveau Joueur';
}

async function getAvailableCategories() {
  try {
    const res = await axios.get(`${BASE_URL}/categories`);
    return res.data.map(cat => cat.toLowerCase());
  } catch (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
}

// Envoi d'image sécurisé (fallback texte si échec)
async function sendQuestionPhoto(bot, chatId, url, caption, replyToId) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return bot.sendMessage(chatId, caption, { reply_to_message_id: replyToId });
  }
  try {
    return await bot.sendPhoto(chatId, url, { caption, reply_to_message_id: replyToId });
  } catch (e) {
    console.error("sendPhoto failed:", url, e.message);
    return bot.sendMessage(chatId, caption, { reply_to_message_id: replyToId });
  }
}

// ========== Point d'entrée principal ==========
async function onStart({ bot, message, msg, chatId, args, usages }) {
  const command = args[0]?.toLowerCase();
  const userId = msg.from.id;
  const userName = msg.from.first_name || msg.from.username || "Joueur";

  try {
    await axios.post(`${BASE_URL}/user/update`, {
      userId: userId,
      name: userName
    }).catch(() => {});

    if (!args[0] || command === "help") {
      return handleDefaultView(chatId, bot, msg);
    }

    switch (command) {
      case "rank":
      case "profile":
      case "rang":
      case "profil":
        return await handleRank(chatId, msg, bot, userId, userName);

      case "leaderboard":
      case "lb":
      case "classement":
        return await handleLeaderboard(chatId, msg, bot, args.slice(1));

      case "category":
      case "categorie":
        if (args.length > 1) {
          return await handleCategoryLeaderboard(chatId, msg, bot, args.slice(1));
        }
        return await handleCategories(chatId, bot, msg);

      case "daily":
      case "quotidien":
        return await handleDailyChallenge(chatId, msg, bot, userId, userName);

      case "torf":
      case "vrai/faux":
        return await handleTrueOrFalse(chatId, msg, bot, userId, userName);

      case "flag":
      case "drapeau":
      case "drapeaux":
        return await handleFlagQuiz(chatId, msg, bot, userId, userName);

      case "anime":
        return await handleAnimeQuiz(chatId, msg, bot, userId, userName);

      case "cartoon":
      case "dessin":
      case "dessins":
      case "kids":
        return await handleImageQuiz(chatId, msg, bot, userId, userName, "cartoon", "📺 𝗤𝘂𝗶𝘇 𝗗𝗲𝘀𝘀𝗶𝗻𝘀 𝗔𝗻𝗶𝗺é𝘀");

      case "animaux":
      case "animal":
        return await handleImageQuiz(chatId, msg, bot, userId, userName, "animaux", "🐾 𝗤𝘂𝗶𝘇 𝗔𝗻𝗶𝗺𝗮𝘂𝘅");

      case "monument":
      case "monuments":
        return await handleImageQuiz(chatId, msg, bot, userId, userName, "monument", "🏛️ 𝗤𝘂𝗶𝘇 𝗠𝗼𝗻𝘂𝗺𝗲𝗻𝘁𝘀");

      case "sport":
      case "sports":
        return await handleImageQuiz(chatId, msg, bot, userId, userName, "sport", "⚽ 𝗤𝘂𝗶𝘇 𝗦𝗽𝗼𝗿𝘁");

      case "cinema":
      case "film":
      case "films":
        return await handleImageQuiz(chatId, msg, bot, userId, userName, "cinema", "🎬 𝗤𝘂𝗶𝘇 𝗖𝗶𝗻é𝗺𝗮");

      case "hard":
      case "difficile":
        return await handleQuiz(chatId, msg, bot, userId, userName, ["general"], "hard");

      case "medium":
      case "moyen":
        return await handleQuiz(chatId, msg, bot, userId, userName, ["general"], "medium");

      case "easy":
      case "facile":
        return await handleQuiz(chatId, msg, bot, userId, userName, ["general"], "easy");

      case "random":
      case "aleatoire":
      case "aléatoire":
        return await handleQuiz(chatId, msg, bot, userId, userName, []);

      default:
        const categories = await getAvailableCategories();
        if (categories.includes(command)) {
          return await handleQuiz(chatId, msg, bot, userId, userName, [command]);
        } else {
          return handleDefaultView(chatId, bot, msg);
        }
    }
  } catch (err) {
    console.error("Quiz start error:", err);
    return bot.sendMessage(chatId, "⚠️ Erreur, réessayez plus tard.",
      { reply_to_message_id: msg.message_id });
  }
}

// ========== Gestion des réponses ==========
async function onReply({ bot, message, msg, chatId, userId, data, replyMsg }) {
  if (data.type !== "quiz_reply" || userId !== data.authorId) return;

  try {
    const ans = msg.text?.trim().toUpperCase();
    if (!["A", "B", "C", "D"].includes(ans)) {
      return bot.sendMessage(chatId, "❌ Veuillez répondre avec A, B, C ou D uniquement !",
        { reply_to_message_id: msg.message_id });
    }

    const timeSpent = (Date.now() - data.startTime) / 1000;
    if (timeSpent > 30) {
      global.teamnix.replies.delete(replyMsg.message_id);
      let correctDisplay = data.correctAnswer;
      if (data.isTorf) correctDisplay = data.correctAnswer === "A" ? "Vrai" : "Faux";
      return bot.sendMessage(chatId, `⏰ Temps écoulé ! La bonne réponse était: ${correctDisplay}`,
        { reply_to_message_id: msg.message_id });
    }

    const userName = msg.from.first_name || msg.from.username || "Joueur";

    // Conversion lettre → texte d'option pour flag/anime/image
    let userAnswer = ans;
    if ((data.isFlag || data.isAnime || data.isImage) && data.options) {
      const optionIndex = ans.charCodeAt(0) - 65;
      if (optionIndex >= 0 && optionIndex < data.options.length) {
        userAnswer = data.options[optionIndex];
      }
    }

    const answerData = {
      userId: userId,
      questionId: data.questionId,
      answer: userAnswer,
      timeSpent,
      userName
    };

    const res = await axios.post(`${BASE_URL}/answer`, answerData);

    if (!res.data) {
      throw new Error('Aucune donnée reçue');
    }

    const { result, user } = res.data;
    let responseMsg;

    const balances = getDatabase('balances');
    if (!balances[userId]) balances[userId] = { money: 0 };

    if (result === "correct") {
      let baseMoneyReward = 10000;
      if (data.difficulty === 'hard') baseMoneyReward = 15000;
      if (data.difficulty === 'easy') baseMoneyReward = 7500;
      if (data.isFlag) baseMoneyReward = 12000;
      if (data.isAnime) baseMoneyReward = 15000;
      if (data.isImage) baseMoneyReward = 12000;
      if (data.isDaily) baseMoneyReward = 20000;

      const streakBonus = (user.currentStreak || 0) * 1000;
      const totalMoneyReward = baseMoneyReward + streakBonus;

      balances[userId].money += totalMoneyReward;
      saveDatabase('balances', balances);

      const difficultyBonus = data.difficulty === 'hard' ? ' 🔥' : data.difficulty === 'easy' ? ' ⭐' : '';
      const streakBonus2 = (user.currentStreak || 0) >= 5 ? ` 🚀 ${user.currentStreak}x série !` : '';
      const flagBonus = data.isFlag ? ' 🏁' : '';
      const animeBonus = data.isAnime ? ' 🎌' : '';
      const imageBonus = data.isImage ? ' 🖼️' : '';
      const dailyBonus = data.isDaily ? ' 🌟' : '';

      responseMsg =
        `🎉 𝗕𝗼𝗻𝗻𝗲 𝗿𝗲́𝗽𝗼𝗻𝘀𝗲 !\n` +
        `━━━━━━━━━━\n\n` +
        `💰 𝗔𝗿𝗴𝗲𝗻𝘁: +${totalMoneyReward.toLocaleString()}\n` +
        `✨ 𝗫𝗣: +${user.xpGained || 15}\n` +
        `📊 𝗦𝗰𝗼𝗿𝗲: ${user.correct || 0}/${user.total || 0} (${user.accuracy || 0}%)\n` +
        `🔥 𝗦𝗲́𝗿𝗶𝗲: ${user.currentStreak || 0}\n` +
        `⚡ 𝗧𝗲𝗺𝗽𝘀: ${timeSpent.toFixed(1)}s\n` +
        `🎯 𝗫𝗣 𝗧𝗼𝘁𝗮𝗹: ${user.xp || 0}/1000\n` +
        `💰 𝗦𝗼𝗹𝗱𝗲: ${balances[userId].money.toLocaleString()}\n` +
        `👤 ${userName}` + difficultyBonus + streakBonus2 + flagBonus + animeBonus + imageBonus + dailyBonus;
    } else {
      let correctDisplay = data.correctAnswer;
      if (data.isTorf) correctDisplay = data.correctAnswer === "A" ? "Vrai" : "Faux";

      responseMsg =
        `❌ 𝗠𝗮𝘂𝘃𝗮𝗶𝘀𝗲 𝗿𝗲́𝗽𝗼𝗻𝘀𝗲\n` +
        `━━━━━━━━━━\n\n` +
        `🎯 𝗕𝗼𝗻𝗻𝗲 𝗿𝗲́𝗽𝗼𝗻𝘀𝗲: ${correctDisplay}\n` +
        `📊 𝗦𝗰𝗼𝗿𝗲: ${user.correct || 0}/${user.total || 0} (${user.accuracy || 0}%)\n` +
        `💔 𝗦𝗲́𝗿𝗶𝗲 𝗿𝗲́𝗶𝗻𝗶𝘁𝗶𝗮𝗹𝗶𝘀𝗲́𝗲\n` +
        `👤 ${userName}` + (data.isFlag ? ' 🏁' : '') + (data.isAnime ? ' 🎌' : '') + (data.isImage ? ' 🖼️' : '');
    }

    await bot.sendMessage(chatId, responseMsg, { reply_to_message_id: msg.message_id });

    if (user.achievements && user.achievements.length > 0) {
      balances[userId].money += 50000;
      saveDatabase('balances', balances);

      const achievementMsg = user.achievements.map(ach => `🏆 ${ach}`).join('\n');
      await bot.sendMessage(chatId,
        `🏆 𝗦𝘂𝗰𝗰𝗲̀𝘀 𝗱𝗲́𝗯𝗹𝗼𝗾𝘂𝗲́ !\n${achievementMsg}\n💰 +50 000 pièces bonus !\n✨ +100 XP bonus !`,
        { reply_to_message_id: msg.message_id }
      );
    }

    global.teamnix.replies.delete(replyMsg.message_id);

  } catch (err) {
    console.error("Answer error:", err);
    const errorMsg = err.response?.data?.error || err.message || "Erreur inconnue";
    bot.sendMessage(chatId, `⚠️ Erreur lors du traitement: ${errorMsg}`,
      { reply_to_message_id: msg.message_id });
  }
}

// ========== Gestionnaires ==========
async function handleDefaultView(chatId, bot, msg) {
  try {
    const res = await axios.get(`${BASE_URL}/categories`);
    const categories = res.data;

    const icons = {
      anime: '🎌', flag: '🏁', cartoon: '📺', animaux: '🐾',
      monument: '🏛️', sport: '⚽', science: '🔬', histoire: '📖',
      cinema: '🎬', geographie: '🌍', maths: '➗', culture: '🎭',
      torf: '⚖️', general: '🎯'
    };

    const catText = categories.map(c =>
      `${icons[c] || '📍'} ${c.charAt(0).toUpperCase() + c.slice(1)}`
    ).join("\n");

    return bot.sendMessage(chatId,
      `🎯 𝗤𝘂𝗶𝘇\n━━━━━━━━\n\n` +
      `📚 𝗖𝗮𝘁𝗲́𝗴𝗼𝗿𝗶𝗲𝘀 (${categories.length})\n\n${catText}\n\n` +
      `━━━━━━━━━\n\n` +
      `🏆 𝗨𝘁𝗶𝗹𝗶𝘀𝗮𝘁𝗶𝗼𝗻\n` +
      `• /quiz rank - Voir votre profil\n` +
      `• /quiz leaderboard - Classement global\n` +
      `• /quiz daily - Défi quotidien\n` +
      `• /quiz torf - Vrai/Faux\n` +
      `• /quiz flag - Drapeaux\n` +
      `• /quiz anime - Quiz Anime\n` +
      `• /quiz cartoon - Dessins animés\n` +
      `• /quiz animaux - Animaux\n` +
      `• /quiz monument - Monuments\n` +
      `• /quiz sport - Sport\n\n` +
      `🎮 Utilisez: /quiz <catégorie> pour commencer`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (err) {
    console.error("Default view error:", err);
    return bot.sendMessage(chatId,
      "⚠️ Impossible de récupérer les catégories. Essayez '/quiz help' pour les commandes.",
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleRank(chatId, msg, bot, userId, userName) {
  try {
    const res = await axios.get(`${BASE_URL}/user/${userId}`);
    const user = res.data;

    if (!user || user.total === 0) {
      return bot.sendMessage(chatId,
        `❌ Vous n'avez pas encore joué de quiz ! Utilisez '/quiz random' pour commencer.\n👤 Bienvenue, ${userName} !`,
        { reply_to_message_id: msg.message_id }
      );
    }

    const position = user.position ?? "N/A";
    const totalUser = user.totalUsers ?? "N/A";
    const progressBar = generateProgressBar(user.percentile ?? 0);
    const title = getUserTitle(user.correct || 0);

    const balances = getDatabase('balances');
    const userMoney = balances[userId]?.money || 0;

    const currentXP = user.xp ?? 0;
    const xpTo1000 = Math.max(0, 1000 - currentXP);
    const xpProgress = Math.min(100, (currentXP / 1000) * 100);
    const xpProgressBar = generateProgressBar(xpProgress);

    const streakInfo = user.currentStreak > 0
      ? `🔥 𝖲é𝗋𝗂𝖾 𝖾𝗇 𝖼𝗈𝗎𝗋𝗌: ${user.currentStreak}${user.currentStreak >= 5 ? ' 🚀' : ''}`
      : `🔥 𝖲é𝗋𝗂𝖾 𝖾𝗇 𝖼𝗈𝗎𝗋𝗌: 0`;

    const bestStreakInfo = user.bestStreak > 0
      ? `🏅 𝖬𝖾𝗂𝗅𝗅𝖾𝗎𝗋𝖾 𝗌é𝗋𝗂𝖾: ${user.bestStreak}${user.bestStreak >= 10 ? ' 👑' : user.bestStreak >= 5 ? ' ⭐' : ''}`
      : `🏅 𝖬𝖾𝗂𝗅𝗅𝖾𝗎𝗋𝖾 𝗌é𝗋𝗂𝖾: 0`;

    return bot.sendMessage(chatId,
      `🎮 𝗣𝗿𝗼𝗳𝗶𝗹 𝗤𝘂𝗶𝘇\n━━━━━━━━━\n\n` +
      `👤 ${userName}\n` +
      `🎖️ ${title}\n` +
      `🏆 𝖢𝗅𝖺𝗌𝗌𝖾𝗆𝖾𝗇𝗍 𝗀𝗅𝗈𝖻𝖺𝗅: #${position}/${totalUser}\n` +
      `📈 𝖯𝖾𝗋𝖼𝖾𝗇𝗍𝗂𝗅𝖾: ${progressBar} ${user.percentile ?? 0}%\n\n` +
      `📊 𝗦𝘁𝗮𝘁𝗶𝘀𝘁𝗶𝗾𝘂𝗲𝘀\n` +
      `✅ 𝖡𝗈𝗇𝗇𝖾𝗌 𝗋é𝗉𝗈𝗇𝗌𝖾𝗌: ${user.correct ?? 0}\n` +
      `❌ 𝖬𝖺𝗎𝗏𝖺𝗂𝗌𝖾𝗌 𝗋é𝗉𝗈𝗇𝗌𝖾𝗌: ${user.wrong ?? 0}\n` +
      `📝 𝖳𝗈𝗍𝖺𝗅: ${user.total ?? 0}\n` +
      `🎯 𝖯𝗋é𝖼𝗂𝗌𝗂𝗈𝗇: ${user.accuracy ?? 0}%\n` +
      `⚡ 𝖳𝖾𝗆𝗉𝗌 𝗆𝗈𝗒𝖾𝗇: ${(user.avgResponseTime ?? 0).toFixed(1)}s\n\n` +
      `💰 𝗥𝗶𝗰𝗵𝗲𝘀𝘀𝗲 & 𝗫𝗣\n` +
      `💵 𝖠𝗋𝗀𝖾𝗇𝗍: ${userMoney.toLocaleString()}\n` +
      `✨ 𝖷𝖯: ${currentXP}/1000\n` +
      `🎯 𝖷𝖯 𝗋𝖾𝗌𝗍𝖺𝗇𝗍: ${xpTo1000}\n` +
      `${xpProgressBar} ${xpProgress.toFixed(1)}%\n\n` +
      `🔥 𝗜𝗻𝗳𝗼 𝘀é𝗋𝗂𝖾\n` +
      `${streakInfo}\n` +
      `${bestStreakInfo}\n\n` +
      `🎯 𝖯𝗋𝗈𝖼𝗁𝖺𝗂𝗇 𝗈𝖻𝗃𝖾𝖼𝗍𝗂𝖿: ${user.nextMilestone || "Continuez à jouer !"}`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (err) {
    console.error("Rank error:", err);
    return bot.sendMessage(chatId,
      "⚠️ Impossible de récupérer votre profil. Veuillez réessayer plus tard.",
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleLeaderboard(chatId, msg, bot, args) {
  try {
    const page = parseInt(args?.[0]) || 1;
    const res = await axios.get(`${BASE_URL}/leaderboards?page=${page}&limit=8`);
    const { rankings, stats, pagination } = res.data;

    if (!rankings || rankings.length === 0) {
      return bot.sendMessage(chatId,
        "🏆 Aucun joueur dans le classement. Commencez à jouer pour être le premier !",
        { reply_to_message_id: msg.message_id }
      );
    }

    const now = new Date();
    const currentDate = now.toLocaleDateString('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
    });
    const currentTime = now.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC'
    });

    const players = rankings.map((u, i) => {
      const userName = u.name || 'Joueur Anonyme';
      const position = (pagination.currentPage - 1) * 8 + i + 1;
      const crown = position === 1 ? "👑" : position === 2 ? "🥈" : position === 3 ? "🥉" : position <= 10 ? "🏅" : "🎯";
      const title = getUserTitle(u.correct || 0);

      const level = u.level ?? Math.floor((u.correct || 0) / 50) + 1;
      const xp = u.xp ?? (u.correct || 0) * 10;
      const accuracy = u.accuracy ?? (u.total > 0 ? Math.round((u.correct / u.total) * 100) : 0);
      const avgResponseTime = typeof u.avgResponseTime === 'number' ? `${u.avgResponseTime.toFixed(2)}s` : 'N/A';
      const totalResponseTime = u.totalResponseTime?.toFixed(2) || '0';
      const fastest = u.fastestResponse?.toFixed(2) || 'N/A';
      const slowest = u.slowestResponse?.toFixed(2) || 'N/A';
      const playTime = u.totalPlayTime ? `${(u.totalPlayTime / 60).toFixed(1)} min` : '0 min';
      const games = u.gamesPlayed || u.total || 0;
      const perfectGames = u.perfectGames || 0;
      const joinDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : 'Inconnu';

      return `${crown} #${position} ${userName}\n` +
             `🎖️ ${title} | 🌟 Nv.${level} | ✨ XP: ${xp.toLocaleString()}\n` +
             `📊 ${u.correct} ✅ / ${u.wrong} ❌ (Précision: ${accuracy}%)\n` +
             `🔥 Série actuelle: ${u.currentStreak || 0} | 🏅 Meilleure série: ${u.bestStreak || 0}\n` +
             `⚡ Temps moyen: ${avgResponseTime} | ⏱️ Temps total: ${totalResponseTime}s\n` +
             `🚀 Plus rapide: ${fastest}s | 🐌 Plus lent: ${slowest}s\n` +
             `🎯 Questions répondues: ${u.questionsAnswered || 0} | Parties: ${games}\n` +
             `🎮 Temps de jeu: ${playTime} | 📈 Parties parfaites: ${perfectGames}\n` +
             `📅 Inscrit le: ${joinDate}`;
    });

    return bot.sendMessage(chatId,
      `🏆 𝗖𝗹𝗮𝘀𝘀𝗲𝗺𝗲𝗻𝘁 𝗴𝗹𝗼𝗯𝗮𝗹\n━━━━━━━━━\n\n` +
      `📅 ${currentDate}\n⏰ ${currentTime} UTC\n\n` +
      `━━━━━━━━━\n\n${players.join('\n\n')}\n\n` +
      `📖 Page ${pagination?.currentPage || 1}/${pagination?.totalPages || 1} | 👥 Total: ${stats?.totalUsers || 0}\n` +
      `🔄 Utilisez: /quiz leaderboard <page>\n` +
      `📊 Tris disponibles: correct, accuracy, streak, level`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (err) {
    console.error("Leaderboard error:", err);
    return bot.sendMessage(chatId,
      "⚠️ Impossible de récupérer le classement. Le serveur est peut-être occupé, réessayez plus tard.",
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleCategories(chatId, bot, msg) {
  try {
    const res = await axios.get(`${BASE_URL}/categories`);
    const categories = res.data;

    const icons = {
      anime: '🎌', flag: '🏁', cartoon: '📺', animaux: '🐾',
      monument: '🏛️', sport: '⚽', science: '🔬', histoire: '📖',
      cinema: '🎬', geographie: '🌍', maths: '➗', culture: '🎭',
      torf: '⚖️', general: '🎯'
    };

    const catText = categories.map(c =>
      `${icons[c] || '📍'} ${c.charAt(0).toUpperCase() + c.slice(1)}`
    ).join("\n");

    return bot.sendMessage(chatId,
      `📚 𝗖𝗮𝘁𝗲́𝗴𝗼𝗿𝗶𝗲𝘀 𝗱𝘂 𝗤𝘂𝗶𝘇 (${categories.length})\n━━━━━━━━\n\n${catText}\n\n` +
      `🎯 Utilisez: /quiz <catégorie>\n` +
      `🎲 Aléatoire: /quiz random\n` +
      `🏆 Quotidien: /quiz daily\n` +
      `🌟 Spéciaux: torf, flag, anime, cartoon, animaux, monument, sport`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (err) {
    console.error("Categories error:", err);
    return bot.sendMessage(chatId, "⚠️ Impossible de récupérer les catégories.",
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleCategoryLeaderboard(chatId, msg, bot, args) {
  try {
    const category = args[0]?.toLowerCase();
    if (!category) {
      return bot.sendMessage(chatId, "📚 Veuillez spécifier une catégorie pour voir le classement.",
        { reply_to_message_id: msg.message_id }
      );
    }

    const page = parseInt(args[1]) || 1;
    const res = await axios.get(`${BASE_URL}/leaderboard/category/${category}?page=${page}&limit=10`);
    const { users, pagination } = res.data;

    if (!users || users.length === 0) {
      return bot.sendMessage(chatId, `🏆 Aucun joueur trouvé pour la catégorie : ${category}.`,
        { reply_to_message_id: msg.message_id }
      );
    }

    const players = users.map((u, i) => {
      const userName = u.name || 'Joueur Anonyme';
      const position = (pagination.currentPage - 1) * 10 + i + 1;
      const crown = position === 1 ? "👑" : position === 2 ? "🥈" : position === 3 ? "🥉" : "🏅";
      const title = getUserTitle(u.correct || 0);
      return `${crown} #${position} ${userName}\n🎖️ ${title}\n📊 ${u.correct || 0}/${u.total || 0} (${u.accuracy || 0}%)`;
    });

    return bot.sendMessage(chatId,
      `🏆 𝗖𝗹𝗮𝘀𝘀𝗲𝗺𝗲𝗻𝘁 : ${category.charAt(0).toUpperCase() + category.slice(1)}\n━━━━━━━━━\n\n${players.join('\n\n')}\n\n` +
      `📖 Page ${pagination.currentPage}/${pagination.totalPages}\n` +
      `👥 Total joueurs: ${pagination.totalUsers || 0}`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (err) {
    console.error("Category leaderboard error:", err);
    return bot.sendMessage(chatId, "⚠️ Impossible de récupérer le classement de la catégorie.",
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleDailyChallenge(chatId, msg, bot, userId, userName) {
  try {
    const res = await axios.get(`${BASE_URL}/challenge/daily?userId=${userId}`);
    const { question, challengeDate, reward, streak } = res.data;

    const translatedData = await translateQuestion({
      question: question.question,
      options: question.options,
      answer: question.answer,
      _id: question._id
    });

    const optText = translatedData.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n");

    const info = await bot.sendMessage(chatId,
      `🌟 𝗗𝗲́𝗳𝗶 𝗤𝘂𝗼𝘁𝗶𝗱𝗶𝗲𝗻\n━━━━━━━━━\n\n` +
      `📅 ${challengeDate}\n` +
      `🎯 Récompense bonus: +${reward} XP\n` +
      `🔥 Série quotidienne: ${streak}\n\n\n` +
      `❓ ${translatedData.question}\n\n${optText}\n\n⏰ 30 secondes pour répondre !`,
      { reply_to_message_id: msg.message_id }
    );

    global.teamnix.replies.set(info.message_id, {
      nix,
      type: "quiz_reply",
      authorId: userId,
      correctAnswer: translatedData.answer,
      options: translatedData.options,
      questionId: translatedData._id,
      startTime: Date.now(),
      isDaily: true,
      difficulty: "daily"
    });

    setTimeout(() => {
      if (global.teamnix.replies.has(info.message_id)) {
        global.teamnix.replies.delete(info.message_id);
        bot.sendMessage(chatId, `⏰ Temps écoulé ! La bonne réponse était: ${translatedData.answer}`,
          { reply_to_message_id: info.message_id }
        );
      }
    }, 30000);

  } catch (err) {
    console.error("Daily challenge error:", err);
    return bot.sendMessage(chatId, "⚠️ Impossible de créer le défi quotidien.",
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleTrueOrFalse(chatId, msg, bot, userId, userName) {
  try {
    const res = await axios.get(`${BASE_URL}/question?category=torf&userId=${userId}`);
    const { _id, question, answer } = res.data;

    const translatedData = await translateQuestion({
      question: question,
      options: ["Vrai", "Faux"],
      answer: answer,
      _id: _id
    });

    const info = await bot.sendMessage(chatId,
      `⚙ 𝗤𝘂𝗶𝘇 ( Vrai/Faux )\n━━━━━━━━━━\n\n💭 𝗤𝘂𝗲𝘀𝘁𝗶𝗼𝗻: ${translatedData.question}\n\n` +
      `A. Vrai\nB. Faux\n\n⏰ 30 secondes pour répondre (A/B)`,
      { reply_to_message_id: msg.message_id }
    );

    global.teamnix.replies.set(info.message_id, {
      nix,
      type: "quiz_reply",
      authorId: userId,
      correctAnswer: answer,
      options: translatedData.options,
      questionId: _id,
      startTime: Date.now(),
      isTorf: true
    });

    setTimeout(() => {
      if (global.teamnix.replies.has(info.message_id)) {
        global.teamnix.replies.delete(info.message_id);
        const correctDisplay = answer === "A" ? "Vrai" : "Faux";
        bot.sendMessage(chatId, `⏰ Temps écoulé ! La bonne réponse était: ${correctDisplay}`,
          { reply_to_message_id: info.message_id }
        );
      }
    }, 30000);

  } catch (err) {
    console.error("True/False error:", err);
    return bot.sendMessage(chatId, "⚠️ Impossible de créer une question Vrai/Faux.",
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleFlagQuiz(chatId, msg, bot, userId, userName) {
  try {
    const res = await axios.get(`${BASE_URL}/question?category=flag&userId=${userId}`, { timeout: 25000 });
    const { _id, question, options, answer, imageUrl } = res.data;

    if (!Array.isArray(options) || !options.length) {
      return bot.sendMessage(chatId, "⚠️ Aucune question sur les drapeaux disponible pour le moment. Réessayez plus tard.",
        { reply_to_message_id: msg.message_id }
      );
    }

    const caption =
      `🏁 𝗤𝘂𝗶𝘇 𝗱𝗲 𝗗𝗿𝗮𝗽𝗲𝗮𝘂𝘅\n━━━━━━━━\n\n🌍 Devinez le pays de ce drapeau :\n\n` +
      options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n") +
      `\n\n⏰ Temps : 30 secondes pour répondre.`;

    const photoUrl = imageUrl || question;
    const info = await sendQuestionPhoto(bot, chatId, photoUrl, caption, msg.message_id);

    global.teamnix.replies.set(info.message_id, {
      nix,
      type: "quiz_reply",
      authorId: userId,
      correctAnswer: answer,
      options: options,
      questionId: _id,
      startTime: Date.now(),
      isFlag: true
    });

    setTimeout(() => {
      if (global.teamnix.replies.has(info.message_id)) {
        global.teamnix.replies.delete(info.message_id);
        bot.sendMessage(chatId, `⏰ Temps écoulé ! La bonne réponse était: ${answer}`,
          { reply_to_message_id: info.message_id }
        );
      }
    }, 30000);

  } catch (err) {
    console.error("Flag quiz error:", err);
    const detail = err?.response?.data?.error || err.message || "erreur inconnue";
    return bot.sendMessage(chatId, `⚠️ Impossible de créer un quiz de drapeau.\n📄 Raison: ${detail}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleAnimeQuiz(chatId, msg, bot, userId, userName) {
  try {
    const res = await axios.get(`${BASE_URL}/question?category=anime&userId=${userId}`, { timeout: 25000 });
    const { _id, question, options, answer, imageUrl, hint } = res.data;

    if (!Array.isArray(options) || !options.length) {
      return bot.sendMessage(chatId, "⚠️ Aucune question anime disponible pour le moment. Réessayez plus tard.",
        { reply_to_message_id: msg.message_id }
      );
    }

    const translatedData = await translateQuestion({
      question: hint || question,
      options: options,
      answer: answer,
      _id: _id
    });

    const caption =
      `🎌 𝗤𝘂𝗶𝘇 𝗔𝗻𝗶𝗺𝗲\n━━━━━━━━\n\n❔ 𝗜𝗻𝗱𝗶𝗰𝗲 : ${translatedData.question}\n\n` +
      options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n") +
      `\n\n⏰ Temps : 30 secondes\n🎯 Défi de reconnaissance de personnages animés !`;

    const info = await sendQuestionPhoto(bot, chatId, imageUrl, caption, msg.message_id);

    global.teamnix.replies.set(info.message_id, {
      nix,
      type: "quiz_reply",
      authorId: userId,
      correctAnswer: answer,
      options: options,
      questionId: _id,
      startTime: Date.now(),
      isAnime: true
    });

    setTimeout(() => {
      if (global.teamnix.replies.has(info.message_id)) {
        global.teamnix.replies.delete(info.message_id);
        bot.sendMessage(chatId, `⏰ Temps écoulé ! La bonne réponse était: ${answer}\n🎌 Continuez à regarder des animés pour améliorer vos compétences !`,
          { reply_to_message_id: info.message_id }
        );
      }
    }, 30000);

  } catch (err) {
    console.error("Anime quiz error:", err);
    const detail = err?.response?.data?.error || err.message || "erreur inconnue";
    return bot.sendMessage(chatId, `⚠️ Impossible de créer un quiz anime.\n📄 Raison: ${detail}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleImageQuiz(chatId, msg, bot, userId, userName, category, title) {
  try {
    const res = await axios.get(`${BASE_URL}/question?category=${category}&userId=${userId}`, { timeout: 25000 });
    const { _id, question, options, answer, imageUrl, hint } = res.data;

    if (!Array.isArray(options) || !options.length) {
      return bot.sendMessage(chatId, `⚠️ Aucune question « ${category} » disponible pour le moment. Réessayez plus tard.`,
        { reply_to_message_id: msg.message_id }
      );
    }

    const translatedData = await translateQuestion({
      question: hint || question,
      options: options,
      answer: answer,
      _id: _id,
      category: category
    });

    const caption =
      `${title}\n━━━━━━━━\n\n❔ ${translatedData.question}\n\n` +
      options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n") +
      `\n\n⏰ 30 secondes pour répondre (A/B/C/D)`;

    const info = await sendQuestionPhoto(bot, chatId, imageUrl, caption, msg.message_id);

    global.teamnix.replies.set(info.message_id, {
      nix,
      type: "quiz_reply",
      authorId: userId,
      correctAnswer: answer,
      options: options,
      questionId: _id,
      startTime: Date.now(),
      isImage: true,
      category: category
    });

    setTimeout(() => {
      if (global.teamnix.replies.has(info.message_id)) {
        global.teamnix.replies.delete(info.message_id);
        bot.sendMessage(chatId, `⏰ Temps écoulé ! La bonne réponse était : ${answer}`,
          { reply_to_message_id: info.message_id }
        );
      }
    }, 30000);

  } catch (err) {
    console.error(`Image quiz (${category}) error:`, err);
    const detail = err?.response?.data?.error || err.message || "erreur inconnue";
    return bot.sendMessage(chatId, `⚠️ Impossible de créer le quiz ${category}.\n📄 Raison: ${detail}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleQuiz(chatId, msg, bot, userId, userName, args, forcedDifficulty = null) {
  try {
    const category = args[0]?.toLowerCase() || "";

    let queryParams = { userId: userId };
    if (category && category !== "random") {
      queryParams.category = category;
    }
    if (forcedDifficulty) {
      queryParams.difficulty = forcedDifficulty;
    }

    const res = await axios.get(`${BASE_URL}/question`, { params: queryParams });
    const { _id, question, options, answer, category: qCategory, difficulty, imageUrl, hint } = res.data;

    const translatedData = await translateQuestion({
      _id,
      question: hint || question,
      options,
      answer,
      category: qCategory,
      difficulty
    });

    const optText = options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n");

    const caption =
      `🎯 𝗗𝗲́𝗳𝗶 𝗤𝘂𝗶𝘇\n━━━━━━━━━━\n\n` +
      `📚 𝖢𝖺𝗍𝖾́𝗀𝗈𝗋𝗂𝖾: ${qCategory?.charAt(0).toUpperCase() + qCategory?.slice(1) || "Aléatoire"}\n` +
      `🎚️ 𝖣𝗂𝖿𝖿𝗂𝖼𝗎𝗅𝗍𝖾́: ${difficulty?.charAt(0).toUpperCase() + difficulty?.slice(1) || "Moyen"}\n` +
      `❓ 𝗤𝘂𝗲𝘀𝘁𝗶𝗼𝗻: ${translatedData.question}\n\n${optText}\n\n` +
      `⏰ 𝖵𝗈𝗎𝗌 𝖺𝗏𝖾𝗓 30 𝗌𝖾𝖼𝗈𝗇𝖽𝖾𝗌 𝗉𝗈𝗎𝗋 𝗋épondre (A/B/C/D):`;

    const info = await sendQuestionPhoto(bot, chatId, imageUrl, caption, msg.message_id);

    global.teamnix.replies.set(info.message_id, {
      nix,
      type: "quiz_reply",
      authorId: userId,
      correctAnswer: answer,
      options: options,
      questionId: _id,
      startTime: Date.now(),
      difficulty,
      category: qCategory,
      isImage: !!imageUrl
    });

    setTimeout(() => {
      if (global.teamnix.replies.has(info.message_id)) {
        global.teamnix.replies.delete(info.message_id);
        bot.sendMessage(chatId, `⏰ Temps écoulé ! La bonne réponse était: ${answer}`,
          { reply_to_message_id: info.message_id }
        );
      }
    }, 30000);

  } catch (err) {
    console.error("Quiz error:", err);
    bot.sendMessage(chatId, "⚠️ Impossible de récupérer une question. Essayez '/quiz categories' pour voir les options disponibles.",
      { reply_to_message_id: msg.message_id }
    );
  }
}

module.exports = { onStart, onReply, nix };
