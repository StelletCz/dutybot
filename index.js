const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
require('dotenv').config();
const { loadUsers, saveUsers } = require('./jsonbin');
const { updateEnvVariable } = require('./envUtils');

const token = process.env.DISCORD_TOKEN;
const dutyChannelId = process.env.DUTY_CHANNEL_ID;
let dutyMessageId = process.env.DUTY_MESSAGE_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.once('ready', async () => {
  console.log(`✅ Bot je přihlášen jako ${client.user.tag}`);

  try {
    await client.application.commands.set([
      {
        name: 'sluzba',
        description: 'Zahájí nebo ukončí službu pro uživatele'
      }
    ]);
    console.log("📦 Slash příkazy zaregistrovány.");
  } catch (error) {
    console.error("❌ Chyba při registraci příkazů:", error);
  }

  try {
    const channel = await client.channels.fetch(dutyChannelId);
    console.log("📺 Kanál načten.");

    if (!dutyMessageId) {
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('👮 Seznam aktivních ve službě')
        .setDescription('*Žádní uživatelé nejsou ve službě*')
        .setTimestamp();

      const message = await channel.send({ embeds: [embed] });
      dutyMessageId = message.id;
      updateEnvVariable('DUTY_MESSAGE_ID', dutyMessageId);
      console.log(`📨 Embed zpráva vytvořena s ID: ${dutyMessageId}`);
    }

    await updateEmbed(channel);
    setInterval(async () => {
      await updateEmbed(channel);
    }, 60 * 1000);
  } catch (error) {
    console.error("❌ Chyba při načítání kanálu nebo spuštění embed aktualizace:", error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'sluzba') return;

  try {
    let users = await loadUsers();
    const userId = interaction.user.id;
    const userName = interaction.user.username;

    if (users[userId]) {
      delete users[userId];
      await interaction.reply({ content: `❌ ${userName} ukončil službu.`, ephemeral: true });
    } else {
      users[userId] = userName;
      await interaction.reply({ content: `✅ ${userName} zahájil službu.`, ephemeral: true });
    }

    await saveUsers(users);
    const channel = await client.channels.fetch(dutyChannelId);
    await updateEmbed(channel);

  } catch (error) {
    console.error("❌ Chyba při zpracování příkazu:", error);
    await interaction.reply({ content: "⚠️ Nastala chyba, zkuste to znovu.", ephemeral: true });
  }
});

async function updateEmbed(channel) {
  try {
    let users = await loadUsers();
    const message = await channel.messages.fetch(dutyMessageId);

    const activeUsers = Object.values(users).join('\n') || '*Žádní uživatelé nejsou ve službě*';

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('👮 Seznam aktivních ve službě')
      .setDescription(activeUsers)
      .setTimestamp();

    await message.edit({ embeds: [embed] });
  } catch (error) {
    console.error("❌ Chyba při aktualizaci embed zprávy:", error);
  }
}

client.login(token)
  .then(() => console.log("🚀 Přihlášení proběhlo úspěšně."))
  .catch(err => console.error("❌ Nepodařilo se přihlásit:", err));
