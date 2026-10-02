// Pilote Chrome/Edge (DevTools ouverts sur Network) pour produire les captures du TP2.
// Lancé par lancer-captures.bat ; exécute les fichiers cmd/*.js déposés dans le dossier cmd.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cmdDir = path.join(here, 'cmd');
const shotDir = path.join(here, '..', 'docs', 'screenshots', 'tp2');
fs.mkdirSync(shotDir, { recursive: true });
const logFile = path.join(here, 'runner.log');
const log = (...a) => fs.appendFileSync(logFile, new Date().toISOString() + ' ' + a.map(String).join(' ') + '\n');

const candidates = [
  process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env['LOCALAPPDATA'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env['ProgramFiles(x86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env['ProgramFiles'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
];
const exe = candidates.find(p => p && fs.existsSync(p));
log('browser', exe);

const profile = path.join(os.tmpdir(), 'gpc-captures-profile');
fs.mkdirSync(path.join(profile, 'Default'), { recursive: true });
const prefsFile = path.join(profile, 'Default', 'Preferences');
let prefs = {};
try { prefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8')); } catch {}
prefs.devtools = prefs.devtools || {};
prefs.devtools.preferences = Object.assign(prefs.devtools.preferences || {}, {
  'panel-selected-tab': '"network"',
  'panel-selectedTab': '"network"',
  'currentDockState': '"bottom"',
  'network_log.preserve-log': 'true',
  'network-log.preserve-log': 'true',
});
fs.writeFileSync(prefsFile, JSON.stringify(prefs));

const shotPs = path.join(here, 'shot.ps1');
fs.writeFileSync(shotPs, `param([string]$out)
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[Dpi]::SetProcessDPIAware() | Out-Null
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
`);

const browser = await puppeteer.launch({
  executablePath: exe, headless: false, devtools: true, defaultViewport: null,
  userDataDir: profile, args: ['--start-maximized', '--no-first-run', '--no-default-browser-check'],
});
const [page] = await browser.pages();
log('launched');

async function devtools() {
  const t = await browser.waitForTarget(t => t.url().startsWith('devtools://'), { timeout: 10000 });
  return await t.asPage();
}
async function screenshot(name) {
  await page.bringToFront();
  await new Promise(r => setTimeout(r, 700));
  const out = path.join(shotDir, name + '.png');
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', shotPs, out]);
  return out;
}
async function pageShot(name) {
  const out = path.join(shotDir, name + '.png');
  await page.screenshot({ path: out });
  return out;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ctx = { browser, page, devtools, screenshot, pageShot, sleep, fs, path, here, log };
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

fs.writeFileSync(path.join(here, 'ready.txt'), 'ready ' + new Date().toISOString() + ' ' + exe);
for (;;) {
  const files = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js')).sort();
  for (const f of files) {
    const p = path.join(cmdDir, f);
    const code = fs.readFileSync(p, 'utf8');
    fs.renameSync(p, p + '.running');
    let result;
    try {
      const fn = new AsyncFunction('ctx', code);
      result = { ok: true, value: await fn(ctx) };
    } catch (e) {
      result = { ok: false, error: String(e && e.stack || e) };
    }
    fs.writeFileSync(p.replace(/\.js$/, '.out.json'), JSON.stringify(result, null, 2));
    fs.renameSync(p + '.running', p + '.done');
    if (code.includes('//QUIT')) { await browser.close(); process.exit(0); }
  }
  await sleep(500);
}
