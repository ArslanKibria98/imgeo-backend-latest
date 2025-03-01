const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "mysecret";

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ msg: "Access denied. No token provided." });
    }

    const token = authHeader.split(" ")[1]; // Extract token after "Bearer "

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== "admin") {
            return res.status(403).json({ msg: "Access forbidden: Admins only." });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ msg: "Invalid or expired token" });
    }
};

module.exports = authMiddleware;
