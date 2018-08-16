const fs = require('fs');
const request = require('request');

const downloadImage = (url, path, callback) => {
  request.head(uri, function(err, res, body) {
    request(uri)
      .pipe(fs.createWriteStream(path))
      .on('close', callback);
  });
};
