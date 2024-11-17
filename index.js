import { Client, GatewayIntentBits } from "discord.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const BATTLEMETRICS_API_KEY = process.env.BATTLEMETRICS_API_KEY;
const SERVER_ID = process.env.BATTLEMETRICS_SERVERID;
const ORGANIZATION_ID = process.env.BATTLEMETRICS_ORGID;
const BAN_LIST_ID = process.env.BATTLEMETRICS_BANLISTID;
const USER_ID = process.env.BATTLEMETRICS_USERID;
const ALLOWED_USER_ID = process.env.ALLOWED_USER_ID;
const TARGET_EMOJI = ["Masla", "pepe_KMS"];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

async function getPlayerIdBySteamId(steamId) {
  try {
    const response = await axios.post(
      "https://api.battlemetrics.com/players/match",
      {
        data: [
          {
            type: "identifier",
            attributes: {
              type: "steamID",
              identifier: steamId,
            },
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${BATTLEMETRICS_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.data && response.data.data.length > 0) {
      return response.data.data[0].relationships.player.data.id;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

client.once("ready", () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (
    user.bot ||
    user.id !== ALLOWED_USER_ID ||
    !TARGET_EMOJI.includes(reaction.emoji.name)
  )
    return;

  try {
    if (reaction.partial) await reaction.fetch();

    const message = reaction.message;

    const embedTexts = message.embeds
      .map((embed) => {
        const parts = [];
        if (embed.title) parts.push(embed.title);
        if (embed.description) parts.push(embed.description);
        if (embed.fields) {
          embed.fields.forEach((field) => {
            if (field.name) parts.push(field.name);
            if (field.value) parts.push(field.value);
          });
        }
        return parts.join("\n");
      })
      .join("\n");

    const messageContent = `${message.content}\n${embedTexts}`.trim();
    const steamIdMatches = messageContent.matchAll(/\b\d{17}\b/g);
    const steamIds = [...steamIdMatches].map((match) => match[0]);

    if (steamIds.length === 0) {
      return;
    }

    const note = messageContent;
    const timestamp = new Date().toISOString();
    let reason;
    if (reaction.emoji.name === "Masla")
      reason = "Suspect is neutralized by the DP Anti-cheat (DPAC) system";
    if (reaction.emoji.name === "pepe_KMS")
      reason = "Причина бана: не игрок Perm, by Melomory";

    for (const steamId of steamIds) {
      const playerId = await getPlayerIdBySteamId(steamId);
      const banData = {
        data: {
          type: "ban",
          attributes: {
            timestamp: timestamp,
            reason: reason,
            note: note,
            expires: null,
            identifiers: [
              {
                type: "steamID",
                identifier: steamId,
                manual: true,
              },
            ],
            orgWide: true,
            autoAddEnabled: true,
            nativeEnabled: null,
          },
          relationships: {
            server: {
              data: { type: "server", id: SERVER_ID },
            },
            organization: {
              data: { type: "organization", id: ORGANIZATION_ID },
            },
            banList: {
              data: { type: "banList", id: BAN_LIST_ID },
            },
            user: {
              data: { type: "user", id: USER_ID },
            },
          },
        },
      };

      if (playerId) {
        banData.data.relationships.player = {
          data: { type: "player", id: playerId },
        };
      }

      await axios.post("https://api.battlemetrics.com/bans", banData, {
        headers: {
          Authorization: `Bearer ${BATTLEMETRICS_API_KEY}`,
          "Content-Type": "application/json",
        },
      });
    }
  } catch (error) {
    console.error("Ошибка при обработке реакции:", error);
  }
});

client.login(BOT_TOKEN);
