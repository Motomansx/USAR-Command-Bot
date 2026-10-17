const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const noblox = require('noblox.js');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const GROUP_ID = 338694123;
const OWNER_DISCORD_ID = '1192582006639448185';
const MAIN_GUILD_ID = '1518101681072508949';
const HQ_GUILD_ID = '1543638529735786687';
const LOG_CHANNEL_ID = '1548155269001904229';
const XP_LOG_CHANNEL_ID = '1548166411266822144';

// Channel Restriction IDs (Active in Main Server for others)
const XP_CHANNEL_ID = '1526039744700743821';
const SETRANK_CHANNEL_ID = '1526041058553630730';
const BACKGROUND_CHANNEL_ID = '1548441081786663072';

client.once('clientReady', async () => {
    console.log(`[USAR Command] Logged in as ${client.user.tag}`);

    try {
        await noblox.setCookie(process.env.ROBLOSECURITY);
        const currentUser = await noblox.getCurrentUser();
        console.log(`[USAR Command] 🟢 ACTIVE ROBLOX BOT ACCOUNT: Username -> ${currentUser.UserName} \vert{} ID ->${currentUser.UserID}`);
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

            CREATE TABLE IF NOT EXISTS xp_ranks (
                min_xp INT PRIMARY KEY,
                rank_value INT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS discharges (
                id SERIAL PRIMARY KEY,
                roblox_username VARCHAR(64),
                discord_id VARCHAR(32),
                position VARCHAR(64),
                company VARCHAR(64),
                time_logged VARCHAR(32),
                notes TEXT,
                reason TEXT,
                type VARCHAR(32)
            );

            CREATE TABLE IF NOT EXISTS awards (
                id SERIAL PRIMARY KEY,
                roblox_username VARCHAR(64),
                discord_id VARCHAR(32),
                award_name VARCHAR(128),
                category VARCHAR(64),
                reason TEXT,
                awarded_by VARCHAR(32),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS award_board_config (
                guild_id VARCHAR(32) PRIMARY KEY,
                channel_id VARCHAR(32),
                message_id VARCHAR(32)
            );
        `);
        console.log('[USAR Command] Database setup verified.');
    } catch (err) {
        console.error('[USAR Command] Database setup error:', err);
    }
    
    const commands = [
        new SlashCommandBuilder()
            .setName('setrank')
            .setDescription('Set the rank of a user in the group')
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
            .setName('discharge')
            .setDescription('Log a member discharge record into the database')
            .addStringOption(option => option.setName('user').setDescription('Roblox Username or User ID').setRequired(true))
            .addUserOption(option => option.setName('discord').setDescription('Discord user').setRequired(true))
            .addStringOption(option => option.setName('position').setDescription('Position').setRequired(true))
            .addStringOption(option => option.setName('company').setDescription('Company').setRequired(true))
            .addStringOption(option => option.setName('time').setDescription('Time').setRequired(true))
            .addStringOption(option => option.setName('notes').setDescription('Additional notes').setRequired(true))
            .addStringOption(option => option.setName('reason').setDescription('Reason for discharge').setRequired(true))
            .addStringOption(option => 
                option.setName('type')
                    .setDescription('Select discharge type')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Honorable', value: 'Honorable' },
                        { name: 'General', value: 'General' },
                        { name: 'Dishonorable', value: 'Dishonorable' }
                    )),
        new SlashCommandBuilder()
            .setName('updatedischarge')
            .setDescription('Update an existing discharge record type or reason')
            .addIntegerOption(option => option.setName('record_id').setDescription('The Discharge Record ID number').setRequired(true))
            .addStringOption(option => 
                option.setName('type')
                    .setDescription('New discharge type choice')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Honorable', value: 'Honorable' },
                        { name: 'General', value: 'General' },
                        { name: 'Dishonorable', value: 'Dishonorable' }
                    ))
            .addStringOption(option => option.setName('reason').setDescription('New Reason update').setRequired(true)),
        new SlashCommandBuilder()
            .setName('removedischarge')
            .setDescription('Completely remove/wipe a discharge record by its ID')
            .addIntegerOption(option => option.setName('record_id').setDescription('The Discharge Record ID number to delete').setRequired(true)),
        new SlashCommandBuilder()
            .setName('viewdischarges')
            .setDescription('View all logged member discharge records')
            .addUserOption(option => option.setName('user').setDescription('Filter by specific Discord user').setRequired(false)),
        new SlashCommandBuilder()
            .setName('giveaward')
            .setDescription('Award a medal/ribbon/badge to a member')
            .addStringOption(option => option.setName('user').setDescription('Roblox Username or User ID').setRequired(true))
            .addUserOption(option => option.setName('discord').setDescription('Discord user').setRequired(true))
            .addStringOption(option => option.setName('award').setDescription('Award Name (e.g. Combat Action Badge)').setRequired(true))
            .addStringOption(option => 
                option.setName('category')
                    .setDescription('Award Category Tab')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Badges Database', value: 'Badges Database' },
                        { name: 'Ribbons Database', value: 'Ribbons Database' },
                        { name: 'Foreign Awards Database', value: 'Foreign Awards Database' },
                        { name: 'Unit Awards', value: 'Unit Awards' }
                    ))
            .addStringOption(option => option.setName('reason').setDescription('Reason for award').setRequired(true)),
        new SlashCommandBuilder()
            .setName('revokeaward')
            .setDescription('Revoke an award record by ID and update the live spreadsheet board')
            .addIntegerOption(option => option.setName('award_id').setDescription('The Award Record ID to remove').setRequired(true)),
        new SlashCommandBuilder()
            .setName('postawardboard')
            .setDescription('Posts the persistent live spreadsheet-style Award Board in this channel'),
        new SlashCommandBuilder()
            .setName('background')
            .setDescription('Run a full background screening check on a member')
            .addStringOption(option => 
                option.setName('user').setDescription('Roblox Username or User ID').setRequired(true))
            .addUserOption(option => 
                option.setName('discord').setDescription('Discord user to cross-reference').setRequired(true)),
        new SlashCommandBuilder()
            .setName('auditlogs')
            .setDescription('View recent Roblox group audit logs')
            .addIntegerOption(option => 
                option.setName('limit').setDescription('Number of logs to fetch (default 10, max 50)').setRequired(false)),
        new SlashCommandBuilder()
            .setName('botaccount')
            .setDescription('Check which Roblox account the bot is currently using to rank people'),
        new SlashCommandBuilder()
            .setName('setnickname')
            .setDescription('Changes the bot nickname in this server')
            .addStringOption(option => 
                option.setName('name').setDescription('New nickname for the bot').setRequired(true))
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

// Helper function to render a spreadsheet table view inside Discord
async function updateAwardBoard(guild) {
    try {
        const configRes = await pool.query('SELECT channel_id, message_id FROM award_board_config WHERE guild_id = $1', [guild.id]);
        if (configRes.rows.length === 0) return;

        const { channel_id, message_id } = configRes.rows[0];
        const channel = await guild.channels.fetch(channel_id).catch(() => null);
        if (!channel) return;

        const message = await channel.messages.fetch(message_id).catch(() => null);
        if (!message) return;

        const awardsRes = await pool.query('SELECT * FROM awards ORDER BY id ASC LIMIT 20');
        
        let tableRows = '';
        if (awardsRes.rows.length === 0) {
            tableRows = 'No records found in database.';
        } else {
            // Spreadsheet Header Row
            tableRows += `${'ID'.padEnd(4)} \vert{}${'ROBLOX USERNAME'.padEnd(18)} | ${'AWARD / DECORATION'.padEnd(26)} \vert{}${'CATEGORY'}\n`;
            tableRows += `${'-'.repeat(4)}-+-${'-'.repeat(18)}-+-${'-'.repeat(26)}-+-${'-'.repeat(20)}\n`;

            for (const a of awardsRes.rows) {
                const idStr = `#${a.id}`.padEnd(4);
                const userStr = (a.roblox_username || 'Unknown').substring(0, 18).padEnd(18);
                const awardStr = (a.award_name || 'N/A').substring(0, 26).padEnd(26);
                const catStr = (a.category || 'General').substring(0, 20);
                tableRows += `${idStr} \vert{}${userStr} | ${awardStr} \vert{}${catStr}\n`;
            }
        }

        const spreadsheetView = `\`\`\`sql\n[ARMY QUARTERMASTER CORPS | DECORATIONS DATABASE GRID]\n\n${tableRows}\n\`\`\``;

        const embed = new EmbedBuilder()
            .setTitle('📊 USAR MASTER DECORATIONS SPREADSHEET')
            .setColor(0x1E4620)
            .setDescription(spreadsheetView)
            .setFooter({ text: 'Live Synchronized Database • Auto-Updates on /giveaward' })
            .setTimestamp();

        await message.edit({ embeds: [embed] });
    } catch (err) {
        console.error('Failed to update Spreadsheet Award Board:', err);
    }
}

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

    if (commandName === 'setnickname') {
        const newName = interaction.options.getString('name');
        try {
            await interaction.guild.members.me.setNickname(newName);
            await interaction.reply({ content: `✅ Successfully changed bot nickname to **${newName}** in this server.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: `❌ Failed to change nickname: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
        return;
    }

    if (commandName === 'botaccount') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const currentUser = await noblox.getCurrentUser();
            const headshotThumb = await noblox.getPlayerThumbnail(currentUser.UserID, '420x420', 'png', false, 'Headshot').catch(() => []);
            const thumbUrl = headshotThumb[0]?.imageUrl || null;

            const embed = new EmbedBuilder()
                .setTitle('🤖 Active Bot Roblox Account')
                .setColor(0x3498DB)
                .setThumbnail(thumbUrl)
                .addFields(
                    { name: 'Username', value: `[${currentUser.UserName}](https://www.roblox.com/users/${currentUser.UserID}/profile)`, inline: true },
                    { name: 'User ID', value: `\`${currentUser.UserID}\``, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `Failed to fetch bot Roblox account info: ${error.message}` });
        }
        return;
    }

    async function resolveRobloxId(input) {
        if (/^\d+$/.test(input)) {
            return parseInt(input, 10);
        } else {
            return await noblox.getIdFromUsername(input);
        }
    }

    if (commandName === 'postawardboard') {
        await interaction.deferReply();
        try {
            const embed = new EmbedBuilder()
                .setTitle('📊 USAR MASTER DECORATIONS SPREADSHEET')
                .setColor(0x1E4620)
                .setDescription('```sql\n[Initializing Spreadsheet Grid...]\n```')
                .setTimestamp();

            const boardMsg = await interaction.channel.send({ embeds: [embed] });

            await pool.query(`
                INSERT INTO award_board_config (guild_id, channel_id, message_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (guild_id)
                DO UPDATE SET channel_id = $2, message_id = $3;
            `, [interaction.guildId, interaction.channelId, boardMsg.id]);

            await updateAwardBoard(interaction.guild);
            await interaction.editReply({ content: '✅ Spreadsheet Grid Award Board created and linked to this channel!' });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Failed to create Spreadsheet Board: ${error.message}` });
        }
        return;
    }

    if (commandName === 'giveaward') {
        await interaction.deferReply();
        const userInput = interaction.options.getString('user');
        const targetDiscord = interaction.options.getUser('discord');
        const awardName = interaction.options.getString('award');
        const category = interaction.options.getString('category');
        const reason = interaction.options.getString('reason');

        try {
            const robloxUserId = await resolveRobloxId(userInput);
            const robloxUsername = await noblox.getUsernameFromId(robloxUserId);

            const res = await pool.query(`
                INSERT INTO awards (roblox_username, discord_id, award_name, category, reason, awarded_by)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id;
            `, [robloxUsername, targetDiscord.id, awardName, category, reason, interaction.user.id]);

            const awardId = res.rows[0].id;
            await updateAwardBoard(interaction.guild);

            const embed = new EmbedBuilder()
                .setTitle('🎖️ Award Logged & Spreadsheet Updated')
                .setColor(0x1E4620)
                .addFields(
                    { name: 'Award ID', value: `#${awardId}`, inline: true },
                    { name: 'Recipient', value: `<@${targetDiscord.id}> (\`${robloxUsername}\`)`, inline: true },
                    { name: 'Award Name', value: awardName, inline: false },
                    { name: 'Category', value: category, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Failed to give award: ${error.message}` });
        }
        return;
    }

    if (commandName === 'revokeaward') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const awardId = interaction.options.getInteger('award_id');

        try {
            const check = await pool.query('SELECT * FROM awards WHERE id = $1', [awardId]);
            if (check.rows.length === 0) {
                return await interaction.editReply({ content: `❌ No award record found with ID **#${awardId}**.` });
            }

            await pool.query('DELETE FROM awards WHERE id = $1', [awardId]);
            await updateAwardBoard(interaction.guild);

            await interaction.editReply({ content: `✅ Successfully removed award **#${awardId}** and updated the spreadsheet grid.` });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Failed to revoke award: ${error.message}` });
        }
        return;
    }

    if (commandName === 'auditlogs') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const limit = interaction.options.getInteger('limit') || 10;

        try {
            const response = await noblox.getAuditLog(GROUP_ID, Math.min(limit, 50)).catch(() => null);
            const logs = Array.isArray(response) ? response : (response?.data || response?.items || []);

            if (!logs || logs.length === 0) {
                return await interaction.editReply({ content: `📂 Note: Roblox's group audit log endpoint returned no items or is restricted for this bot account configuration.` });
            }

            let description = `Showing the last **${logs.length}** audit log entries:\n\n`;
            
            for (const log of logs) {
                const actorName = log.actor?.user?.username || log.agent?.username || 'Unknown User';
                const actionType = log.actionType || log.type || 'Unknown Action';
                const targetInfo = log.description?.TargetName || log.description?.NewValue || log.target || '';
                const date = log.created ? new Date(log.created).toLocaleString() : 'Unknown Date';

                description += `🔹 **[${date}]** \n• **Actor:** \`${actorName}\`\n• **Action:** \`${actionType}\``;
                if (targetInfo) {
                    description += `\n• **Details:** \`${typeof targetInfo === 'object' ? JSON.stringify(targetInfo) : targetInfo}\``;
                }
                description += `\n\n`;
            }

            if (description.length > 4000) {
                description = description.substring(0, 3996) + '...';
            }

            const embed = new EmbedBuilder()
                .setTitle(`📜 Roblox Group Audit Logs`)
                .setColor(0x3498DB)
                .setDescription(description)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Failed to fetch audit logs: ${error.message}` });
        }
        return;
    }

    if (commandName === 'discharge') {
        await interaction.deferReply();
        const userInput = interaction.options.getString('user');
        const targetDiscord = interaction.options.getUser('discord');
        const position = interaction.options.getString('position');
        const company = interaction.options.getString('company');
        const timeLogged = interaction.options.getString('time');
        const notes = interaction.options.getString('notes');
        const reason = interaction.options.getString('reason');
        const type = interaction.options.getString('type');

        try {
            const robloxUserId = await resolveRobloxId(userInput);
            const robloxUsername = await noblox.getUsernameFromId(robloxUserId);

            const res = await pool.query(`
                INSERT INTO discharges (roblox_username, discord_id, position, company, time_logged, notes, reason, type)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id;
            `, [robloxUsername, targetDiscord.id, position, company, timeLogged, notes, reason, type]);

            const recordId = res.rows[0].id;

            const embed = new EmbedBuilder()
                .setTitle(`🚨 Discharge Logged Successfully (ID: #${recordId})`)
                .setColor(0xE74C3C)
                .addFields(
                    { name: 'Name', value: robloxUsername, inline: true },
                    { name: 'Discord ID', value: targetDiscord.id, inline: true },
                    { name: 'Position', value: position, inline: true },
                    { name: 'Company', value: company, inline: true },
                    { name: 'Time', value: timeLogged, inline: true },
                    { name: 'Notes', value: notes, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Type', value: type, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `Failed to log discharge: ${error.message}` });
        }
        return;
    }

    if (commandName === 'updatedischarge') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const recordId = interaction.options.getInteger('record_id');
        const newType = interaction.options.getString('type');
        const newReason = interaction.options.getString('reason');

        try {
            const check = await pool.query('SELECT * FROM discharges WHERE id = $1', [recordId]);
            if (check.rows.length === 0) {
                return await interaction.editReply({ content: `❌ No discharge record found with ID **#${recordId}**.` });
            }

            await pool.query(
                'UPDATE discharges SET type = $1, reason = $2 WHERE id = $3',
                [newType, newReason, recordId]
            );

            await interaction.editReply({ content: `✅ Successfully updated discharge record **#${recordId}** to **Type: ${newType}**.` });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Failed to update discharge record: ${error.message}` });
        }
        return;
    }

    if (commandName === 'removedischarge') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const recordId = interaction.options.getInteger('record_id');

        try {
            const check = await pool.query('SELECT * FROM discharges WHERE id = $1', [recordId]);
            if (check.rows.length === 0) {
                return await interaction.editReply({ content: `❌ No discharge record found with ID **#${recordId}**.` });
            }

            await pool.query('DELETE FROM discharges WHERE id = $1', [recordId]);

            await interaction.editReply({ content: `✅ Successfully wiped/removed discharge record **#${recordId}** from the database.` });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Failed to remove discharge record: ${error.message}` });
        }
        return;
    }

    if (commandName === 'viewdischarges') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const targetUser = interaction.options.getUser('user');

        try {
            let query = 'SELECT * FROM discharges';
            let params = [];

            if (targetUser) {
                query += ' WHERE discord_id = $1';
                params.push(targetUser.id);
            }
            query += ' ORDER BY id DESC LIMIT 20';

            const res = await pool.query(query, params);
            const discharges = res.rows;

            if (discharges.length === 0) {
                return await interaction.editReply({ content: `📂 No discharge records found in the database.` });
            }

            let description = `Found **${discharges.length}** discharge record(s):\n\n`;
            for (const d of discharges) {
                description += `> **[ID: #${d.id}]**\n> Name: ${d.roblox_username} | Discord: <@${d.discord_id}>\n> Position: ${d.position} (${d.company}) | Type: **${d.type}**\n> Notes: ${d.notes || 'N/A'}\n> Reason: ${d.reason}\n\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`📋 Disciplinary Discharge Database`)
                .setColor(0xE67E22)
                .setDescription(description)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Failed to fetch discharge logs: ${error.message}` });
        }
        return;
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

            if (interaction.guildId === MAIN_GUILD_ID) {
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

            if (interaction.guildId === MAIN_GUILD_ID) {
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

            if (interaction.guildId === MAIN_GUILD_ID) {
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
                    const url = `[https://badges.roblox.com/v1/users/$](https://badges.roblox.com/v1/users/$){robloxUserId}/badges?limit=100&sortOrder=Asc${cursor ? `&cursor=${cursor}` : ''}`;
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

            const dischargeQuery = await pool.query(
                'SELECT * FROM discharges WHERE discord_id = $1 OR LOWER(roblox_username) = LOWER($2)', 
                [targetDiscord.id, targetUsername]
            );
            
            let dischargeSection = '• **Discharge Records:** None found 🟢';
            if (dischargeQuery.rows.length > 0) {
                let recordsText = '';
                for (const d of dischargeQuery.rows) {
                    recordsText += `\n> **[Record ID: #${d.id}]**\n> Name: ${d.roblox_username}\n> Discord ID: ${d.discord_id}\n> Position: ${d.position}\n> Company: ${d.company}\n> TIme: ${d.time_logged}\n> Notes: ${d.notes || 'N/A'}\n> Reason: ${d.reason}\n> Type: ${d.type}\n`;
                }
                dischargeSection = `📋 **DISCHARGE RECORDS FOUND:**${recordsText}`;
            }

            const ageDisplay = typeof robloxAgeDays === 'number' ? `~${Math.floor(robloxAgeDays / 365)} years (${robloxAgeDays} days)` : 'Unknown';

            let hazardStatus = '🟢 **Status: GOOD (Low Risk)**';
            let embedColor = 0x2ECC71;

            const isAltAccount = typeof robloxAgeDays === 'number' && robloxAgeDays < 30;
            const discordAccountAgeDays = Math.floor((Date.now() - targetDiscord.createdTimestamp) / (1000 * 60 * 60 * 24));
            const isDiscordAlt = discordAccountAgeDays < 30;

            const hasDishonorable = dischargeQuery.rows.some(d => d.type.toLowerCase() === 'dishonorable');

            if (isAltAccount || isDiscordAlt) {
                hazardStatus = '⚠️ **Status: HAZARD (Potential Alt / New Account)**';
                embedColor = 0xE67E22;
            }

            if ((isAltAccount && isDiscordAlt) || hasDishonorable) {
                hazardStatus = '🚨 **Status: HIGH HAZARD (Severe Risk / Dishonorable Discharge)**';
                embedColor = 0xE74C3C;
            }

            const embed = new EmbedBuilder()
                .setTitle(`🛡️ CLASSIFIED BACKGROUND CHECK: ${targetUsername}`)
                .setColor(embedColor)
                .setThumbnail(thumbUrl)
                .addFields(
                    { name: '🔍 Security Evaluation', value: hazardStatus, inline: false },
                    { name: '👤 Roblox Identity', value: `[Profile Link](https://www.roblox.com/users/${robloxUserId}/profile)\n• **ID:** \`${robloxUserId}\`\n• **Account Age:** ${ageDisplay}\n• **Badges Earned:** ${badgeCount}`, inline: false },
                    { name: '🎖️ Group Status', value: `• **Current Rank:** ${currentRankInGroup || 'Civilian / Unranked'}\n• **Total Recorded XP:** ${userXp} XP`, inline: false },
                    { name: '⚠️ Disciplinary Records', value: dischargeSection, inline: false },
                    { name: '💬 Discord Identity', value: `• **User:** <@${targetDiscord.id}>\n• **Account Created:** <t:${discordCreated}:R>\n• **Server Join:** <t:${joinedServer}:R>`, inline: false },
                    { name: '📋 Clearance & Roles', value: rolesList, inline: false },
                    { name: '📜 Alias History', value: pastUsernames.length > 0 ? pastUsernames.join(', ') : 'No recorded name changes', inline: false }
                )
                .setFooter({ text: `Checked by ${interaction.user.tag} • Security Division` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `Background check failed: ${error.message}` });
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);