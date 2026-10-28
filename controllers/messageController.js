const Message = require("../models/Message");
const User = require("../models/User");
const Story = require("../models/Story");
const Post = require("../models/Post");
const Reel = require("../models/Reel");

const populateMessage = (query) =>
  query
    .populate("sender", "username profileImage")
    .populate("receiver", "username profileImage")
    .populate("story", "image user")
    .populate("post", "image caption user")
    .populate({
      path: "reel",
      select: "video caption user",
      populate: { path: "user", select: "username profileImage" },
    });

const sendMessage = async (req, res) => {
  try {
    const { text } = req.body;
    const receiverId = req.params.id;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.userId.toString() === receiverId.toString()) {
      return res.status(400).json({ message: "You cannot message yourself" });
    }

    const message = await Message.create({
      sender: req.userId,
      receiver: receiverId,
      text: text.trim(),
    });

    const populatedMessage = await populateMessage(Message.findById(message._id));

    res.status(201).json({
      message: "Message sent successfully",
      data: populatedMessage,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to send message",
      error: error.message,
    });
  }
};

const sendStoryReply = async (req, res) => {
  try {
    const { text } = req.body;
    const storyId = req.params.id;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Reply cannot be empty" });
    }

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ message: "Story not found or has expired" });
    }

    if (story.expiresAt <= new Date()) {
      return res.status(400).json({ message: "This story has expired" });
    }

    if (story.user.toString() === req.userId.toString()) {
      return res.status(400).json({ message: "You cannot reply to your own story" });
    }

    const receiver = await User.findById(story.user);
    if (!receiver) {
      return res.status(404).json({ message: "Story owner not found" });
    }

    const message = await Message.create({
      sender: req.userId,
      receiver: story.user,
      text: text.trim(),
      story: story._id,
      storyImage: story.image,
    });

    const populatedMessage = await populateMessage(Message.findById(message._id));

    res.status(201).json({
      message: "Story reply sent successfully",
      data: populatedMessage,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to send story reply",
      error: error.message,
    });
  }
};

const sharePost = async (req, res) => {
  try {
    const { receiverId } = req.body;
    const postId = req.params.postId;

    if (!receiverId) {
      return res.status(400).json({ message: "Receiver is required" });
    }

    if (req.userId.toString() === receiverId.toString()) {
      return res.status(400).json({ message: "You cannot share a post with yourself" });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: "User not found" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const message = await Message.create({
      sender: req.userId,
      receiver: receiverId,
      text: "Shared a post",
      post: post._id,
      postImage: post.image,
      postCaption: post.caption || "",
    });

    const populatedMessage = await populateMessage(Message.findById(message._id));

    res.status(201).json({
      message: "Post shared successfully",
      data: populatedMessage,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to share post",
      error: error.message,
    });
  }
};

const shareReel = async (req, res) => {
  try {
    const { receiverId } = req.body;
    const reelId = req.params.reelId;

    if (!receiverId) {
      return res.status(400).json({ message: "Receiver is required" });
    }

    if (req.userId.toString() === receiverId.toString()) {
      return res.status(400).json({ message: "You cannot share a reel with yourself" });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: "User not found" });
    }

    const reel = await Reel.findById(reelId);
    if (!reel) {
      return res.status(404).json({ message: "Reel not found" });
    }

    const message = await Message.create({
      sender: req.userId,
      receiver: receiverId,
      text: "Shared a reel",
      reel: reel._id,
    });

    const populatedMessage = await populateMessage(Message.findById(message._id));

    res.status(201).json({
      message: "Reel shared successfully",
      data: populatedMessage,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to share reel",
      error: error.message,
    });
  }
};

const getConversation = async (req, res) => {
  try {
    const otherUserId = req.params.id;

    const otherUser = await User.findById(otherUserId).select("username profileImage");
    if (!otherUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const messages = await populateMessage(
      Message.find({
        $or: [
          { sender: req.userId, receiver: otherUserId },
          { sender: otherUserId, receiver: req.userId },
        ],
      }).sort({ createdAt: 1 })
    );

    await Message.updateMany(
      {
        sender: otherUserId,
        receiver: req.userId,
        read: false,
      },
      { $set: { read: true } }
    );

    res.status(200).json({ user: otherUser, messages });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get conversation",
      error: error.message,
    });
  }
};

const getConversations = async (req, res) => {
  try {
    const messages = await populateMessage(
      Message.find({
        $or: [{ sender: req.userId }, { receiver: req.userId }],
      }).sort({ createdAt: -1 })
    );

    const conversations = [];
    const seenUsers = new Set();

    for (const message of messages) {
      const otherUser =
        message.sender._id.toString() === req.userId.toString()
          ? message.receiver
          : message.sender;

      if (!otherUser) continue;

      const otherUserId = otherUser._id.toString();

      if (!seenUsers.has(otherUserId)) {
        seenUsers.add(otherUserId);

        const unreadCount = await Message.countDocuments({
          sender: otherUserId,
          receiver: req.userId,
          read: false,
        });

        conversations.push({
          user: otherUser,
          lastMessage: message,
          unreadCount,
        });
      }
    }

    res.status(200).json({ conversations });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get conversations",
      error: error.message,
    });
  }
};

module.exports = {
  sendMessage,
  sendStoryReply,
  sharePost,
  shareReel,
  getConversation,
  getConversations,
};