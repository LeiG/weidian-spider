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
    type: Number,
    required: p => p > this.invoicePriceInCents
  },
  itemTitle: {
    type: String,
    required: true,
    lowercase: true
  },
  itemDetails: {
    type: String,
    lowercase: true
  },
  imagesPath: {
    type: [String],
    required: arr => arr.length > 0
  },
  dateCrawled: {
    type: Date,
    index: true
  },
  dateListed: Date
});

let Item = mongoose.model('Item', itemSchema);

module.exports = Item;
