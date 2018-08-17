const fs = require('fs');
const request = require('request-promise-native');

module.exports.downloadImage = async function(url, path, callback) {
  await request.head(url, function(err, res, body) {
    request(url)
      .pipe(fs.createWriteStream(path))
      .on('close', callback);
  });
};


