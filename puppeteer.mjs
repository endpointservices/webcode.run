import { createProxyMiddleware } from 'http-proxy-middleware';
import {default as puppeteer} from 'puppeteer';
const localmode = process.env.LOCAL || false;

let uid = 0;
export const puppeteerProxy = createProxyMiddleware('/', {
    ws: true,
    router: async function(req) {

        let browser = null;
        req.on('close', async function (err) {
            if (browser && !localmode) {
                await browser.close(); browser = undefined;    
            }
        });
    
        browser = await puppeteer.launch({ 
            ...(process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD && {executablePath: 'google-chrome-stable'}),
            devtools: localmode,
            args: [
                `--proxy-server=127.0.0.1:8888`,
                `--disk-cache-dir=/tmp/${uid}`,
                `--media-cache-dir=/tmp/${uid++}`,
                `--media-cache-size=0`,
                `--disk-cache-size=0`,
                '--no-sandbox', // Not necissary if running with --cap-add=SYS_ADMIN
                '--no-zygote',
                '--disable-gpu',
                '--mute-audio',
                '--disable-dev-shm-usage',
                '--disable-web-security', // Turn off CORS
                `--user-agent=observablehq.com/@endpointservices/puppeteer` 
            ]
        });
        console.log("redirecting to " + browser.wsEndpoint())
        return browser.wsEndpoint();
    }
});