const Story = require("../models/Story");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

const uploadToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "instagram-clone/stories",
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    streamifier
      .createReadStream(file.buffer)
      .pipe(uploadStream);
  });
};

const createStory = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Please upload an image",
      });
    }

    const result = await uploadToCloudinary(req.file);

    const story = await Story.create({
      user: req.userId,
      image: result.secure_url,
      cloudinaryPublicId: result.public_id,
      expiresAt: new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ),
    });

    const populatedStory = await Story.findById(
      story._id
    ).populate(
      "user",
      "username profileImage"
    );

    res.status(201).json({
      message: "Story created successfully",
      story: populatedStory,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create story",
      error: error.message,
    });
  }
};

const getStories = async (req, res) => {
  try {
    const stories = await Story.find({
      expiresAt: {
        $gt: new Date(),
      },
    })
      .populate(
        "user",
        "username profileImage"
      )
      .populate(
        "viewers",
        "username profileImage"
      )
      .sort({ createdAt: 1 });

    const groupedStories = [];

    stories.forEach((story) => {
      const existingGroup =
        groupedStories.find(
          (group) =>
            group.user._id.toString() ===
            story.user._id.toString()
        );

      const storyData = {
        _id: story._id,
        user: story.user,
        image: story.image,
        expiresAt: story.expiresAt,
        createdAt: story.createdAt,
        viewers:
          story.user._id.toString() ===
          req.userId.toString()
            ? story.viewers
            : [],
      };

      if (existingGroup) {
        existingGroup.stories.push(
          storyData
        );
      } else {
        groupedStories.push({
          user: story.user,
          stories: [storyData],
        });
      }
    });

    res.status(200).json({
      stories: groupedStories,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get stories",
      error: error.message,
    });
  }
};

const viewStory = async (req, res) => {
  try {
    const story = await Story.findById(
      req.params.id
    );

    if (!story) {
      return res.status(404).json({
        message: "Story not found",
      });
    }

    if (story.expiresAt <= new Date()) {
      return res.status(404).json({
        message: "Story has expired",
      });
    }

    const alreadyViewed = story.viewers.some(
      (userId) =>
        userId.toString() ===
        req.userId.toString()
    );

    if (!alreadyViewed) {
      story.viewers.push(req.userId);

      await story.save();
    }

    res.status(200).json({
      message: "Story viewed successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to view story",
      error: error.message,
    });
  }
};

const deleteStory = async (req, res) => {
  try {
    const story = await Story.findById(
      req.params.id
    );

    if (!story) {
      return res.status(404).json({
        message: "Story not found",
      });
    }

    if (
      story.user.toString() !==
      req.userId.toString()
    ) {
      return res.status(403).json({
        message:
          "You can only delete your own story",
      });
    }

    await Story.findByIdAndDelete(
      req.params.id
    );

    if (story.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(
          story.cloudinaryPublicId,
          {
            resource_type: "image",
          }
        );
      } catch (cloudinaryError) {
        console.log(
          "Cloudinary image deletion failed:",
          cloudinaryError.message
        );
      }
    }

    res.status(200).json({
      message: "Story deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete story",
      error: error.message,
    });
  }
};

module.exports = {
  createStory,
  getStories,
  viewStory,
  deleteStory,
};