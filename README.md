![JakeBot Logo](logo.png)

### JakeBot

**A Padlet Proxybot for Plurals Like Us!**

> Status: This project is in live development. What you see here reflects active work and evolving snapshots. Development happens in GitHub Codespaces, and updates roll in as commits are pushed.

---

## Table of Contents
- [What is this?](#what-is-this)
- [The problem](#the-problem)
- [The solution](#the-solution)
- [Features](#features)
- [Getting JakeBot ready for your Padlet](#getting-jakebot-ready-for-your-padlet)
- [Troubleshooting](#troubleshooting)
- [What still needs work](#what-still-needs-work)
- [Contributing](#contributing)
- [FAQ](#faq)
- [Disclaimer](#disclaimer)

---

## What is this?

**Plurality** means having multiple distinct people, consciousnesses, or identities sharing one brain and body. Some call these headmates, alters, or system members.

I'm plural. That means my mind isn't just me, it includes others with their own thoughts, feelings, and voices.

One of those voices is Jake. He's a koala 🐨 who lives in my Mindforest. Jake has his own opinions, personality, and a strong urge to express himself wherever we happen to be online. Honestly? I like that about him.

Like most people, Jake wants independence; especially digitally. He prefers speaking through his own profile rather than being filtered through mine. That's quite understandable.

## The problem

I don't have two devices.

If Jake wants to post as himself, I'd have to sign out of my account, log into his, post, then switch back again. If I want to speak, we reverse the process. That gets frustrating fast.

On Discord, this problem is already solved. Bots like Tupperware let Jake speak through my account while clearly showing him as the author. Clean. Simple. Effective.

Padlet, however, has no such solution. Possibly because plurals rarely use it. We do.

**The idea**

Jake's fourth-month birthday rolled around, and I didn't have a gift for him. Around 5 PM, it clicked: I could build one.

JakeBot became that gift.

The challenge was making it work without Padlet's paid API. Why the API costs money is a mystery for another day, but it meant I had to get creative.

## The solution

After a lot of research and experimentation, I landed on a **headless browser** approach. A headless browser is a web browser without a graphical interface—it can visit websites, click buttons, and fill out forms just like a human would, but it runs in the background through code.

**The bot:**

* Uses Playwright (a headless browser automation tool)
* Logs into Jake's Padlet account
* Watches for input
* Posts messages under his name
* Runs continuously in the background

After wrestling with Padlet's quirks, detours, and curveballs, *I got it working!*

Now I start the bot, have Jake input his credentials, and let it run. When Jake speaks through me, his words appear under his own profile.

**Mission accomplished.**

## Features

JakeBot currently can:

* **Authenticate** into a Padlet account securely
* **Monitor** for messages from you to post
* **Post** messages to Padlet under your headmate's account
* **Run persistently** in the background
* **Command system** for controlling the bot (note: this works for Jake and me, but reflects my style—feedback welcome for improvements!)

## Getting JakeBot ready for your Padlet

**Prerequisites:**
- GitHub account
- Access to GitHub Codespaces (or a Linux environment)
- Node.js (latest version recommended)
- Playwright
- A Padlet account for your headmate/Mind Buddy

**Note:** If you're using GitHub Codespaces, `run.sh` handles most of the technical setup automatically!

**Steps:**

1. Fork this repository
2. Open it in GitHub Codespaces
3. Run `run.sh` to prepare the environment
4. `cd jakebot/`
5. From the jakebot folder, run `node setup.js`
6. Complete the requirements in the setup (some things might need your Headmate's / Mind Buddy's help)
7. Run `node watch.js` (same jakebot folder)
8. Let the bot do its thing - if all is set up right, it should be online and ready in a minute.

## Troubleshooting

*This section is growing as we discover common issues. If you encounter a problem not listed here, please open an issue!*

**Common issues:**

- *Coming soon as users report them*

## What still needs work

JakeBot is functional, but far from finished. Things that need improvement:

~~* A proper command system~~
* Speed and reliability optimizations
~~* Easier setup and configuration~~
* Multi-account support (where the user doesn't have to run multiple JakeBots)

If you're interested in helping, you're very welcome.

## Contributing

Pull requests are welcome! Whether you're fixing bugs, adding features, or improving documentation, we appreciate your help.

**Guidelines:**
- Keep the personal, accessible tone of the project
- Test your changes in a Codespaces environment if possible
- Consider how changes might affect other plural systems using JakeBot
- Open an issue first if you're planning major changes

## FAQ

**Q: I'm plural and want to use this. Do I need to know how to code?**
A: Basic terminal familiarity helps, but `run.sh` and `setup.js` handle most of the heavy lifting. If you can follow the setup steps, you can get JakeBot running!

**Q: Will this work with more than one headmate?**
A: Currently, JakeBot is designed for one additional account. Multi-headmate support is being considered!

**Q: Is this against Padlet's Terms of Service?**
A: JakeBot automates login and posting to an account you legitimately own. We recommend reviewing Padlet's ToS yourself and using JakeBot responsibly.

**Q: Can I use this for non-plural purposes?**
A: JakeBot is specifically built for plural systems; whether you have headmates, alters, or other system members. We understand plurality comes in many forms, and this tool is for all of you. However, we don't recommend using JakeBot for purposes outside of plurality. While it's technically possible, it's not what this tool was created for, and we can't support uses that might be harmful or violate the spirit of why JakeBot exists.

**Q: Does this cost anything?**
A: No! JakeBot is free and open source. You just need a GitHub account for Codespaces (which has a free tier) and Padlet accounts.

**Q: The command system is confusing to us... can we suggest improvements there?**
A: The current command system reflects my personal style. If it doesn't quite fit your system, please share feedback or contribute improvements!

## Disclaimer

JakeBot is provided as-is for use by plural systems who need digital independence on Padlet. While we've built this with care, we cannot guarantee it will work perfectly in all situations or remain compatible as Padlet updates its platform.

**We are not responsible for any issues, damages, or account problems that may arise from using JakeBot, except where required by law.** Use at your own discretion, and always ensure you're following Padlet's Terms of Service.

---

# 🐨
### Final note: This is an ongoing experiment. I actively develop in Codespaces, and each push represents a snapshot anyone can use or build on.