const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Načteme token z environmentální proměnné
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

const dutyData = {}; // Pro uložení dat o uživatelských hodinách

// ID kanálu, kde bude stat panel (získáš ID kanálu kliknutím pravým tlačítkem na kanál > Kopírovat ID)
const dutyChannelId = '1358183328104321223';

// ID zprávy, kterou bot vytvoří (tu bude pravidelně aktualizovat)
let dutyMessageId = null;

// Funkce pro převod času na HH:MM:SS
function formatTime(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

client.once('ready', async () => {
    console.log(`Bot je přihlášen jako ${client.user.tag}`);

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

    // Automatická aktualizace každou minutu
    setInterval(async () => {
        const dutyChannel = await client.channels.fetch(dutyChannelId);
        const dutyMessage = await dutyChannel.messages.fetch(dutyMessageId);

        // Generování seznamu lidí, kteří jsou ve službě, s jejich časy
        const usersOnDuty = Object.keys(dutyData).filter(userId => dutyData[userId].status === 'on')
            .map(userId => {
                const userData = dutyData[userId];
                const timeInService = formatTime(Date.now() - userData.startTime); // Čas ve službě v HH:MM:SS
                return `<@${userId}> - Naposledy ve službě: ${userData.lastTime} - ${timeInService}`;
            });

        // Generování seznamu pro "Odpracováno tento týden"
        const workedThisWeek = Object.keys(dutyData)
            .filter(userId => dutyData[userId].workedHours)
            .map(userId => {
                const userData = dutyData[userId];
                const workedTime = formatTime(userData.workedHours * 1000 * 60 * 60); // Celkový odpracovaný čas v HH:MM:SS
                return `<@${userId}> - Naposledy ve službě: ${userData.lastTime} | Celkový odpracovaný čas: ${workedTime}`;
            });

        // Celkový čas odsloužený tímto týdnem
        const totalWorkedHours = Object.values(dutyData).filter(data => data.workedHours).reduce((sum, data) => sum + data.workedHours, 0);

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

    if (commandName === 'sluzba') {
        // Pokud uživatel není ve službě, připojí ho
        if (!dutyData[user.id] || dutyData[user.id].status === 'off') {
            dutyData[user.id] = { 
                status: 'on', 
                startTime: Date.now(), 
                lastTime: new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' }) 
            };

            await interaction.reply(`<@${user.id}>, jsi připojen k službě!`);
        } else {
            // Pokud je uživatel ve službě, odpojí ho
            if (dutyData[user.id].status === 'on') {
                const hoursWorked = Date.now() - dutyData[user.id].startTime; // Počet odpracovaných milisekund
                const formattedWorkedTime = formatTime(hoursWorked); // Převede milisekundy na HH:MM:SS
                dutyData[user.id].status = 'off';
                dutyData[user.id].workedHours = (dutyData[user.id].workedHours || 0) + (hoursWorked / (1000 * 60 * 60)); // Přidání k celkovému odpracovanému času
                dutyData[user.id].lastTime = new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' });

                await interaction.reply(`<@${user.id}>, jsi odpojen od služby. Odpracoval/a jsi ${formattedWorkedTime}.`);
            }
        }

        // Generování seznamu lidí, kteří jsou ve službě, s jejich časy
        const usersOnDuty = Object.keys(dutyData).filter(userId => dutyData[userId].status === 'on')
            .map(userId => {
                const userData = dutyData[userId];
                const timeInService = formatTime(Date.now() - userData.startTime); // Čas ve službě v HH:MM:SS
                return `<@${userId}> - Naposledy ve službě: ${userData.lastTime} - ${timeInService}`;
            });

        // Generování seznamu pro "Odpracováno tento týden"
        const workedThisWeek = Object.keys(dutyData)
            .filter(userId => dutyData[userId].workedHours)
            .map(userId => {
                const userData = dutyData[userId];
                const workedTime = formatTime(userData.workedHours * 1000 * 60 * 60); // Celkový odpracovaný čas v HH:MM:SS
                return `<@${userId}> - Naposledy ve službě: ${userData.lastTime} | Celkový odpracovaný čas: ${workedTime}`;
            });

        // Celkový čas odsloužený tímto týdnem
        const totalWorkedHours = Object.values(dutyData).filter(data => data.workedHours).reduce((sum, data) => sum + data.workedHours, 0);

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
        const dutyChannel = await client.channels.fetch(dutyChannelId);
        const dutyMessage = await dutyChannel.messages.fetch(dutyMessageId);
        dutyMessage.edit({ embeds: [updatedEmbed] });
    }
});

client.login(token);
