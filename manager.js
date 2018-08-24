const mongoose = require('mongoose');
const path = require('path');
const program = require('commander');
const puppeteer = require('puppeteer');

const utils = require('./utils');
const Creds = require('./models/creds');
const Item = require('./models/item');
const Weidian = require('./models/weidian');

const imageBasePath = path.join(__dirname, 'images');

// command line arguments
program
  // default to false
  .option('-d, --no-dryRun', 'Whether to dry run')
  .parse(process.argv);

async function uploadImages(page, imagesPath) {
  await page.waitFor(1000);

  const input = await page.$('input[name="uploadImg[]"]');

  await input.uploadFile(...imagesPath);
  await page.waitFor(1000);
};

async function uploadTitle(page, title) {
  await page.waitFor(1000);
  await page.click('#i_des');
  await page.keyboard.type(title);
  await page.waitFor(1000);
};

async function uploadRetailPrice(page, retailPrice) {
  await page.waitFor(1000);
  await page.click('#i_no_sku_price_wrap > input');
  await page.keyboard.type((retailPrice / 100).toString());
  await page.waitFor(1000);
};

async function uploadStock(page, inStock = 99) {
  await page.waitFor(1000);
  await page.click('#i_do_wrap > div:nth-child(9) > input');
  await page.keyboard.type(inStock.toString());
  await page.waitFor(1000);
};

async function checkRequireIdBox(page) {
  await page.waitFor(1000);
  await page.click('#i_do_wrap > div:nth-child(23) > label:nth-child(4) > div');
  await page.waitFor(1000);
};

async function uploadItem(page, item) {
  await uploadImages(page, item.imagesPath);
  await uploadTitle(page, item.title);
  await uploadRetailPrice(page, item.retailPriceInCents);
  await uploadStock(page);
  await checkRequireIdBox(page);
  await page.waitFor(1000);
};

async function login(page) {
  const phoneNumberSelector = '.tele';
  const passwordSelector = '.login_pass';
  const loginSelector = '.next-step';

  await page.goto(Weidian.loginUrl);
  await page.waitFor(1000);

  await page.select('.country-list', 'number:1');

  await page.click(phoneNumberSelector);
  await page.keyboard.type(Creds.phoneNumber);

  await page.click(passwordSelector);
  await page.keyboard.type(Creds.password);

  await page.click(loginSelector);
  await page.waitFor(5000);
};

async function uploadItems(items) {
  const browser = await puppeteer.launch({headless: false});
  const page = await browser.newPage();

  page.setViewport({ width: 1280, height: 926 });

  await login(page);

  // click on item management button
  await page.click('#menu > div > div:nth-child(3) > div.children > a:nth-child(1)');
  await page.waitFor(1000);

  for(let item of items) {
    const newPagePromise = new Promise(x => browser.once('targetcreated', target => x(target.page())));

    await page.click('#right-content > div > div.cpc-items-main-opt > a.add');

    const newPage = await newPagePromise;

    await uploadItem(newPage, item);

    newPage.close();

    await page.waitFor(1000);
  }
};

async function updateItemInDb(item) {
  // if this item exists, update the entry, don't insert
  const conditions = {
    itemId: item.itemId
  };

  const options = {
    new: true,
    overwrite: true
  };

  await Item.findOneAndUpdate(conditions, item, options, (err, result) => {
    if (err) {
      throw err;
    }
  });
};

async function updateItem(item) {
  let tmp = updateRetailPrice(item);

  tmp = await downloadAndUpdateImagesPath(tmp);

  return tmp;
};

async function downloadAndUpdateImagesPath(item) {
  const imagesPath = [];

  let counter = 0;
  await Promise.all(
    item.imagesUrl
    .map(async (imageUrl) => {
      counter++;
      let filename = `item_${item.itemId}_${counter}.jpeg`;
      let imagePath = path.join(imageBasePath, filename);

      await utils.downloadImage(imageUrl, imagePath);

      const relativePath = path.relative(process.cwd(), imagePath);
      imagesPath.push(relativePath);
    })
  );

  item.imagesPath = imagesPath;

  return item;
};

function updateRetailPrice(item) {
  item.retailPriceInCents = Math.ceil(item.invoicePriceInCents * 1.1);

  return item;
};

async function updateItems() {
  const items = [];

  await Item
    .find({"dateListed" : { "$exists" : false }})
    .cursor()
    .eachAsync(async (item) => {
      items.push(await updateItem(item));
    });

  return items;
};

async function run() {
  if (mongoose.connection.readyState == 0) {
    mongoose.connect(Weidian.dbUrl, { useNewUrlParser: true });
  }

  const items = await updateItems();

  // dryRun will not upload items to weidian
  if(!program.dryRun) {
    await uploadItems(items);
  }

  for(let item of items) {
    await updateItemInDb(item);
  }

  process.exit();
};

run().catch(error => console.error(error.stack));
