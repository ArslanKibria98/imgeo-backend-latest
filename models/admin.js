const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: "admin" } // Ensures only admins use this model
}, { timestamps: true });

module.exports = mongoose.model("Admin", AdminSchema);
