require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// Načteme token z environmentální proměnné
const token = process.env.TOKEN;

// Zajistíme, že token je nastaven
if (!token) {
    console.error("Token nebyl nalezen v environmentálních proměnných.");
    process.exit(1); // Zastavíme běh, pokud není token
}

// Nastavení bota
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const dutyData = {}; // Pro uložení dat o uživatelských hodinách

// ID kanálu, kde bude stat panel (získáš ID kanálu kliknutím pravým tlačítkem na kanál > Kopírovat ID)
const dutyChannelId = '1358183328104321223';

// ID zprávy, kterou bot vytvoří (tu bude pravidelně aktualizovat)
let dutyMessageId = null;

client.once('ready', async () => {
    console.log(`Bot je přihlášen jako ${client.user.tag}`);

    // Získání kanálu pro status zprávu
    const dutyChannel = await client.channels.fetch(dutyChannelId);

    // Vytvoření embed zprávy
    const embed = new EmbedBuilder()
        .setColor('#ffcc00')
        .setTitle('📊 ZAMĚSTNANCI')
        .setDescription('✅ Reaguj ✅ pro nástup do služby\n❌ Reaguj ❌ pro ukončení služby')
        .addFields(
            { name: '✅ Ve službě:', value: 'Žádní uživatelé jsou ve službě' },
            { name: '⏱️ Odpracováno tento týden:', value: '0h 0m' }
        )
        .setTimestamp();

    // Pošleme zprávu do kanálu
    const dutyMessage = await dutyChannel.send({ embeds: [embed] });
    dutyMessageId = dutyMessage.id; // Uložíme ID zprávy pro pozdější aktualizace

    // Přidáme reakce (emoji ✅ a ❌)
    await dutyMessage.react('✅');
    await dutyMessage.react('❌');
});

client.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.message.id !== dutyMessageId || user.bot) return; // Ignoruj boty a zprávy, které nejsou od našeho panelu

    // Získání kanálu pro aktualizaci
    const dutyChannel = await client.channels.fetch(dutyChannelId);
    const dutyMessage = await dutyChannel.messages.fetch(dutyMessageId);

    if (reaction.emoji.name === '✅') {
        // Uživatel jde "on duty"
        dutyData[user.id] = { status: 'on', startTime: Date.now() };
    } else if (reaction.emoji.name === '❌') {
        // Uživatel jde "off duty"
        if (dutyData[user.id] && dutyData[user.id].status === 'on') {
            const hoursWorked = (Date.now() - dutyData[user.id].startTime) / (1000 * 60 * 60); // Počet odpracovaných hodin
            dutyData[user.id].status = 'off';
            dutyData[user.id].workedHours = (dutyData[user.id].workedHours || 0) + hoursWorked;
        }
    }

    // Aktualizace zprávy s novými daty
    const usersOnDuty = Object.keys(dutyData).filter(userId => dutyData[userId].status === 'on').map(userId => `<@${userId}>`);
    const totalWorkedHours = Object.values(dutyData).filter(data => data.workedHours).reduce((sum, data) => sum + data.workedHours, 0);

    // Vytvoří nový embed se staty
    const updatedEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📊 ZAMĚSTNANCI')
        .setDescription('✅ Reaguj ✅ pro nástup do služby\n❌ Reaguj ❌ pro ukončení služby')
        .addFields(
            { name: '✅ Ve službě:', value: usersOnDuty.length ? usersOnDuty.join('\n') : 'Žádní uživatelé jsou ve službě' },
            { name: '⏱️ Odslouženo tento týden:', value: `${totalWorkedHours.toFixed(2)}h` }
        )
        .setTimestamp();

    // Aktualizujeme zprávu
    dutyMessage.edit({ embeds: [updatedEmbed] });
});

client.login(token);
