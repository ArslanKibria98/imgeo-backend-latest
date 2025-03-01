require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Import Routes
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin")
app.use("/api/auth",authRoutes);
app.use("/api/admin",adminRoutes);


// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Start the Server

const path = require('path');
app.use(express.static(path.join(__dirname, 'build')));
app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname, 'build','index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
