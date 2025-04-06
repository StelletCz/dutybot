const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, REST, Routes } = require('discord.js');
const { loadUsers, saveUsers } = require('./jsonbin');
require('dotenv').config();

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
    console.error("Chybí TOKEN, CLIENT_ID nebo GUILD_ID v .env.");
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const dutyChannelId = '1358252706417872978';
let dutyMessageId = null;

function formatTime(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}h ${m}m ${s}s`;
}

// Slash příkazy
const commands = [
    new SlashCommandBuilder().setName('sluzba').setDescription('Připojit/odpojit se od služby'),
    new SlashCommandBuilder().setName('reset').setDescription('Resetuje všechna data')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);
(async () => {
    try {
        console.log('Registruji slash příkazy...');
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log('Příkazy registrovány!');
    } catch (error) {
        console.error('Chyba při registraci příkazů:', error);
    }
})();

client.once('ready', async () => {
    console.log(`✅ Bot přihlášen jako ${client.user.tag}`);

    const channel = await client.channels.fetch(dutyChannelId);
    const users = await loadUsers();

    const embed = await generateEmbed(users);
    const message = await channel.send({ embeds: [embed] });
    dutyMessageId = message.id;

    setInterval(async () => {
        const users = await loadUsers();
        const updatedEmbed = await generateEmbed(users);
        const message = await channel.messages.fetch(dutyMessageId);
        await message.edit({ embeds: [updatedEmbed] });
    }, 60000);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, user, guild } = interaction;
    const member = await guild.members.fetch(user.id);

    const sluzbaRoleId = '1358253943339352225';
    const resetRoleId = '1358230355244744896';
    let users = await loadUsers();

    if (commandName === 'sluzba') {
        if (!member.roles.cache.has(sluzbaRoleId)) {
            return interaction.reply({ content: 'Nemáš práva.', ephemeral: true });
        }

        if (!users[user.id] || users[user.id].status === 'off') {
            users[user.id] = {
                id: user.id,
                status: 'on',
                startTime: Date.now(),
                lastTime: new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' }),
                workedHours: users[user.id]?.workedHours || 0
            };
            await saveUsers(users);
            await interaction.reply(`<@${user.id}> připojen ke službě!`);
        } else {
            const duration = Date.now() - users[user.id].startTime;
            users[user.id].workedHours += duration / 3600000;
            users[user.id].status = 'off';
            await saveUsers(users);
            await interaction.reply(`<@${user.id}> odpojen od služby. Odpracováno: ${formatTime(duration)}`);
        }
    }

    if (commandName === 'reset') {
        if (!member.roles.cache.has(resetRoleId)) {
            return interaction.reply({ content: 'Nemáš práva.', ephemeral: true });
        }

        for (const id in users) {
            users[id] = {
                id,
                status: 'off',
                startTime: 0,
                lastTime: '',
                workedHours: 0
            };
        }
        await saveUsers(users);
        await interaction.reply({ content: 'Data byla resetována.', ephemeral: true });
    }
});

async function generateEmbed(users) {
    const onDuty = Object.values(users).filter(u => u.status === 'on');
    const worked = Object.values(users);

    const onDutyList = onDuty.map(u =>
        `<@${u.id}> od: ${u.lastTime} | ${formatTime(Date.now() - u.startTime)}`
    ).join('\n') || 'Nikdo není ve službě';

    const workedList = worked.map(u =>
        `<@${u.id}> naposledy: ${u.lastTime} | ${formatTime(u.workedHours * 3600000)}`
    ).join('\n') || 'Žádná data.';

    return new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📊 ZAMĚSTNANCI')
        .addFields(
            { name: '✅ Ve službě:', value: onDutyList },
            { name: '⏱️ Tento týden:', value: workedList }
        )
        .setFooter({ text: `Aktualizováno: ${new Date().toLocaleTimeString('cs-CZ')}` })
        .setTimestamp();
}

client.login(token);
