
const Post = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

const uploadToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "instagram-clone/posts", resource_type: "image" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
};

const canViewPost = async (post, userId) => {
  const ownerId = post.user?._id
    ? post.user._id.toString()
    : post.user.toString();

  if (ownerId === userId.toString()) return true;

  const owner = await User.findById(ownerId).select("isPrivate followers");
  if (!owner || !owner.isPrivate) return true;

  return owner.followers.some((id) => id.toString() === userId.toString());
};

const createPost = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Please upload an image" });
    }

    const result = await uploadToCloudinary(req.file);
    const post = await Post.create({
      user: req.userId,
      image: result.secure_url,
      caption: req.body.caption || "",
    });

    const populatedPost = await Post.findById(post._id).populate(
      "user",
      "username profileImage isPrivate"
    );

    res.status(201).json({
      message: "Post created successfully",
      post: populatedPost,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create post",
      error: error.message,
    });
  }
};

const getAllPosts = async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId).select("following");
    if (!currentUser) {
      return res.status(401).json({ message: "User not found" });
    }

    const followingIds = currentUser.following.map((id) => id.toString());

    const posts = await Post.find()
      .populate("user", "username profileImage isPrivate followers")
      .populate("comments.user", "username profileImage")
      .sort({ createdAt: -1 });

    const visiblePosts = posts.filter((post) => {
      if (!post.user) return false;
      if (!post.user.isPrivate) return true;

      const ownerId = post.user._id.toString();
      return (
        ownerId === req.userId.toString() ||
        followingIds.includes(ownerId)
      );
    });

    res.status(200).json({ posts: visiblePosts });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get posts",
      error: error.message,
    });
  }
};

const likePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (!(await canViewPost(post, req.userId))) {
      return res.status(403).json({ message: "This account is private" });
    }

    const alreadyLiked = post.likes.some(
      (id) => id.toString() === req.userId.toString()
    );

    if (alreadyLiked) {
      post.likes = post.likes.filter(
        (id) => id.toString() !== req.userId.toString()
      );
      await post.save();
      return res.status(200).json({ message: "Post unliked", likes: post.likes });
    }

    post.likes.push(req.userId);
    await post.save();

    if (post.user.toString() !== req.userId.toString()) {
      await Notification.create({
        recipient: post.user,
        sender: req.userId,
        type: "like",
        post: post._id,
      });
    }

    res.status(200).json({ message: "Post liked", likes: post.likes });
  } catch (error) {
    res.status(500).json({
      message: "Failed to like post",
      error: error.message,
    });
  }
};

const addComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Comment cannot be empty" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (!(await canViewPost(post, req.userId))) {
      return res.status(403).json({ message: "This account is private" });
    }

    post.comments.push({ user: req.userId, text: text.trim() });
    await post.save();

    const newComment = post.comments[post.comments.length - 1];

    if (post.user.toString() !== req.userId.toString()) {
      await Notification.create({
        recipient: post.user,
        sender: req.userId,
        type: "comment",
        post: post._id,
        comment: newComment._id,
      });
    }

    const updatedPost = await Post.findById(post._id)
      .populate("user", "username profileImage")
      .populate("comments.user", "username profileImage");

    res.status(201).json({
      message: "Comment added successfully",
      post: updatedPost,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to add comment",
      error: error.message,
    });
  }
};

const deleteComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    if (comment.user.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "You can only delete your own comment" });
    }

    comment.deleteOne();
    await post.save();

    res.status(200).json({ message: "Comment deleted successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete comment",
      error: error.message,
    });
  }
};

const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.user.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "You can only delete your own posts" });
    }

    await Post.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Post deleted successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete post",
      error: error.message,
    });
  }
};

module.exports = {
  createPost,
  getAllPosts,
  likePost,
  addComment,
  deleteComment,
  deletePost,
};