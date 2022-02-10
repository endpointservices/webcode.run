import {default as puppeteer} from 'puppeteer';
import * as useragent from './useragent.mjs';
import * as observable from './observable.mjs';
import * as os from 'os';
import {promiseRecursive} from './utils.mjs';
const localmode = process.env.LOCAL || false;

const browsers = {}; // Cache of browser entries

const CLEANUP_CHECK_PERIOD_HOURS = 2;
const BROWSER_IDLE_CLEANUP_HOURS = 4;

// Closes browsers that have not been used in a while
export async function cleanup ({all = false} = {}) {
    Object.keys(browsers).forEach(async shard => {
        const entry = browsers[shard];
        if (all || Date.now() - entry.lastUsed > 1000 * 60 * 60 * BROWSER_IDLE_CLEANUP_HOURS) {
            console.log(`Cleanup browser for ${shard}`);
            delete browsers[shard];
            try {
                const browser = await entry.browser;
                browser.close();
            } catch (err) {
                console.error(err.message);
            }
        }
    })
}

export function scheduleCleanup() {
    console.log("scheduled cleanup...")
    try {
        cleanup();
    } catch (err) {
        console.log(err);
    }
    setTimeout(scheduleCleanup, CLEANUP_CHECK_PERIOD_HOURS * 60 * 60 * 1000);
}

export async function newPage(shard, args = [], pageURL) {
    if (browsers[shard] === undefined) {
        console.log(`Launching new browser on shard ${shard}`);
        browsers[shard] = {
            lastUsed: Date.now(),
            pages: {},
            browser: puppeteer.launch({ 
                ...(process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD && {executablePath: 'google-chrome-stable'}),
                devtools: localmode,
                args: [
                    ...args,
                    `--disk-cache-dir=/tmp/${shard}`,
                    `--media-cache-dir=/tmp/${shard}`,
                    `--media-cache-size=1000000`, // 1MB
                    `--disk-cache-size=1000000`,
                    '--no-sandbox', // Not necissary if running with --cap-add=SYS_ADMIN
                    '--no-zygote',
                    '--disable-gpu',
                    '--mute-audio',
                    '--disable-dev-shm-usage',
                    '--disable-web-security', // Turn off CORS
                    '--allow-running-insecure-content', // Allow access to http sites too (BUG: does not work in headless mode https://github.com/puppeteer/puppeteer/issues/3741)
                    localmode ? '--disable-features=site-per-process': '', // Helps keep iframe detection working https://github.com/puppeteer/puppeteer/issues/5123#issuecomment-559158303 when using devtools
                    `--user-agent=${useragent.base}` // We set it on a per page but incase we forget we set it here too
                ]
            })
        };
    }

    const browserEntry = browsers[shard];
    browserEntry.lastUsed = Date.now();

    if (pageURL && browserEntry.pages[pageURL]) {
        console.log("Reusing page", pageURL)
        const pageEntry = browserEntry.pages[pageURL];
        pageEntry.lastUsed = Date.now();
        return pageEntry.pagePromise;
    } else {
        const pagePromise = new Promise(async (resolve) => {
            console.log("Opening page for", pageURL);
            const browser = await browserEntry.browser;
            const page = await browser.newPage();
            page.requests = {};
            await page.setRequestInterception(true)
            
            page.on('request', interceptedRequest => {
                const hostname = new URL(interceptedRequest.url()).hostname;
                if (hostname.endsWith(".internal") || // Prevent access to e.g. Metadata server
                    hostname === "127.0.0.1" ||
                    hostname === "0.0.0.0") {
                    interceptedRequest.abort()
                } else {
                    // Note we can't mutate fetch requests until https://github.com/puppeteer/puppeteer/issues/2781
                    interceptedRequest.continue()
                }
            });
            resolve(page);  
        });
        if (pageURL) {
            browserEntry.pages[pageURL] = {
                lastUsed: Date.now(),
                pagePromise: pagePromise
            };
        }
        return pagePromise;
    }
}

export async function shutdown () {
    Object.keys(browsers).forEach(async shard => {
        await (await browsers[shard]).close()
    });
}

const closePageWhenUnused = (page, attempts = 5) => {
    if (attempts == 0 || Object.keys(page.requests).length === 0) {
        page.close();
    } else {
        console.log("Waiting for page to be unused");
        setTimeout(closePageWhenUnused.bind(null, page, attempts - 1), 5000);
    }    
};

export const invalidate = async (namespace, endpointURL) => {
    const entry = browsers[namespace];
    if (!entry) return;
    Object.values(entry.pages).forEach(async (pageEntry) => {
        const page = await pageEntry.pagePromise;
        const pageURL = page.url()
        if (observable.canHost(pageURL, endpointURL) && !page.isClosed()) {
            console.log("Invalidating page", pageURL, "due to", endpointURL);
            delete entry.pages[pageURL];
            closePageWhenUnused(page);
        }
    }) 
}

export const invalidatePage = async (namespace, pageURL) => {
    const entry = browsers[namespace];
    if (!entry) return;
    Object.values(entry.pages).forEach(async (pageEntry) => {
        const page = await pageEntry.pagePromise;
        if (page.url() === pageURL && !page.isClosed()) {
            console.log("Invalidating page", page.url());
            delete entry.pages[pageURL]
            closePageWhenUnused(page);
        }
    }) 
}

export const stats = async () => ({
        // cpus: os.cpus(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        browsers: {
            ...Object.fromEntries(await promiseRecursive(Object.keys(browsers).map(async (namespace) => {
                const entry = browsers[namespace];
                const browser = await entry.browser;
                try {
                    const pages = await browser.pages();
                    return [namespace, {
                        pages: await promiseRecursive((pages).map(async (page) => ({
                            title: await page.title(),
                            url: page.url(),
                            metrics: await page.metrics(),
                        })))
                    }];
                } catch (err) {
                    console.error(err);
                    console.log("Error duing stats, so purging", namespace);
                    delete browsers[namespace];
                    browser.close();
                }
            })))
        }
    });

export const statsHandler = async (req, res) => {
    try {
        res.json(await stats());
    } catch (err) {
        // Try to recover by killing all browsers and starting again.
        console.error(err.message);
        await cleanup({all: true});
        res.status(500).send(err.message);
    }
}
    
