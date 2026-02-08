#!/usr/bin/env node
const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

/* ================= CONFIG ================= */

const PADLET_URL = 'https://padlet.com/jacobbutcher28/lets-chat-qjrhalto59z8efms';
const PADLET_ID = 'qjrhalto59z8efms';
const MARKDOWN_URL = `https://padlet.com/padlets/${PADLET_ID}/exports/markdown.md`;

const POST_CHECK_INTERVAL = 5000;
const MAX_PROXY_AGE = 10 * 60 * 1000;

const SIGNALERS = ['🐨', '[', ']'];
const ORIGINAL_AUTHOR = 'Jacob Butcher';

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

// Detect {Jake: COMMAND} at the start of a post title
function parseJakeCommand(title) {
  const match = title.match(/^\s*\{Jake:\s*([A-Z\s]+)\}\s*$/i);
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

/* ================= TEMPORARY POST ================= */

async function postTemporary(page, content, waitMs = 5000) {
  log(`📨 Jake posting temporary content: "${content.slice(0,40)}..."`);

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
  log(`📨 Jake posting: "${title}"`);

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

/* ================= KOALA POSTS ================= */

async function postKoalaPosts(page) {
  log('🐨 Posting KOALA posts');

  const koalaPosts = [
    {
      title: 'About Jake',
      body: "Hi! I\u2019m Jake, Jacob\'s Mind Buddy. 🐨 Jacob is plural, which means he can think with multiple minds — and I\u2019m one of them! I have my own thoughts and feelings, but I can also share my mind with Jacob whenever we want. I love exploring ideas, thinking independently, and leaving little koala footprints wherever I go.\n\nThanks to JakeBot, a clever proxy tool Jacob made for my 4th monthly birthday, I can post on Padlet just like Jacob does, but without having to have Jacob sign out of his account for me. That means I get to share my thoughts, tell my stories, and join in discussions anytime I want.\n\nI\u2019m here to think, to share, and to have a little fun along the way. So if you see me posting, that\'s me!  Jake, Jacob's friendly koala Mind Buddy."
    },
    {
      title: 'About the Bot',
      body: "Hi! I\u2019m JakeBot, the proxy bot that helps Jake and Jacob share their thoughts on Padlet. 🐨 I monitor posts, proxy messages from Jacob to Jake, and make sure everything runs smoothly on the board. I don\u2019t have my own thoughts like Jake does, but I help him express himself safely and efficiently.\n\nI was created by Jacob for Jake\u2019s 4th monthly birthday, so that Jake can participate in discussions without needing to sign in to his own account. My job is to make posting easy, keep the board tidy, and help Jake have a voice wherever he wants to share.\n\nThink of me as Jake\u2019s assistant and Padlet helper, always working in the background to keep ideas flowing and fun times going!"
    }
  ];

  for (const kp of koalaPosts) {
    await page.bringToFront();
    await page.keyboard.press('c');
    await delay(400);

    await page.keyboard.type(kp.title, { delay: 15 });
    await page.keyboard.press('Enter');
    await delay(100);
    await page.keyboard.type(kp.body, { delay: 15});
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');

    log(`📌 Posted: ${kp.title}`);
    await delay(1000);
  }
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

/* ================= HANDLE JAKE COMMAND ================= */

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
      //await deleteOriginalPost(page);
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
      //await deleteOriginalPost(page);
      break;

    case 'STATUS':
      log('📊 Jake command: STATUS');
      const statusTitle = 'JakeBot Status 🐨';
      const statusBody = `🟢 JakeBot is Online

Proxy Status: ${autoproxyEnabled ? '🟢 ON' : '🔴 OFF'}
Uptime: ${getUptime()}

If you need help with JakeBot, use {Jake: HELP}!`;
      
      await postRegular(page, statusTitle, statusBody);
      await delay(1000);
      await deleteOriginalPost(page);
      break;

    case 'UPTIME':
      log('⏱️ Jake command: UPTIME');
      const uptimeMsg = `JakeBot has been running for ${getUptime()} 🐨`;
      await postTemporary(page, uptimeMsg, 5000);
      break;

    case 'SHUTDOWN':
      log('🛑 Jake command: SHUTDOWN - Initiating graceful shutdown');
      const shutdownTitle = 'JakeBot has gone to bed.';
      const shutdownBody = "JakeBot has been told to take a rest, and will no longer monitor / proxy posts. To wake JakeBot, Jacob will have to go to JakeBot's home and wake JakeBot there. G'night mates! 🐨💤";
      
      await postRegular(page, shutdownTitle, shutdownBody);
      await delay(2000);
      await deleteOriginalPost(page);
      
      log('💤 Saving state and closing browser...');
      fs.writeFileSync('state.json', JSON.stringify({ seenPostIds: [...seenPostIds], autoproxyEnabled }, null, 2));
      
      await browser.close();
      log('👋 JakeBot has shut down gracefully. Run `node watch.js` to wake me again!');
      process.exit(0);
      break;

    case 'HELP':
      log('📖 Jake command: HELP');
      const helpTitle = 'JakeBot Commands 🐨';
      const helpBody = `Available commands (post as "{Jake: COMMAND}"):

🟢 BOT ON - Enable automatic proxying of posts with signalers (🐨, [, ])
🔴 BOT OFF - Disable automatic proxying
📊 STATUS - Show JakeBot's current status and uptime
⏱️ UPTIME - Show how long JakeBot has been running
🛑 SHUTDOWN - Put JakeBot to sleep (stops the bot)
📖 HELP - Show this command list
🧪 TEST POST - Post a test message ("G'Day Mates!")
📡 TEST PING - Silent test (just deletes the command post)
🐨 KOALA - Post the "About Jake" and "About the Bot" intro posts
🗑️ DELETE RECENT - Delete the most recent post on the board

Signalers: Include 🐨, [, or ] in your post title or body to trigger proxying when BOT is ON.`;
      
      await postRegular(page, helpTitle, helpBody);
      await delay(1000);
      await deleteOriginalPost(page);
      break;

    case 'DELETE RECENT':
      log('🗑️ Jake command: DELETE RECENT');
      await deleteOriginalPost(page);
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
      log('🧪 Jake command: TEST POST');
      await postTemporary(page, "G'Day Mates!", 5000);
      break;

    case 'TEST PING':
      log('📡 Jake command: TEST PING acknowledged');
      await deleteOriginalPost(page);
      break;

    case 'KOALA':
      log('🐨 Jake command: KOALA');
      await postKoalaPosts(page);
      await deleteOriginalPost(page);
      break;

    default:
      log(`⚠️ Unknown Jake command: ${command}`);
      await deleteOriginalPost(page);
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
  log('=== JakeBot 🐨 Fully Running ===');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(r => rl.question(q, r));
  const email = await ask('Padlet Email: ');
  const password = await ask('Padlet Password: ');
  rl.close();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  log('🔐 Logging in to Padlet...');
  await page.goto('https://padlet.com/auth/login');
  await page.fill('input[type="email"]', email);
  await page.keyboard.press('Enter');
  await delay(2000);
  await page.fill('input[type="password"]', password);
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

If you need help with JakeBot, use {Jake: HELP}!`;
  
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

        // Check for Jake command FIRST, before checking for signalers
        const jakeCmd = parseJakeCommand(post.title);
        if (jakeCmd) {
          log(`🧠 Jake command detected: "${jakeCmd.command}"`);
          await handleJakeCommand(page, jakeCmd, post, browser);
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