const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";

// ✅ Middleware to Authenticate Admin
module.exports = function (req, res, next) {
    const token = req.header("Authorization")?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ msg: "Access Denied" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== "admin") {
            return res.status(403).json({ msg: "Not authorized as admin" });
        }
        req.admin = decoded;
        next();
    } catch (error) {
        res.status(401).json({ msg: "Invalid Token" });
    }
};
