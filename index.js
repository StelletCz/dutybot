const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { loadUsers, saveUsers } = require('./jsonbin');

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
        .setTitle('👮 Služby')
        .setDescription('*Žádní uživatelé nejsou ve službě*')
        .setTimestamp();

      const message = await channel.send({ embeds: [embed] });
      dutyMessageId = message.id;
      console.log(`📨 Embed zpráva vytvořena s ID: ${dutyMessageId}`);

      const envPath = path.resolve(__dirname, '.env');
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('DUTY_MESSAGE_ID=')) {
        envContent += `\nDUTY_MESSAGE_ID=${dutyMessageId}`;
      } else {
        envContent = envContent.replace(/DUTY_MESSAGE_ID=.*/, `DUTY_MESSAGE_ID=${dutyMessageId}`);
      }
      fs.writeFileSync(envPath, envContent);
      console.log(`📁 DUTY_MESSAGE_ID zapsáno do .env souboru.`);
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
    const now = new Date().toISOString();

    if (users[userId] && users[userId].start) {
      const start = new Date(users[userId].start);
      const end = new Date();
      const hours = ((end - start) / (1000 * 60 * 60)).toFixed(2);

      if (!users[userId].total) users[userId].total = 0;
      users[userId].total += parseFloat(hours);
      delete users[userId].start;

      await interaction.reply({ content: `❌ ${userName} ukončil službu. (+${hours} h)`, ephemeral: true });
    } else {
      users[userId] = {
        name: userName,
        start: now,
        total: users[userId]?.total || 0
      };
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

    const activeUsers = Object.entries(users)
      .filter(([_, data]) => data.start)
      .map(([_, data]) => `🟢 **${data.name}** (od <t:${Math.floor(new Date(data.start).getTime() / 1000)}:R>)`)
      .join('\n') || '*Žádní uživatelé nejsou ve službě*';

    const totals = Object.entries(users)
      .map(([_, data]) => `👤 **${data.name}** - ${data.total?.toFixed(2) || 0} h`)
      .join('\n') || '*Žádné údaje*';

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('👮 Služby')
      .addFields(
        { name: 'Aktivní ve službě', value: activeUsers, inline: false },
        { name: 'Týdenní časy', value: totals, inline: false }
      )
      .setTimestamp();

    await message.edit({ embeds: [embed] });
  } catch (error) {
    console.error("❌ Chyba při aktualizaci embed zprávy:", error);
  }
}

client.login(token)
  .then(() => console.log("🚀 Přihlášení proběhlo úspěšně."))
  .catch(err => console.error("❌ Nepodařilo se přihlásit:", err));
