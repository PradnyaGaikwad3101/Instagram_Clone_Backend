const express = require("express");
const router = express.Router();

const {
  createReel,
  getReels,
  getSavedReels,
  toggleReelLike,
  toggleSaveReel,
  addReelComment,
  deleteReelComment,
} = require("../controllers/reelController");

const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

router.post("/", protect, upload.single("video"), createReel);

router.get("/", protect, getReels);
router.get("/saved", protect, getSavedReels);

router.put("/:id/like", protect, toggleReelLike);
router.put("/:id/save", protect, toggleSaveReel);

router.post("/:id/comments", protect, addReelComment);
router.delete("/:id/comments/:commentId", protect, deleteReelComment);

module.exports = router;