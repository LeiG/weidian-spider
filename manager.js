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
  .option('-o, --overwrite', 'Whether overwrite items uploaded before')
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
  await page.keyboard.type(`[${Creds.shopName}] ${title}`);
  await page.waitFor(1000);
};

async function selectCategory(page) {
  await page.waitFor(5000);
  await page.click('#i_do_wrap > div:nth-child(4) > div > div > div.use-select-option-default.ng-binding.ng-scope');
  await page.waitFor(1000);
  await page.click('#i_do_wrap > div:nth-child(4) > div > div > div.all-option > div:nth-child(1)');
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

async function generateDetails(page, details, images) {
  // upload details
  await page.waitFor(1000);
  await page.click('div.editor-list > div.addModulesbtn');
  await page.waitFor(1000);
  await page.click('#select-modules-bars > ul > li:nth-child(1) > div');
  await page.waitFor(1000);
  await page.click('#textareaNumber0');
  await page.keyboard.type(details);
  await page.waitFor(1000);

  let input;
  // upload images
  await page.click('div.editor-list > div.addModulesbtn');
  await page.waitFor(1000);

  input = await page.$('input[id="upImage"]');
  await input.uploadFile(...images);
  await page.waitFor(5000);

  // upload barcode
  await page.click('div.editor-list > div.addModulesbtn');
  await page.waitFor(1000);

  input = await page.$('input[id="upImage"]');
  await input.uploadFile(...['images/logo/barcode.jpg']);
  await page.waitFor(1000);
};

async function listItem(page) {
  await page.waitFor(1000);
  await page.click('#i_do_wrap > button.submit.wdng-btn-major.ng-isolate-scope');
  await page.waitFor(1000);
};

async function uploadItem(page, item) {
  await uploadImages(page, item.imagesPath);
  await uploadTitle(page, item.title);
  await selectCategory(page);
  await uploadRetailPrice(page, item.retailPriceInCents);
  await uploadStock(page);
  await checkRequireIdBox(page);
  await generateDetails(page, item.details, item.imagesPath);

  await page.waitFor(5000);
  await listItem(page);
  await page.waitFor(5000);
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
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.setViewport({ width: 1280, height: 926 });

  await login(page);

  // click on item management button
  await page.click('#menu > div > div:nth-child(3) > div.children > a:nth-child(1)');
  await page.waitFor(1000);

  let counter = 0;
  for(let item of items) {
    // filter out items less than $10
    if(item.invoicePriceInCents < 1000) {
      continue;
    }

    const newPagePromise = new Promise(x => browser.once('targetcreated', target => x(target.page())));

    await page.click('#right-content > div > div.cpc-items-main-opt > a.add');

    const newPage = await newPagePromise;

    counter++;
    if(counter % 10 == 0) {
      console.log(`Uploading ${counter} items so far...`);
    }

    try {
      await uploadItem(newPage, item);

      newPage.close();

      item.dateListed = Date.now();

      await page.waitFor(1000);

      await updateItemInDb(item);
    } catch (e) {
      console.error(e.stack);
    }
  }

  return items;
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

  Item.findOneAndUpdate(conditions, item, options, (err, result) => {
    if (err) {
      throw err;
    }
  });
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
  item.retailPriceInCents = utils.calcRetailPriceInCents(item.invoicePriceInCents);
  return item;
};

async function updateItem(item) {
  let tmp = updateRetailPrice(item);

  tmp = await downloadAndUpdateImagesPath(tmp);

  return tmp;
};

async function updateItems() {
  const items = [];

  let cursor;
  if(program.overwrite) {
    cursor = Item.find().sort({itemId: 1}).cursor();
  } else {
    cursor = Item.find({"dateListed" : { "$exists" : false }}).sort({itemId: 1}).cursor();
  }

  await cursor.eachAsync(async (item) => {
    items.push(await updateItem(item));
  });

  return items;
};

async function run() {
  if (mongoose.connection.readyState == 0) {
    mongoose.connect(Weidian.dbUrl, { useNewUrlParser: true });
  }

  let items = await updateItems();

  // dryRun will not upload items to weidian
  if(!program.dryRun) {
    items = await uploadItems(items);
  }

  process.exit();
};

run().catch(error => console.error(error.stack));
