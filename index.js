const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mysql = require('mysql2');

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

// Připojení k MySQL databázi
const db = mysql.createConnection({
    host: 'sql107.infinityfree.com', // Hostitel MySQL
    user: 'if0_38682377', // Uživatelské jméno
    password: 'kokot9511', // Heslo
    database: 'if0_38682377_dutybot' // Název databáze
});

db.connect((err) => {
    if (err) {
        console.error('Chyba při připojení k databázi:', err);
        process.exit(1); // Pokud není možné se připojit, zastavíme běh
    }
    console.log('Připojeno k databázi MySQL');
});

// ID kanálu, kde bude stat panel
const dutyChannelId = '1358183328104321223';
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

        // Načítání uživatelů ve službě z databáze
        db.query('SELECT * FROM users WHERE status = "on"', (err, results) => {
            if (err) {
                console.error('Chyba při načítání dat z databáze:', err);
                return;
            }

            // Generování seznamu lidí, kteří jsou ve službě, s jejich časy
            const usersOnDuty = results.map(userData => {
                const timeInService = formatTime(Date.now() - userData.startTime); // Čas ve službě v HH:MM:SS
                return `<@${userData.id}> - **Ve službě od:** ${userData.lastTime} | **Čas ve službě:** ${timeInService}`;
            });

            // Generování seznamu pro "Odpracováno tento týden"
            db.query('SELECT * FROM users WHERE workedHours > 0', (err, results) => {
                if (err) {
                    console.error('Chyba při načítání odpracovaných hodin:', err);
                    return;
                }

                const workedThisWeek = results.map(userData => {
                    const workedTime = formatTime(userData.workedHours * 1000 * 60 * 60); // Celkový odpracovaný čas v HH:MM:SS
                    return `<@${userData.id}> - **Naposledy ve službě:** ${userData.lastTime} | **Odpracovaný čas:** ${workedTime}`;
                });

                // Celkový čas odsloužený tímto týdnem
                const totalWorkedHours = results.reduce((sum, userData) => sum + userData.workedHours, 0);

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
            });
        });
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
        // Načítání uživatele z databáze
        db.query('SELECT * FROM users WHERE id = ?', [user.id], async (err, results) => {
            if (err) {
                console.error('Chyba při načítání uživatele z databáze:', err);
                return;
            }

            if (results.length === 0 || results[0].status === 'off') {
                // Pokud uživatel není ve službě, připojí ho
                db.query('INSERT INTO users (id, status, startTime, lastTime) VALUES (?, "on", ?, ?)', [user.id, Date.now(), new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })]);

                await interaction.reply(`<@${user.id}>, jsi připojen k službě!`);
            } else {
                // Pokud je uživatel ve službě, odpojí ho
                const hoursWorked = Date.now() - results[0].startTime; // Počet odpracovaných milisekund
                const formattedWorkedTime = formatTime(hoursWorked); // Převede milisekundy na HH:MM:SS
                db.query('UPDATE users SET status = "off", workedHours = workedHours + ? WHERE id = ?', [hoursWorked / (1000 * 60 * 60), user.id]);

                await interaction.reply(`<@${user.id}>, jsi odpojen od služby. Odpracoval/a jsi ${formattedWorkedTime}.`);
            }

            // Generování seznamu lidí, kteří jsou ve službě, s jejich časy
            const usersOnDuty = results.map(userData => {
                const timeInService = formatTime(Date.now() - userData.startTime); // Čas ve službě v HH:MM:SS
                return `<@${userData.id}> - **Ve službě od:** ${userData.lastTime} | **Čas ve službě:** ${timeInService}`;
            });

            // Generování seznamu pro "Odpracováno tento týden"
            const workedThisWeek = results.map(userData => {
                const workedTime = formatTime(userData.workedHours * 1000 * 60 * 60); // Celkový odpracovaný čas v HH:MM:SS
                return `<@${userData.id}> - **Naposledy ve službě:** ${userData.lastTime} | **Odpracovaný čas:** ${workedTime}`;
            });

            // Celkový čas odsloužený tímto týdnem
            const totalWorkedHours = results.reduce((sum, userData) => sum + userData.workedHours, 0);

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
        });
    }
});

client.login(token);
