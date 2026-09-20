const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const noblox = require('noblox.js');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const GROUP_ID = 61252017;
const CIMT_GROUP_ID = 520955701;
const OWNER_DISCORD_ID = '1192582006639448185';
const MAIN_GUILD_ID = '1518101681072508949';
const LOG_CHANNEL_ID = '1548155269001904229';
const XP_LOG_CHANNEL_ID = '1548166411266822144';

// Kept for later use, but currently deactivated for command permissions
const AUTHORIZED_ROLE_IDS = [
    '1518144720281272451',
    '1518145962428600353',
    '1518145925304815787',
    '1518145499318980638'
];

// Channel Restriction IDs (Active)
const XP_CHANNEL_ID = '1526039744700743821';
const SETRANK_CHANNEL_ID = '1526041058553630730';
const BACKGROUND_CHANNEL_ID = '1548441081786663072';

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
            .setName('revokexp')
            .setDescription('Revoke/remove XP from a member')
            .addStringOption(option => option.setName('user').setDescription('Roblox Username or User ID').setRequired(true))
            .addUserOption(option => option.setName('discord').setDescription('Discord user').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('Amount of XP to revoke').setRequired(true)),
        new SlashCommandBuilder()
            .setName('xp')
            .setDescription('View user XP profile')
            .addUserOption(option => 
                option.setName('user').setDescription('Discord user to check').setRequired(false)),
        new SlashCommandBuilder()
            .setName('xpranks')
            .setDescription('View the current rank threshold requirements'),
        new SlashCommandBuilder()
            .setName('grouproles')
            .setDescription('List all Roblox group roles and their exact rank numbers'),
        new SlashCommandBuilder()
            .setName('cimtroles')
            .setDescription('List all CIMT group roles and their exact rank numbers (Restricted)'),
        new SlashCommandBuilder()
            .setName('background')
            .setDescription('Run a full background screening check on a member')
            .addStringOption(option => 
                option.setName('user').setDescription('Roblox Username or User ID').setRequired(true))
            .addUserOption(option => 
                option.setName('discord').setDescription('Discord user to cross-reference').setRequired(true)),
        new SlashCommandBuilder()
            .setName('meme')
            .setDescription('Forces the bot to leave the current server')
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

    // Strict global lock: Only you can use any command right now
    if (interaction.user.id !== OWNER_DISCORD_ID) {
        return interaction.reply({ content: `🤷‍♂️`, flags: MessageFlags.Ephemeral });
    }

    const { commandName } = interaction;

    if (commandName === 'meme') {
        await interaction.reply({ content: `👋 Leaving server...`, flags: MessageFlags.Ephemeral });
        return await interaction.guild.leave();
    }

    // Role and Server restrictions for management commands (Main server check remains active for your testing)
    if (['setrank', 'givexp', 'revokexp'].includes(commandName)) {
        if (interaction.guildId !== MAIN_GUILD_ID) {
            return interaction.reply({
                content: `❌ This command can only be used in the main server.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }

    // Channel restriction checks
    if (commandName === 'setrank' && interaction.channelId !== SETRANK_CHANNEL_ID) {
        return interaction.reply({ 
            content: `❌ This command can only be used in <#${SETRANK_CHANNEL_ID}>.`, 
            flags: MessageFlags.Ephemeral 
        });
    }

    if ((commandName === 'givexp' || commandName === 'revokexp' || commandName === 'xp' || commandName === 'xpranks' || commandName === 'grouproles') && interaction.channelId !== XP_CHANNEL_ID) {
        return interaction.reply({ 
            content: `❌ This command can only be used in <#${XP_CHANNEL_ID}>.`, 
            flags: MessageFlags.Ephemeral 
        });
    }

    if (commandName === 'background' && interaction.channelId !== XP_CHANNEL_ID && interaction.channelId !== BACKGROUND_CHANNEL_ID) {
        return interaction.reply({ 
            content: `❌ This command can only be used in <#${XP_CHANNEL_ID}> or <#${BACKGROUND_CHANNEL_ID}>.`, 
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
            const targetUsername = await noblox.getUsernameFromId(robloxUserId).catch(() => 'Unknown');

            let rankPromotionText = '';
            let promotedRankName = null;
            
            const rankCheck = await pool.query('SELECT rank_value FROM xp_ranks WHERE min_xp <= $1 ORDER BY min_xp DESC LIMIT 1', [newTotalXp]);
            if (rankCheck.rows.length > 0) {
                const targetRankVal = rankCheck.rows[0].rank_value;
                try {
                    await noblox.setRank(GROUP_ID, robloxUserId, targetRankVal);
                    const roles = await noblox.getRoles(GROUP_ID);
                    const matchedRole = roles.find(r => r.rank === targetRankVal);
                    promotedRankName = matchedRole ? matchedRole.name : `Rank ${targetRankVal}`;
                    rankPromotionText = ` 🎉 XP requirement met! Automatically promoted to **${promotedRankName}**.`;
                } catch (rankErr) {
                    console.error('Auto-rank error:', rankErr);
                    rankPromotionText = ` ⚠️ (Reached XP threshold but failed auto-rank: ${rankErr.message})`;
                }
            }

            await interaction.editReply(`Successfully awarded **${amount} XP** to <@${targetDiscord.id}>. Total XP: **${newTotalXp}**${rankPromotionText}`);

            // Send log to primary log channel (LOG_CHANNEL_ID)
            const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
            if (logChannel) {
                const headshotThumb = await noblox.getPlayerThumbnail(robloxUserId, '420x420', 'png', false, 'Headshot').catch(() => []);
                const thumbUrl = headshotThumb[0]?.imageUrl || null;

                const embed = new EmbedBuilder()
                    .setTitle('⭐ XP Awarded')
                    .setColor(0x3498DB)
                    .setThumbnail(thumbUrl)
                    .addFields(
                        { name: 'Member', value: `<@${targetDiscord.id}> ([${targetUsername}](https://www.roblox.com/users/${robloxUserId}/profile))` },
                        { name: 'XP Added', value: `+${amount} XP (Total: ${newTotalXp})`, inline: true },
                        { name: 'Awarded By', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setTimestamp();

                if (promotedRankName) {
                    embed.addFields({ name: '🎖️ XP Requirement Met', value: `Promoted to **${promotedRankName}** due to reaching the XP threshold.` });
                }

                await logChannel.send({ embeds: [embed] });
            }

            // Send log to dedicated XP log channel
            const xpLogChannel = await client.channels.fetch(XP_LOG_CHANNEL_ID).catch(() => null);
            if (xpLogChannel) {
                const xpEmbed = new EmbedBuilder()
                    .setTitle('📈 XP Log Entry')
                    .setColor(0xE67E22)
                    .addFields(
                        { name: 'Recipient', value: `<@${targetDiscord.id}> (\`${targetUsername}\)`, inline: true },
                        { name: 'XP Amount', value: `+${amount} XP`, inline: true },
                        { name: 'New Total', value: `**${newTotalXp} XP**`, inline: true },
                        { name: 'Awarded By', value: `<@${interaction.user.id}>`, inline: false }
                    )
                    .setTimestamp();
                await xpLogChannel.send({ embeds: [xpEmbed] });
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `Failed to award XP: ${error.message}` });
        }
    }

    if (commandName === 'revokexp') {
        await interaction.deferReply();
        const userInput = interaction.options.getString('user');
        const targetDiscord = interaction.options.getUser('discord');
        const amount = interaction.options.getInteger('amount');

        try {
            const robloxUserId = await resolveRobloxId(userInput);
            const targetUsername = await noblox.getUsernameFromId(robloxUserId).catch(() => 'Unknown');

            const query = `
                INSERT INTO user_xp (discord_id, roblox_id, xp)
                VALUES ($1, $2, 0)
                ON CONFLICT (discord_id) 
                DO UPDATE SET xp = GREATEST(0, user_xp.xp - $3), roblox_id = $2
                RETURNING xp;
            `;
            const result = await pool.query(query, [targetDiscord.id, robloxUserId, amount]);
            const newTotalXp = result.rows[0].xp;

            await interaction.editReply(`Successfully revoked **${amount} XP** from <@${targetDiscord.id}>. Total XP: **${newTotalXp}**`);

            const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ XP Revoked')
                    .setColor(0xE74C3C)
                    .addFields(
                        { name: 'Member', value: `<@${targetDiscord.id}> ([${targetUsername}](https://www.roblox.com/users/${robloxUserId}/profile))`, inline: false },
                        { name: 'XP Removed', value: `-${amount} XP (Total:${newTotalXp})`, inline: true },
                        { name: 'Revoked By', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [embed] });
            }

            const xpLogChannel = await client.channels.fetch(XP_LOG_CHANNEL_ID).catch(() => null);
            if (xpLogChannel) {
                const xpEmbed = new EmbedBuilder()
                    .setTitle('📉 XP Log Entry (Revoked)')
                    .setColor(0xC0392B)
                    .addFields(
                        { name: 'Recipient', value: `<@${targetDiscord.id}> (\`${targetUsername}\)`, inline: true },
                        { name: 'XP Revoked', value: `-${amount} XP`, inline: true },
                        { name: 'New Total', value: `**${newTotalXp} XP**`, inline: true },
                        { name: 'Revoked By', value: `<@${interaction.user.id}>`, inline: false }
                    )
                    .setTimestamp();
                await xpLogChannel.send({ embeds: [xpEmbed] });
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `Failed to revoke XP: ${error.message}` });
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

            const nextRankQuery = await pool.query('SELECT min_xp, rank_value FROM xp_ranks WHERE min_xp > $1 ORDER BY min_xp ASC LIMIT 1', [userXp]);
            let nextRankText = 'Max Rank Reached 🎉';
            if (nextRankQuery.rows.length > 0) {
                const nextThreshold = nextRankQuery.rows[0].min_xp;
                const neededXp = nextThreshold - userXp;
                const roles = await noblox.getRoles(GROUP_ID).catch(() => []);
                const matchedRole = roles.find(r => r.rank === nextRankQuery.rows[0].rank_value);
                const nextRoleName = matchedRole ? matchedRole.name : `Rank ID ${nextRankQuery.rows[0].rank_value}`;
                nextRankText = `**${neededXp} XP** needed for **${nextRoleName}** (${nextThreshold} XP threshold)`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`📊 XP Profile: ${targetUser.username}`)
                .setColor(0xF1C40F)
                .setThumbnail(thumbUrl)
                .addFields(
                    { name: 'Discord User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Current XP', value: `**${userXp} XP**`, inline: true },
                    { name: 'Progress to Next Rank', value: nextRankText, inline: false },
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

            let description = 'Here is how much XP you need to reach each rank:\n\n';
            if (ranksResult.rows.length === 0) {
                description += 'No rank thresholds have been added to the database yet.';
            } else {
                for (const row of ranksResult.rows) {
                    const matchedRole = roles.find(r => r.rank === row.rank_value);
                    const roleName = matchedRole ? matchedRole.name : `Rank ID ${row.rank_value}`;
                    description += `🔹 **${roleName}** ➔ Requires **${row.min_xp} XP**\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('🎖️ Ranks')
                .setColor(0x2ECC71)
                .setDescription(description)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to fetch rank requirements.', flags: MessageFlags.Ephemeral });
        }
    }

    if (commandName === 'grouproles') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const roles = await noblox.getRoles(GROUP_ID);
            roles.sort((a, b) => a.rank - b.rank);

            let description = 'Here are all the group roles and their exact rank numbers:\n\n';
            for (const role of roles) {
                description += `• **${role.name}** ➔ Rank Value: \`${role.rank}\`\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle('📋 Roblox Group Roles & Rank Numbers')
                .setColor(0x3498DB)
                .setDescription(description)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `Failed to fetch group roles: ${error.message}` });
        }
    }

    if (commandName === 'cimtroles') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const roles = await noblox.getRoles(CIMT_GROUP_ID);
            roles.sort((a, b) => a.rank - b.rank);

            let description = 'Here are all the CIMT group roles and their exact rank numbers:\n\n';
            for (const role of roles) {
                description += `• **${role.name}** ➔ Rank Value: \`${role.rank}\`\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle('📋 CIMT Group Roles & Rank Numbers')
                .setColor(0x9B59B6)
                .setDescription(description)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `Failed to fetch CIMT group roles: ${error.message}` });
        }
    }

    if (commandName === 'background') {
        await interaction.deferReply();
        const userInput = interaction.options.getString('user');
        const targetDiscord = interaction.options.getUser('discord');
        const member = await interaction.guild.members.fetch(targetDiscord.id).catch(() => null);

        try {
            const robloxUserId = await resolveRobloxId(userInput);
            const targetUsername = await noblox.getUsernameFromId(robloxUserId);
            
            const playerInfo = await noblox.getPlayerInfo(robloxUserId).catch(() => null);
            const joinDate = playerInfo?.joinDate ? new Date(playerInfo.joinDate) : null;
            const robloxAgeDays = joinDate ? Math.floor((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24)) : 'Unknown';

            const headshotThumb = await noblox.getPlayerThumbnail(robloxUserId, '420x420', 'png', false, 'Headshot');
            const thumbUrl = headshotThumb[0]?.imageUrl || null;
            const currentRankInGroup = await noblox.getRankNameInGroup(GROUP_ID, robloxUserId);
            
            const pastUsernames = playerInfo?.oldNames ? playerInfo.oldNames : [];

            let badgeCount = 0;
            let cursor = '';
            try {
                const cookie = noblox.cookie || process.env.ROBLOSECURITY;
                const headers = cookie ? { 'Cookie': `.ROBLOSECURITY=${cookie}` } : {};

                do {
                    const url = `https://badges.roblox.com/v1/users/${robloxUserId}/badges?limit=100&sortOrder=Asc${cursor ? `&cursor=${cursor}` : ''}`;
                    const response = await fetch(url, { headers });
                    const data = await response.json();
                    
                    if (data && Array.isArray(data.data)) {
                        badgeCount += data.data.length;
                        cursor = data.nextPageCursor;
                    } else {
                        break;
                    }
                } while (cursor);
            } catch (err) {
                console.error('Failed to fetch full badge list:', err);
                badgeCount = 'Unknown';
            }

            const discordCreated = Math.floor(targetDiscord.createdTimestamp / 1000);
            const joinedServer = member ? Math.floor(member.joinedTimestamp / 1000) : 'Unknown';
            const rolesList = member ? member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => `<@&${r.id}>`).join(', ') || 'None' : 'Not in server';

            const dbResult = await pool.query('SELECT xp FROM user_xp WHERE discord_id = $1', [targetDiscord.id]);
            const userXp = dbResult.rows.length > 0 ? dbResult.rows[0].xp : 0;

            const ageDisplay = typeof robloxAgeDays === 'number' ? `~${Math.floor(robloxAgeDays / 365)} years (${robloxAgeDays} days)` : 'Unknown';

            let hazardStatus = '🟢 **Status: GOOD (Low Risk)**';
            let embedColor = 0x2ECC71;

            const isAltAccount = typeof robloxAgeDays === 'number' && robloxAgeDays < 30;
            const discordAccountAgeDays = Math.floor((Date.now() - targetDiscord.createdTimestamp) / (1000 * 60 * 60 * 24));
            const isDiscordAlt = discordAccountAgeDays < 30;

            if (isAltAccount || isDiscordAlt) {
                hazardStatus = '⚠️ **Status: HAZARD (Potential Alt / New Account)**';
                embedColor = 0xE67E22;
            }

            if (isAltAccount && isDiscordAlt) {
                hazardStatus = '🚨 **Status: HIGH HAZARD (Severe Alt / Risk)**';
                embedColor = 0xE74C3C;
            }

            const embed = new EmbedBuilder()
                .setTitle(`🛡️ CLASSIFIED BACKGROUND CHECK: ${targetUsername}`)
                .setColor(embedColor)
                .setThumbnail(thumbUrl)
                .addFields(
                    { name: '🔍 Security Evaluation', value: hazardStatus, inline: false },
                    { name: '👤 Roblox Identity', value: `[Profile Link](https://www.roblox.com/users/${robloxUserId}/profile)\n• **ID:** \`${robloxUserId}\`\n• **Account Age:** ${ageDisplay}\n• **Badges Earned:** ${badgeCount}`, inline: false },
                    { name: '🎖️ USAR Group Status', value: `• **Current Rank:** ${currentRankInGroup || 'Civilian / Unranked'}\n• **Total Recorded XP:** ${userXp} XP`, inline: false },
                    { name: '💬 Discord Identity', value: `• **User:** <@${targetDiscord.id}>\n• **Account Created:** <t:${discordCreated}:R>\n• **Server Join:** <t:${joinedServer}:R>`, inline: false },
                    { name: '📋 Clearance & Roles', value: rolesList, inline: false },
                    { name: '📜 Alias History', value: pastUsernames.length > 0 ? pastUsernames.join(', ') : 'No recorded name changes', inline: false }
                )
                .setFooter({ text: `Checked by ${interaction.user.tag} • USAR Security Division` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `Background check failed: ${error.message}` });
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);