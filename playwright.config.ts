import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// Optional project-local browser runtime for minimal Linux hosts.
const local = (path:string) => fileURLToPath(new URL(path,import.meta.url));
if(existsSync(local('./.cache/ms-playwright'))) process.env.PLAYWRIGHT_BROWSERS_PATH=local('./.cache/ms-playwright');
if(existsSync(local('./.cache/browser-libs'))) process.env.LD_LIBRARY_PATH=[local('./.cache/browser-libs/usr/lib/x86_64-linux-gnu'),local('./.cache/browser-libs/lib/x86_64-linux-gnu'),process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
if(existsSync(local('./.cache/fonts.conf'))) process.env.FONTCONFIG_FILE=local('./.cache/fonts.conf');
export default defineConfig({
 testDir:'tests/e2e',
 use:{baseURL:'http://127.0.0.1:4322',viewport:{width:1440,height:1000}},
 webServer:{command:'npm run dev -- --port 4322',url:'http://127.0.0.1:4322',reuseExistingServer:!process.env.CI},
 reporter:'list',
});
