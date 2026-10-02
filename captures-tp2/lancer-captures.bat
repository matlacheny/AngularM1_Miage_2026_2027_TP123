@echo off
cd /d "%~dp0"
if not exist node_modules\puppeteer-core (
  call npm init -y > npm.log 2>&1
  call npm install puppeteer-core >> npm.log 2>&1
)
node runner.mjs > runner.out.txt 2>&1
