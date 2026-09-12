const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const noblox = require('noblox.js');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const GROUP_ID = 61252017;
const LOG_CHANNEL_ID = '1548155269001904229';

client.once('clientReady', async () => {
    console.log(`[USAR Command] Logged in as ${client.user.tag}`);

    try {
        await noblox.setCookie(process.env.ROBLOSECURITY);
        const currentUser = await noblox.getCurrentUser();
        console.log(`[USAR Command] Logged into Roblox as cookie account: ${currentUser.UserName}`);
    } catch (err) {
        console.error('[USAR Command] Failed to log into Roblox with cookie:', err);
    }

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_xp (
                discord_id VARCHAR(32) PRIMARY KEY,
                xp INT DEFAULT 0
            )
        `);
        console.log('[USAR Command] Database table verified.');
    } catch (err) {
        console.error('[USAR Command] Database setup error:', err);
    }
    
    const commands = [
        new SlashCommandBuilder()
            .setName('setrank')
            .setDescription('Set the rank of a user in the USAR group')
            .addIntegerOption(option => 
                option.setName('userid').setDescription('Roblox User ID').setRequired(true))
            .addStringOption(option => 
                option.setName('rank')
                    .setDescription('Select group rank from dropdown')
                    .setRequired(true)
                    .setAutocomplete(true)),
        new SlashCommandBuilder()
            .setName('xp')
            .setDescription('View user XP profile')
            .addUserOption(option => 
                option.setName('user').setDescription('Discord user to check').setRequired(false))
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('[USAR Command] Slash commands registered.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'setrank') {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            try {
                const roles = await noblox.getRoles(GROUP_ID);
                const filtered = roles
                    .filter(role => role.name.toLowerCase().includes(focusedValue))
                    .slice(0, 25);
                
                await interaction.respond(
                    filtered.map(role => ({ name: role.name, value: role.rank.toString() }))
                );
            } catch (err) {
                console.error('Failed to fetch autocomplete roles:', err);
            }
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'setrank') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const robloxUserId = interaction.options.getInteger('userid');
        const rankValue = parseInt(interaction.options.getString('rank'), 10);
        
        try {
            // Fetch target user details & rank name for logging
            const targetUsername = await noblox.getUsernameFromId(robloxUserId);
            const headshotThumb = await noblox.getPlayerThumbnail(robloxUserId, '428x428', 'png', false, 'Headshot');
            const thumbUrl = headshotThumb[0]?.imageUrl || null;
            
            const roles = await noblox.getRoles(GROUP_ID);
            const targetRole = roles.find(r => r.rank === rankValue);
            const rankName = targetRole ? targetRole.name : `Rank ${rankValue}`;

            // Perform rank update
            await noblox.setRank(GROUP_ID, robloxUserId, rankValue);
            await interaction.editReply(`Successfully updated Roblox user **${targetUsername}** (${robloxUserId}) to **${rankName}**.`);

            // Send Embed Log to channel
            const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('📋 Rank Updated')
                    .setColor(0x00FF00)
                    .setThumbnail(thumbUrl)
                    .addFields(
                        { name: 'Target User', value: `[${targetUsername}](https://www.roblox.com/users/${robloxUserId}/profile) (\`${robloxUserId}\`)`, inline: false },
                        { name: 'New Rank', value: `${rankName} (\`${rankValue}\`)`, inline: true },
                        { name: 'Ranked By', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setTimestamp();

                await logChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply(`Failed to update rank: ${error.message}`);
        }
    }

    if (commandName === 'xp') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        
        try {
            const result = await pool.query('SELECT xp FROM user_xp WHERE discord_id = $1', [targetUser.id]);
            const userXp = result.rows[0] ? result.rows[0].xp : 0;
            await interaction.reply({ content: `User <@${targetUser.id}> currently has **${userXp} XP**.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Database error fetching XP.', flags: MessageFlags.Ephemeral });
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);