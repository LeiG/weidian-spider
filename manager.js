const mongoose = require('mongoose');
const path = require('path');
const program = require('commander');

const utils = require('./utils');
const Item = require('./models/item');
const Weidian = require('./models/weidian');

const imageBasePath = path.join(__dirname, 'images');

// command line arguments
program
  // default to false
  .option('-d, --no-dryRun', 'Whether to dry run')
  .parse(process.argv);

async function updateItemInDb(item) {
  // if this item exists, update the entry, don't insert
  let conditions = {
    itemId: item.itemId
  };

  let options = {
    new: true,
    overwrite: true
  };

  await Item.findOneAndUpdate(conditions, item, options, (err, result) => {
    if (err) {
      throw err;
    }
  });
}

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
      imagesPath.push(imagePath);
    })
  );

  item.imagesPath = imagesPath;

  return item;
};

function updateRetailPrice(item) {
  // item.retailPriceInCents = Math.ceil(item.invoicePriceInCents * 1.1);

  item.retailPriceInCents = 42;

  return item;
};

async function fetchItemsCursor() {
  return Item.find({"dateListed" : { "$exists" : false }}).cursor().eachAsync(async (item) => await updateItem(item));
};

async function run() {
  if (mongoose.connection.readyState == 0) {
    mongoose.connect(Weidian.dbUrl, { useNewUrlParser: true });
  }

  let items = await fetchItemsCursor();

  // items = await updateItems(items);

  for(let item of items) {
    console.log(item);
    await updateItemInDb(item);
  }

  if(!program.dryRun) {
    console.log(program.dryRun);
  }

  process.exit();
};

run().catch(error => console.error(error.stack));
