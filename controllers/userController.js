
const User = require("../models/User");
const Notification = require("../models/Notification");
const Post = require("../models/Post");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

const uploadToCloudinary = (file) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "instagram-clone/profiles", resource_type: "image" },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("-password")
      .populate({
        path: "savedPosts",
        populate: { path: "user", select: "username profileImage" },
      });

    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: "Failed to get profile", error: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { username, bio, isPrivate } = req.body;
    if (!username?.trim()) {
      return res.status(400).json({ message: "Username is required" });
    }

    const trimmedUsername = username.trim();
    const existingUser = await User.findOne({
      username: trimmedUsername,
      _id: { $ne: req.userId },
    });

    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }

    user.username = trimmedUsername;
    user.bio = bio?.trim() || "";

    if (typeof isPrivate !== "undefined") {
      user.isPrivate = isPrivate === true || isPrivate === "true";
    }

    if (req.file) {
      const result = await uploadToCloudinary(req.file);
      user.profileImage = result.secure_url;
    }

    await user.save();
    const updatedUser = await User.findById(req.userId).select("-password");

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -followRequests")
      .populate("followers", "username profileImage")
      .populate("following", "username profileImage");

    if (!user) return res.status(404).json({ message: "User not found" });

    const isOwnProfile = user._id.toString() === req.userId.toString();
    const isFollowing = user.followers.some(
      (follower) => follower._id.toString() === req.userId.toString()
    );

    const hasRequestedFollow = !isOwnProfile && Boolean(
      await User.exists({ _id: user._id, followRequests: req.userId })
    );

    let pendingFollowRequests;
    if (isOwnProfile) {
      const owner = await User.findById(req.userId)
        .populate("followRequests", "username profileImage");
      pendingFollowRequests = owner?.followRequests || [];
    }

    res.status(200).json({
      user,
      isOwnProfile,
      isFollowing,
      hasRequestedFollow,
      canViewPosts: !user.isPrivate || isFollowing || isOwnProfile,
      pendingFollowRequests,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to get user", error: error.message });
  }
};

const searchUsers = async (req, res) => {
  try {
    const { username } = req.query;

    if (!username?.trim()) {
      return res.status(400).json({ message: "Please enter a username" });
    }

    const users = await User.find({
      username: { $regex: username.trim(), $options: "i" },
    })
      .select("username profileImage bio followers following isPrivate")
      .limit(20);

    res.status(200).json({ users });
  } catch (error) {
    res.status(500).json({ message: "Failed to search users", error: error.message });
  }
};

const followUser = async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);
    const targetUser = await User.findById(req.params.id);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (currentUser._id.equals(targetUser._id)) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    const currentId = currentUser._id.toString();
    const targetId = targetUser._id.toString();

    const isFollowing = currentUser.following.some(
      (id) => id.toString() === targetId
    );

    const hasRequested = targetUser.followRequests.some(
      (id) => id.toString() === currentId
    );

    if (isFollowing) {
      currentUser.following.pull(targetUser._id);
      targetUser.followers.pull(currentUser._id);

      await Promise.all([currentUser.save(), targetUser.save()]);

      return res.status(200).json({
        message: "User unfollowed successfully",
        isFollowing: false,
        hasRequestedFollow: false,
      });
    }

    if (hasRequested) {
      targetUser.followRequests.pull(currentUser._id);
      await targetUser.save();

      await Notification.deleteMany({
        recipient: targetUser._id,
        sender: currentUser._id,
        type: "follow_request",
      });

      return res.status(200).json({
        message: "Follow request cancelled",
        isFollowing: false,
        hasRequestedFollow: false,
      });
    }

    if (targetUser.isPrivate) {
      targetUser.followRequests.addToSet(currentUser._id);
      await targetUser.save();

      await Notification.findOneAndUpdate(
        {
          recipient: targetUser._id,
          sender: currentUser._id,
          type: "follow_request",
        },
        {
          $set: { read: false },
          $setOnInsert: {
            recipient: targetUser._id,
            sender: currentUser._id,
            type: "follow_request",
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return res.status(200).json({
        message: "Follow request sent",
        isFollowing: false,
        hasRequestedFollow: true,
      });
    }

    currentUser.following.addToSet(targetUser._id);
    targetUser.followers.addToSet(currentUser._id);

    await Promise.all([currentUser.save(), targetUser.save()]);

    await Notification.create({
      recipient: targetUser._id,
      sender: currentUser._id,
      type: "follow",
    });

    res.status(200).json({
      message: "User followed successfully",
      isFollowing: true,
      hasRequestedFollow: false,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to follow user", error: error.message });
  }
};

const respondToFollowRequest = async (req, res) => {
  try {
    const { requesterId } = req.params;
    const { action } = req.body;

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ message: "Action must be accept or reject" });
    }

    const owner = await User.findById(req.userId);
    const requester = await User.findById(requesterId);

    if (!owner || !requester) {
      return res.status(404).json({ message: "User not found" });
    }

    const hasRequest = owner.followRequests.some(
      (id) => id.toString() === requester._id.toString()
    );

    if (!hasRequest) {
      return res.status(404).json({ message: "Follow request not found" });
    }

    owner.followRequests.pull(requester._id);

    if (action === "accept") {
      owner.followers.addToSet(requester._id);
      requester.following.addToSet(owner._id);
    }

    await Promise.all([owner.save(), requester.save()]);

    await Notification.deleteMany({
      recipient: owner._id,
      sender: requester._id,
      type: "follow_request",
    });

    res.status(200).json({
      message: action === "accept"
        ? "Follow request accepted"
        : "Follow request rejected",
      action,
      requesterId: requester._id,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to respond to follow request",
      error: error.message,
    });
  }
};

const savePost = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const post = await Post.findById(req.params.id);

    if (!user || !post) {
      return res.status(404).json({ message: "User or post not found" });
    }

    const isSaved = user.savedPosts.some(
      (id) => id.toString() === post._id.toString()
    );

    if (isSaved) {
      user.savedPosts.pull(post._id);
      await user.save();

      return res.status(200).json({
        message: "Post removed from saved",
        saved: false,
      });
    }

    user.savedPosts.addToSet(post._id);
    await user.save();

    res.status(200).json({ message: "Post saved successfully", saved: true });
  } catch (error) {
    res.status(500).json({ message: "Failed to save post", error: error.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getUserById,
  searchUsers,
  followUser,
  respondToFollowRequest,
  savePost,
};