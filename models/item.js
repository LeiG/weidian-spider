const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  itemId: {
    type: String,
    unique: true,
    required: true
  },
  retailItemId: String,
  invoicePriceInCents: {
    type: Number,
    required: p => p > 0
  },
  retailPriceInCents: {
    type: Number
  },
  title: {
    type: String,
    required: true,
    lowercase: true
  },
  details: {
    type: String,
    lowercase: true
  },
  imagesUrl: {
    type: [String],
    required: arr => arr.length > 0
  },
  imagesPath: {
    type: [String]
  },
  dateCrawled: {
    type: Date,
    index: true,
    default: Date.now
  },
  dateListed: Date
});

let Item = mongoose.model('Item', itemSchema);

module.exports = Item;
