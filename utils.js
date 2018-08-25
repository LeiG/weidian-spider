const fs = require('fs');
const request = require('request-promise-native');

module.exports.downloadImage = async function(url, path) {
  const options = {
    uri: url,
    method: 'GET',
    encoding: 'binary'
  };

  await request(options)
    .then(function(body, data) {
      let writeStream = fs.createWriteStream(path);

      writeStream.write(body, 'binary');
      writeStream.on('finish', () => {});
      writeStream.end();
    });
};

module.exports.calcRetailPriceInCents = function(invoicePriceInCents) {
  let retailPriceInCents = Math.ceil(1.05 * invoicePriceInCents);

  if(invoicePriceInCents % 1000 < 500) {
    retailPriceInCents = Math.floor(retailPriceInCents / 1000) * 1000 + 499;
  } else {
    retailPriceInCents = Math.floor(retailPriceInCents / 1000) * 1000 + 999;
  }

  return retailPriceInCents;
};
