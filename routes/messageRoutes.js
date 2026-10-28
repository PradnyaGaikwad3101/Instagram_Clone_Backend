const express = require("express");

const {
  sendMessage,
  sendStoryReply,
  sharePost,
  shareReel,
  getConversation,
  getConversations,
} = require("../controllers/messageController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getConversations);

router.get("/:id", protect, getConversation);

router.post("/story/:id", protect, sendStoryReply);

router.post("/post/:postId", protect, sharePost);

router.post("/reel/:reelId", protect, shareReel);

router.post("/:id", protect, sendMessage);

module.exports = router;