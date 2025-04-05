const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');

// Nastavení bota
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,              // Pro připojení ke guildám (servery)
        GatewayIntentBits.GuildMessages,       // Pro čtení zpráv v kanálech
        GatewayIntentBits.MessageReactions,    // Pro sledování reakcí
        GatewayIntentBits.MessageContent,      // Pro získávání obsahu zpráv (nutné pro nový Discord.js)
    ]
});

const dutyData = {}; // Pro uložení dat o uživatelských hodinách

// Tady vlož svůj token
const token = 'MTM1ODE4Mzk1NDM2NDIzOTk1Mg.Gs2QZ0.QjiAo4m0Ow_op_r9016By3D95O07OGlHBYhg0g';

const dutyChannelId = '1358183328104321223'; // ID kanálu, kde bude stat panel (získáš ID kanálu kliknutím pravým tlačítkem na kanál > Kopírovat ID)
let dutyMessageId = null;
console.log('Discord.js version:', require('discord.js').version);

client.once('ready', async () => {
    console.log('Discord.js version:', require('discord.js').version);
    console.log(`Bot je přihlášen jako ${client.user.tag}`);

    // Získání kanálu pro status zprávu
    const dutyChannel = await client.channels.fetch(dutyChannelId);

    // Vytvoření embed zprávy
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
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