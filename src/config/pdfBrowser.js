const puppeteer = require("puppeteer-core");
const config = require("./config");

// Chrome for PDF rendering, launched the same way for every document (page size and margins are
// set per document). Puppeteer must not act on SIGINT/SIGTERM itself (on SIGINT it exits the
// process at once): index.js and worker.js stop gracefully and then close it with closePdfBrowser.
const launchPdfBrowser = () =>
  puppeteer.launch({
    headless: true,
    executablePath: config.PUPPETEER_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    handleSIGINT: false,
    handleSIGTERM: false,
  });

// One Chrome serves every PDF: started on first use, started again if it closes or crashes, and
// closed once no PDF has been rendered for a while, so it doesn't hold memory between batches
const IDLE_CLOSE_MS = 30000;

let browserPromise = null;
let rendering = 0;
let idleTimer = null;

const forget = (launch) => {
  if (browserPromise === launch) browserPromise = null;
};

const sharedBrowser = async () => {
  const current = browserPromise;
  if (current) {
    const browser = await current;
    if (browser.connected) return browser;
    forget(current);
    if (browserPromise) return browserPromise; // another render already started a new one
  }
  const launch = launchPdfBrowser();
  browserPromise = launch;
  launch.then(
    (browser) => browser.on("disconnected", () => forget(launch)),
    () => forget(launch),
  );
  return launch;
};

const closePdfBrowser = async () => {
  clearTimeout(idleTimer);
  const launch = browserPromise;
  browserPromise = null;
  if (launch) await launch.then((browser) => browser.close()).catch(() => {});
};

// Runs in the page: resolves once every <img> has loaded or failed
const allImagesSettled = async () => {
  const images = Array.from(document.images);
  await Promise.all(
    images.map((img) => {
      if (img.complete) return;
      return new Promise((resolve) => {
        img.addEventListener("load", resolve);
        img.addEventListener("error", resolve);
      });
    }),
  );
};

// Renders an HTML document to PDF in a new tab of the shared Chrome; the tab is closed whatever
// happens. waitUntil goes to setContent; fonts and images wait for web fonts and every <img>
// before printing; pdf holds page.pdf's options (with a path it also writes the file).
// Resolves with the PDF bytes.
const renderPdf = async (html, { waitUntil, fonts = false, images = false, pdf }) => {
  clearTimeout(idleTimer);
  rendering += 1;
  try {
    const browser = await sharedBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, waitUntil ? { waitUntil } : undefined);
      if (fonts) await page.evaluateHandle("document.fonts.ready");
      if (images) await page.evaluate(allImagesSettled);
      return await page.pdf(pdf);
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    rendering -= 1;
    if (rendering === 0) idleTimer = setTimeout(closePdfBrowser, IDLE_CLOSE_MS).unref();
  }
};

module.exports = { launchPdfBrowser, renderPdf, closePdfBrowser, IDLE_CLOSE_MS };
