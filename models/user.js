const mongoose = require("mongoose");
const LabelSchema = new mongoose.Schema({
  fileName: { type: String },
  carrier: { type: String },
  trackingNumber: { type: String },
  labelType: { type: String, },
  vendor: { type: String },
  weight: { type: Number },
  height: { type: Number },
  width: { type: Number },
  length: { type: Number },
  senderName: { type: String },
  senderAddress: { type: String },
  senderCity: { type: String },
  senderState: { type: String },
  senderZip: { type: String },
  recipientName: { type: String },
  recipientAddress: { type: String },
  recipientCity: { type: String },
  recipientState: { type: String },
  recipientZip: { type: String },
  barcodeImg: { type: String },
  generatedAt: { type: Date, default: Date.now }
});
const BulkLabelSchema = new mongoose.Schema({
  labels: { type: [LabelSchema], required: true },
  generatedAt: { type: Date, default: Date.now }
});

const LabelStatsSchema = new mongoose.Schema({
  remaining: { type: Number, default: 0 },
  generated: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  distributed: { type: Number, default: 0 }
}, { _id: false });
const AllowedCarrierSchema = new mongoose.Schema({
  carrier: { type: String, required: true },
  allowedVendors: { type: [String], default: [] },
  labelStats: { type: LabelStatsSchema, default: {} },
  status: { type: Boolean, default: false }
  // list of allowed vendor names for that carrier
}, { _id: false });
const SubUserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  rate: { type: Number, default: 0 },
  availableBalance: { type: Number, default: 0 },
  isBlocked: { type: Boolean, default: false },
  totalDeposit: { type: Number, default: 0 },
  labelStats: { type: LabelStatsSchema, default: {} },
  allowedCarriers: { type: [AllowedCarrierSchema], default: [] },
  balanceHistory: [
    {
      previousBalance: { type: Number, required: true },
      newBalance: { type: Number, required: true },
      totalDeposit: { type: Number, required: true },
      status: { type: String, enum: ["paid", "unpaid"], default: "unpaid" },
      updatedAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  labelHistory: { type: [LabelSchema], default: [] },
  bulkLabelHistory: { type: [BulkLabelSchema], default: [] },
}, { timestamps: true });
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
