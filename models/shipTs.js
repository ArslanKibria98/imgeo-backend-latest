// models/Shipment.js
const mongoose = require("mongoose");

// A simple schema to store each row from the Excel file
const ShipTsSchema = new mongoose.Schema({
  carrier:    { type: String, required: true }, // Maps to "Carrier" column
  tracking:   { type: String, required: true }, // Maps to "tracking" column
  labelType:  { type: String, required: true }, // Maps to "labelType" column
}, { timestamps: true });

module.exports = mongoose.model("ShipTs", ShipTsSchema);
