const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const axios = require("axios");
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "mysecret"; // Secret key
const app = express();
// app.use(bodyParser.json());
// app.use(session({
//   secret: 'yourSecretKey',
//   resave: false,
//   saveUninitialized: true,
//   cookie: { secure: true } // for HTTP; set to true for HTTPS
// }));
app.get('api/users', async (req, res) => {
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
app.post('api/signup', async (req, res) => {
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
    req.session.userId = newUser._id; // Set user session ID
    req.session.device = device; // Set user device in session

    res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});
app.post('api/login', async (req, res) => {
  const { email, password, device } = req.body;
  console.log(req.body, "req.body")
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

    res.json({ message: 'Logged in successfully', status: user.isLoggedIn });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});
app.get("/", (req, res) => {
  res.send("API is working!");
});
app.delete('api/users/:id', async (req, res) => {
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
app.patch('api/users/:id', async (req, res) => {
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
app.post('api/logout', async (req, res) => {
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




module.exports = router;
