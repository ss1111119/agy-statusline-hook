const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

console.log('🚀 Starting Antigravity CLI Statusline Hook installation...');

const homeDir = os.homedir();
const hookDir = path.join(homeDir, '.gemini', 'antigravity-cli', 'hooks');
const settingsPath = path.join(homeDir, '.gemini', 'antigravity-cli', 'settings.json');
const scriptName = 'my-status.mjs';
const scriptDest = path.join(hookDir, scriptName);

// 1. Create hooks directory if it doesn't exist
if (!fs.existsSync(hookDir)) {
    fs.mkdirSync(hookDir, { recursive: true });
    console.log(`📁 Created directory: ${hookDir}`);
}

// 2. Download all required scripts
const filesToDownload = ['my-status.mjs', 'git.mjs', 'input.mjs', 'renderer.mjs'];
let downloadedCount = 0;

function downloadFile(fileName) {
    const dest = path.join(hookDir, fileName);
    const url = `https://raw.githubusercontent.com/ss1111119/agy-statusline-hook/main/${fileName}`;
    
    console.log(`⬇️  Downloading ${fileName}...`);
    https.get(url, (res) => {
        if (res.statusCode !== 200) {
            console.error(`❌ Failed to download ${fileName}. Status Code: ${res.statusCode}`);
            process.exit(1);
        }

        const fileStream = fs.createWriteStream(dest);
        res.pipe(fileStream);

        fileStream.on('finish', () => {
            fileStream.close();
            console.log(`✅ Successfully downloaded ${fileName} to: ${dest}`);
            downloadedCount++;
            if (downloadedCount === filesToDownload.length) {
                updateSettings();
            }
        });
    }).on('error', (err) => {
        console.error(`❌ Download error for ${fileName}: ${err.message}`);
        process.exit(1);
    });
}

filesToDownload.forEach(downloadFile);

// 3. Update settings.json
function updateSettings() {
    console.log(`⚙️  Updating settings.json...`);
    let settings = {};

    if (fs.existsSync(settingsPath)) {
        try {
            const raw = fs.readFileSync(settingsPath, 'utf8');
            settings = JSON.parse(raw);
        } catch (e) {
            console.error(`❌ Error parsing settings.json: ${e.message}`);
            console.log('⚠️  Please manually configure settings.json.');
            process.exit(1);
        }
    } else {
        console.log(`⚠️  settings.json not found, creating a new one...`);
        // Create the directory for settings if somehow it's not there
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    }

    // Windows paths need to be escaped in JSON, or we can just use the absolute path
    // Node handles forward slashes well on Windows too. Let's replace backslashes to avoid JSON parsing issues if manually edited later
    const commandPath = scriptDest.replace(/\\/g, '/');

    const command = commandPath.includes(' ') ? `node "${commandPath}"` : `node ${commandPath}`;

    settings.statusLine = {
        enabled: true,
        type: 'command',
        command: command
    };

    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        console.log(`✅ Successfully updated settings.json`);
        console.log('\n🎉 Installation Complete!');
        console.log('👉 You can now run `agy` in your terminal to see the statusline.');
        console.log('👉 Tip: Type `/statusline` inside agy to toggle visibility.');
    } catch (e) {
        console.error(`❌ Failed to write settings.json: ${e.message}`);
        process.exit(1);
    }
}
