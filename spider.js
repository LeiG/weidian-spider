const mongoose = require('mongoose');
const path = require('path');
const program = require('commander');
const puppeteer = require('puppeteer');

const utils = require('./utils');
const Item = require('./models/item');
const Weidian = require('./models/weidian');

const imageBasePath = path.join(__dirname, 'images');

// command line arguments
program
  .option('-s, --shopId [value]', 'Shop id to be scraped')
  .option('-i, --items [n]', 'Number of items to scrape', parseInt)
  .parse(process.argv);

const extractItem = () => {

  const itemId = document.getElementsByClassName('report-entrance')[0].href.match(/itemID=(.*)/)[1];

  const invoicePriceInCents = parseFloat(document.querySelector('div.price-wrap > span').innerText) * 100;

  const itemTitle = document.querySelector('div.title-wrap > span').innerText.trim();

  const itemDetails = document.querySelector('#dContainer > div.d-content > p').innerText;

  const itemImagesUrl = Array.from(document.getElementsByClassName('item-img'))
    .map(img => img.src)
    .filter(i => i != undefined);

  const item = {
    itemId: itemId,
    invoicePriceInCents: invoicePriceInCents,
    itemTitle: itemTitle,
    itemDetails: itemDetails,
    itemImagesUrl: itemImagesUrl
  };

  return item;
};

const iterateItemPages = async (page, url) => {
  await page.goto(url);
  await page.waitFor(5000);

  return await page.evaluate(extractItem);
};

const extractItems = async () => {
  const extractedElements = document.querySelectorAll('li.list-item.normal-cart.tabbar-item');

  const itemsUrl = [];
  for (let element of extractedElements) {
    itemsUrl.push(element.childNodes.item(1).href);
  }

  return itemsUrl;
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

const upsertItem = (item) => {
  const DB_URL = 'mongodb://localhost:27017/weidiandb';

  if (mongoose.connection.readyState == 0) {
    mongoose.connect(DB_URL, { useNewUrlParser: true });
  }

  // if this item exists, update the entry, don't insert
	let conditions = {
    itemId: item.itemId
  };
	let options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true
  };

  console.log('upserting to mongodb!');

  Item.findOneAndUpdate(conditions, item, options, (err, result) => {
  	if (err) {
      throw err;
    }
  });
};

const run = async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.setViewport({ width: 1280, height: 926 });

  await page.goto(Weidian.shopUrl + program.shopId);
  await page.waitFor(1000);

  await page.click('#tabbarItems > span:nth-child(4)');
  await page.waitFor(5000);

  const itemsUrl = await scrapeInfiniteScrollItems(page, extractItems, program.items);

  const items = [];

  for(let url of itemsUrl) {
    items.push(await iterateItemPages(page, url));
  }

  browser.close();

  console.log(items);

  items.map((item) => upsertItem(item));
};

run();
