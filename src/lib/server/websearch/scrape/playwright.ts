import {
   chromium,
   devices,
   type Page,
   type BrowserContextOptions,
   type Response,
   type Browser,
} from 'playwright';

import { PlaywrightBlocker } from '@cliqz/adblocker-playwright';
import { env } from '@env';
import { onExit } from '@lib/server/exitHandler';
import { logger } from '@logger';

const blocker =
   env.PLAYWRIGHT_ADBLOCKER === 'true'
      ? await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)
           .then((blker) => {
              const mostBlocked = blker
                 .blockFonts()
                 .blockMedias()
                 .blockFrames()
                 .blockImages();
              if (env.WEBSEARCH_JAVASCRIPT === 'false') {
                 return mostBlocked.blockScripts();
              }
              return mostBlocked;
           })
           .catch((err) => {
              logger.error(
                 err,
                 'Failed to initialize PlaywrightBlocker from prebuilt lists'
              );
              return PlaywrightBlocker.empty();
           })
      : PlaywrightBlocker.empty();

let browserSingleton: Promise<Browser> | undefined;
async function getBrowser() {
   const browser = await chromium.launch({ headless: true });
   onExit(() => browser.close());
   browser.on('disconnected', () => {
      logger.warn('Browser closed');
      browserSingleton = undefined;
   });
   return browser;
}

async function getPlaywrightCtx() {
   if (!browserSingleton) {
      browserSingleton = getBrowser();
   }
   const browser = await browserSingleton;

   const device = devices['Desktop Chrome'];
   const options: BrowserContextOptions = {
      ...device,
      // Increasing width improves spatial clustering accuracy
      screen: {
         width: 3840,
         height: 1080,
      },
      viewport: {
         width: 3840,
         height: 1080,
      },
      reducedMotion: 'reduce',
      acceptDownloads: false,
      timezoneId: 'America/New_York',
      locale: 'en-US',
      userAgent:
         'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
   };
   return browser.newContext(options);
}

export async function withPage<T>(
   url: string,
   callback: (page: Page, response?: Response) => Promise<T>
): Promise<T> {
   const ctx = await getPlaywrightCtx();

   try {
      const page = await ctx.newPage();
      env.PLAYWRIGHT_ADBLOCKER === 'true' &&
         (await blocker.enableBlockingInPage(page));

      const res = await page.goto(url, {
         waitUntil: 'load',
         timeout: parseInt(env.WEBSEARCH_TIMEOUT),
      });
      // await needed here so that we don't close the context before the callback is done
      return await callback(page, res ?? undefined);
   } finally {
      ctx.close();
   }
}
