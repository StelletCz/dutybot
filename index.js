const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

console.log("✅ Spouštím index.js...");

// ENV hodnoty
const token = process.env.TOKEN;
const BIN_ID = process.env.JSONBIN_BIN_ID;
const API_KEY = process.env.JSONBIN_API_KEY;

if (!token || !BIN_ID || !API_KEY) {
    console.error("❌ Chybí TOKEN, JSONBIN_BIN_ID nebo JSONBIN_API_KEY v .env!");
    process.exit(1);
}

// HEADERY pro JSONBIN
const headers = {
    'Content-Type': 'application/json',
    'X-Master-Key': API_KEY
};

// FUNKCE pro načítání a ukládání
async function loadUsers() {
    try {
        const res = await axios.get(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, { headers });
        console.log("📥 JSONBin načten.");
        return res.data.record.users || {};
    } catch (error) {
        console.error("❌ Chyba při načítání z JSONBin:", error.message);
        return {};
    }
}

async function saveUsers(users) {
    try {
        const res = await axios.put(`https://api.jsonbin.io/v3/b/${BIN_ID}`, { users }, { headers });
        console.log("💾 Uživatelé uloženi do JSONBin.");
        return res.data;
    } catch (error) {
        console.error("❌ Chyba při ukládání do JSONBin:", error.message);
    }
}

// Nastavení klienta
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const dutyChannelId = '1358183328104321223';
let dutyMessageId = null;

function formatTime(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

client.once('ready', async () => {
    console.log(`🤖 Bot přihlášen jako ${client.user.tag}`);

    try {
        let users = await loadUsers();

        // Slash příkazy
        await client.application.commands.create(new SlashCommandBuilder().setName('sluzba').setDescription('Připojit/odpojit se od služby'));
        await client.application.commands.create(new SlashCommandBuilder().setName('reset').setDescription('Resetuje všechna data'));
        console.log("✅ Slash příkazy zaregistrovány.");

        const dutyChannel = await client.channels.fetch(dutyChannelId);
        if (!dutyChannel) {
            console.error("❌ Kanál nebyl nalezen.");
            return;
        }

        console.log("✅ Kanál pro službu načten.");

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📊 ZAMĚSTNANCI')
            .setDescription('Načítání dat...')
            .addFields(
                { name: '✅ Ve službě:', value: 'Žádní uživatelé ve službě' },
                { name: '⏱️ Odpracováno tento týden:', value: '0h 0m' }
            )
            .setTimestamp();

        const dutyMessage = await dutyChannel.send({ embeds: [embed] });
        dutyMessageId = dutyMessage.id;
        console.log("✅ Embed zpráva odeslána.");

        // Automatická aktualizace
        setInterval(async () => {
            try {
                const updatedUsers = await loadUsers();

                const usersOnDuty = Object.values(updatedUsers)
                    .filter(u => u.status === 'on')
                    .map(u => {
                        const time = formatTime(Date.now() - u.startTime);
                        return `<@${u.id}> - Ve službě od: ${u.lastTime} | Čas ve službě: ${time}`;
                    });

                const workedThisWeek = Object.values(updatedUsers).map(u => {
                    const worked = formatTime(u.workedHours * 3600000);
                    return `<@${u.id}> - Naposledy ve službě: ${u.lastTime} | Odpracovaný čas: ${worked}`;
                });

                const updatedEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('📊 ZAMĚSTNANCI')
                    .setDescription('Pravidelná aktualizace')
                    .addFields(
                        { name: '✅ Ve službě:', value: usersOnDuty.length ? usersOnDuty.join('\n') : 'Žádní uživatelé ve službě' },
                        { name: '⏱️ Odpracováno tento týden:', value: workedThisWeek.length ? workedThisWeek.join('\n') : 'Žádný záznam' }
                    )
                    .setTimestamp()
                    .setFooter({ text: new Date().toLocaleString('cs-CZ') });

                const msg = await dutyChannel.messages.fetch(dutyMessageId);
                await msg.edit({ embeds: [updatedEmbed] });
                console.log("🔁 Embed zpráva aktualizována.");
            } catch (err) {
                console.error("❌ Chyba při aktualizaci embedu:", err.message);
            }
        }, 60000);

    } catch (err) {
        console.error("❌ Chyba při spouštění:", err.message);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    console.log(`📥 Slash příkaz: ${interaction.commandName} od ${interaction.user.tag}`);

    const { commandName, user } = interaction;
    const member = await interaction.guild.members.fetch(user.id);

    const users = await loadUsers();

    if (commandName === 'sluzba') {
        if (!member.roles.cache.has('1354526121005154393')) {
            return interaction.reply({ content: 'Nemáš práva.', ephemeral: true });
        }

        const userData = users[user.id];
        if (!userData || userData.status === 'off') {
            users[user.id] = {
                id: user.id,
                status: 'on',
                startTime: Date.now(),
                lastTime: new Date().toLocaleString('cs-CZ'),
                workedHours: userData ? userData.workedHours : 0
            };
            await saveUsers(users);
            await interaction.reply(`<@${user.id}> jsi připojen ke službě.`);
            console.log(`✅ ${user.tag} připojen ke službě.`);
        } else {
            const worked = Date.now() - userData.startTime;
            userData.workedHours += worked / 3600000;
            userData.status = 'off';
            await saveUsers(users);
            const formatted = formatTime(worked);
            await interaction.reply(`<@${user.id}> odpojen ze služby. Odpracováno: ${formatted}`);
            console.log(`🕒 ${user.tag} odpojen ze služby. Čas: ${formatted}`);
        }
    }

    if (commandName === 'reset') {
        if (!member.roles.cache.has('1354526121005154394')) {
            return interaction.reply({ content: 'Nemáš práva.', ephemeral: true });
        }

        for (const id in users) {
            users[id].workedHours = 0;
            users[id].status = 'off';
            users[id].startTime = 0;
            users[id].lastTime = '';
        }

        await saveUsers(users);
        await interaction.reply({ content: 'Data byla resetována.', ephemeral: true });
        console.log("♻️ Data byla resetována.");
    }
});

client.login(token).catch(err => {
    console.error("❌ Nepodařilo se přihlásit:", err.message);
});
