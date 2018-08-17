const mongoose = require('mongoose');
const program = require('commander');
const puppeteer = require('puppeteer');

const Item = require('./models/item');
const Weidian = require('./models/weidian');

// command line arguments
program
  .option('-s, --shopId [value]', 'Shop id to be scraped')
  .option('-i, --items [n]', 'Number of items to scrape', parseInt)
  .parse(process.argv);

function extractItem() {

  const itemId = document.getElementsByClassName('report-entrance')[0].href.match(/itemID=(.*)/)[1];

  const invoicePriceInCents = parseFloat(document.querySelector('div.price-wrap > span').innerText) * 100;

  const title = document.querySelector('div.title-wrap > span').innerText.trim();

  const details = document.querySelector('#dContainer > div.d-content > p').innerText;

  const imagesUrl = Array.from(document.getElementsByClassName('item-img'))
    .map(img => img.src)
    .filter(i => i != undefined && i.startsWith("https"));

  const item = {
    itemId: itemId,
    invoicePriceInCents: invoicePriceInCents,
    title: title,
    details: details,
    imagesUrl: imagesUrl
  };

  return item;
};

async function iterateItemPage(page, url) {
  await page.goto(url);
  await page.waitFor(5000);

  return await page.evaluate(extractItem);
};

async function extractItems() {
  const extractedElements = document.querySelectorAll('li.list-item.normal-cart.tabbar-item');

  const itemsUrl = [];
  for (let element of extractedElements) {
    itemsUrl.push(element.childNodes.item(1).href);
  }

  return itemsUrl;
};

async function scrapeInfiniteScrollItems(page, extractItems, itemTargetCount, scrollDelay = 5000) {
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

async function upsertItem(item) {
  // if this item exists, update the entry, don't insert
  let conditions = {
    itemId: item.itemId
  };
  let options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true
  };

  await Item.findOneAndUpdate(conditions, item, options, (err, result) => {
    if (err) {
      throw err;
    }
  });
};

async function run() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.setViewport({ width: 1280, height: 926 });

  await page.goto(Weidian.shopUrl + program.shopId);
  await page.waitFor(1000);

  await page.click('#tabbarItems > span:nth-child(4)');
  await page.waitFor(5000);

  const itemsUrl = await scrapeInfiniteScrollItems(page, extractItems, program.items);

  console.log(`Scrapped ${itemsUrl.length} item URLs.`);

  if (mongoose.connection.readyState == 0) {
    mongoose.connect(Weidian.dbUrl, { useNewUrlParser: true });
  }

  const items = [];
  for(let url of itemsUrl) {
    let item = await iterateItemPage(page, url);
    await upsertItem(item);

    items.push(item);

    if(items.length % 100 == 0) {
      console.log(`Scrapping/upserting ${items.length} items.`);
    }
  }

  browser.close();

  process.exit();
};

run();
