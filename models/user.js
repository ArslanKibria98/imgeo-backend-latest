const mongoose = require("mongoose");
const LabelSchema = new mongoose.Schema({
  carrier: { type: String},
  trackingNumber: { type: String, required: true },
  labelType: { type: String, required: true },
  vendor: { type: String, required: true },
  weight: { type: Number },
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
  generatedAt: { type: Date, default: Date.now }
});
const BulkLabelSchema = new mongoose.Schema({
  labels: { type: [LabelSchema], required: true },
  generatedAt: { type: Date, default: Date.now }
});
const LabelStatsSchema = new mongoose.Schema({
  total: { type: Number, default: 0 },
  used: { type: Number, default: 0 },
  distributed: { type: Number, default: 0 },
  remaining: { type: Number, default: 0 }
}, { _id: false });
const AllowedCarrierSchema = new mongoose.Schema({
  carrier: { type: String, required: true },
  allowedVendors: { type: [String], default: [] },
  labelStats: { type: LabelStatsSchema, default: {} },
  status: {type:Boolean, default:false}
  // list of allowed vendor names for that carrier
}, { _id: false });

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


const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true,trim: true ,sparse: true },
  password: { type: String, required: true },
  availableBalance: { type: Number, default: 0 },
  rate :{type: Number, default: 0},
  totalGeneratedLabels: { type: Number, default: 0 },
  isBlocked: { type: Boolean, default: false },
  isDealer: { type: Boolean, default: false },
  // For single label generation:
  allowedCarriers: { type: [AllowedCarrierSchema], default: [] },
  // subUsers: { type: [SubUserSchema], default: [] },
  labelStats: { type: LabelStatsSchema, default: {} },
  // For bulk label generation, each bulk event stores an array of labels:
  labelHistory: { type: [LabelSchema], default: [] },
  bulkLabelHistory: { type: [BulkLabelSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
