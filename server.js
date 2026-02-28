const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const session = require('express-session');
const User = require("./models/user");
const app = express();
const bcrypt = require('bcrypt');

// Auto-logout timers (in-memory, per process)
const autoLogoutTimers = new Map(); // userId -> Timeout
const AUTO_LOGOUT_EMAIL = "hello@britainenergy.co.uk";
const AUTO_LOGOUT_DELAY_MS = 10 * 60 * 1000;

function scheduleAutoLogout(userId) {
  if (!userId) return;
  const key = String(userId);
  const existing = autoLogoutTimers.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    try {
      await User.findByIdAndUpdate(key, { $set: { isLoggedIn: false } });
    } catch (e) {
      console.error("Auto-logout failed:", e?.message || e);
    } finally {
      autoLogoutTimers.delete(key);
    }
  }, AUTO_LOGOUT_DELAY_MS);

  autoLogoutTimers.set(key, timer);
}
// Body Parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// CORS
const isProduction = process.env.NODE_ENV === "production";
const envOriginRaw = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "";
const defaultOrigins = [
  "https://imgeo-prod.netlify.app",
  "https://imgeo-new.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

function normalizeOrigin(origin) {
  if (!origin) return "";
  // normalize for safe comparisons (trim, lowercase, no trailing slash)
  let s = String(origin).trim();
  // strip surrounding quotes (common in .env files)
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }
  return s.trim().toLowerCase().replace(/\/$/, "");
}

const envOrigins = envOriginRaw
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

const normalizedDefaultOrigins = defaultOrigins
  .map(normalizeOrigin)
  .filter(Boolean);
// Important: never let env accidentally override/block the known good defaults.
// We always allow the default origins, and we *add* any env-provided origins.
const allowedOriginSet = new Set([...normalizedDefaultOrigins, ...envOrigins]);

function isOriginAllowed(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return true; // non-browser clients (curl/Postman/mobile)
  if (allowedOriginSet.has(normalized)) return true;
  if (!isProduction) {
    // Dev convenience: allow localhost/127.0.0.1 on any port
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) return true;
  }
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) return callback(null, true);
    // Don't throw an error (it becomes a 500 and looks like a backend bug).
    // Returning false just omits CORS headers for disallowed origins.
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  optionsSuccessStatus: 204,
  // Note: leave allowedHeaders unset so `cors` reflects Access-Control-Request-Headers
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// needed when deploying behind a proxy / load balancer (secure cookies, correct req.ip)
app.set("trust proxy", 1);
app.use(session({
  secret: 'yourSecretKey',
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: isProduction, // must be true when sameSite is 'none'
    sameSite: isProduction ? "none" : "lax",
  }
}));
// Routes
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
app.get('/api/users', async (req, res) => {
  try {
    // Fetch all users from the database
    const users = await User.find({});

    // Return the list of users
    res.json(users);
  } catch (error) {
    console.error('Failed to retrieve users:', error);
    res.status(500).json({ message: 'Failed to retrieve users' });
  }
});
app.post('/api/signup', async (req, res) => {
  const { email, password, device } = req.body;

  try {

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }


    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new User({
      email,
      password: password,
      lastDevice: device,
      isLoggedIn: false
    });

    // Save the new user
    await newUser.save();
    req.session.userId = newUser._id;
    req.session.device = device;

    res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});
app.post('/api/login', async (req, res) => {
  const { email, password, device } = req.body;
  console.log(req?.body, "req.body")
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const validPassword = (password === user.password);
    if (!validPassword) {
      return res.status(400).json({ message: 'Invalid password' });
    }
    if (user.lastDevice == "") {
      user.lastDevice = device;
    }
    console.log(user.lastDevice, device, "1234")

    if (user.isLoggedIn) {
      const errorMessage =
        'User already logged in on this device'
      return res.status(400).json({ message: errorMessage });
    }
    if (user.lastDevice != device) {
      return res.status(400).json({ message: 'User already logged in from another device' });
    }
    user.isLoggedIn = true;


    await user.save();

    req.session.userId = user._id;
    req.session.device = device;

    // Special-case: auto logout this account after 1 minute
    if ((user.email || "").toLowerCase() === AUTO_LOGOUT_EMAIL) {
      scheduleAutoLogout(user._id);
    }

    res.json({ message: 'Logged in successfully', status: user.isLoggedIn });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});
app.get("/", (req, res) => {
  res.send("API is working!");
});
app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await User.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Failed to delete user:', error);
    res.status(500).json({ message: error.message });
  }
});
app.patch('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { email, password, device } = req.body;
  console.log(device, "device")
  try {
    const user = await User.findById({ _id: id });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }


    if (email && email !== user.email) {

      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      user.email = email;
    }

    if (password) {
      user.password = password;
    }
    if (!device) {
      user.lastDevice = "";
    }
    if (device) {
      user.lastDevice = device;
    }

    await user.save();
    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('Failed to update user:', error);
    res.status(500).json({ message: error.message });
  }
});
app.post('/api/logout', async (req, res) => {
  console.log(req, "req")
  const { email } = req.body;

  console.log(email, "email")
  if (email === null) {
    return res.status(401).json({ message: 'No user found' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isLoggedIn = false;

    await user.save();
    res.json({ message: 'Logged out successfully' });



  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});
// app.use("/api/admin", adminRoutes);
app.get("/", (req, res) => {
  res.send("✅ API running, all routes handled by authRoutes");
});
// MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log(process.env.MONGO_URI, "✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Catch-All for undefined routes
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Error Handling
app.use((err, req, res, next) => {
  console.error("❌ Unhandled Error:", err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

// Start Server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
});
