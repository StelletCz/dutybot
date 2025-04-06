import { Client, GatewayIntentBits, Routes, REST, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const token = process.env.TOKEN;
const BIN_ID = process.env.BIN_ID;
const API_KEY = process.env.JSONBIN_API_KEY;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName('sluzba')
    .setDescription('Změní tvůj stav ve službě.'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

let users = await loadUsers();
let dutyMessage;

client.once('ready', async () => {
  console.log(`Přihlášen jako ${client.user.tag}`);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands },
  );

  const channel = await client.channels.fetch('1358252706417872978');

  const embed = generateEmbed();
  const sentMessage = await channel.send({ embeds: [embed] });
  dutyMessage = sentMessage;

  setInterval(async () => {
    await saveUsers(users);
    const updatedEmbed = generateEmbed();
    if (dutyMessage) await dutyMessage.edit({ embeds: [updatedEmbed] });
  }, 60000);
});

function generateEmbed() {
  const usersOnDuty = Object.values(users).filter(u => u.status === 'on').map(u => {
    const duration = formatTime(Date.now() - u.startTime);
    return `<@${u.id}> - **Ve službě od:** ${u.lastTime} | **Čas ve službě:** ${duration}`;
  });

  const workedThisWeek = Object.values(users).map(u => {
    const worked = formatTime(u.workedHours * 3600000);
    return `<@${u.id}> - **Naposledy ve službě:** ${u.lastTime} | **Odpracovaný čas:** ${worked}`;
  });

  return new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('📊 ZAMĚSTNANCI')
    .addFields(
      { name: '✅ Ve službě:', value: usersOnDuty.length ? usersOnDuty.join('\n') : 'Nikdo není ve službě' },
      { name: '⏱️ Odpracováno tento týden:', value: workedThisWeek.length ? workedThisWeek.join('\n') : 'Zatím nikdo neodpracoval' }
    )
    .setTimestamp()
    .setFooter({ text: `Aktualizováno: ${new Date().toLocaleString('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' })}` });
}

async function loadUsers() {
  const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
    headers: {
      'X-Master-Key': API_KEY
    }
  });
  const data = await response.json();
  return data.record || {};
}

async function saveUsers(users) {
  await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': API_KEY
    },
    body: JSON.stringify(users)
  });
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'sluzba') {
    const id = interaction.user.id;
    const now = Date.now();
    const user = users[id] || { id, workedHours: 0, status: 'off', lastTime: 'Nikdy' };

    if (user.status === 'on') {
      const time = now - user.startTime;
      user.workedHours += time / 3600000;
      user.status = 'off';
      user.lastTime = new Date(now).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' });
      delete user.startTime;
      await interaction.reply({ content: 'Ukončil jsi službu.', ephemeral: true });
    } else {
      user.status = 'on';
      user.startTime = now;
      user.lastTime = new Date(now).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' });
      await interaction.reply({ content: 'Nastoupil jsi do služby.', ephemeral: true });
    }

    users[id] = user;
    await saveUsers(users);
  }
});

client.login(token);
