import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const TYPING_TIMEOUT_MS = 3000;

export const setTyping = mutation({
  args: { chatRoomId: v.id("chatRooms") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const user = await ctx.db.get(userId);
    if (!user) return;

    const existing = await ctx.db
      .query("typingIndicators")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", userId).eq("chatRoomId", args.chatRoomId)
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { lastTypedAt: now });
    } else {
      await ctx.db.insert("typingIndicators", {
        chatRoomId: args.chatRoomId,
        userId,
        userName: user.name ?? user.email ?? "Співрозмовник",
        lastTypedAt: now,
      });
    }
  },
});

export const getTypingUsers = query({
  args: { chatRoomId: v.id("chatRooms") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const threshold = Date.now() - TYPING_TIMEOUT_MS;

    const indicators = await ctx.db
      .query("typingIndicators")
      .withIndex("by_room", (q) => q.eq("chatRoomId", args.chatRoomId))
      .filter((q) => q.gt(q.field("lastTypedAt"), threshold))
      .collect();

    return indicators
      .filter((ind) => ind.userId !== userId)
      .map((ind) => ind.userName);
  },
});