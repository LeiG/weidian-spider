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

  for(let item of items) {
    await updateItemInDb(item);
  }

  if(!program.dryRun) {
    console.log(program.dryRun);
  }

  process.exit();
};

run().catch(error => console.error(error.stack));
