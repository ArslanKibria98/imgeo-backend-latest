const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const axios = require("axios");
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "mysecret"; // Secret key
router.get("/user", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ msg: "No token, authorization denied" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) return res.status(404).json({ msg: "User not found" });

    console.log("User Data:", user); // Debugging log

    res.json(user);
  } catch (error) {
    console.error("Auth Error:", error);
    res.status(500).json({ msg: "Server Error" });
  }
});

router.get("/barcode", async (req, res) => {
  try {
    const response = await axios.get("https://my.labelscheap.com/api/barcodev2.php");
    res.json(response.data); // Return the response to the frontend
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

router.get("/allowed-carriers/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch the user and only return allowedCarriers
    const user = await User.findById(userId).select("allowedCarriers");

    if (!user) return res.status(404).json({ msg: "User not found" });

    // Filter allowed carriers where status is true
    const allowedCarriers = user.allowedCarriers.filter(carrier => carrier.status === true);

    res.json(allowedCarriers);
  } catch (error) {
    console.error("Error fetching allowed carriers:", error);
    res.status(500).json({ msg: "Server Error" });
  }
});

///
router.get("/dealer/:dealerId/sub-users/:subUserId/allowed-carriers", async (req, res) => {
  try {
    const { dealerId, subUserId } = req.params;

    // Find the dealer
    const dealer = await User.findById(dealerId);
    if (!dealer || !dealer.isDealer) {
      return res.status(403).json({ msg: "Unauthorized dealer access" });
    }

    // Find the sub-user under the dealer
    const subUser = dealer.subUsers.id(subUserId);
    if (!subUser) {
      return res.status(404).json({ msg: "Sub-user not found under this dealer" });
    }

    // Filter allowed carriers where status is true
    const allowedCarriers = (subUser.allowedCarriers || []).filter(carrier => carrier.status === true);

    res.json(allowedCarriers);

  } catch (error) {
    console.error("Error fetching allowed carriers for sub-user:", error);
    res.status(500).json({ msg: "Server Error", error: error.message });
  }
});

// ✅ User Signup Route
router.post("/signup", async (req, res) => {
  var { name, email, password } = req.body;

  try {
    email = email.toLowerCase();
    // Check if the user already exists
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: "User already exists" });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save new user
    user = new User({ name, email, password: hashedPassword });
    await user.save();

    res.status(201).json({ msg: "User registered successfully" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});
///// dealer allow to make users
// POST /dealer/add-subuser
router.post("/dealer/:userId/add-subuser", async (req, res) => {
  const { userId } = req.params;
  const { name, email, password, rate } = req.body;

  try {
    const dealer = await User.findById(userId);
    if (!dealer || !dealer.isDealer) {
      return res.status(403).json({ msg: "Unauthorized: Not a dealer" });
    }

    const lowerEmail = email.toLowerCase();

    // Check if a sub-user with this email already exists under the dealer
    const emailExists = dealer.subUsers.some(
      (sub) => sub.email.toLowerCase() === lowerEmail
    );
    if (emailExists) {
      return res.status(400).json({ msg: "Sub-user email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    dealer.subUsers.push({
      name,
      email: lowerEmail,
      password: hashedPassword,
      rate,
    });

    await dealer.save();

    res.status(201).json({ msg: "Sub-user added successfully" });
  } catch (err) {
    console.error("Add sub-user error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});





// ✅ User Login Route
router.post("/login", async (req, res) => {
  let { email, password } = req.body;

  try {
    email = email.toLowerCase();

    // First, try to find as a dealer or top-level user
    let user = await User.findOne({ email });

    // If not found as top-level, search all dealers for sub-user
    if (!user) {
      const dealers = await User.find({ isDealer: true });

      for (const dealer of dealers) {
        const subUser = dealer.subUsers.find(sub => sub.email === email);

        if (subUser) {
          const isMatch = await bcrypt.compare(password, subUser.password);
          if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });

          // Create token for sub-user
          const token = jwt.sign(
            { dealerId: dealer._id, subUserId: subUser._id },
            JWT_SECRET,
            { expiresIn: "5h" }
          );
          const totalBulkLabelsDealer = subUser.bulkLabelHistory.reduce((sum, bulk) => sum + bulk.labels.length, 0);
          const userData = {
            id: subUser._id,
            dealerId: dealer._id,
            name: subUser.name,
            email: subUser.email,
            rate: subUser.rate,
            availableBalance: subUser.availableBalance,
            totalDeposit: subUser.totalDeposit,
            isDealer: false,
            isBlocked: subUser.isBlocked,
            labelHistory: subUser.labelHistory.length,
            bulkLabelHistory: totalBulkLabelsDealer,
            totalGeneratedLabels: subUser.totalGeneratedLabels,
            role: "sub-user"
          };

          return res.json({ token, userData });
        }
      }

      return res.status(400).json({ msg: "Invalid credentials" });
    }

    // Validate password for top-level user
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });

    const totalBulkLabels = user.bulkLabelHistory.reduce((sum, bulk) => sum + bulk.labels.length, 0);

    // Create token for dealer or top-level user
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "5h" });

    const userData = {
      id: user._id,
      rate: user.rate,
      name: user.name,
      email: user.email,
      availableBalance: user.availableBalance,
      totalDeposit: user.totalDeposit,
      isBlocked: user.isBlocked,
      isDealer: user.isDealer || false,
      labelHistory: user.labelHistory.length,
      bulkLabelHistory: totalBulkLabels,
      totalGeneratedLabels: user.totalGeneratedLabels,
      role: user.isDealer ? "dealer" : "user"
    };

    res.json({ token, userData });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});


/// update password

// ✅ Protected Route (Only accessible with valid token)
router.get("/protected", authenticateToken, async (req, res) => {
  res.json({ msg: "You have accessed a protected route!" });
});




// ✅ Middleware to Authenticate JWT Token
function authenticateToken(req, res, next) {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ msg: "Access Denied" });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ msg: "Token expired. Please log in again." });
    }
    res.status(401).json({ msg: "Invalid Token" });
  }
}
router.put("/update-password", async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    console.log(userId, oldPassword, newPassword, "1")
    // Validate input fields
    if (!userId || !newPassword) {
      return res.status(400).json({ msg: "User ID and new password are required" });
    }
    console.log("2")
    // Fetch user from DB
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });
    const id = user?._id.toString().replace(/^ObjectId\(["']?|["']?\)$/g, "");
    console.log(user, id, "3")
    let isMatch = false;
    // If the user is updating their own password, validate old password
    if (id === userId) {
      if (!oldPassword) {
        return res.status(400).json({ msg: "Old password is required" });
      }
      console.log(user.password, oldPassword, "4")
      bcrypt.compare(oldPassword, user.password, (err, isMatch) => {
        if (err) {
          console.error("Error comparing passwords:", err);
        } else if (isMatch) {
          console.log("Password is correct!");
        } else {
          console.log("Incorrect password!");
          return
        }
      });
      console.log(isMatch, "5")

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      console.log("6")
      // Save updated user record
      await user.save();

      res.status(200).json({ msg: "Password updated successfully!" });
    }
    else {
      console.log(isMatch, "5")
      res.status(400).json({ msg: "Something went wrong" });
      // If an admin is updating another user's password, check permissions
      // if (req.user.role !== "admin") {
      //   return res.status(403).json({ msg: "Access denied" });
      // }
    }

    // Hash the new password before saving

  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ msg: "Server error" });
  }
});
router.put("/update-password/dealer/:dealerId/:subUserId", async (req, res) => {
  try {
    const { dealerId, subUserId } = req.params; // Get dealerId and subUserId from params
    const { oldPassword, newPassword } = req.body;

    // Validate inputs
    if (!dealerId || !subUserId || !newPassword) {
      return res.status(400).json({ msg: "Dealer ID, Sub-User ID and new password are required" });
    }

    // Fetch dealer
    const dealer = await User.findById(dealerId);
    if (!dealer || !dealer.isDealer) {
      return res.status(403).json({ msg: "Unauthorized dealer access" });
    }

    // Find sub-user
    const subUser = dealer.subUsers.id(subUserId);
    if (!subUser) {
      return res.status(404).json({ msg: "Sub-user not found under this dealer" });
    }

    // If oldPassword is provided, validate it
    if (oldPassword) {
      const isMatch = await bcrypt.compare(oldPassword, subUser.password);
      if (!isMatch) {
        return res.status(400).json({ msg: "Old password is incorrect" });
      }
    }

    // Hash new password and save
    const salt = await bcrypt.genSalt(10);
    subUser.password = await bcrypt.hash(newPassword, salt);

    await dealer.save();

    return res.status(200).json({ msg: "Sub-user password updated successfully" });

  } catch (error) {
    console.error("Error updating sub-user password:", error);
    return res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// router.post("/:userId/sub-users", async (req, res) => {
//   try {
//       const { userId } = req.params;
//       const { name, email, password, rate } = req.body;

//       // Validate input
//       if (!name || !email || !password) {
//           return res.status(400).json({ message: "Name, email, and password are required." });
//       }

//       // Find the parent user (dealer)
//       const user = await User.findById(userId);
//       if (!user) {
//           return res.status(404).json({ message: "User not found." });
//       }

//       // Check if sub-user email already exists
//       const existingSubUser = user.subUsers.find(sub => sub.email === email);
//       if (existingSubUser) {
//           return res.status(400).json({ message: "Sub-user with this email already exists." });
//       }

//       // Hash the password
//       const hashedPassword = await bcrypt.hash(password, 10);

//       // Create sub-user object
//       const newSubUser = {
//           name,
//           email,
//           password: hashedPassword,
//           rate: rate || 0, // Default to 0 if not provided
//       };

//       // Add to sub-users array
//       user.subUsers.push(newSubUser);
//       await user.save();

//       res.status(201).json({ message: "Sub-user created successfully", subUser: newSubUser });
//   } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: "Internal server error" });
//   }
// });
// router.put("/generate-label/:userid", async (req, res) => {
//     try {
//         console.log("Headers received:", req.headers); // Debugging

//         // Ensure Authorization header exists
//         if (!req.headers.authorization) {
//             return res.status(401).json({ msg: "Authorization header missing" });
//         }

//         // Extract token correctly
//         const token = req.headers.authorization.split(" ")[1];  
//         if (!token) {
//             return res.status(401).json({ msg: "Token is missing" });
//         }

//         // Verify JWT
//         const decoded = jwt.verify(token, JWT_SECRET);
//         const userId = decoded.userId;

//         console.log("Decoded user ID:", userId);
//         console.log("Requested user ID:", req.params.userid);

//         // Ensure the decoded user matches the request
//         if (userId !== req.params.userid) {
//             return res.status(403).json({ msg: "Unauthorized access" });
//         }

//         // Find the user
//         const user = await User.findById(userId);
//         if (!user) return res.status(404).json({ msg: "User not found" });

//         // Update Balance and Labels
//         user.availableBalance -= 1;
//         user.totalGeneratedLabels += 1;
//         await user.save();

//         res.json({
//             msg: "Label generated successfully",
//             availableBalance: user.availableBalance,
//             totalGeneratedLabels: user.totalGeneratedLabels,
//         });

//     } catch (error) {
//         console.error("Server error:", error);
//         res.status(500).json({ msg: "Server error", error: error.message });
//     }
// });
router.put("/generate-label/:userid", async (req, res) => {
  try {
    console.log("Headers received:", req.headers);

    // Ensure Authorization header exists
    if (!req.headers.authorization) {
      return res.status(401).json({ msg: "Authorization header missing" });
    }

    // Extract token correctly
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(401).json({ msg: "Token is missing" });
    }

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    // console.log("Decoded user ID:", userId);
    // console.log("Requested user ID:", req.params.userid);
    // console.log(user.rate);

    // Ensure the decoded user matches the request
    if (userId !== req.params.userid) {
      return res.status(403).json({ msg: "Unauthorized access" });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Single label generation mode
    user.availableBalance -= user.rate;
    user.totalGeneratedLabels += user.rate;

    // Create a single label record
    user.labelHistory.push({
      carrier: req.body.carrier,
      trackingNumber: req.body.trackingNumber,
      labelType: req.body.labelType,
      vendor: req.body.vendor,
      weight: req.body.weight,
      length: req.body.length,
      width: req.body.width,
      height: req.body.height,
      senderName: req.body.senderName,
      senderAddress: req.body.senderAddress,
      senderCity: req.body.senderCity,
      senderState: req.body.senderState,
      senderZip: req.body.senderZip,
      recipientName: req.body.recipientName,
      recipientAddress: req.body.recipientAddress,
      recipientCity: req.body.recipientCity,
      recipientState: req.body.recipientState,
      recipientZip: req.body.recipientZip,
      barcodeImg: req.body.barcodeImg,
      generatedAt: new Date()
    });

    await user.save();

    return res.json({
      msg: "Label generated successfully",
      availableBalance: user.availableBalance,
      totalGeneratedLabels: user.totalGeneratedLabels,
      labelHistory: user.labelHistory
    });

  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ msg: "Server error", error: error.message });
  }
});
////

router.put("/dealer/:dealerId/sub-users/:subUserId/generate-label", async (req, res) => {
  try {
    const { dealerId, subUserId } = req.params;

    // Find the dealer
    const dealer = await User.findById(dealerId);
    if (!dealer || !dealer.isDealer) {
      return res.status(403).json({ msg: "Unauthorized dealer access" });
    }

    // Find the sub-user
    const subUser = dealer.subUsers.id(subUserId);
    if (!subUser) {
      return res.status(404).json({ msg: "Sub-user not found under this dealer" });
    }

    // Check if sub-user has enough balance
    if (subUser.availableBalance < subUser.rate) {
      return res.status(400).json({ msg: "Insufficient balance to generate label" });
    }

    // Deduct balance and add to generated total
    subUser.availableBalance -= subUser.rate;
    subUser.totalGeneratedLabels = (subUser.totalGeneratedLabels || 0) + subUser.rate;

    // Add to labelHistory
    subUser.labelHistory.push({
      carrier: req.body.carrier,
      trackingNumber: req.body.trackingNumber,
      labelType: req.body.labelType,
      vendor: req.body.vendor,
      weight: req.body.weight,
      length: req.body.length,
      width: req.body.width,
      height: req.body.height,
      senderName: req.body.senderName,
      senderAddress: req.body.senderAddress,
      senderCity: req.body.senderCity,
      senderState: req.body.senderState,
      senderZip: req.body.senderZip,
      recipientName: req.body.recipientName,
      recipientAddress: req.body.recipientAddress,
      recipientCity: req.body.recipientCity,
      recipientState: req.body.recipientState,
      recipientZip: req.body.recipientZip,
      barcodeImg: req.body.barcodeImg,
      generatedAt: new Date()
    });

    await dealer.save();

    return res.json({
      msg: "Label generated successfully",
      availableBalance: subUser.availableBalance,
      totalGeneratedLabels: subUser.totalGeneratedLabels,
      labelHistory: subUser.labelHistory
    });

  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ msg: "Server error", error: error.message });
  }
});

router.put("/bulk-generate-label/:userid", async (req, res) => {
  try {
    console.log("Headers received:", req.headers);

    // Ensure Authorization header exists
    if (!req.headers.authorization) {
      return res.status(401).json({ msg: "Authorization header missing" });
    }

    // Extract token correctly
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(401).json({ msg: "Token is missing" });
    }

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    console.log("Decoded user ID:", userId);
    console.log("Requested user ID:", req.params.userid);

    // Ensure the decoded user matches the request
    if (userId !== req.params.userid) {
      return res.status(403).json({ msg: "Unauthorized access" });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Single label generation mode
    user.availableBalance -= user.rate;
    user.totalGeneratedLabels += user.rate;

    await user.save();

    return res.json({
      msg: "Label generated successfully",
      availableBalance: user.availableBalance,
      totalGeneratedLabels: user.totalGeneratedLabels,
      // labelHistory: user.labelHistory
    });

  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ msg: "Server error", error: error.message });
  }
});
// router.post("/add-bulk-label-history/:userid", async (req, res) => {
//   try {
//     console.log("Headers received:", req.headers);

//     // Ensure Authorization header exists
//     if (!req.headers.authorization) {
//       return res.status(401).json({ msg: "Authorization header missing" });
//     }

//     // Extract token correctly
//     const token = req.headers.authorization.split(" ")[1];
//     if (!token) {
//       return res.status(401).json({ msg: "Token is missing" });
//     }

//     // Verify JWT
//     const decoded = jwt.verify(token, JWT_SECRET);
//     const userId = decoded.userId;

//     console.log("Decoded user ID:", userId);
//     console.log("Requested user ID:", req.params.userid);

//     // Ensure the decoded user matches the request
//     if (userId !== req.params.userid) {
//       return res.status(403).json({ msg: "Unauthorized access" });
//     }

//     // Find the user
//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ msg: "User not found" });

//     // Extract label data from the request body (expecting an array of label objects)
//     const { labels } = req.body;
//     if (!labels || !Array.isArray(labels) || labels.length === 0) {
//       return res.status(400).json({ msg: "No label data provided" });
//     }

//     // Create a new bulk event object containing the provided labels
//     const bulkEvent = {
//       labels: labels.map(label => ({
//         carrier: label?.carrier,
//         trackingNumber: label.trackingNumber,
//         labelType: label.labelType,
//         vendor: label.vendor,
//         weight: label.weight,
//         height: label.height,
//         width: label.width,
//         length: label.length,
//         senderName: label.senderName,
//         senderAddress: label.senderAddress,
//         senderCity: label.senderCity,
//         senderState: label.senderState,
//         senderZip: label.senderZip,
//         recipientName: label.recipientName,
//         recipientAddress: label.recipientAddress,
//         recipientCity: label.recipientCity,
//         recipientState: label.recipientState,
//         recipientZip: label.recipientZip,
//         barcodeImg: label.barcodeImg,
//         generatedAt: new Date()
//       })),
//       generatedAt: new Date()
//     };

//     // Push the new bulk event into the user's bulkLabelHistory array
//     user.bulkLabelHistory.push(bulkEvent);
//     await user.save();

//     return res.json({
//       msg: "Bulk label history updated successfully",
//       bulkLabelHistory: user.bulkLabelHistory
//     });

//   } catch (error) {
//     console.error("Server error:", error);
//     return res.status(500).json({ msg: "Server error", error: error.message });
//   }
// });


// ✅ Route to Add Bulk Label History
router.post("/add-bulk-label-history/:userid", async (req, res) => {
  try {
    // ✅ Check Authorization Header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ msg: "Authorization header missing" });
    }

    // ✅ Extract & Verify JWT Token
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ msg: "Token is missing" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    const paramUserId = req.params.userid;

    console.log("Decoded user ID:", userId);
    console.log("Requested user ID:", paramUserId);

    // ✅ Ensure User is Updating Their Own Data
    if (userId !== paramUserId) {
      return res.status(403).json({ msg: "Unauthorized access" });
    }

    // ✅ Find the User
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // ✅ Validate Labels Array
    const { labels } = req.body;
    if (!Array.isArray(labels) || labels.length === 0) {
      return res.status(400).json({ msg: "No label data provided" });
    }

    // ✅ Prepare Bulk Insert Data
    const formattedLabels = labels.map(label => ({
      fileName: label.fileName,
      carrier: label.carrier,
      trackingNumber: label.trackingNumber,
      labelType: label.labelType,
      vendor: label.vendor,
      weight: label.weight,
      height: label.height,
      width: label.width,
      length: label.length,
      senderName: label.senderName,
      senderAddress: label.senderAddress,
      senderCity: label.senderCity,
      senderState: label.senderState,
      senderZip: label.senderZip,
      recipientName: label.recipientName,
      recipientAddress: label.recipientAddress,
      recipientCity: label.recipientCity,
      recipientState: label.recipientState,
      recipientZip: label.recipientZip,
      barcodeImg: label.barcodeImg,
      generatedAt: new Date(),
    }));

    // ✅ Efficiently Push Labels Using `$push` in Bulk
    const bulkUpdate = {
      updateOne: {
        filter: { _id: userId },
        update: {
          $push: {
            bulkLabelHistory: {
              labels: formattedLabels,
              generatedAt: new Date(),
            },
          },
        },
      },
    };

    const bulkResult = await User.bulkWrite([bulkUpdate]);
    console.log('history upate')

    // ✅ Response
    return res.json({
      msg: "Bulk label history updated successfully",
      modifiedCount: bulkResult.modifiedCount,
    });

  } catch (error) {
    console.error("❌ Server error:", error);
    return res.status(500).json({ msg: "Server error", error: error.message });
  }
});
module.exports = router;
router.get("/label-history/:userid", async (req, res) => {
  try {
    // Check for the authorization header
    if (!req.headers.authorization) {
      return res.status(401).json({ msg: "Authorization header missing" });
    }

    // Extract and verify the token
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(401).json({ msg: "Token is missing" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    // Ensure the token's userId matches the requested user id
    if (userId !== req.params.userid) {
      return res.status(403).json({ msg: "Unauthorized access" });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Return both single and bulk label histories
    res.json({
      labelHistory: user.labelHistory,
      bulkLabelHistory: user.bulkLabelHistory
    });

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});


////

router.get("/dealer/:dealerId/label-history/:subUserId", async (req, res) => {
  try {
    const { dealerId, subUserId } = req.params;

    // Check for the authorization header
    // const authHeader = req.headers.authorization;
    // if (!authHeader) {
    //   return res.status(401).json({ msg: "Authorization header missing" });
    // }

    // // Extract and verify the token
    // const token = authHeader.split(" ")[1];
    // if (!token) {
    //   return res.status(401).json({ msg: "Token is missing" });
    // }

    // const decoded = jwt.verify(token, JWT_SECRET);

    // // Validate dealer authorization
    // if (decoded.userId !== dealerId) {
    //   return res.status(403).json({ msg: "Unauthorized dealer access" });
    // }

    // Find dealer
    const dealer = await User.findById(dealerId);
    if (!dealer || !dealer.isDealer) {
      return res.status(404).json({ msg: "Dealer not found or not authorized" });
    }

    // Find sub-user in dealer's subUsers array
    const subUser = dealer.subUsers.id(subUserId);
    if (!subUser) {
      return res.status(404).json({ msg: "Sub-user not found" });
    }

    // Return sub-user's label history
    res.json({
      labelHistory: subUser.labelHistory || [],
      bulkLabelHistory: subUser.bulkLabelHistory || [],
    });

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});
///
router.get("/label-history-single/:userid", async (req, res) => {
  try {
    // Check for the authorization header
    if (!req.headers.authorization) {
      return res.status(401).json({ msg: "Authorization header missing" });
    }

    // Extract and verify the token
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(401).json({ msg: "Token is missing" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    // Ensure the token's userId matches the requested user id
    if (userId !== req.params.userid) {
      return res.status(403).json({ msg: "Unauthorized access" });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Return both single and bulk label histories
    res.json({
      labelHistory: user.labelHistory
    });

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

///
router.get("/dealer/:dealerId/sub-users/:subUserId/label-history-single", async (req, res) => {
  try {
    const { dealerId, subUserId } = req.params;

    // Find the dealer
    const dealer = await User.findById(dealerId);
    if (!dealer || !dealer.isDealer) {
      return res.status(403).json({ msg: "Unauthorized dealer access" });
    }

    // Find the sub-user inside the dealer
    const subUser = dealer.subUsers.id(subUserId);
    if (!subUser) {
      return res.status(404).json({ msg: "Sub-user not found under this dealer" });
    }

    // Return only labelHistory
    res.json({
      labelHistory: subUser.labelHistory
    });

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});
///
router.get("/download-bulk-file/:bulkId", async (req, res) => {
  try {
    const user = await User.findOne({
      "bulkLabelHistory._id": req.params.bulkId
    });

    const bulkEvent = user.bulkLabelHistory.id(req.params.bulkId);

    res.set({
      "Content-Type": bulkEvent.excelContentType,
      "Content-Disposition": `attachment; filename="bulk-labels-${req.params.bulkId}.xlsx"`
    });

    res.send(bulkEvent.excelFile);
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ msg: "Error downloading file" });
  }
});




module.exports = router;
