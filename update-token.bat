@echo off
mkdir D:\Temp 2>nul

set "TOKEN=EAARZAoQUJZBXEBSDYwf8F90wC1ZBWLZBPL2eV2Jq0jaNtpHr04u7QxWgiQQLO7dZClc9ZBU9EtvPrgkWbP1jNfKJLLkjaNmupHYRmIvmdQ7Nm6dsm2Eo5PZCzXw5GEBcTqDJ0xtKICEWTM1hd4V2pDuZCIMUZAFs3fMVd94gImWbqs91PiTad4xWPTZBOfPIYmpWD86GbisR9BPYwzQHHpIsFA89tQnUYq4x7ePdND"

cd /d c:\Users\Zitga\Desktop\xxx\creative-testing-dashboard

echo Removing old env var...
call npx -y vercel env rm META_ACCESS_TOKEN production --yes 2>nul

echo Adding new env var...
echo %TOKEN%| npx -y vercel env add META_ACCESS_TOKEN production --yes

echo Redeploying...
call npx -y vercel --prod --yes

echo Done!
pause
