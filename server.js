const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();


const app = express();
app.use(express.json({ limit: "50mb" }));  // Adjust based on your needs
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// CORS Configuration
// const corsOptions = {
//   origin: process.env.FRONTEND_URL || "http://localhost:3000", // Allow only specific origin
//   methods: "GET,POST,PUT,DELETE", // Allowed HTTP methods
//   allowedHeaders: "Content-Type,Authorization", // Allowed headers
// };
const corsOptions = {
  origin: "*", // Allow all origins
  methods: "GET,POST,PUT,DELETE", // Allowed HTTP methods
  allowedHeaders: "Content-Type,Authorization", // Allowed headers
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));


// Middleware
// app.use(express.json()); // Parse JSON bodies

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
  .then(() => console.log(process.env.MONGO_URI, "✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Serve Static Files (React Build)
// Serve Static Files (React Build)
// Serve Static Files (React Build)
app.use(express.static(path.join(__dirname, "build")));

// Ensure React handles routing
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next(); // Don't interfere with API routes
  res.sendFile(path.resolve(__dirname, "build", "index.html"));
});



// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

// Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));