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
        GatewayIntentBits.MessageContent       // Pro čtení obsahu zpráv
    ]
});

const dutyData = {}; // Pro uložení dat o uživatelských hodinách

// ID kanálu, kde bude stat panel (získáš ID kanálu kliknutím pravým tlačítkem na kanál > Kopírovat ID)
const dutyChannelId = '1358183328104321223';

// ID zprávy, kterou bot vytvoří (tu bude pravidelně aktualizovat)
let dutyMessageId = null;

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
        .setDescription('Test')
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
        await updateDutyMessage();
    }, 60000); // 60000 ms = 1 minuta
});

async function updateDutyMessage() {
    // Získání aktuálního data pro footer
    const currentTime = new Date().toLocaleString();

    // Aktualizace zprávy s novými daty
    const usersOnDuty = Object.keys(dutyData)
        .filter(userId => dutyData[userId].status === 'on')
        .map(userId => {
            const userData = dutyData[userId];
            const hoursOnDuty = ((Date.now() - userData.startTime) / (1000 * 60 * 60)).toFixed(2);
            return `<@${userId}> - Přišel do služby: ${userData.startDate} - Doba ve službě: ${hoursOnDuty}h`;
        });

    const totalWorkedHours = Object.values(dutyData)
        .filter(data => data.workedHours)
        .reduce((sum, data) => sum + data.workedHours, 0);

    // Vytvoří nový embed se staty
    const updatedEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📊 ZAMĚSTNANCI')
        .setDescription('Test')
        .addFields(
            { name: '✅ Ve službě:', value: usersOnDuty.length ? usersOnDuty.join('\n') : 'Žádní uživatelé jsou ve službě' },
            { name: '⏱️ Odslouženo tento týden:', value: `${totalWorkedHours.toFixed(2)}h` }
        )
        .setTimestamp()
        .setFooter({ text: `Poslední aktualizace: ${currentTime}` }); // Přidání footeru s časem poslední aktualizace

    // Aktualizujeme zprávu
    const dutyChannel = await client.channels.fetch(dutyChannelId);
    const dutyMessage = await dutyChannel.messages.fetch(dutyMessageId);
    dutyMessage.edit({ embeds: [updatedEmbed] });
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, user } = interaction;

    if (commandName === 'sluzba') {
        // Pokud uživatel není ve službě, připojí ho
        if (!dutyData[user.id] || dutyData[user.id].status === 'off') {
            dutyData[user.id] = { 
                status: 'on', 
                startTime: Date.now(),
                startDate: new Date().toLocaleString() // Uložíme datum, kdy uživatel začal službu
            };

            await interaction.reply(`<@${user.id}>, jsi připojen k službě!`);

        } else {
            // Pokud je uživatel ve službě, odpojí ho
            if (dutyData[user.id].status === 'on') {
                const hoursWorked = (Date.now() - dutyData[user.id].startTime) / (1000 * 60 * 60); // Počet odpracovaných hodin
                dutyData[user.id].status = 'off';
                dutyData[user.id].workedHours = (dutyData[user.id].workedHours || 0) + hoursWorked;

                await interaction.reply(`<@${user.id}>, jsi odpojen od služby. Odpracoval/a jsi ${hoursWorked.toFixed(2)} hodin.`);

            }
        }

        // Aktualizace zprávy po interakci
        await updateDutyMessage();
    }
});

client.login(token);
