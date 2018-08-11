const program = require('commander');
const puppeteer = require('puppeteer');

const shop = require('./models/shop');

// command line arguments
program
  .option('-s, --shopId [value]', 'Shop id to be scraped')
  .option('-i, --items [n]', 'Number of items to scrape', parseInt)
  .parse(process.argv);

const extractItems = () => {
  const extractedElements = document.querySelectorAll('li.list-item.normal-cart.tabbar-item');

  const items = [];
  for (let element of extractedElements) {
    items.push(element.innerText);
  }

  return items;
};

const scrapeInfiniteScrollItems = async (page, extractItems, itemTargetCount, scrollDelay = 5000) => {
  let items = [];

  try {
    let previousHeight;
    while (items.length < itemTargetCount) {
      items = await page.evaluate(extractItems);

      // scroll down
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForFunction(`document.body.scrollHeight > ${previousHeight}`);

      // sleep between scrolling
      await page.waitFor(scrollDelay + Math.floor((Math.random() - 1) * 2000));
    }
  } catch(e) {
    console.log("error:" + e);
  }

  return items;
};

const run = async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.setViewport({ width: 1280, height: 926 });

  await page.goto(shop.url + program.shopId);
  await page.waitFor(1000);

  await page.click('#tabbarItems > span:nth-child(4)');
  await page.waitFor(1000);

  const items = await scrapeInfiniteScrollItems(page, extractItems, program.items);

  console.log(items);

  browser.close();
};

run();
