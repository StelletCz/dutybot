const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadUsers, saveUsers } = require('./jsonbin');
require('dotenv').config();

const token = process.env.TOKEN;

if (!token) {
    console.error("Token nebyl nalezen v environmentálních proměnných.");
    process.exit(1);
}

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
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

client.once('ready', async () => {
    console.log(`Bot je přihlášen jako ${client.user.tag}`);

    let users = {};
    try {
        users = await loadUsers();
        console.log("✅ Data z JSONBin načtena.");
    } catch (err) {
        console.error("❌ Chyba při načítání dat z JSONBin:", err.message);
    }

    const data = new SlashCommandBuilder().setName('sluzba').setDescription('Připojit/odpojit se od služby');
    const resetData = new SlashCommandBuilder().setName('reset').setDescription('Resetuje všechna data a odpracované hodiny');

    await client.application.commands.create(data);
    await client.application.commands.create(resetData);

    const dutyChannel = await client.channels.fetch(dutyChannelId);

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📊 ZAMĚSTNANCI')
        .setDescription('TEST')
        .addFields(
            { name: '✅ Ve službě:', value: 'Žádní uživatelé jsou ve službě' },
            { name: '⏱️ Odpracováno tento týden:', value: '0h 0m' }
        )
        .setTimestamp();

    const dutyMessage = await dutyChannel.send({ embeds: [embed] });
    dutyMessageId = dutyMessage.id;

    const updateEmbed = async () => {
        let users = {};
        try {
            users = await loadUsers();
        } catch (err) {
            console.error("❌ Chyba při načítání dat z JSONBin:", err.message);
            return;
        }

        const usersOnDuty = Object.values(users).filter(u => u.status === 'on').map(u => `<@${u.id}> - **Ve službě od:** ${u.lastTime} | **Čas ve službě:** ${formatTime(Date.now() - u.startTime)}`);
        const workedThisWeek = Object.values(users).map(u => `<@${u.id}> - **Naposledy ve službě:** ${u.lastTime} | **Odpracovaný čas:** ${formatTime(u.workedHours * 1000 * 60 * 60)}`);

        const updatedEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📊 ZAMĚSTNANCI')
            .setDescription('TEST')
            .addFields(
                { name: '✅ Ve službě:', value: usersOnDuty.length ? usersOnDuty.join('\n') : 'Žádní uživatelé jsou ve službě' },
                { name: '⏱️ Odpracováno tento týden:', value: workedThisWeek.length ? workedThisWeek.join('\n') : 'Žádní uživatelé neodpracovali tento týden žádný čas' }
            )
            .setTimestamp()
            .setFooter({ text: `Aktualizováno: ${new Date().toLocaleString('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' })}` });

        const dutyChannel = await client.channels.fetch(dutyChannelId);
        const dutyMessage = await dutyChannel.messages.fetch(dutyMessageId);
        dutyMessage.edit({ embeds: [updatedEmbed] });
    };

    updateEmbed();
    setInterval(updateEmbed, 60000);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;
    const { commandName, user } = interaction;

    const sluzbaRoleId = '1354526121005154393';
    const resetRoleId = '1354526121005154394';
    const member = await interaction.guild.members.fetch(user.id);

    if (commandName === 'sluzba') {
        if (!member.roles.cache.has(sluzbaRoleId)) {
            return interaction.reply({ content: 'Nemáš dostatečná práva.', ephemeral: true });
        }

        let users = {};
        try {
            users = await loadUsers();
        } catch (err) {
            console.error("❌ Chyba při načítání dat:", err.message);
            return interaction.reply({ content: 'Chyba při načítání dat.', ephemeral: true });
        }

        const userData = users[user.id];

        if (!userData || userData.status === 'off') {
            users[user.id] = {
                id: user.id,
                status: 'on',
                startTime: Date.now(),
                lastTime: new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' }),
                workedHours: userData ? userData.workedHours : 0
            };

            try {
                await saveUsers(users);
            } catch (err) {
                console.error("❌ Chyba při ukládání dat:", err.message);
                return interaction.reply({ content: 'Chyba při ukládání dat.', ephemeral: true });
            }

            await interaction.reply(`<@${user.id}>, jsi připojen k službě!`);
        } else {
            const hoursWorked = Date.now() - userData.startTime;
            const formattedWorkedTime = formatTime(hoursWorked);

            userData.workedHours += hoursWorked / (1000 * 60 * 60);
            userData.status = 'off';

            try {
                await saveUsers(users);
            } catch (err) {
                console.error("❌ Chyba při ukládání dat:", err.message);
                return interaction.reply({ content: 'Chyba při ukládání dat.', ephemeral: true });
            }

            await interaction.reply(`<@${user.id}>, jsi odpojen od služby. Odpracoval/a jsi ${formattedWorkedTime}.`);
        }

        try {
            await updateEmbed();
        } catch (err) {
            console.error("❌ Chyba při aktualizaci embed zprávy:", err.message);
        }
    }

    if (commandName === 'reset') {
        if (!member.roles.cache.has(resetRoleId)) {
            return interaction.reply({ content: 'Nemáš dostatečná práva.', ephemeral: true });
        }

        let users = {};
        try {
            users = await loadUsers();
        } catch (err) {
            console.error("❌ Chyba při načítání dat:", err.message);
            return interaction.reply({ content: 'Chyba při načítání dat.', ephemeral: true });
        }

        for (const userId in users) {
            users[userId].workedHours = 0;
            users[userId].status = 'off';
            users[userId].startTime = 0;
            users[userId].lastTime = '';
        }

        try {
            await saveUsers(users);
        } catch (err) {
            console.error("❌ Chyba při ukládání resetovaných dat:", err.message);
            return interaction.reply({ content: 'Chyba při ukládání dat.', ephemeral: true });
        }

        await interaction.reply({ content: 'Data byla resetována.', ephemeral: true });
        try {
            await updateEmbed();
        } catch (err) {
            console.error("❌ Chyba při aktualizaci embed zprávy:", err.message);
        }
    }
});

client.login(token);
