@echo off
cd /d "%~dp0"
set "PATH=%~dp0.tools\node-v24.22.1-win-x64;%PATH%"
echo 丰冠记账：http://localhost:3000
echo 若还没改过密码，账号 admin，密码 123456
node server\index.js
