import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});

export const generateAvatarUploadUrl = mutation(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Unauthorized: Потрібна авторизація");
  }
  return await ctx.storage.generateUploadUrl();
});

export const updateUserProfile = mutation({
  args: {
    name: v.string(),
    username: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new Error("Ім'я користувача не може бути порожнім");
    }

    const patchData: Record<string, any> = {
      name: trimmedName,
      username: args.username?.trim().replace(/^@/, ""),
      bio: args.bio?.trim(),
    };

    if (args.avatarStorageId) {
      const imageUrl = await ctx.storage.getUrl(args.avatarStorageId);
      if (imageUrl) {
        patchData.image = imageUrl;
        patchData.avatarStorageId = args.avatarStorageId;
      }
    }

    await ctx.db.patch(userId, patchData);
    return { success: true };
  },
});

export const getUserProfile = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const userMessages = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("senderId"), args.userId))
      .collect();

    const createdRooms = await ctx.db
      .query("chatRooms")
      .filter((q) => q.eq(q.field("creatorId"), args.userId))
      .collect();

    return {
      _id: user._id,
      name: user.name ?? "Користувач",
      email: user.email,
      image: user.image,
      username: user.username,
      bio: user.bio,
      _creationTime: user._creationTime,
      stats: {
        messagesCount: userMessages.length,
        roomsCreatedCount: createdRooms.length,
      },
    };
  },
});