
const express = require("express");

const {
  getProfile,
  updateProfile,
  getUserById,
  searchUsers,
  followUser,
  respondToFollowRequest,
  savePost,
} = require("../controllers/userController");

const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

router.get("/profile", protect, getProfile);

router.put(
  "/profile",
  protect,
  upload.single("profileImage"),
  updateProfile
);

router.get("/search", protect, searchUsers);

router.put("/follow-requests/:requesterId", protect, respondToFollowRequest);

router.put("/:id/follow", protect, followUser);

router.put("/:id/save", protect, savePost);

router.get("/:id", protect, getUserById);

module.exports = router;