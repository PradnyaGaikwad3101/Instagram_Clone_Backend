const Reel = require("../models/Reel");
const Notification = require("../models/Notification");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

const uploadVideoToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "instagram-clone/reels",
        resource_type: "video",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });

const createReel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Please select a video." });
    }

    if (!req.file.mimetype.startsWith("video/")) {
      return res.status(400).json({ message: "Please upload a valid video." });
    }

    const result = await uploadVideoToCloudinary(req.file.buffer);

    const reel = await Reel.create({
      user: req.userId,
      video: result.secure_url,
      caption: req.body.caption?.trim() || "",
    });

    await reel.populate("user", "username profileImage");

    return res.status(201).json({
      message: "Reel uploaded successfully.",
      reel,
    });
  } catch (error) {
    console.error("Create reel error:", error);
    return res.status(500).json({ message: "Failed to upload reel." });
  }
};

const getReels = async (req, res) => {
  try {
    const reels = await Reel.find()
      .populate("user", "username profileImage")
      .populate("likes", "username profileImage")
      .populate("savedBy", "username profileImage")
      .populate("comments.user", "username profileImage")
      .sort({ createdAt: -1 });

    return res.status(200).json({ reels });
  } catch (error) {
    console.error("Get reels error:", error);
    return res.status(500).json({ message: "Failed to fetch reels." });
  }
};

const getSavedReels = async (req, res) => {
  try {
    const reels = await Reel.find({ savedBy: req.userId })
      .populate("user", "username profileImage")
      .populate("likes", "username profileImage")
      .populate("savedBy", "username profileImage")
      .populate("comments.user", "username profileImage")
      .sort({ createdAt: -1 });

    return res.status(200).json({ reels });
  } catch (error) {
    console.error("Get saved reels error:", error);
    return res.status(500).json({
      message: "Failed to fetch saved reels.",
    });
  }
};

const toggleReelLike = async (req, res) => {
  try {
    const reel = await Reel.findById(req.params.id);

    if (!reel) {
      return res.status(404).json({ message: "Reel not found." });
    }

    const userId = String(req.userId);
    const alreadyLiked = reel.likes.some(
      (id) => String(id) === userId
    );

    if (alreadyLiked) {
      reel.likes.pull(req.userId);
    } else {
      reel.likes.addToSet(req.userId);

      if (String(reel.user) !== userId) {
        await Notification.create({
          recipient: reel.user,
          sender: req.userId,
          type: "like",
        });
      }
    }

    await reel.save();
    await reel.populate("user", "username profileImage");
    await reel.populate("likes", "username profileImage");
    await reel.populate("savedBy", "username profileImage");
    await reel.populate("comments.user", "username profileImage");

    return res.status(200).json({ reel });
  } catch (error) {
    console.error("Toggle reel like error:", error);
    return res.status(500).json({ message: "Failed to update reel like." });
  }
};

const toggleSaveReel = async (req, res) => {
  try {
    const reel = await Reel.findById(req.params.id);

    if (!reel) {
      return res.status(404).json({ message: "Reel not found." });
    }

    const userId = String(req.userId);
    const alreadySaved = reel.savedBy.some(
      (id) => String(id) === userId
    );

    if (alreadySaved) {
      reel.savedBy.pull(req.userId);
    } else {
      reel.savedBy.addToSet(req.userId);
    }

    await reel.save();

    return res.status(200).json({
      message: alreadySaved
        ? "Reel removed from saved items."
        : "Reel saved successfully.",
      isSaved: !alreadySaved,
      reelId: reel._id,
    });
  } catch (error) {
    console.error("Toggle save reel error:", error);
    return res.status(500).json({ message: "Failed to save reel." });
  }
};

const addReelComment = async (req, res) => {
  try {
    const text = req.body.text?.trim();

    if (!text) {
      return res.status(400).json({ message: "Comment cannot be empty." });
    }

    if (text.length > 1000) {
      return res.status(400).json({
        message: "Comment cannot exceed 1000 characters.",
      });
    }

    const reel = await Reel.findById(req.params.id);

    if (!reel) {
      return res.status(404).json({ message: "Reel not found." });
    }

    reel.comments.push({
      user: req.userId,
      text,
    });

    await reel.save();
    await reel.populate("comments.user", "username profileImage");

    return res.status(201).json({
      message: "Comment added successfully.",
      comments: reel.comments,
    });
  } catch (error) {
    console.error("Add reel comment error:", error);
    return res.status(500).json({ message: "Failed to add comment." });
  }
};

const deleteReelComment = async (req, res) => {
  try {
    const reel = await Reel.findById(req.params.id);

    if (!reel) {
      return res.status(404).json({ message: "Reel not found." });
    }

    const comment = reel.comments.id(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found." });
    }

    if (String(comment.user) !== String(req.userId)) {
      return res.status(403).json({
        message: "You can only delete your own comments.",
      });
    }

    comment.deleteOne();
    await reel.save();
    await reel.populate("comments.user", "username profileImage");

    return res.status(200).json({
      message: "Comment deleted successfully.",
      comments: reel.comments,
    });
  } catch (error) {
    console.error("Delete reel comment error:", error);
    return res.status(500).json({ message: "Failed to delete comment." });
  }
};

module.exports = {
  createReel,
  getReels,
  getSavedReels,
  toggleReelLike,
  toggleSaveReel,
  addReelComment,
  deleteReelComment,
};