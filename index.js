const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
require('dotenv').config();
const axios = require('axios');

const token = process.env.TOKEN;
const BIN_ID = process.env.BIN_ID;
const API_KEY = process.env.JSONBIN_API_KEY;

if (!token || !BIN_ID || !API_KEY) {
    console.error("TOKEN, BIN_ID nebo JSONBIN_API_KEY nejsou správně nastavené.");
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const dutyChannelId = '1358252706417872978';
let dutyMessageId = null;

// JSONBin – načtení a uložení dat
async function loadUsers() {
    try {
        const response = await axios.get(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
            headers: { 'X-Master-Key': API_KEY }
        });
        return response.data.record || {};
    } catch (error) {
        console.error("Chyba při načítání dat z JSONBin:", error.message);
        return {};
    }
}

async function saveUsers(data) {
    try {
        await axios.put(`https://api.jsonbin.io/v3/b/${BIN_ID}`, data, {
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            }
        });
    } catch (error) {
        console.error("Chyba při ukládání dat do JSONBin:", error.message);
    }
}

function formatTime(ms) {
    const h = Math.floor(ms / (1000 * 60 * 60));
    const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((ms % (1000 * 60)) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

client.once('ready', async () => {
    console.log(`✅ Bot přihlášen jako ${client.user.tag}`);

    const sluzbaCmd = new SlashCommandBuilder().setName('sluzba').setDescription('Připojit/odpojit se od služby');
    const resetCmd = new SlashCommandBuilder().setName('reset').setDescription('Resetuje všechna data a odpracované hodiny');

    await client.application.commands.create(sluzbaCmd);
    await client.application.commands.create(resetCmd);

    const dutyChannel = await client.channels.fetch(dutyChannelId);
    const msg = await dutyChannel.send({ embeds: [generateEmbed(await loadUsers())] });
    dutyMessageId = msg.id;

    // Auto refresh každou minutu
    setInterval(async () => {
        const dutyMessage = await dutyChannel.messages.fetch(dutyMessageId);
        const users = await loadUsers();
        dutyMessage.edit({ embeds: [generateEmbed(users)] });
    }, 60000);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, user } = interaction;
    const member = await interaction.guild.members.fetch(user.id);

    const sluzbaRoleId = '1358253943339352225';
    const resetRoleId = '1358230355244744896';

    let users = await loadUsers();
    const userData = users[user.id] || { workedHours: 0 };

    if (commandName === 'sluzba') {
        if (!member.roles.cache.has(sluzbaRoleId)) {
            return interaction.reply({ content: '❌ Nemáš práva na tento příkaz.', ephemeral: true });
        }

        if (userData.status !== 'on') {
            users[user.id] = {
                id: user.id,
                status: 'on',
                startTime: Date.now(),
                lastTime: new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' }),
                workedHours: userData.workedHours || 0
            };
            await interaction.reply(`<@${user.id}> připojen do služby.`);
        } else {
            const msWorked = Date.now() - userData.startTime;
            users[user.id].workedHours += msWorked / (1000 * 60 * 60);
            users[user.id].status = 'off';
            await interaction.reply(`<@${user.id}> odpojen. Odpracováno: ${formatTime(msWorked)}`);
        }

        await saveUsers(users);
        const channel = await client.channels.fetch(dutyChannelId);
        const msg = await channel.messages.fetch(dutyMessageId);
        msg.edit({ embeds: [generateEmbed(users)] });
    }

    if (commandName === 'reset') {
        if (!member.roles.cache.has(resetRoleId)) {
            return interaction.reply({ content: '❌ Nemáš práva na tento příkaz.', ephemeral: true });
        }

        for (const uid in users) {
            users[uid].workedHours = 0;
            users[uid].status = 'off';
            users[uid].startTime = 0;
            users[uid].lastTime = '';
        }

        await saveUsers(users);
        await interaction.reply({ content: '✅ Všechna data byla resetována.', ephemeral: true });

        const channel = await client.channels.fetch(dutyChannelId);
        const msg = await channel.messages.fetch(dutyMessageId);
        msg.edit({ embeds: [generateEmbed(users)] });
    }
});

function generateEmbed(users) {
    const onDuty = Object.values(users).filter(u => u.status === 'on');
    const worked = Object.values(users);

    const dutyList = onDuty.map(u =>
        `<@${u.id}> - od: ${u.lastTime} | ${formatTime(Date.now() - u.startTime)}`
    ).join('\n') || 'Žádní uživatelé ve službě';

    const workedList = worked.map(u =>
        `<@${u.id}> - ${u.lastTime || 'nikdy'} | ${formatTime((u.workedHours || 0) * 3600000)}`
    ).join('\n') || 'Žádní odpracovaní uživatelé';

    return new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📊 ZAMĚSTNANCI')
        .addFields(
            { name: '✅ Ve službě:', value: dutyList },
            { name: '⏱️ Odpracováno tento týden:', value: workedList }
        )
        .setFooter({ text: `Aktualizováno: ${new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}` })
        .setTimestamp();
}

client.login(token);
