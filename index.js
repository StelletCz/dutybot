const { Client, GatewayIntentBits, Partials, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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

function formatTime(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

client.once('ready', async () => {
  console.log(`✅ Bot je přihlášen jako ${client.user.tag}`);

  try {
    await client.application.commands.set([
      new SlashCommandBuilder().setName('sluzba').setDescription('Zahájí nebo ukončí službu'),
      new SlashCommandBuilder().setName('reset').setDescription('Resetuje všechna data')
    ]);
    console.log("📦 Slash příkazy zaregistrovány.");
  } catch (error) {
    console.error("❌ Chyba při registraci příkazů:", error);
  }

  try {
    const channel = await client.channels.fetch(dutyChannelId);

    if (!dutyMessageId) {
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📊 ZAMĚSTNANCI')
        .setDescription('TEST')
        .addFields(
          { name: '✅ Ve službě:', value: 'Žádní uživatelé jsou ve službě' },
          { name: '⏱️ Odpracováno tento týden:', value: '0h 0m' }
        )
        .setTimestamp();

      const message = await channel.send({ embeds: [embed] });
      dutyMessageId = message.id;

      const envPath = path.resolve(__dirname, '.env');
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (!envContent.includes('DUTY_MESSAGE_ID=')) {
        envContent += `\nDUTY_MESSAGE_ID=${dutyMessageId}`;
      } else {
        envContent = envContent.replace(/DUTY_MESSAGE_ID=.*/, `DUTY_MESSAGE_ID=${dutyMessageId}`);
      }
      fs.writeFileSync(envPath, envContent);
    }

    await updateEmbed(channel);
    setInterval(() => updateEmbed(channel), 60 * 1000);
  } catch (error) {
    console.error("❌ Chyba při načítání kanálu nebo zprávy:", error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user } = interaction;
  const users = await loadUsers();

  if (commandName === 'sluzba') {
    const userData = users[user.id];

    if (!userData || userData.status === 'off') {
      users[user.id] = {
        id: user.id,
        status: 'on',
        startTime: Date.now(),
        lastTime: new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' }),
        workedHours: userData?.workedHours || 0
      };

      await saveUsers(users);
      await interaction.reply({ content: `✅ <@${user.id}> zahájil službu.`, ephemeral: true });
    } else {
      const workedMs = Date.now() - userData.startTime;
      const workedHrs = workedMs / (1000 * 60 * 60);
      userData.workedHours += workedHrs;
      userData.status = 'off';
      delete userData.startTime;

      await saveUsers(users);
      await interaction.reply({ content: `❌ <@${user.id}> ukončil službu. (+${formatTime(workedMs)})`, ephemeral: true });
    }

    const channel = await client.channels.fetch(dutyChannelId);
    await updateEmbed(channel);
  }

  if (commandName === 'reset') {
    for (const id in users) {
      users[id] = {
        id,
        status: 'off',
        workedHours: 0,
        lastTime: '',
        startTime: 0
      };
    }

    await saveUsers(users);
    await interaction.reply({ content: '✅ Všechna data byla resetována.', ephemeral: true });

    const channel = await client.channels.fetch(dutyChannelId);
    await updateEmbed(channel);
  }
});

async function updateEmbed(channel) {
  try {
    const users = await loadUsers();
    const message = await channel.messages.fetch(dutyMessageId);

    const usersOnDuty = Object.values(users)
      .filter(u => u.status === 'on')
      .map(u => {
        const timeInService = formatTime(Date.now() - u.startTime);
        return `<@${u.id}> - **Ve službě od:** ${u.lastTime} | **Čas ve službě:** ${timeInService}`;
      });

    const workedThisWeek = Object.values(users)
      .map(u => {
        const totalWorked = formatTime((u.workedHours || 0) * 60 * 60 * 1000);
        return `<@${u.id}> - **Naposledy ve službě:** ${u.lastTime || 'N/A'} | **Odpracovaný čas:** ${totalWorked}`;
      });

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('📊 ZAMĚSTNANCI')
      .setDescription('TEST')
      .addFields(
        { name: '✅ Ve službě:', value: usersOnDuty.length ? usersOnDuty.join('\n') : 'Žádní uživatelé jsou ve službě' },
        { name: '⏱️ Odpracováno tento týden:', value: workedThisWeek.length ? workedThisWeek.join('\n') : 'Žádní uživatelé neodpracovali tento týden žádný čas' }
      )
      .setTimestamp()
      .setFooter({
        text: `Aktualizováno: ${new Date().toLocaleString('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' })}`
      });

    await message.edit({ embeds: [embed] });
  } catch (err) {
    console.error("❌ Chyba při aktualizaci embedu:", err);
  }
}

client.login(token);
