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

// Channel Restriction IDs
const XP_CHANNEL_ID = '1526039744700743821';
const SETRANK_CHANNEL_ID = '1526041058553630730';

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
                roblox_id BIGINT,
                xp INT DEFAULT 0
            );
            ALTER TABLE user_xp ADD COLUMN IF NOT EXISTS roblox_id BIGINT;
            ALTER TABLE user_xp DROP COLUMN IF EXISTS robux_id;

            CREATE TABLE IF NOT EXISTS xp_ranks (
                min_xp INT PRIMARY KEY,
                rank_value INT NOT NULL
            );
        `);
        console.log('[USAR Command] Database tables and columns verified.');
    } catch (err) {
        console.error('[USAR Command] Database setup error:', err);
    }
    
    const commands = [
        new SlashCommandBuilder()
            .setName('setrank')
            .setDescription('Set the rank of a user in the USAR group')
            .addStringOption(option => 
                option.setName('user').setDescription('Roblox Username or User ID').setRequired(true))
            .addStringOption(option => 
                option.setName('rank')
                    .setDescription('Select group rank from dropdown')
                    .setRequired(true)
                    .setAutocomplete(true)),
        new SlashCommandBuilder()
            .setName('givexp')
            .setDescription('Award event XP to a member')
            .addStringOption(option => option.setName('user').setDescription('Roblox Username or User ID').setRequired(true))
            .addUserOption(option => option.setName('discord').setDescription('Discord user').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('Amount of XP to give').setRequired(true)),
        new SlashCommandBuilder()
            .setName('xp')
            .setDescription('View user XP profile')
            .addUserOption(option => 
                option.setName('user').setDescription('Discord user to check').setRequired(false)),
        new SlashCommandBuilder()
            .setName('xpranks')
            .setDescription('View the current XP rank threshold requirements')
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

    // Channel restriction checks
    if (commandName === 'setrank' && interaction.channelId !== SETRANK_CHANNEL_ID) {
        return interaction.reply({ 
            content: `❌ This command can only be used in <#${SETRANK_CHANNEL_ID}>.`, 
            flags: MessageFlags.Ephemeral 
        });
    }

    if ((commandName === 'givexp' || commandName === 'xp' || commandName === 'xpranks') && interaction.channelId !== XP_CHANNEL_ID) {
        return interaction.reply({ 
            content: `❌ This command can only be used in <#${XP_CHANNEL_ID}>.`, 
            flags: MessageFlags.Ephemeral 
        });
    }

    // Helper function to resolve either a username or ID string into a numeric Roblox User ID
    async function resolveRobloxId(input) {
        if (/^\d+$/.test(input)) {
            return parseInt(input, 10);
        } else {
            return await noblox.getIdFromUsername(input);
        }
    }

    if (commandName === 'setrank') {
        await interaction.deferReply();
        const userInput = interaction.options.getString('user');
        const rankValue = parseInt(interaction.options.getString('rank'), 10);
        
        try {
            const robloxUserId = await resolveRobloxId(userInput);
            const targetUsername = await noblox.getUsernameFromId(robloxUserId);
            const headshotThumb = await noblox.getPlayerThumbnail(robloxUserId, '420x420', 'png', false, 'Headshot');
            const thumbUrl = headshotThumb[0]?.imageUrl || null;
            
            const roles = await noblox.getRoles(GROUP_ID);
            const targetRole = roles.find(r => r.rank === rankValue);
            const rankName = targetRole ? targetRole.name : `Rank ${rankValue}`;

            await noblox.setRank(GROUP_ID, robloxUserId, rankValue);
            await interaction.editReply(`Successfully updated Roblox user **${targetUsername}** (${robloxUserId}) to **${rankName}**.`);

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
            await interaction.editReply({ content: `Failed to update rank: ${error.message}` });
        }
    }

    if (commandName === 'givexp') {
        await interaction.deferReply();
        const userInput = interaction.options.getString('user');
        const targetDiscord = interaction.options.getUser('discord');
        const amount = interaction.options.getInteger('amount');

        try {
            const robloxUserId = await resolveRobloxId(userInput);
            const query = `
                INSERT INTO user_xp (discord_id, roblox_id, xp)
                VALUES ($1, $2, $3)
                ON CONFLICT (discord_id) 
                DO UPDATE SET xp = user_xp.xp + $3, roblox_id = $2
                RETURNING xp;
            `;
            const result = await pool.query(query, [targetDiscord.id, robloxUserId, amount]);
            const newTotalXp = result.rows[0].xp;

            let rankPromotionText = '';
            
            const rankCheck = await pool.query('SELECT rank_value FROM xp_ranks WHERE min_xp <= $1 ORDER BY min_xp DESC LIMIT 1', [newTotalXp]);
            if (rankCheck.rows.length > 0) {
                const targetRankVal = rankCheck.rows[0].rank_value;
                try {
                    await noblox.setRank(GROUP_ID, robloxUserId, targetRankVal);
                    const roles = await noblox.getRoles(GROUP_ID);
                    const matchedRole = roles.find(r => r.rank === targetRankVal);
                    const rankName = matchedRole ? matchedRole.name : `Rank ${targetRankVal}`;
                    rankPromotionText = ` 🎉 Automatically promoted to **${rankName}**!`;
                } catch (rankErr) {
                    console.error('Auto-rank error:', rankErr);
                    rankPromotionText = ` ⚠️ (Reached XP threshold but failed auto-rank: ${rankErr.message})`;
                }
            }

            await interaction.editReply(`Successfully awarded **${amount} XP** to <@${targetDiscord.id}>. Total XP: **${newTotalXp}**${rankPromotionText}`);

            const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
            if (logChannel) {
                const targetUsername = await noblox.getUsernameFromId(robloxUserId).catch(() => 'Unknown');
                const embed = new EmbedBuilder()
                    .setTitle('⭐ XP Awarded')
                    .setColor(0x3498DB)
                    .addFields(
                        { name: 'Member', value: `<@${targetDiscord.id}> ([${targetUsername}](https://www.roblox.com/users/${robloxUserId}/profile))`, inline: false },
                        { name: 'XP Added', value: `+${amount} XP (Total: ${newTotalXp})`, inline: true },
                        { name: 'Awarded By', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [embed] });
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `Failed to award XP: ${error.message}` });
        }
    }

    if (commandName === 'xp') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        
        try {
            const result = await pool.query('SELECT xp, roblox_id FROM user_xp WHERE discord_id = $1', [targetUser.id]);
            const userData = result.rows[0];
            const userXp = userData ? userData.xp : 0;
            const robloxId = userData ? userData.roblox_id : null;

            let robloxName = 'Not Linked';
            let thumbUrl = null;
            if (robloxId) {
                robloxName = await noblox.getUsernameFromId(robloxId).catch(() => 'Unknown');
                const headshotThumb = await noblox.getPlayerThumbnail(robloxId, '420x420', 'png', false, 'Headshot').catch(() => []);
                thumbUrl = headshotThumb[0]?.imageUrl || null;
            }

            const embed = new EmbedBuilder()
                .setTitle(`📊 XP Profile: ${targetUser.username}`)
                .setColor(0xF1C40F)
                .setThumbnail(thumbUrl)
                .addFields(
                    { name: 'Discord User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Current XP', value: `**${userXp} XP**`, inline: true },
                    { name: 'Roblox Account', value: robloxId ? `[${robloxName}](https://www.roblox.com/users/${robloxId}/profile) (\`${robloxId}\`)` : 'None linked via givexp', inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('XP Command Error Details:', error);
            await interaction.reply({ content: `Database error fetching XP profile: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }

    if (commandName === 'xpranks') {
        try {
            const ranksResult = await pool.query('SELECT min_xp, rank_value FROM xp_ranks ORDER BY min_xp ASC');
            const roles = await noblox.getRoles(GROUP_ID).catch(() => []);

            let description = 'Here are the current XP requirements for division ranks:\n\n';
            if (ranksResult.rows.length === 0) {
                description += '*No rank thresholds have been added to the database yet.*';
            } else {
                for (const row of ranksResult.rows) {
                    const matchedRole = roles.find(r => r.rank === row.rank_value);
                    const roleName = matchedRole ? matchedRole.name : `Rank ID ${row.rank_value}`;
                    description += `🔹 **${row.min_xp} XP** ➔ **${roleName}**\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('🎖️ USAR Division XP Ranks')
                .setColor(0x2ECC71)
                .setDescription(description)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to fetch XP rank tiers.', flags: MessageFlags.Ephemeral });
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);