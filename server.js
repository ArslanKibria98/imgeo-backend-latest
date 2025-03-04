const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

// CORS Configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || "https://shiplabelpro.com", // Allow only specific origin
  methods: "GET,POST,PUT,DELETE", // Allowed HTTP methods
  allowedHeaders: "Content-Type,Authorization", // Allowed headers
};
app.use(cors(corsOptions));
// app.options("*", cors(corsOptions));


// Middleware
app.use(express.json()); // Parse JSON bodies

// Import Routes
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");

// Use Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Serve Static Files (React Build)
app.use(express.static(path.join(__dirname, 'client/build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

// Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));