import { Client, GatewayIntentBits } from "discord.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ALLOWED_USER_ID = process.env.ALLOWED_USER_ID;
const TARGET_EMOJI = ["Masla", "pepe_KMS"];

const ORGANIZATIONS = [
  {
    organizationId: process.env.BATTLEMETRICS_ORGID,
    banListId: process.env.BATTLEMETRICS_BANLISTID,
    serverId: process.env.BATTLEMETRICS_SERVERID,
    reasons: {
      Masla: "Suspect is neutralized by the DP Anti-cheat (DPAC) system",
      pepe_KMS: "Причина бана: не игрок Perm",
    },
    includeNote: true,
  },
  {
    organizationId: process.env.BATTLEMETRICS_ORGID_2,
    banListId: process.env.BATTLEMETRICS_BANLISTID_2,
    serverId: process.env.BATTLEMETRICS_SERVERID_2,
    reasons: {
      Masla: "Причина бана: Читер Perm",
      pepe_KMS: "Причина бана: не игрок Perm",
    },
    includeNote: false,
  },
];

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
          Authorization: `Bearer ${process.env.BATTLEMETRICS_API_KEY}`,
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
    console.error("Ошибка при получении playerId:", error);
    return null;
  }
}

async function banPlayerInMultipleOrganizations(
  steamId,
  playerId,
  emoji,
  globalNote,
  timestamp
) {
  for (const org of ORGANIZATIONS) {
    const reason = org.reasons[emoji];
    if (!reason) continue;

    const banData = {
      data: {
        type: "ban",
        attributes: {
          timestamp: timestamp,
          reason: reason,
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
            data: { type: "server", id: org.serverId },
          },
          organization: {
            data: { type: "organization", id: org.organizationId },
          },
          banList: {
            data: { type: "banList", id: org.banListId },
          },
          user: {
            data: { type: "user", id: process.env.BATTLEMETRICS_USERID },
          },
        },
      },
    };

    if (org.includeNote && globalNote) {
      banData.data.attributes.note = globalNote;
    }

    if (playerId) {
      banData.data.relationships.player = {
        data: { type: "player", id: playerId },
      };
    }

    try {
      await axios.post("https://api.battlemetrics.com/bans", banData, {
        headers: {
          Authorization: `Bearer ${process.env.BATTLEMETRICS_API_KEY}`,
          "Content-Type": "application/json",
        },
      });
      console.log(
        `Игрок ${steamId} успешно забанен в организации ${org.organizationId}`
      );
    } catch (error) {
      console.error(
        `Ошибка при добавлении бана в организации ${org.organizationId}:", error`
      );
    }
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
    const uniqueSteamIds = [
      ...new Set([...steamIdMatches].map((match) => match[0])),
    ];

    if (uniqueSteamIds.length === 0) {
      return;
    }

    const note = messageContent;
    const timestamp = new Date().toISOString();

    for (const steamId of uniqueSteamIds) {
      const playerId = await getPlayerIdBySteamId(steamId);
      await banPlayerInMultipleOrganizations(
        steamId,
        playerId,
        reaction.emoji.name,
        note,
        timestamp
      );
    }
  } catch (error) {
    console.error("Ошибка при обработке реакции:", error);
  }
});

client.login(BOT_TOKEN);
