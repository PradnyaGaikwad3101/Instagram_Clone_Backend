const express = require("express");

const {
  createStory,
  getStories,
  viewStory,
  deleteStory,
} = require("../controllers/storyController");

const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

router.post(
  "/",
  protect,
  upload.single("image"),
  createStory
);

router.get("/", protect, getStories);

router.put("/:id/view", protect, viewStory);

router.delete("/:id", protect, deleteStory);

module.exports = router;