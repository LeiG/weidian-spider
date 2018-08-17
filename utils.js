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
    })
};


