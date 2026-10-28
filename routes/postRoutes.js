const express = require("express");

const {
  createPost,
  getAllPosts,
  likePost,
  addComment,
  deleteComment,
  deletePost,
} = require("../controllers/postController");

const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

router.post(
  "/",
  protect,
  upload.single("image"),
  createPost
);

router.get("/", protect, getAllPosts);

router.put("/:id/like", protect, likePost);

router.post("/:id/comments", protect, addComment);

router.delete(
  "/:id/comments/:commentId",
  protect,
  deleteComment
);

router.delete("/:id", protect, deletePost);

module.exports = router;