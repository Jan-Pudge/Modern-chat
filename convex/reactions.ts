import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const toggleReaction = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Необхідно авторизуватися");
    }

    const existing = await ctx.db
      .query("messageReactions")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", userId)
      )
      .filter((q) => q.eq(q.field("emoji"), args.emoji))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { action: "removed", emoji: args.emoji };
    } else {
      await ctx.db.insert("messageReactions", {
        messageId: args.messageId,
        userId,
        emoji: args.emoji,
        createdAt: Date.now(),
      });
      return { action: "added", emoji: args.emoji };
    }
  },
});

export const getMessageReactions = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    const rawReactions = await ctx.db
      .query("messageReactions")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect();

    const map = new Map<
      string,
      { emoji: string; count: number; hasReacted: boolean }
    >();

    for (const r of rawReactions) {
      const item = map.get(r.emoji) || {
        emoji: r.emoji,
        count: 0,
        hasReacted: false,
      };
      item.count += 1;
      if (userId && r.userId === userId) {
        item.hasReacted = true;
      }
      map.set(r.emoji, item);
    }

    return Array.from(map.values());
  },
});