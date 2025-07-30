const mongoose = require("mongoose");
// const SubUserSchema = new mongoose.Schema({
//   name: { type: String, required: true },
//   email: { type: String, required: true, trim:true , sparse: true },
//   password: { type: String, required: true },
//   rate :{type: Number, default: 0},
//   labelStats: { type: LabelStatsSchema, default: {} },
//   allowedCarriers: { type: [AllowedCarrierSchema], default: [] },
//   createdat:{ type: Date, default: Date.now },
//   labelHistory: { type: [LabelSchema], default: [] },
//   bulkLabelHistory: { type: [BulkLabelSchema], default: [] }
//   // You can add additional fields here as needed (e.g., role, permissions, etc.)
// }, { timestamps: true });


const dataTableSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  lastDevice: String,
  isLoggedIn: { type: Boolean, default: false }
});

module.exports = mongoose.model("table", dataTableSchema);
