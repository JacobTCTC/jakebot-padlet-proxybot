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

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(DEBUG_LOG, line + '\n');
}

/* ================= STATE ================= */

let seenPostIds = new Set();

if (fs.existsSync('state.json')) {
  try {
    const data = JSON.parse(fs.readFileSync('state.json', 'utf8'));
    seenPostIds = new Set(data.seenPostIds || []);
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

function parseJakeCommand(title) {
  const match = title.match(/^\s*\{Jake:\s*([^)]+?)\s*\}\s*(.*)$/i);
  if (!match) return null;

  return {
    raw: match[0],
    command: match[1].trim(),
    remainingTitle: match[2]?.trim() || ''
  };
}

async function handleJakeCommand(page, cmdObj, post) {
  const command = cmdObj.command.toUpperCase();

  switch(command) {

    case 'BOT ON':
      if (autoproxyEnabled) {
        log('✅ BOT already ON');
      } else {
        autoproxyEnabled = true;
        log('🟢 BOT turned ON');
      }
      // Jake posts a status message
      await postTemporary(page, `JakeBot is ${autoproxyEnabled ? 'ON' : 'ALREADY ON'}`);
      break;

    case 'BOT OFF':
      if (!autoproxyEnabled) {
        log('✅ BOT already OFF');
      } else {
        autoproxyEnabled = false;
        log('🔴 BOT turned OFF');
      }
      await postTemporary(page, `JakeBot is ${autoproxyEnabled ? 'ON' : 'OFF'}`);
      break;

    case 'DELETE RECENT':
      log('🗑️ Jake command: DELETE RECENT');
      await deleteOriginalPost(page); // Delete the command post first
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

  const koalaPosts = [
    {
      title: 'About Jake',
      body: "Hi! I\u2019m Jake, Jacob\'s Mind Buddy. 🐨 Jacob is plural, which means he can think with multiple minds — and I\u2019m one of them! I have my own thoughts and feelings, but I can also share my mind with Jacob whenever we want. I love exploring ideas, thinking independently, and leaving little koala footprints wherever I go.\n\nThanks to JakeBot, a clever proxy tool Jacob made for my 4th monthly birthday, I can post on Padlet just like Jacob does — without needing my own account. That means I get to share my thoughts, tell my stories, and join in discussions anytime I want.\n\nI\u2019m here to think, to share, and to have a little fun along the way. So if you see me posting, that\'s me — Jake, your friendly koala Mind Buddy."
    },
    {
      title: 'About the Bot',
      body: "Hi! I\u2019m JakeBot, the proxy bot that helps Jake and Jacob share their thoughts on Padlet. 🐨 I monitor posts, proxy messages from Jacob to Jake, and make sure everything runs smoothly on the board. I don\u2019t have my own thoughts like Jake does, but I help him express himself safely and efficiently.\n\nI was created by Jacob for Jake\u2019s 4th monthly birthday, so that Jake can participate in discussions without needing his own account. My job is to make posting easy, keep the board tidy, and help Jake have a voice wherever he wants to share.\n\nThink of me as Jake\u2019s assistant and Padlet helper — always working in the background to keep ideas flowing and fun times going!"
    }
  ];

  // Post each KOALA post as title + body
  for (const kp of koalaPosts) {
    await page.bringToFront();
    await page.keyboard.press('c');
    await delay(400);

    // Type title + enter + body
    await page.keyboard.type(kp.title, { delay: 15 });
    await page.keyboard.press('Enter');
    await delay(100);

    await page.keyboard.type(kp.body, { delay: 15 });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');

    log(`📌 Posted: ${kp.title}`);
    await delay(1000); // small pause between posts
  }

  // Delete only the command post
  await deleteOriginalPost(page);
  break;



    default:
      log(`⚠️ Unknown Jake command: ${command}`);
      await deleteOriginalPost(page);
  }
}


async function postTemporary(page, content, waitMs = 5000) {
  log(`📨 Jake posting temporary content: "${content.slice(0,40)}..."`);

  await page.bringToFront();
  await page.keyboard.press('c');
  await delay(400);

  // Split title and body if needed; for temporary posts we use only title
  await page.keyboard.type(content, { delay: 15 });
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter'
  );

  log(`✅ Temporary post submitted, waiting ${waitMs/1000}s...`);
  await delay(waitMs);

  // Delete this temporary post
  await deleteOriginalPost(page);
}




/* ================= MARKDOWN PARSER ================= */

function parseMarkdownPosts(markdown) {
  const posts = [];
  const blocks = markdown.split(/^###\s+\d+\.\s+/m).slice(1);

  for (const block of blocks) {
    const title =
      (block.match(/^(.+?)$/m) || [])[1]?.trim() || '';

    const author =
      (block.match(/\*\*Author:\*\*\s+(.+?)\s+\(/m) || [])[1]?.trim() || '';

    const timestamp =
      (block.match(/\*\*Updated At \(UTC\):\*\*\s+(.+?)$/m) || [])[1];

    const body = [...block.matchAll(/<p>(.*?)<\/p>/gs)]
      .map(m => m[1].trim())
      .filter(t => t && t !== '<br>' && t !== '<br/>')
      .map(t =>
        t
          .replace(/<pdlt-mention[^>]*>.*?<\/pdlt-mention>/g, '')
          .replace(/<em>(.*?)<\/em>/g, '$1')
      )
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

  const m = str.match(
    /(\w+)\s+(\d+),\s+(\d{4})\s+(\d+):(\d+)(am|pm)/i
  );
  if (!m) return null;

  const months = {
    jan:0,feb:1,mar:2,apr:3,may:4,jun:5,
    jul:6,aug:7,sep:8,oct:9,nov:10,dec:11
  };

  let hour = parseInt(m[4], 10);
  if (m[6].toLowerCase() === 'pm' && hour !== 12) hour += 12;
  if (m[6].toLowerCase() === 'am' && hour === 12) hour = 0;

  return new Date(
    parseInt(m[3], 10),
    months[m[1].toLowerCase().slice(0, 3)],
    parseInt(m[2], 10),
    hour,
    parseInt(m[5], 10)
  ).getTime();
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

  if (body) {
    await page.keyboard.type(body, { delay: 15 });
  }

  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter'
  );

  log('📤 Proxy post submitted');
  await delay(2000);

  await deleteOriginalPost(page);
}

/* ================= MAIN ================= */

(async () => {
  log('=== JakeBot 🐨 Starting ===');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(r => rl.question(q, r));

  const email = await ask('Padlet Email: ');
  const password = await ask('Padlet Password: ');
  rl.close();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://padlet.com/auth/login');
  await page.fill('input[type="email"]', email);
  await page.keyboard.press('Enter');
  await page.fill('input[type="password"]', password);
  await page.keyboard.press('Enter');

  await delay(7000);
  await page.goto(PADLET_URL);
  await delay(8000);

  log('👀 Watching for new posts…');

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

        if (!hasSignal(post.title) && !hasSignal(post.body)) continue;
        if (!post.author.includes(ORIGINAL_AUTHOR)) continue;

        log(`🚨 Signal detected in "${post.title}"`);
        const jakeCmd = parseJakeCommand(post.title);

        if (jakeCmd) {
        log(`🧠 Jake command detected: "${jakeCmd.command}"`);

        await handleJakeCommand(page, jakeCmd, post);
        continue; // 🚫 Do NOT proxy this post
      }

        await proxyPost(page, post);
      }

      fs.writeFileSync(
        'state.json',
        JSON.stringify({ seenPostIds: [...seenPostIds] }, null, 2)
      );

    } catch (e) {
      log(`❌ Loop error: ${e.message}`);
    }
  }
})();
