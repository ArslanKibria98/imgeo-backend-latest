const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const Admin = require("../models/admin");
const User = require("../models/user")
const authMiddleware = require("../middleware/authMiddleware"); // Protect admin routes
const shipTs = require("../models/shipTs");
const axios = require('axios');
require("dotenv").config();
const JWT_SECRET = process.env.JWT_SECRET || "default_secret"; // Ensure this is set

const router = express.Router();

// ⛔️ Rate limiting to prevent brute-force attacks (5 requests per 15 minutes)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 attempts
  message: { msg: "Too many login attempts. Please try again later." },
});

// ✅ Admin Registration (Secure)
router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Invalid email"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      var { name, email, password } = req.body;
      email = email.toLowerCase();

      // Check if admin already exists
      let admin = await Admin.findOne({ email });
      if (admin) {
        return res.status(400).json({ msg: "Admin already exists" });
      }

      // Hash password with bcrypt
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new admin
      admin = new Admin({ name, email, password: hashedPassword });
      await admin.save();

      res.status(201).json({ msg: "Admin registered successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ msg: "Server error" });
    }
  }
);

// ✅ Admin Login (Secure)
router.post(
  "/login",
  loginLimiter, // ⛔ Apply rate limiting
  [
    body("email").isEmail().withMessage("Invalid email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    var { email, password } = req.body;
    email = email.toLowerCase();

    try {
      const admin = await Admin.findOne({ email });

      // Security: Avoid revealing whether email exists
      // if (!admin || !(await bcrypt.compare(password, admin.password))) {
      //   return res.status(400).json({ msg: "Invalid email or password" });
      // }

      // Generate JWT token
      const token = jwt.sign(
        { userId: admin._id, role: "admin" },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.json({ token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Server error" });
    }
  }
);


router.get("/users", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ msg: "Access denied" });
    }

    let { page = 1, limit = 10 } = req.query;
    page = Math.max(1, parseInt(page)); // Ensure page is at least 1
    limit = Math.max(1, Math.min(100, parseInt(limit))); // Limit between 1-100

    const totalUsers = await User.countDocuments();
    const totalPages = Math.ceil(totalUsers / limit);
    const users = await User.find()
      .select("-password") // Exclude password field
      .sort({ createdAt: -1 }) // Sort by newest first
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(); // Optimize query speed

    // Generate next and previous page URLs
    const baseUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}/users`;
    const nextPage = page < totalPages ? `${baseUrl}?page=${page + 1}&limit=${limit}` : null;
    const prevPage = page > 1 ? `${baseUrl}?page=${page - 1}&limit=${limit}` : null;

    res.status(200).json({
      users,
      pagination: {
        totalUsers,
        totalPages,
        currentPage: page,
        nextPage,
        prevPage,
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

/// dealer users
// GET /dealer/:userId/sub-users
router.get("/dealer/:userId/sub-users", async (req, res) => {
  const { userId } = req.params;
  let { page = 1, limit = 10 } = req.query;

  try {
    const dealer = await User.findById(userId).lean();
    if (!dealer || !dealer.isDealer) {
      return res.status(403).json({ msg: "Access denied: Not a dealer" });
    }

    page = Math.max(1, parseInt(page));
    limit = Math.max(1, Math.min(100, parseInt(limit)));

    const subUsers = dealer.subUsers || [];

    const totalUsers = subUsers.length;
    const totalPages = Math.ceil(totalUsers / limit);

    const paginatedSubUsers = subUsers
      .slice((page - 1) * limit, page * limit)
      .map(({ password, ...rest }) => rest); // Remove password from response

    const baseUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}/dealer/${userId}/sub-users`;
    const nextPage = page < totalPages ? `${baseUrl}?page=${page + 1}&limit=${limit}` : null;
    const prevPage = page > 1 ? `${baseUrl}?page=${page - 1}&limit=${limit}` : null;

    res.status(200).json({
      success: true,
      users: paginatedSubUsers,
      pagination: {
        totalUsers,
        totalPages,
        currentPage: page,
        nextPage,
        prevPage,
      },
    });
  } catch (err) {
    console.error("Dealer sub-user fetch error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});


// ✅ 2. Block/Unblock a user
router.put("/users/:id/status", authMiddleware, async (req, res) => {
  try {
    console.log(req.body, "req")
    if (req.user.role !== "admin") {
      return res.status(403).json({ msg: "Access denied" });
    }
    console.log(req.body, "123")
    const { status } = req.body;
    const updatedUser = await User.findByIdAndUpdate(req.params.id, { isBlocked: req.body.status }, { new: true });
    console.log(updatedUser, "updatedUser")
    if (!updatedUser) return res.status(404).json({ msg: "User not found" });

    res.status(200).json({ msg: "User status updated successfully", updatedUser });
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({ msg: "Server error" });
  }
});
/// 
router.put("/dealer/:dealerId/sub-users/:subUserId/status", async (req, res) => {
  const { dealerId, subUserId } = req.params;
  const { status } = req.body;

  try {
    // Check if the dealer exists and the request is coming from the correct dealer
    const dealer = await User.findById(dealerId);
    if (!dealer || !dealer.isDealer) {
      return res.status(403).json({ msg: "Unauthorized" });
    }

    // Find the sub-user within the dealer's sub-users list
    const subUser = dealer.subUsers.id(subUserId); // Mongoose method to get sub-user by ID
    if (!subUser) {
      return res.status(404).json({ msg: "Sub-user not found" });
    }

    // Validate the status value
    if (typeof status !== "boolean") {
      return res.status(400).json({ msg: "Invalid status. Status must be a boolean value." });
    }

    // Update the sub-user's status
    subUser.isBlocked = status;

    // Save the updated dealer document
    await dealer.save();

    // Return success response
    res.status(200).json({
      msg: "Sub-user status updated successfully",
      updatedSubUser: subUser,
    });

  } catch (error) {
    console.error("Error updating sub-user status:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

///// delete user
router.delete("/users/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ msg: "Access denied" });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ msg: "User ID is required" });
    }

    if (id === req.user.id) {
      return res.status(400).json({ msg: "You cannot delete yourself" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    await User.deleteOne({ _id: id });

    res.status(200).json({ msg: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// delete dealer user
// DELETE /dealer/:dealerId/sub-users/:subUserId
router.delete("/dealer/:dealerId/sub-users/:subUserId", async (req, res) => {
  const { dealerId, subUserId } = req.params;

  try {
    const dealer = await User.findById(dealerId);
    if (!dealer || !dealer.isDealer) {
      return res.status(403).json({ msg: "Access denied: Not a dealer" });
    }

    // Find the index of the sub-user with the given ID
    const subUserIndex = dealer.subUsers.findIndex(
      (sub) => sub._id.toString() === subUserId
    );

    if (subUserIndex === -1) {
      return res.status(404).json({ msg: "Sub-user not found" });
    }

    // Remove the sub-user
    dealer.subUsers.splice(subUserIndex, 1);
    await dealer.save();

    res.status(200).json({ msg: "Sub-user deleted successfully" });
  } catch (err) {
    console.error("Delete sub-user error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ✅ 3. Increase/Decrease user balance
router.put("/users/:id/balance", authMiddleware, async (req, res) => {
  try {
    // Check if the user is an admin
    if (req.user.role !== "admin") {
      return res.status(403).json({ msg: "Access denied" });
    }

    // Extract availableBalance and totalDeposit from the request body
    const { availableBalance, totalDeposit } = req.body;

    // Validate input
    if (typeof availableBalance !== "number" || typeof totalDeposit !== "number") {
      return res.status(400).json({ msg: "Invalid input. Both availableBalance and totalDeposit must be numbers." });
    }

    // Find the user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Determine status: "paid" or "unpaid"
    const status = availableBalance >= totalDeposit ? "unpaid" : "unpaid";

    // Store previous balance before updating
    const previousBalance = user.availableBalance;

    // Update user and push balance history
    user.availableBalance = availableBalance;
    user.totalDeposit = totalDeposit;
    user.balanceHistory.push({
      previousBalance,
      newBalance: availableBalance,
      totalDeposit,
      status,
      updatedAt: new Date(),
    });

    await user.save();

    // Return success response
    res.status(200).json({
      msg: "User balance and total deposit updated successfully",
      updatedUser: user,
    });

  } catch (error) {
    console.error("Error updating user balance and total deposit:", error);
    res.status(500).json({ msg: "Server error" });
  }
});
/// dealer user balance update
// PUT /dealer/:dealerId/sub-users/:subUserId/balance
router.put("/dealer/:dealerId/sub-users/:subUserId/balance", async (req, res) => {
  const { dealerId, subUserId } = req.params;

  try {
    // Check if the user is a dealer and if they are updating their own sub-user
    const dealer = await User.findById(dealerId);
    if (!dealer || !dealer.isDealer) {
      return res.status(403).json({ msg: "Unauthorized" });
    }

    // Ensure dealer has a subUsers array
    if (!dealer.subUsers || !Array.isArray(dealer.subUsers)) {
      return res.status(404).json({ msg: "Dealer has no sub-users" });
    }

    // Find the sub-user within the dealer's sub-users list
    const subUser = dealer.subUsers.id(subUserId); // This uses Mongoose's internal method to find the sub-user by ID
    if (!subUser) {
      return res.status(404).json({ msg: "Sub-user not found" });
    }

    // Extract availableBalance and totalDeposit from the request body
    const { availableBalance, totalDeposit } = req.body;

    // Validate input
    if (typeof availableBalance !== "number" || typeof totalDeposit !== "number") {
      return res.status(400).json({ msg: "Invalid input. Both availableBalance and totalDeposit must be numbers." });
    }

    // Determine status: "paid" or "unpaid"
    const status = availableBalance >= totalDeposit ? "paid" : "unpaid";

    // Store previous balance before updating
    const previousBalance = subUser.availableBalance;

    // Update sub-user balance and push balance history
    subUser.availableBalance = availableBalance;
    subUser.totalDeposit = totalDeposit;
    subUser.balanceHistory.push({
      previousBalance,
      newBalance: availableBalance,
      totalDeposit,
      status,
      updatedAt: new Date(),
    });

    // Save the updated dealer document
    await dealer.save();

    // Return success response
    res.status(200).json({
      msg: "Sub-user balance and total deposit updated successfully",
      updatedSubUser: subUser,
    });

  } catch (error) {
    console.error("Error updating sub-user balance and total deposit:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});





router.put("/users/:id/balance-history/:entryId", authMiddleware, async (req, res) => {
  try {
    // Check admin access
    if (req.user.role !== "admin") {
      return res.status(403).json({ msg: "Access denied" });
    }

    const { status } = req.body;

    // Validate status input
    if (!["paid", "unpaid"].includes(status)) {
      return res.status(400).json({ msg: "Invalid status. Must be 'paid' or 'unpaid'." });
    }

    // Find the user and update the specific history entry
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, "balanceHistory._id": req.params.entryId },
      {
        $set: {
          "balanceHistory.$.status": status,
          "balanceHistory.$.updatedAt": new Date(),
        },
      },
      { new: true }
    );

    // If no user or entry is found
    if (!user) {
      return res.status(404).json({ msg: "User or balance entry not found" });
    }

    res.status(200).json({
      msg: "Balance history status updated successfully",
      updatedUser: user,
    });
  } catch (error) {
    console.error("Error updating balance status:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/users/:id/balance-history", authMiddleware, async (req, res) => {
  try {
    // Find the user by ID and project only the balanceHistory field
    const user = await User.findById(req.params.id).select("balanceHistory");
    const userLabels = await User.findById(req.params.id).select("labelHistory");
    const userLabelsBulk = await User.findById(req.params.id).select("bulkLabelHistory");
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Return the user's balance history
    res.status(200).json({
      msg: "Balance history retrieved successfully",
      balanceHistory: user.balanceHistory,
      labelHistory: userLabels.labelHistory,
      bulkLabelHistory: userLabelsBulk.bulkLabelHistory,
    });

  } catch (error) {
    console.error("Error fetching balance history:", error);
    res.status(500).json({ msg: "Server error" });
  }
});
router.get("/dealer/:dealerId/sub-user/:subUserId/balance-history", async (req, res) => {
  try {
    const { dealerId, subUserId } = req.params;

    // Find the dealer user and ensure they are a dealer
    const dealer = await User.findById(dealerId);
    // if (!dealer || !dealer.isDealer) {
    //   return res.status(403).json({ msg: "Unauthorized dealer access" });
    // }

    // Find the sub-user under the dealer
    const subUser = dealer.subUsers.id(subUserId);
    if (!subUser) {
      return res.status(404).json({ msg: "Sub-user not found under this dealer" });
    }

    // Return balance and label history
    res.status(200).json({
      msg: "Balance and label history retrieved successfully",
      balanceHistory: subUser.balanceHistory || [],
      labelHistory: subUser.labelHistory || [],
      bulkLabelHistory: subUser.bulkLabelHistory || [],
    });

  } catch (error) {
    console.error("Error fetching sub-user balance history:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/users/total-balance-per-day", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ msg: "Start date and end date are required" });
    }

    const result = await User.aggregate([
      // Unwind the balanceHistory array
      { $unwind: "$balanceHistory" },

      // Match balanceHistory within the date range
      {
        $match: {
          "balanceHistory.updatedAt": {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
        },
      },

      // Project necessary fields
      {
        $project: {
          date: {
            $dateToString: { format: "%Y-%m-%d", date: "$balanceHistory.updatedAt" },
          },
          newBalance: "$balanceHistory.newBalance",
        },
      },

      // Group by date and sum the newBalance
      {
        $group: {
          _id: "$date", // Group by formatted date
          totalBalance: { $sum: "$newBalance" }, // Sum new balances
        },
      },

      // Sort by date in ascending order
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      msg: "Total balance per day retrieved successfully",
      balancePerDay: result,
    });
  } catch (error) {
    console.error("Error fetching total balance per day:", error);
    res.status(500).json({ msg: "Server error" });
  }
});
// GET /dealer/:dealerId/sub-users/total-balance-per-day
router.get("/dealer/:dealerId/sub-users/total-balance-per-day", async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { startDate, endDate } = req.query;

    if (!dealerId) {
      return res.status(400).json({ msg: "Dealer ID is required" });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ msg: "Start date and end date are required" });
    }

    // if (!mongoose.Types.ObjectId.isValid(dealerId)) {
    //   return res.status(400).json({ msg: "Invalid dealer ID format" });
    // }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const dealer = await User.findById(dealerId).lean();
    if (!dealer || !dealer.isDealer) {
      return res.status(404).json({ msg: "Dealer not found or not a dealer" });
    }

    const balanceData = [];

    for (const sub of dealer.subUsers || []) {
      for (const entry of sub.balanceHistory || []) {
        const entryDate = new Date(entry.updatedAt);
        if (entryDate >= start && entryDate <= end) {
          const dateKey = entryDate.toISOString().split("T")[0];
          balanceData.push({ date: dateKey, newBalance: entry.newBalance });
        }
      }
    }

    const grouped = balanceData.reduce((acc, { date, newBalance }) => {
      acc[date] = (acc[date] || 0) + newBalance;
      return acc;
    }, {});

    const result = Object.entries(grouped)
      .map(([date, totalBalance]) => ({ date, totalBalance }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    res.status(200).json({
      msg: "Dealer sub-user total balance per day retrieved successfully",
      balancePerDay: result,
    });
  } catch (error) {
    console.error("Error fetching dealer sub-user balance per day:", error);
    res.status(500).json({ msg: "Server error" });
  }
});



router.post("/upload-shipments", async (req, res) => {
  try {
    const { rows } = req.body; // 'rows' is an array of objects from Excel
    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ msg: "No rows provided" });
    }

    // Transform each row to match the ShipmentSchema
    const shipmentsToInsert = rows.map(row => ({
      carrier: row.Carrier.toLowerCase(),
      tracking: row.tracking,
      labelType: row.labelType,
    }));

    // Insert all in one go
    await shipTs.insertMany(shipmentsToInsert);

    res.json({ msg: "Shipments saved successfully" });
  } catch (error) {
    console.error("Error saving shipments:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/read/shipts", async (req, res) => {
  try {
    // Retrieve all shipments from the database
    const shipments = await shipTs.find({});
    // Respond with the list of shipments
    res.json(shipments);
  } catch (error) {
    console.error("Error fetching shipments:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});
router.post("/pull/shipts", async (req, res) => {
  try {
    const { labelType, carrier } = req.body;
    if (!labelType || !carrier) {
      return res.status(400).json({ msg: "labelType and carrier are required" });
    }
    //   labelType = labelType.toLowerCase();
    //   carrier = carrier.toLowerCase();

    // Find the first matching shipment and delete it atomically
    const shipment = await shipTs.findOneAndDelete({ labelType, carrier });
    if (!shipment) {
      return res.status(404).json({ msg: "Server Error Our Team Try to fix Pls Wait...." });
    }

    res.json({
      msg: "Shipment retrieved and deleted successfully",
      shipment,
    });
  } catch (error) {
    console.error("Error pulling shipment:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// update isDealer

router.put("/:userId/is-dealer", async (req, res) => {
  try {
    const { userId } = req.params;
    const { isDealer } = req.body;

    // Validate input
    if (typeof isDealer !== "boolean") {
      return res.status(400).json({ message: "isDealer must be a boolean value (true or false)." });
    }

    // Find and update user
    const user = await User.findByIdAndUpdate(
      userId,
      { isDealer },
      { new: true } // Return the updated document
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ message: "User updated successfully", user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});


router.put("/:userId/carriers", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { allowedCarriers } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    user.allowedCarriers = allowedCarriers;
    await user.save();

    res.json({ msg: "Carriers updated successfully!", user });
  } catch (error) {
    res.status(500).json({ msg: "Server Error", error });
  }
});
/////
router.put("/dealer/:dealerId/sub-users/:subUserId/carriers", async (req, res) => {
  const { dealerId, subUserId } = req.params; // Get dealerId and subUserId from the URL
  const { allowedCarriers } = req.body; // Get the new allowed carriers from the request body

  try {
    // Find the dealer by ID
    const dealer = await User.findById(dealerId);
    if (!dealer || !dealer.isDealer) {
      return res.status(403).json({ error: 'Unauthorized. Dealer not found.' });
    }

    // Find the sub-user within the dealer's sub-users list
    const subUser = dealer.subUsers.id(subUserId);
    if (!subUser) {
      return res.status(404).json({ error: 'Sub-user not found.' });
    }

    // Update the sub-user's allowed carriers
    subUser.allowedCarriers = allowedCarriers;

    // Save the dealer document with the updated sub-user
    await dealer.save();

    // Return the updated sub-user
    res.json({ message: 'Sub-user allowed carriers updated successfully.', subUser });
  } catch (error) {
    console.error('Error updating sub-user allowed carriers:', error);
    res.status(500).json({ error: 'Failed to update sub-user allowed carriers.' });
  }
});

//////////
router.post("/add-carrier", authMiddleware, async (req, res) => {
  try {
    const { userId, carrier } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Add carrier if it doesn't exist
    if (!user.allowedCarriers.some(c => c.carrier === carrier)) {
      user.allowedCarriers.push({ carrier, allowedVendors: [], status: false });
      await user.save();
      return res.json({ msg: "Carrier added successfully", user });
    } else {
      return res.status(400).json({ msg: "Carrier already exists" });
    }
  } catch (error) {
    res.status(500).json({ msg: "Server Error", error });
  }
});

// Add a vendor to a carrier (Admin Only)
router.post("/add-vendor", authMiddleware, async (req, res) => {
  try {
    const { userId, carrier, vendor } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Find the carrier and add the vendor
    const carrierObj = user.allowedCarriers.find(c => c.carrier === carrier);
    if (!carrierObj) return res.status(404).json({ msg: "Carrier not found" });

    if (!carrierObj.allowedVendors.includes(vendor)) {
      carrierObj.allowedVendors.push(vendor);
      await user.save();
      return res.json({ msg: "Vendor added successfully", user });
    } else {
      return res.status(400).json({ msg: "Vendor already exists" });
    }
  } catch (error) {
    res.status(500).json({ msg: "Server Error", error });
  }
});

// Update Carrier Status (Allow/Block) (Admin Only)
router.put("/update-carrier-status", authMiddleware, async (req, res) => {
  try {
    const { userId, carrier, status } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const carrierObj = user.allowedCarriers.find(c => c.carrier === carrier);
    if (!carrierObj) return res.status(404).json({ msg: "Carrier not found" });

    carrierObj.status = status;
    await user.save();

    return res.json({ msg: "Carrier status updated", user });
  } catch (error) {
    res.status(500).json({ msg: "Server Error", error });
  }
});

// Update Vendor Status (Allow/Block) (Admin Only)
router.put("/update-vendor-status", authMiddleware, async (req, res) => {
  try {
    const { userId, carrier, vendor, status } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const carrierObj = user.allowedCarriers.find(c => c.carrier === carrier);
    if (!carrierObj) return res.status(404).json({ msg: "Carrier not found" });

    // Check if vendor exists
    if (!carrierObj.allowedVendors.includes(vendor)) {
      return res.status(404).json({ msg: "Vendor not found" });
    }

    // Update vendor status (new way: keep a separate status for vendors if needed)
    carrierObj.allowedVendors = carrierObj.allowedVendors.map(v =>
      v === vendor ? { name: v, status } : v
    );

    await user.save();

    return res.json({ msg: "Vendor status updated", user });
  } catch (error) {
    res.status(500).json({ msg: "Server Error", error });
  }
});
router.get('/generate-tracking', async (req, res) => {
  try {
    const response = await axios.get('https://my.labelscheap.com/api/generate_tracking.php', {
      params: {
        user_name: 'sarim',
        api_key: '4ec5cdddf39363d957608a7927b6dc28be4211c9f5cc3e836cb12abb61054aca',
        class: 'ground_advantage',
        vendor: 'rollo',
        count: 1,

      }
    });

    // Log the response data (for debugging)
    console.log(response.data);

    // Send the response data back to the client
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching tracking number:', error.message);
    res.status(500).json({ error: 'Failed to fetch tracking number' });
  }
});


router.put('/:userId/rate', async (req, res) => {
  const { userId } = req.params; // Get the user ID from the URL
  const { rate } = req.body; // Get the new rate from the request body

  // Validate the rate
  if (typeof rate !== 'number' || rate < 0) {
    return res.status(400).json({ error: 'Invalid rate. Rate must be a non-negative number.' });
  }

  try {
    // Find the user by ID and update the rate
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { rate }, // Update the rate field
      { new: true } // Return the updated user
    );

    // Check if the user exists
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Return the updated user
    res.json({ message: 'Rate updated successfully.', user: updatedUser });
  } catch (error) {
    console.error('Error updating rate:', error);
    res.status(500).json({ error: 'Failed to update rate.' });
  }
});

/// dealer
router.put("/dealer/:dealerId/sub-users/:subUserId/rate", async (req, res) => {
  const { dealerId, subUserId } = req.params; // Get dealerId and subUserId from the URL
  const { rate } = req.body; // Get the new rate from the request body

  // Validate the rate
  if (typeof rate !== 'number' || rate < 0) {
    return res.status(400).json({ error: 'Invalid rate. Rate must be a non-negative number.' });
  }

  try {
    // Find the dealer by ID
    const dealer = await User.findById(dealerId);
    if (!dealer || !dealer.isDealer) {
      return res.status(403).json({ error: 'Unauthorized. Dealer not found.' });
    }

    // Find the sub-user within the dealer's sub-users list
    const subUser = dealer.subUsers.id(subUserId);
    if (!subUser) {
      return res.status(404).json({ error: 'Sub-user not found.' });
    }

    // Update the sub-user's rate
    subUser.rate = rate;

    // Save the dealer document with the updated sub-user
    await dealer.save();

    // Return the updated sub-user
    res.json({ message: 'Sub-user rate updated successfully.', subUser });
  } catch (error) {
    console.error('Error updating sub-user rate:', error);
    res.status(500).json({ error: 'Failed to update sub-user rate.' });
  }
});



///get data from nameCheap
router.post('/get/vtno', async (req, res) => {
  const { vendor, labelType } = req.body;

  try {
    // Make request to the external API
    const apiResponse = await axios.get(
      `https://my.labelscheap.com/api/generate_tracking.php`,
      {
        params: {
          user_name: 'sarim',
          api_key: '4ec5cdddf39363d957608a7927b6dc28be4211c9f5cc3e836cb12abb61054aca',
          vendor: vendor,
          class: labelType,
          count: 1,
        },
      }
    );

    if (!apiResponse.data.tracking_numbers) {
      throw new Error('No tracking numbers returned from the API');
    }

    // Return the tracking number to the frontend
    res.status(200).json({
      trackingNumber: apiResponse.data.tracking_numbers[0],
    });
  } catch (error) {
    console.error('Error fetching tracking number:', error.message);
    res.status(500).json({ error: 'Failed to fetch tracking number' });
  }
});



router.get('/set/barcode', async (req, res) => {
  try {
    const { zip, tracking } = req.query;

    // Make request to external API
    const barcodeResponse = await axios.get(
      `https://my.labelscheap.com/api/barcodev2.php`,
      {
        params: {
          user_name: 'sarim',
          api_key: '4ec5cdddf39363d957608a7927b6dc28be4211c9f5cc3e836cb12abb61054aca',
          f: 'png',
          s: 'ean-128',
          zip: zip,
          tracking: tracking,
          sf: 3,
          ms: 'r',
          md: 0.8,
        },
      }
    );

    // Forward the response to the client
    res.json(barcodeResponse.data);
  } catch (error) {
    console.error('Error fetching barcode:', error.message);
    res.status(500).json({ error: 'Failed to fetch barcode' });
  }
});
///
router.post('/senders/:userId', async (req, res) => {
  let senderData = req.body;

  if (!Array.isArray(senderData)) {
    return res.status(400).json({ message: 'Invalid data format. Expected an array.' });
  }

  const requestedUserId = req.params.userId;

  try {
    // Ensure the user exists
    const user = await User.findById(requestedUserId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const { vendor, labelType } = senderData[0]; // assume same for all
    const count = senderData.length;

    // Step 1: Call tracking API once to generate tracking numbers
    const trackingRes = await axios.get(`https://my.labelscheap.com/api/generate_tracking.php`, {
      params: {
        user_name: 'sarim',
        api_key: '4ec5cdddf39363d957608a7927b6dc28be4211c9f5cc3e836cb12abb61054aca',
        vendor,
        class: labelType,
        count,
      },
    });

    const trackingNumbers = trackingRes.data.tracking_numbers;
    console.log(trackingRes, "trackingRes")
    if (!Array.isArray(trackingNumbers) || trackingNumbers.length !== count) {
      return res.status(500).json({ message: 'Mismatch in tracking numbers received.' });
    }

    // Step 2: For each sender, assign tracking number and barcode
    const updatedSenderData = [];

    for (let index = 0; index < senderData.length; index++) {
      const item = senderData[index];
      const tracking = trackingNumbers[index];
      const zip = item.senderZip;

      try {
        const barcodeRes = await axios.get(`https://my.labelscheap.com/api/barcodev2.php`, {
          params: {
            user_name: 'sarim',
            api_key: '4ec5cdddf39363d957608a7927b6dc28be4211c9f5cc3e836cb12abb61054aca',
            f: 'png',
            s: 'ean-128',
            zip,
            tracking,
            sf: 3,
            ms: 'r',
            md: 0.8,
          },
        });

        const barcode = barcodeRes.data.barcode_data_url;
        // console.log(barcode, "barcode");

        if (!barcode) {
          throw new Error(`Barcode not generated for tracking number ${zip}, ${tracking}`);
        }

        updatedSenderData.push({
          ...item,
          vendor,
          labelType,
          trackingNumber: tracking,
          barcode,
        });
      } catch (barcodeErr) {
        throw new Error(`Barcode generation failed for tracking number ${tracking}: ${barcodeErr.message}`);
      }
    }

    senderData = updatedSenderData;


    // Step 3: Update user's balance and label count
    const totalCost = user.rate * count;
    user.availableBalance -= totalCost;
    user.totalGeneratedLabels += count;

    await user.save();

    // Step 4: Add the bulk label history for the user
    const formattedLabels = senderData.map(label => ({
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
      barcodeImg: label.barcode,
      generatedAt: new Date(),
    }));

    const bulkUpdate = {
      updateOne: {
        filter: { _id: requestedUserId },
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

    // Step 5: Respond with success
    res.status(200).json({
      message: 'Sender data processed, user updated, and bulk label history added.',
      count: senderData.length,

      modifiedCount: bulkResult.modifiedCount,
      user: {
        availableBalance: user.availableBalance,
        totalGeneratedLabels: user.totalGeneratedLabels,
      },
      data: senderData,
    });
  } catch (error) {
    console.error('Processing error:', error.message);
    res.status(500).json({ message: 'Something went wrong.', error: error.message });
  }
});
//
router.post('/senders/dealer/:dealerId/sub-user/:subUserId', async (req, res) => {
  let senderData = req.body;

  if (!Array.isArray(senderData)) {
    return res.status(400).json({ message: 'Invalid data format. Expected an array.' });
  }

  const { dealerId, subUserId } = req.params;

  try {
    // Find dealer
    const dealer = await User.findById(dealerId);
    if (!dealer || !dealer.isDealer) {
      return res.status(403).json({ message: 'Unauthorized dealer access' });
    }

    // Find sub-user
    const subUser = dealer.subUsers.id(subUserId);
    if (!subUser) {
      return res.status(404).json({ message: 'Sub-user not found under this dealer' });
    }

    const { vendor, labelType } = senderData[0]; // assume same for all
    const count = senderData.length;

    // Generate tracking numbers
    const trackingRes = await axios.get(`https://my.labelscheap.com/api/generate_tracking.php`, {
      params: {
        user_name: 'sarim',
        api_key: '4ec5cdddf39363d957608a7927b6dc28be4211c9f5cc3e836cb12abb61054aca',
        vendor,
        class: labelType,
        count,
      },
    });

    const trackingNumbers = trackingRes.data.tracking_numbers;
    if (!Array.isArray(trackingNumbers) || trackingNumbers.length !== count) {
      return res.status(500).json({ message: 'Mismatch in tracking numbers received.' });
    }

    // Assign barcodes
    const updatedSenderData = [];
    for (let i = 0; i < senderData.length; i++) {
      const item = senderData[i];
      const tracking = trackingNumbers[i];
      const zip = item.senderZip;

      try {
        const barcodeRes = await axios.get(`https://my.labelscheap.com/api/barcodev2.php`, {
          params: {
            user_name: 'sarim',
            api_key: '4ec5cdddf39363d957608a7927b6dc28be4211c9f5cc3e836cb12abb61054aca',
            f: 'png',
            s: 'ean-128',
            zip,
            tracking,
            sf: 3,
            ms: 'r',
            md: 0.8,
          },
        });

        const barcode = barcodeRes.data.barcode_data_url;
        if (!barcode) throw new Error(`Barcode not generated for tracking ${tracking}`);

        updatedSenderData.push({
          ...item,
          vendor,
          labelType,
          trackingNumber: tracking,
          barcode,
        });

      } catch (barcodeErr) {
        throw new Error(`Barcode generation failed for ${tracking}: ${barcodeErr.message}`);
      }
    }

    // Update balance & labels
    const totalCost = subUser.rate * count;
    if (subUser.availableBalance < totalCost) {
      return res.status(400).json({ message: 'Insufficient balance to generate labels' });
    }

    subUser.availableBalance -= totalCost;
    subUser.totalGeneratedLabels = (subUser.totalGeneratedLabels || 0) + count;

    // Add to bulk history
    const formattedLabels = updatedSenderData.map(label => ({
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
      barcodeImg: label.barcode,
      generatedAt: new Date(),
    }));

    subUser.bulkLabelHistory.push({
      labels: formattedLabels,
      generatedAt: new Date(),
    });

    await dealer.save();

    res.status(200).json({
      message: 'Sender data processed, sub-user updated, and bulk label history added.',
      count: updatedSenderData.length,
      user: {
        availableBalance: subUser.availableBalance,
        totalGeneratedLabels: subUser.totalGeneratedLabels,
      },
      data: updatedSenderData,
    });

  } catch (error) {
    console.error('Processing error:', error.message);
    res.status(500).json({ message: 'Something went wrong.', error: error.message });
  }
});

module.exports = router;


