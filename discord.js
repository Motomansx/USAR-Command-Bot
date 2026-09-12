const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const GROUP_ID = '61252017';

// Cache for group roles to prevent spamming the Roblox API
let rolesCache = [];
let lastFetchTime = 0;

async function getGroupRoles() {
    const now = Date.now();
    if (rolesCache.length > 0 && (now - lastFetchTime < 300000)) {
        return rolesCache; // Return cache if less than 5 minutes old
    }

    try {
        const response = await fetch(`https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}/roles`, {
            headers: { 'x-api-key': process.env.ROBLOX_API_KEY }
        });
        const data = await response.json();
        if (data.roles) {
            rolesCache = data.roles.map(r => ({
                name: r.displayName || r.name,
                id: r.id.split('/').pop() // Extract role ID number from resource path
            }));
            lastFetchTime = now;
        }
    } catch (err) {
        console.error('Failed to fetch group roles:', err);
    }
    return rolesCache;
}

client.once('clientReady', async () => {
    console.log(`[USAR Command] Logged in as ${client.user.tag}`);

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
                      .setDescription('Select group rank')
                      .setRequired(true)
                      .setAutocomplete(true)), // Enables rank name selection dropdown
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
            const roles = await getGroupRoles();
            const filtered = roles
                .filter(role => role.name.toLowerCase().includes(focusedValue))
                .slice(0, 25); // Discord allows max 25 autocomplete choices
            
            await interaction.respond(
                filtered.map(role => ({ name: role.name, value: role.id }))
            );
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'setrank') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const robloxUserId = interaction.options.getInteger('userid');
        const rankId = interaction.options.getString('rank');
        
        try {
            const response = await fetch(`https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}/memberships/${robloxUserId}`, {
                method: 'PATCH',
                headers: {
                    'x-api-key': process.env.ROBLOX_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    role: `groups/${GROUP_ID}/roles/${rankId}`
                })
            });

            if (response.ok) {
                await interaction.editReply(`Successfully updated Roblox ID **${robloxUserId}** to the selected group rank.`);
            } else {
                const errData = await response.text();
                await interaction.editReply(`Failed to update rank. Error: ${errData}`);
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('An error occurred while communicating with the Roblox API.');
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