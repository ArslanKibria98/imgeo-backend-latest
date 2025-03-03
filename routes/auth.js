const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");


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


// ✅ User Signup Route
router.post("/signup", async (req, res) => {
  var { name, email, password } = req.body;

  try {
      email = email.toLowerCase();
      // Check if the user already exists
      let user = await User.findOne({ email});
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

// ✅ User Login Route
router.post("/login", async (req, res) => {
    var { email, password } = req.body;

    try {
      email = email.toLowerCase();
        // Check if the user exists
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: "Invalid credentials" });

        // Validate password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });

        // Generate JWT Token
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "1h" });
        const userData = {
            id: user._id,
            rate:user.rate,
            name: user.name,
            email: user.email,
            availableBalance: user.availableBalance,
            totalDeposit: user.totalDeposit,
            totalGeneratedLabels:user.totalGeneratedLabels
            // Include other relevant user data as needed
        };

        // Send token and user data in response
        res.json({ token, userData });
    } catch (err) {
        res.status(500).json({ msg: "Server error" });
    }
});

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
        res.status(401).json({ msg: "Invalid Token" });
    }
}

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
        user.availableBalance -= 1;
        user.totalGeneratedLabels += 1;
        
        // Create a single label record
        // user.labelHistory.push({
        //   trackingNumber: req.body.trackingNumber,
        //   labelType: req.body.labelType,
        //   vendor: req.body.vendor,
        //   weight: req.body.weight,
        //   senderName: req.body.senderName,
        //   senderAddress: req.body.senderAddress,
        //   senderCity: req.body.senderCity,
        //   senderState: req.body.senderState,
        //   senderZip: req.body.senderZip,
        //   recipientName: req.body.recipientName,
        //   recipientAddress: req.body.recipientAddress,
        //   recipientCity: req.body.recipientCity,
        //   recipientState: req.body.recipientState,
        //   recipientZip: req.body.recipientZip,
        //   generatedAt: new Date()
        // });
        
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
    router.post("/add-bulk-label-history/:userid", async (req, res) => {
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
        
        // Extract label data from the request body (expecting an array of label objects)
        const { labels } = req.body;
        if (!labels || !Array.isArray(labels) || labels.length === 0) {
          return res.status(400).json({ msg: "No label data provided" });
        }
        
        // Create a new bulk event object containing the provided labels
        const bulkEvent = {
          labels: labels.map(label => ({
            carrier: label?.carrier,
            trackingNumber: label.trackingNumber,
            labelType: label.labelType,
            vendor: label.vendor,
            weight: label.weight,
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
            generatedAt: new Date()
          })),
          generatedAt: new Date()
        };
        
        // Push the new bulk event into the user's bulkLabelHistory array
        user.bulkLabelHistory.push(bulkEvent);
        await user.save();
        
        return res.json({
          msg: "Bulk label history updated successfully",
          bulkLabelHistory: user.bulkLabelHistory
        });
        
      } catch (error) {
        console.error("Server error:", error);
        return res.status(500).json({ msg: "Server error", error: error.message });
      }
    });
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

   

   

module.exports = router;
