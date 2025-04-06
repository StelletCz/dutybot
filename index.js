const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadUsers, saveUsers } = require('./jsonbin'); // Importujeme funkce pro práci s JSONBin
require('dotenv').config();

// Načteme token z environmentálních proměnných
const token = process.env.TOKEN;

// Zajistíme, že token je nastaven
if (!token) {
    console.error("Token nebyl nalezen v environmentálních proměnných.");
    process.exit(1); // Zastavíme běh, pokud není token
}

// Nastavení bota s potřebnými intenty
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,              // Základní pro práci s guildami
        GatewayIntentBits.GuildMessages,       // Pro čtení zpráv v kanálech
        GatewayIntentBits.MessageContent      // Pro čtení obsahu zpráv
    ]
});

// ID kanálu, kde bude stat panel
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

    // Načítání uživatelů při spuštění
    let users = await loadUsers();

    // Vytvoření slash příkazu
    const data = new SlashCommandBuilder()
        .setName('sluzba')
        .setDescription('Připojit/odpojit se od služby');

    // Registrace příkazu u Discord API
    await client.application.commands.create(data);

    // Získání kanálu pro status zprávu
    const dutyChannel = await client.channels.fetch(dutyChannelId);

    // Vytvoření embed zprávy
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📊 ZAMĚSTNANCI')
        .setDescription('TEST')
        .addFields(
            { name: '✅ Ve službě:', value: 'Žádní uživatelé jsou ve službě' },
            { name: '⏱️ Odpracováno tento týden:', value: '0h 0m' }
        )
        .setTimestamp();

    // Pošleme zprávu do kanálu
    const dutyMessage = await dutyChannel.send({ embeds: [embed] });
    dutyMessageId = dutyMessage.id; // Uložíme ID zprávy pro pozdější aktualizace

    // **Načteme uživatele ihned po startu** a zobrazíme je
    const usersOnDuty = Object.values(users).filter(userData => userData.status === 'on').map(userData => {
        const timeInService = formatTime(Date.now() - userData.startTime); // Čas ve službě v HH:MM:SS
        return `<@${userData.id}> - **Ve službě od:** ${userData.lastTime} | **Čas ve službě:** ${timeInService}`;
    });

    const workedThisWeek = Object.values(users).map(userData => {
        const workedTime = formatTime(userData.workedHours * 1000 * 60 * 60); // Celkový odpracovaný čas v HH:MM:SS
        return `<@${userData.id}> - **Naposledy ve službě:** ${userData.lastTime} | **Odpracovaný čas:** ${workedTime}`;
    });

    // Celkový čas odsloužený tímto týdnem
    const totalWorkedHours = Object.values(users).reduce((sum, userData) => sum + userData.workedHours, 0);

    // Vytvoří nový embed se staty
    const updatedEmbed = new EmbedBuilder()
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

    // **Aktualizujeme zprávu hned po startu bota**
    dutyMessage.edit({ embeds: [updatedEmbed] });

    // Automatická aktualizace každou minutu
    setInterval(async () => {
        const dutyChannel = await client.channels.fetch(dutyChannelId);
        const dutyMessage = await dutyChannel.messages.fetch(dutyMessageId);

        // Načteme uživatele z JSONBin před každou aktualizací
        let users = await loadUsers();

        // Generování seznamu lidí, kteří jsou ve službě, s jejich časy
        const usersOnDuty = Object.values(users).filter(userData => userData.status === 'on').map(userData => {
            const timeInService = formatTime(Date.now() - userData.startTime); // Čas ve službě v HH:MM:SS
            return `<@${userData.id}> - **Ve službě od:** ${userData.lastTime} | **Čas ve službě:** ${timeInService}`;
        });

        // Generování seznamu pro "Odpracováno tento týden"
        const workedThisWeek = Object.values(users).map(userData => {
            const workedTime = formatTime(userData.workedHours * 1000 * 60 * 60); // Celkový odpracovaný čas v HH:MM:SS
            return `<@${userData.id}> - **Naposledy ve službě:** ${userData.lastTime} | **Odpracovaný čas:** ${workedTime}`;
        });

        // Celkový čas odsloužený tímto týdnem
        const totalWorkedHours = Object.values(users).reduce((sum, userData) => sum + userData.workedHours, 0);

        // Vytvoří nový embed se staty
        const updatedEmbed = new EmbedBuilder()
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

        // Aktualizujeme zprávu
        dutyMessage.edit({ embeds: [updatedEmbed] });
    }, 60000); // 60 000 ms = 1 minuta
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, user } = interaction;

    // Ověření, že uživatel má správnou roli
    const requiredRoleId = '1354526121005154393';
    const member = await interaction.guild.members.fetch(user.id);

    if (!member.roles.cache.has(requiredRoleId)) {
        return interaction.reply({
            content: 'Nemáš dostatečná práva pro použití tohoto příkazu.',
            ephemeral: true // Zobrazí tuto zprávu pouze uživateli
        });
    }

    if (commandName === 'sluzba') {
        // Načítání uživatele z JSONBin
        let users = await loadUsers();
        const userData = users[user.id];

        if (!userData || userData.status === 'off') {
            // Pokud uživatel není ve službě, připojí ho
            users[user.id] = {
                id: user.id,
                status: 'on',
                startTime: Date.now(),
                lastTime: new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' }),
                workedHours: userData ? userData.workedHours : 0 // Pokud uživatel už nějaké hodiny odpracoval, připočítáme je
            };

            await saveUsers(users);
            await interaction.reply(`<@${user.id}>, jsi připojen k službě!`);
        } else {
            // Pokud je uživatel ve službě, odpojí ho
            const hoursWorked = Date.now() - userData.startTime; // Počet odpracovaných milisekund
            const formattedWorkedTime = formatTime(hoursWorked); // Převede milisekundy na HH:MM:SS

            // Přičteme odpracovaný čas k celkovým hodinám
            userData.workedHours += hoursWorked / (1000 * 60 * 60); // Přidáme odpracované hodiny
            userData.status = 'off';

            await saveUsers(users);
            await interaction.reply(`<@${user.id}>, jsi odpojen od služby. Odpracoval/a jsi ${formattedWorkedTime}.`);
        }

        // **Uživatelská data aktualizována hned po příkazu /sluzba**
        const usersOnDuty = Object.values(users).filter(userData => userData.status === 'on').map(userData => {
            const timeInService = formatTime(Date.now() - userData.startTime); // Čas ve službě v HH:MM:SS
            return `<@${userData.id}> - **Ve službě od:** ${userData.lastTime} | **Čas ve službě:** ${timeInService}`;
        });

        const workedThisWeek = Object.values(users).map(userData => {
            const workedTime = formatTime(userData.workedHours * 1000 * 60 * 60); // Celkový odpracovaný čas v HH:MM:SS
            return `<@${userData.id}> - **Naposledy ve službě:** ${userData.lastTime} | **Odpracovaný čas:** ${workedTime}`;
        });

        const totalWorkedHours = Object.values(users).reduce((sum, userData) => sum + userData.workedHours, 0);

        const updatedEmbed = new EmbedBuilder()
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

        // Získání kanálu pro status zprávu
        const dutyChannel = await client.channels.fetch(dutyChannelId);
        const dutyMessage = await dutyChannel.messages.fetch(dutyMessageId);

        // Aktualizace zprávy
        dutyMessage.edit({ embeds: [updatedEmbed] });
    }
});

// Při ukončení nebo pádu bota smažeme zprávu
process.on('SIGINT', async () => {
    console.log('Bot se vypíná...');
    if (dutyMessageId) {
        try {
            const dutyChannel = await client.channels.fetch(dutyChannelId);
            await dutyChannel.messages.delete(dutyMessageId);
            console.log('Zpráva byla smazána.');
        } catch (error) {
            console.error('Chyba při mazání zprávy:', error);
        }
    }
    process.exit();
});

// Přihlášení bota
client.login(token);
