#!/usr/bin/env node
const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/* ================= CONFIG LOADING ================= */

const CONFIG_FILE = './config.json';

// Check if config exists, if not run setup
if (!fs.existsSync(CONFIG_FILE)) {
  console.log('⚠️  No configuration file found!');
  console.log('🔧 Running setup script...');
  console.log('');
  
  const setupProcess = spawn('node', ['setup.js'], { stdio: 'inherit' });
  
  setupProcess.on('close', (code) => {
    if (code !== 0) {
      console.error('❌ Setup failed. Please run setup.js manually.');
      process.exit(1);
    }
    console.log('');
    console.log('✅ Setup complete! Please run "node watch.js" again to start JakeBot.');
    process.exit(0);
  });
  
  return;
}

// Load config
let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  console.log('📁 Configuration loaded successfully!');
} catch (error) {
  console.error('❌ Failed to load configuration file:', error.message);
  console.log('💡 Try running: node setup.js');
  process.exit(1);
}

/* ================= CONFIG VALIDATION ================= */

const requiredFields = ['padletUrl', 'padletId', 'originalAuthor', 'mindBuddyEmail', 'mindBuddyPassword'];
const missingFields = requiredFields.filter(field => !config[field]);

if (missingFields.length > 0) {
  console.error('❌ Configuration is incomplete. Missing fields:', missingFields.join(', '));
  console.log('💡 Please run: node setup.js');
  process.exit(1);
}

/* ================= CONFIG ================= */

const PADLET_URL = config.padletUrl;
const PADLET_ID = config.padletId;
const MARKDOWN_URL = `https://padlet.com/padlets/${PADLET_ID}/exports/markdown.md`;

const POST_CHECK_INTERVAL = config.postCheckInterval || 5000;
const MAX_PROXY_AGE = config.maxProxyAge || (10 * 60 * 1000);

const SIGNALERS = config.signalers || ['🐨', '[', ']'];
const ORIGINAL_AUTHOR = config.originalAuthor;
const MIND_BUDDY_NAME = config.mindBuddyName || 'Mind Buddy';
const MIND_BUDDY_BIO = config.mindBuddyBio || `Hi! I'm ${MIND_BUDDY_NAME}, ${ORIGINAL_AUTHOR}'s Mind Buddy. 🐨 I have my own thoughts and feelings, and I love exploring ideas and thinking independently!`;

/* ================= LOGGING ================= */

const LOG_DIR = './logs';
const DEBUG_LOG = path.join(LOG_DIR, 'debug.log');
const MARKDOWN_LOG = path.join(LOG_DIR, 'posts.md');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(DEBUG_LOG, line + '\n');
}

/* ================= STATE ================= */

let seenPostIds = new Set();
let autoproxyEnabled = true;
let botStartTime = Date.now();

if (fs.existsSync('state.json')) {
  try {
    const data = JSON.parse(fs.readFileSync('state.json', 'utf8'));
    seenPostIds = new Set(data.seenPostIds || []);
    autoproxyEnabled = data.autoproxyEnabled ?? true;
    log(`📂 State loaded: autoproxy=${autoproxyEnabled}, seen=${seenPostIds.size} posts`);
  } catch {
    log('⚠️ Failed to load state.json, starting fresh');
  }
}

/* ================= HELPERS ================= */

const delay = ms => new Promise(r => setTimeout(r, ms));

function hasSignal(text) {
  return SIGNALERS.some(s => text.includes(s));
}

function stripSignalers(text) {
  let out = text;
  for (const s of SIGNALERS) {
    out = out.replace(
      new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      ''
    );
  }
  return out.trim();
}

// Detect {Jake: COMMAND} or {MindBuddyName: COMMAND} at the start of a post title
function parseJakeCommand(title) {
  const escapedName = MIND_BUDDY_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*\\{(?:Jake|${escapedName}):\\s*([A-Z\\s]+)\\}\\s*$`, 'i');
  const match = title.match(pattern);
  if (!match) return null;
  return { raw: match[0], command: match[1].trim().toUpperCase() };
}

function getUptime() {
  const ms = Date.now() - botStartTime;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/* ================= WAIT FOR PADLET READY ================= */

async function waitForPadletReady(page) {
  log('⏳ Waiting for Padlet to be fully loaded and interactive...');
  
  // Wait for the page to be in a ready state
  await page.waitForLoadState('networkidle');
  
  // Wait for any article or post element to be visible (indicates board is loaded)
  try {
    await page.waitForSelector('article, [data-testid="post"], [role="article"]', { 
      timeout: 10000,
      state: 'visible' 
    });
    log('✅ Padlet board elements detected');
  } catch (e) {
    log('⚠️ No existing posts found, but continuing...');
  }
  
  // Extra delay to ensure everything is settled
  await delay(3000);
  
  log('✅ Padlet is ready for interaction');
}

/* ================= DELETE ORIGINAL POST ================= */

async function deleteOriginalPost(page) {
  log('🗑️ Attempting to delete original post…');

  const opened = await page.evaluate(authorName => {
    const posts = Array.from(
      document.querySelectorAll('article, [data-testid="post"]')
    );

    for (const post of posts) {
      if ((post.innerText || '').includes(authorName)) {
        const menu =
          post.querySelector('button[aria-haspopup="menu"]') ||
          post.querySelector('[aria-label*="More"]');
        if (menu) {
          menu.click();
          return true;
        }
      }
    }
    return false;
  }, ORIGINAL_AUTHOR);

  if (!opened) {
    log('⚠️ No matching original post found');
    return;
  }

  await delay(600);

  const deleted = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[role="menuitem"], button')]
      .find(b => b.textContent?.toLowerCase().includes('delete'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  log(deleted ? '✅ Original post deleted' : '⚠️ Delete button not found');
}

/* ================= DELETE COMMAND POST ================= */

async function deleteCommandPost(page, commandText) {
  log('🗑️ Attempting to delete command post…');

  const opened = await page.evaluate(cmdText => {
    const posts = Array.from(
      document.querySelectorAll('article, [data-testid="post"]')
    );

    // Find the post containing the command text
    for (const post of posts) {
      if ((post.innerText || '').includes(cmdText)) {
        const menu =
          post.querySelector('button[aria-haspopup="menu"]') ||
          post.querySelector('[aria-label*="More"]');
        if (menu) {
          menu.click();
          return true;
        }
      }
    }
    return false;
  }, commandText);

  if (!opened) {
    log('⚠️ No matching command post found');
    return;
  }

  await delay(600);

  const deleted = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[role="menuitem"], button')]
      .find(b => b.textContent?.toLowerCase().includes('delete'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  log(deleted ? '✅ Command post deleted' : '⚠️ Delete button not found');
}

/* ================= TEMPORARY POST ================= */

async function postTemporary(page, content, waitMs = 5000) {
  log(`📨 ${MIND_BUDDY_NAME} posting temporary content: "${content.slice(0,40)}..."`);

  await page.bringToFront();
  await page.keyboard.press('c');
  await delay(400);

  await page.keyboard.type(content, { delay: 15 });
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter'
  );

  log(`✅ Temporary post submitted, waiting ${waitMs/1000}s...`);
  await delay(waitMs);

  await deleteOriginalPost(page);
}

/* ================= REGULAR POST ================= */

async function postRegular(page, title, body) {
  log(`📨 ${MIND_BUDDY_NAME} posting: "${title}"`);

  await page.bringToFront();
  await page.keyboard.press('c');
  await delay(400);

  await page.keyboard.type(title, { delay: 15 });
  await page.keyboard.press('Enter');
  await delay(150);

  if (body) await page.keyboard.type(body, { delay: 15 });

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');

  log(`✅ Regular post submitted: "${title}"`);
  await delay(1000);
}

/* ================= ABOUT POSTS ================= */

async function postAboutPosts(page) {
  log(`🐨 Posting ABOUT posts for ${MIND_BUDDY_NAME}`);

  const aboutPosts = [
    {
      title: `About ${MIND_BUDDY_NAME}`,
      body: MIND_BUDDY_BIO
    },
    {
      title: 'About the Bot',
      body: `Hi! I'm JakeBot, the proxy bot that helps ${MIND_BUDDY_NAME} and ${ORIGINAL_AUTHOR} share their thoughts on Padlet. 🐨 I monitor posts, proxy messages from ${ORIGINAL_AUTHOR} to ${MIND_BUDDY_NAME}, and make sure everything runs smoothly on the board. I don't have my own thoughts like ${MIND_BUDDY_NAME} does, but I help them express themselves safely and efficiently.\n\nI was created by ${ORIGINAL_AUTHOR} so that ${MIND_BUDDY_NAME} can participate in discussions without needing to sign in to their own account. My job is to make posting easy, keep the board tidy, and help ${MIND_BUDDY_NAME} have a voice wherever they want to share.\n\nThink of me as ${MIND_BUDDY_NAME}'s assistant and Padlet helper, always working in the background to keep ideas flowing and fun times going!`
    }
  ];

  for (const aboutPost of aboutPosts) {
    await page.bringToFront();
    await page.keyboard.press('c');
    await delay(400);

    await page.keyboard.type(aboutPost.title, { delay: 15 });
    await page.keyboard.press('Enter');
    await delay(100);
    await page.keyboard.type(aboutPost.body, { delay: 15});
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');

    log(`📌 Posted: ${aboutPost.title}`);
    await delay(1000);
  }
}

/* ================= KOALA EASTER EGG ================= */

async function postKoalaOriginStory(page) {
  log('🐨 Easter egg activated: KOALA origin story!');

  const originPost = {
    title: 'More About JakeBot 🐨',
    body: `You found the secret koala command! 🎉

JakeBot was created by Jacob Butcher as a special gift for Jake's 4th monthly birthday. Jacob is plural by nature, which means he can think with multiple minds — and Jake is one of them! Jake has his own thoughts, feelings, and personality, but sharing a Padlet account meant Jake couldn't post freely without Jacob signing out.

That's where JakeBot comes in! JakeBot watches the Padlet board for posts from Jacob that contain special "signalers" (like the koala emoji 🐨, or brackets [ ]). When it detects these signals, JakeBot knows Jacob is posting on behalf of Jake, so it automatically:

1. Creates a new post using Jake's account
2. Removes the signalers from the text
3. Deletes the original post from Jacob's account

This way, Jake gets his own voice on Padlet without the hassle of constantly logging in and out! JakeBot runs quietly in the background on Jacob's computer, monitoring the board 24/7 (well, whenever Jacob's computer is on).

JakeBot is built with Playwright (for browser automation) and runs on Node.js. It's a labor of love from one mind to another, proving that even in the digital world, plurality can shine! 🌟

So when you see posts from Jake, you're seeing JakeBot in action — helping a Mind Buddy express himself freely and independently. That's what makes JakeBot special! 🐨💙`
  };

  await page.bringToFront();
  await page.keyboard.press('c');
  await delay(400);

  await page.keyboard.type(originPost.title, { delay: 15 });
  await page.keyboard.press('Enter');
  await delay(100);
  await page.keyboard.type(originPost.body, { delay: 15 });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');

  log(`📌 Posted: ${originPost.title}`);
  await delay(1000);
}

/* ================= PROXY POST ================= */

async function proxyPost(page, post) {
  const title = stripSignalers(post.title);
  const body = stripSignalers(post.body);

  log(`📨 Proxying post: "${title}"`);

  await page.bringToFront();
  await page.keyboard.press('c');
  await delay(400);

  await page.keyboard.type(title, { delay: 15 });
  await page.keyboard.press('Enter');
  await delay(150);

  if (body) await page.keyboard.type(body, { delay: 15 });

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');

  log('📤 Proxy post submitted');
  await delay(2000);

  await deleteOriginalPost(page);
}

/* ================= HANDLE COMMAND ================= */

async function handleJakeCommand(page, cmdObj, post, browser) {
  const command = cmdObj.command.toUpperCase();

  switch(command) {

    case 'BOT ON':
      if (autoproxyEnabled) {
        log('✅ BOT already ON');
        await postTemporary(page, 'JakeBot is already ON 🟢');
      } else {
        autoproxyEnabled = true;
        log('🟢 BOT turned ON');
        await postTemporary(page, 'JakeBot is now ON 🟢');
      }
      await deleteCommandPost(page, cmdObj.raw);
      break;

    case 'BOT OFF':
      if (!autoproxyEnabled) {
        log('✅ BOT already OFF');
        await postTemporary(page, 'JakeBot is already OFF 🔴');
      } else {
        autoproxyEnabled = false;
        log('🔴 BOT turned OFF');
        await postTemporary(page, 'JakeBot is now OFF 🔴');
      }
      await deleteCommandPost(page, cmdObj.raw);
      break;

    case 'STATUS':
      log('📊 Command: STATUS');
      const statusTitle = 'JakeBot Status 🐨';
      const statusBody = `🟢 JakeBot is Online

Proxy Status: ${autoproxyEnabled ? '🟢 ON' : '🔴 OFF'}
Uptime: ${getUptime()}
Mind Buddy: ${MIND_BUDDY_NAME}
Signalers: ${SIGNALERS.join(', ')}

If you need help with JakeBot, use {${MIND_BUDDY_NAME}: HELP}!`;
      
      await postRegular(page, statusTitle, statusBody);
      await delay(1000);
      await deleteCommandPost(page, cmdObj.raw);
      break;

    case 'UPTIME':
      log('⏱️ Command: UPTIME');
      const uptimeMsg = `JakeBot has been running for ${getUptime()} 🐨`;
      await postTemporary(page, uptimeMsg, 5000);
      await deleteCommandPost(page, cmdObj.raw);
      break;

    case 'SHUTDOWN':
      log('🛑 Command: SHUTDOWN - Initiating graceful shutdown');
      const shutdownTitle = 'JakeBot has gone to bed.';
      const shutdownBody = `JakeBot has been told to take a rest, and will no longer monitor / proxy posts. To wake JakeBot, ${ORIGINAL_AUTHOR} will have to go to JakeBot's home and wake JakeBot there. G'night mates! 🐨💤`;
      
      await postRegular(page, shutdownTitle, shutdownBody);
      await delay(2000);
      await deleteCommandPost(page, cmdObj.raw);
      
      log('💤 Saving state and closing browser...');
      fs.writeFileSync('state.json', JSON.stringify({ seenPostIds: [...seenPostIds], autoproxyEnabled }, null, 2));
      
      await browser.close();
      log('👋 JakeBot has shut down gracefully. Run `node watch.js` to wake me again!');
      process.exit(0);
      break;

    case 'HELP':
      log('📖 Command: HELP');
      const helpTitle = 'JakeBot Commands 🐨';
      const helpBody = `Available commands (post as "{${MIND_BUDDY_NAME}: COMMAND}"):

🟢 {Jake: BOT ON} - Enable automatic proxying of posts with signalers (${SIGNALERS.join(', ')})
🔴 {Jake: BOT OFF} - Disable automatic proxying
📊 {Jake: STATUS} - Show JakeBot's current status and uptime
⏱️ {Jake: UPTIME} - Show how long JakeBot has been running
🛑 {Jake: SHUTDOWN} - Put JakeBot to sleep (stops the bot)
📖 {Jake: HELP} - Show this command list
🧪 {Jake: TEST POST} - Post a test message ("G'Day Mates!")
📡 {Jake: TEST PING} - Silent test (just deletes the command post)
🐨 {Jake: ABOUT} - Post the "About ${MIND_BUDDY_NAME}" and "About the Bot" intro posts
🗑️ {Jake: DELETE RECENT} - Delete the most recent post on the board

Signalers: Include ${SIGNALERS.join(', ')} in your post title or body to trigger proxying when BOT is ON.`;
      
      await postRegular(page, helpTitle, helpBody);
      await delay(1000);
      await deleteCommandPost(page, cmdObj.raw);
      break;

    case 'DELETE RECENT':
      log('🗑️ Command: DELETE RECENT');
      await deleteCommandPost(page, cmdObj.raw);
      await delay(500);
      log('🗑️ Deleting most recent post');
      await page.evaluate(() => {
        const posts = Array.from(document.querySelectorAll('article, [data-testid="post"]'));
        if (posts.length) {
          const menu = posts[0].querySelector('button[aria-haspopup="menu"], [aria-label*="More"]');
          if (menu) menu.click();
        }
      });
      await delay(600);
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('[role="menuitem"], button'))
          .find(b => b.textContent?.toLowerCase().includes('delete'));
        if (btn) btn.click();
      });
      log('✅ Recent post deleted');
      break;

    case 'TEST POST':
      log('🧪 Command: TEST POST');
      await postTemporary(page, "G'Day Mates!", 5000);
      await deleteCommandPost(page, cmdObj.raw);
      break;

    case 'TEST PING':
      log('📡 Command: TEST PING acknowledged');
      await deleteCommandPost(page, cmdObj.raw);
      break;

    case 'ABOUT':
      log('🐨 Command: ABOUT');
      await postAboutPosts(page);
      await deleteCommandPost(page, cmdObj.raw);
      break;

    case 'KOALA':
      log('🐨🎉 Easter egg command: KOALA');
      await postKoalaOriginStory(page);
      await delay(1000);
      await deleteCommandPost(page, cmdObj.raw);
      break;

    default:
      log(`⚠️ Unknown command: ${command}`);
      await deleteCommandPost(page, cmdObj.raw);
  }
}

/* ================= MARKDOWN PARSER ================= */

function parseMarkdownPosts(markdown) {
  const posts = [];
  const blocks = markdown.split(/^###\s+\d+\.\s+/m).slice(1);

  for (const block of blocks) {
    const title = (block.match(/^(.+?)$/m) || [])[1]?.trim() || '';
    const author = (block.match(/\*\*Author:\*\*\s+(.+?)\s+\(/m) || [])[1]?.trim() || '';
    const timestamp = (block.match(/\*\*Updated At \(UTC\):\*\*\s+(.+?)$/m) || [])[1];

    const body = [...block.matchAll(/<p>(.*?)<\/p>/gs)]
      .map(m => m[1].trim())
      .filter(t => t && t !== '<br>' && t !== '<br/>')
      .map(t => t.replace(/<pdlt-mention[^>]*>.*?<\/pdlt-mention>/g, '').replace(/<em>(.*?)<\/em>/g, '$1'))
      .join('\n\n');

    if (!title && !body) continue;

    const id = `${timestamp}-${title.slice(0, 40)}`;
    posts.push({ id, title, body, author, timestamp });
  }

  return posts;
}

/* ================= TIMESTAMP ================= */

function parseTimestamp(str) {
  if (!str) return null;
  const m = str.match(/(\w+)\s+(\d+),\s+(\d{4})\s+(\d+):(\d+)(am|pm)/i);
  if (!m) return null;

  const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  let hour = parseInt(m[4], 10);
  if (m[6].toLowerCase() === 'pm' && hour !== 12) hour += 12;
  if (m[6].toLowerCase() === 'am' && hour === 12) hour = 0;

  return new Date(parseInt(m[3], 10), months[m[1].toLowerCase().slice(0,3)], parseInt(m[2], 10), hour, parseInt(m[5],10)).getTime();
}

/* ================= MAIN LOOP ================= */

(async () => {
  log('=== JakeBot 🐨 Starting ===');
  log(`Mind Buddy: ${MIND_BUDDY_NAME}`);
  log(`Original Author: ${ORIGINAL_AUTHOR}`);
  log(`Signalers: ${SIGNALERS.join(', ')}`);
  log(`Padlet URL: ${PADLET_URL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  log('🔐 Logging in to Padlet...');
  await page.goto('https://padlet.com/auth/login');
  await page.fill('input[type="email"]', config.mindBuddyEmail);
  await page.keyboard.press('Enter');
  await delay(2000);
  await page.fill('input[type="password"]', config.mindBuddyPassword);
  await page.keyboard.press('Enter');
  await delay(7000);

  log('🌐 Navigating to Padlet board...');
  await page.goto(PADLET_URL);
  
  // Wait for Padlet to be fully ready
  await waitForPadletReady(page);

  log('📝 Posting online status...');

  // Post online status
  const onlineTitle = 'JakeBot is Online! 🐨';
  const onlineBody = `🟢 JakeBot is now monitoring the board

Proxy Status: ${autoproxyEnabled ? '🟢 ON' : '🔴 OFF'}
Mind Buddy: ${MIND_BUDDY_NAME}

If you need help with JakeBot, use {${MIND_BUDDY_NAME}: HELP}!`;
  
  await postRegular(page, onlineTitle, onlineBody);
  log('✅ Online status posted');

  await delay(2000);

  log('👀 Watching for new posts…');
  log(`🔘 Autoproxy status: ${autoproxyEnabled ? 'ON' : 'OFF'}`);

  while (true) {
    try {
      await delay(POST_CHECK_INTERVAL);

      const mdPage = await context.newPage();
      await mdPage.goto(MARKDOWN_URL);
      await mdPage.waitForLoadState('networkidle');

      const markdown = await mdPage.evaluate(() => document.body.innerText);
      fs.writeFileSync(MARKDOWN_LOG, markdown);
      await mdPage.close();

      const posts = parseMarkdownPosts(markdown);

      for (const post of posts) {
        if (seenPostIds.has(post.id)) continue;
        seenPostIds.add(post.id);

        const ts = parseTimestamp(post.timestamp);
        if (!ts || Date.now() - ts > MAX_PROXY_AGE) continue;

        if (!post.author.includes(ORIGINAL_AUTHOR)) continue;

        // Check for command FIRST, before checking for signalers
        const cmd = parseJakeCommand(post.title);
        if (cmd) {
          log(`🧠 Command detected: "${cmd.command}"`);
          await handleJakeCommand(page, cmd, post, browser);
          continue; // Do not proxy command posts
        }

        // Only check for signalers and proxy if autoproxy is enabled
        if (!autoproxyEnabled) {
          log(`⏸️ Autoproxy is OFF, skipping post: "${post.title}"`);
          continue;
        }

        // Only check for signalers if it's not a command
        if (!hasSignal(post.title) && !hasSignal(post.body)) continue;

        log(`🚨 Signal detected in "${post.title}"`);

        await proxyPost(page, post);
      }

      fs.writeFileSync('state.json', JSON.stringify({ seenPostIds: [...seenPostIds], autoproxyEnabled }, null, 2));

    } catch (e) {
      log(`❌ Loop error: ${e.message}`);
      await delay(5000); // Add a delay on error to prevent rapid retries
    }
  }
})();