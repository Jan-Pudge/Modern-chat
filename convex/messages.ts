import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listMessages = query({
  args: { chatRoomId: v.id("chatRooms") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_chat_room", (q) => q.eq("chatRoomId", args.chatRoomId))
      .order("asc")
      .collect();
  },
});

export const getPaginatedMessages = query({
  args: {
    chatRoomId: v.id("chatRooms"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }

    const paginated = await ctx.db
      .query("messages")
      .withIndex("by_chat_room", (q) => q.eq("chatRoomId", args.chatRoomId))
      .order("desc")
      .paginate(args.paginationOpts);

    return paginated;
  },
});

export const sendMessage = mutation({
  args: {
    chatRoomId: v.id("chatRooms"),
    content: v.string(),
    replyToId: v.optional(v.id("messages")),
    replyToSender: v.optional(v.string()),
    replyToText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found: Користувача не знайдено");
    }

    const trimmedContent = args.content.trim();
    if (!trimmedContent) {
      throw new Error("Message content cannot be empty");
    }

    const messageId = await ctx.db.insert("messages", {
      chatRoomId: args.chatRoomId,
      senderId: userId,
      senderName: user.name ?? user.email ?? "Користувач",
      senderPhoto: user.image,
      content: trimmedContent,
      replyToId: args.replyToId,
      replyToSender: args.replyToSender,
      replyToText: args.replyToText,
    });

    await ctx.db.patch(args.chatRoomId, {
      lastMessage: `${user.name ?? "Користувач"}: ${trimmedContent}`,
      lastMessageAt: Date.now(),
    });

    return messageId;
  },
});

export const editMessage = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const message = await ctx.db.get(args.messageId);
    if (!message || message.senderId !== userId) throw new Error("Forbidden");

    const trimmedContent = args.content.trim();
    if (!trimmedContent) throw new Error("Повідомлення не може бути порожнім");

    await ctx.db.patch(args.messageId, {
      content: trimmedContent,
      isEdited: true,
    });

    const room = await ctx.db.get(message.chatRoomId);
    if (room && room.lastMessageAt === message._creationTime) {
      await ctx.db.patch(message.chatRoomId, {
        lastMessage: `${message.senderName}: ${trimmedContent}`,
      });
    }
  },
});

export const deleteMessage = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const message = await ctx.db.get(args.messageId);
    if (!message || message.senderId !== userId) throw new Error("Forbidden");

    if (message.storageId) {
      await ctx.storage.delete(message.storageId);
    }
    if (message.audioStorageId) {
      await ctx.storage.delete(message.audioStorageId);
    }
    if (message.videoStorageId) {
      await ctx.storage.delete(message.videoStorageId);
    }

    await ctx.db.delete(args.messageId);

    const lastRemaining = await ctx.db
      .query("messages")
      .withIndex("by_chat_room", (q) => q.eq("chatRoomId", message.chatRoomId))
      .order("desc")
      .first();

    await ctx.db.patch(message.chatRoomId, {
      lastMessage: lastRemaining
        ? `${lastRemaining.senderName}: ${lastRemaining.content ?? (lastRemaining.audioUrl ? "🎤 Голосове повідомлення" : lastRemaining.videoUrl ? "📹 Відеоповідомлення" : "📷 Фото")}`
        : "Повідомлень немає",
      lastMessageAt: lastRemaining?._creationTime ?? Date.now(),
    });
  },
});

export const sendMediaMessage = mutation({
  args: {
    chatRoomId: v.id("chatRooms"),
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
    replyToId: v.optional(v.id("messages")),
    replyToSender: v.optional(v.string()),
    replyToText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("Користувача не знайдено");
    }

    const imageUrl = await ctx.storage.getUrl(args.storageId);
    if (!imageUrl) {
      throw new Error("Не вдалося отримати посилання на збережений файл");
    }

    const messageId = await ctx.db.insert("messages", {
      chatRoomId: args.chatRoomId,
      senderId: userId,
      senderName: user.name ?? user.email ?? "Користувач",
      senderPhoto: user.image,
      content: args.caption?.trim() || undefined,
      imageUrl,
      storageId: args.storageId,
      replyToId: args.replyToId,
      replyToSender: args.replyToSender,
      replyToText: args.replyToText,
    });

    await ctx.db.patch(args.chatRoomId, {
      lastMessage: `${user.name ?? "Користувач"}: 📷 Фотографія`,
      lastMessageAt: Date.now(),
    });

    return messageId;
  },
});

export const generateUploadUrl = mutation(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Необхідно авторизуватися");
  }
  return await ctx.storage.generateUploadUrl();
});

export const sendAudioMessage = mutation({
  args: {
    chatRoomId: v.id("chatRooms"),
    audioStorageId: v.id("_storage"),
    audioDuration: v.number(),
    replyToId: v.optional(v.id("messages")),
    replyToSender: v.optional(v.string()),
    replyToText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Необхідно авторизуватися");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("Користувача не знайдено");
    }

    const audioUrl = await ctx.storage.getUrl(args.audioStorageId);
    if (!audioUrl) {
      throw new Error("Не вдалося отримати URL аудіофайлу");
    }

    const fallbackName = user.email?.split("@")[0] ?? "Користувач";

    const messageId = await ctx.db.insert("messages", {
      chatRoomId: args.chatRoomId,
      senderId: userId,
      senderName: user.name ?? fallbackName,
      senderPhoto: user.image ?? undefined,
      audioUrl,
      audioStorageId: args.audioStorageId,
      audioDuration: args.audioDuration,
      replyToId: args.replyToId,
      replyToSender: args.replyToSender,
      replyToText: args.replyToText,
    });

    await ctx.db.patch(args.chatRoomId, {
      lastMessage: "🎤 Голосове повідомлення",
      lastMessageAt: Date.now(),
    });

    return messageId;
  },
});

export const sendVideoNoteMessage = mutation({
  args: {
    chatRoomId: v.id("chatRooms"),
    videoStorageId: v.id("_storage"),
    videoDuration: v.number(),
    replyToId: v.optional(v.id("messages")),
    replyToSender: v.optional(v.string()),
    replyToText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Необхідно авторизуватися");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("Користувача не знайдено");
    }

    const videoUrl = await ctx.storage.getUrl(args.videoStorageId);
    if (!videoUrl) {
      throw new Error("Не вдалося отримати URL відеофайлу");
    }

    const fallbackName = user.email?.split("@")[0] ?? "Користувач";

    const messageId = await ctx.db.insert("messages", {
      chatRoomId: args.chatRoomId,
      senderId: userId,
      senderName: user.name ?? fallbackName,
      senderPhoto: user.image ?? undefined,
      videoUrl,
      videoStorageId: args.videoStorageId,
      videoDuration: args.videoDuration,
      isVideoNote: true,
      replyToId: args.replyToId,
      replyToSender: args.replyToSender,
      replyToText: args.replyToText,
    });

    await ctx.db.patch(args.chatRoomId, {
      lastMessage: "📹 Відеоповідомлення",
      lastMessageAt: Date.now(),
    });

    return messageId;
  },
});