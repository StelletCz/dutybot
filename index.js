const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, Collection, REST, Routes } = require('discord.js');
const { loadUsers, saveUsers } = require('./jsonbin');
require('dotenv').config();

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
    console.error('Chybí TOKEN, CLIENT_ID nebo GUILD_ID v .env souboru');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

// Slash příkazy
const commands = [
    new SlashCommandBuilder()
        .setName('sluzba')
        .setDescription('Připojit/odpojit se od služby'),
    new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Resetuje všechna data a odpracované hodiny')
].map(cmd => cmd.toJSON());

// Registrace příkazů
const rest = new REST({ version: '10' }).setToken(token);
(async () => {
    try {
        console.log('Registruji slash příkazy...');
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log('Slash příkazy byly úspěšně zaregistrovány!');
    } catch (error) {
        console.error(error);
    }
})();

const dutyChannelId = '1358252706417872978';
let dutyMessageId = null;

function formatTime(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

client.once('ready', async () => {
    console.log(`✅ Přihlášen jako ${client.user.tag}`);

    let users = await loadUsers();
    const dutyChannel = await client.channels.fetch(dutyChannelId);

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📊 ZAMĚSTNANCI')
        .setDescription('Probíhá sledování služeb.')
        .addFields(
            { name: '✅ Ve službě:', value: 'Zatím nikdo není ve službě' },
            { name: '⏱️ Odpracováno tento týden:', value: '0h 0m' }
        )
        .setTimestamp();

    const message = await dutyChannel.send({ embeds: [embed] });
    dutyMessageId = message.id;

    // Každou minutu aktualizace
    setInterval(() => updateEmbed(dutyChannel), 60000);

    await updateEmbed(dutyChannel);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user } = interaction;
    const member = await interaction.guild.members.fetch(user.id);
    let users = await loadUsers();

    const sluzbaRole = '1358253943339352225';
    const resetRole = '1358230355244744896';

    if (commandName === 'sluzba') {
        if (!member.roles.cache.has(sluzbaRole)) {
            return interaction.reply({ content: 'Nemáš oprávnění použít tento příkaz.', ephemeral: true });
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
            await saveUsers(users);
            await interaction.reply(`<@${user.id}> se právě připojil ke službě.`);
        } else {
            const worked = Date.now() - userData.startTime;
            users[user.id].workedHours += worked / 3600000;
            users[user.id].status = 'off';
            await saveUsers(users);
            await interaction.reply(`<@${user.id}> se odpojil od služby. Odpracoval: ${formatTime(worked)}`);
        }

        const dutyChannel = await client.channels.fetch(dutyChannelId);
        await updateEmbed(dutyChannel);
    }

    if (commandName === 'reset') {
        if (!member.roles.cache.has(resetRole)) {
            return interaction.reply({ content: 'Nemáš oprávnění použít tento příkaz.', ephemeral: true });
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

        const dutyChannel = await client.channels.fetch(dutyChannelId);
        await updateEmbed(dutyChannel);
    }
});

async function updateEmbed(channel) {
    let users = await loadUsers();
    const message = await channel.messages.fetch(dutyMessageId);

    const usersOnDuty = Object.values(users).filter(u => u.status === 'on');
    const workedText = Object.values(users)
        .map(u => `<@${u.id}> – ${formatTime(u.workedHours * 3600000)}`)
        .join('\n') || 'Zatím nikdo neodpracoval žádný čas.';

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📊 ZAMĚSTNANCI')
        .addFields(
            {
                name: '✅ Ve službě:',
                value: usersOnDuty.length
                    ? usersOnDuty.map(u => `<@${u.id}> – od ${u.lastTime} (${formatTime(Date.now() - u.startTime)})`).join('\n')
                    : 'Nikdo není aktuálně ve službě.'
            },
            {
                name: '⏱️ Odpracováno tento týden:',
                value: workedText
            }
        )
        .setTimestamp()
        .setFooter({ text: `Aktualizováno: ${new Date().toLocaleString('cs-CZ')}` });

    await message.edit({ embeds: [embed] });
}

client.login(token);
