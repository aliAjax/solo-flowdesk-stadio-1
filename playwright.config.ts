import {defineConfig,devices} from '@playwright/test';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/* 沙箱环境无法安装系统依赖时，使用项目内 .browser-libs 中的本地运行库 */
const localLibRoot=fileURLToPath(new URL('.browser-libs',import.meta.url));
if(existsSync(localLibRoot)){
  process.env.LD_LIBRARY_PATH=[`${localLibRoot}/usr/lib/aarch64-linux-gnu`,`${localLibRoot}/lib/aarch64-linux-gnu`,process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS||'1';
}

export default defineConfig({testDir:'./tests',fullyParallel:false,timeout:30_000,expect:{timeout:5000},use:{baseURL:'http://127.0.0.1:4173',trace:'on-first-retry',screenshot:'only-on-failure',viewport:{width:1440,height:1000}},webServer:{command:'npm run dev -- --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:true},projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}]});
