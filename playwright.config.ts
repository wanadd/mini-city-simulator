import {defineConfig,devices} from '@playwright/test'
const external = process.env.CITY_URL
const local = 'http://127.0.0.1:4173'
export default defineConfig({
  testDir:'./tests',
  testMatch:'**/*.e2e.ts',
  timeout:45_000,
  workers:1,
  use:{baseURL:external||local,trace:'retain-on-failure',channel:process.env.CITY_BROWSER_CHANNEL},
  webServer:external?undefined:{command:'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',url:local,reuseExistingServer:true},
  projects:[
    {name:'Desktop Chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
    {name:'Mobile Chromium',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}},
  ],
})
