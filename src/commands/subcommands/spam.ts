// src/commands/subcommands/spam.ts
import {
  IModify,
  IRead,
  IPersistence,
  IPersistenceRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { IAppInterface } from "../../interfaces/IAppInterface";
import { SpamDetectionService } from "../../services/SpamDetectionService";
import {
  SpamReviewPersistence,
  SpamReviewItem,
} from "../../persistence/SpamReviewPersistence";
import { sendNotification } from "../../helpers/message";
import { isUserHighHierarchy } from "../../helpers/message";
import { LayoutBlock } from "@rocket.chat/ui-kit";
import {
  getSectionBlock,
  getActionsBlock,
  getButton,
  getDividerBlock,
  getContextBlock,
} from "../../helpers/blockBuilder";

export async function handleSpamCommand(
  app: IAppInterface,
  read: IRead,
  modify: IModify,
  user: IUser,
  room: IRoom,
  persistence: IPersistence,
  args: string[]
): Promise<void> {
  // Check if user has admin permissions
  if (!isUserHighHierarchy(user)) {
    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message:
        "❌ **Access Denied**\n\nYou don't have permission to access spam review functionality. This feature is restricted to administrators.",
    });
    return;
  }

  const action = args[0]?.toLowerCase();
  const persistenceRead = read.getPersistenceReader();
  switch (action) {
    case "list":
    case undefined: // Default action
      await handleListSpamReviews(
        app,
        read,
        modify,
        user,
        room,
        persistence,
        persistenceRead
      );
      break;

    case "approve":
      await handleSpamAction(
        app,
        read,
        modify,
        user,
        room,
        persistence,
        persistenceRead,
        args[1],
        "approve"
      );
      break;

    case "reject":
      await handleSpamAction(
        app,
        read,
        modify,
        user,
        room,
        persistence,
        persistenceRead,
        args[1],
        "reject"
      );
      break;

    case "ignore":
      await handleSpamAction(
        app,
        read,
        modify,
        user,
        room,
        persistence,
        persistenceRead,
        args[1],
        "ignore"
      );
      break;

    case "help":
      await handleSpamHelp(modify, user, room);
      break;

    default:
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: `❌ **Unknown spam command:** \`${action}\`\n\nUse \`/code-review-agent spam help\` for available commands.`,
      });
      break;
  }
}

/**
 * List pending spam reviews
 */
async function handleListSpamReviews(
  app: IAppInterface,
  read: IRead,
  modify: IModify,
  user: IUser,
  room: IRoom,
  persistence: IPersistence,
  persistenceRead: IPersistenceRead
): Promise<void> {
  try {
    const spamService = app.getSpamDetectionService();
    const pendingReviews = await spamService.getPendingSpamReviews(
      persistenceRead
    );

    if (pendingReviews.length === 0) {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message:
          "✅ **No Pending Spam Reviews**\n\nAll PRs have been processed! No spam detections require admin attention.",
      });
      return;
    }

    const message = buildSpamListMessage(pendingReviews);
    const blocks = buildSpamListBlocks(pendingReviews);

    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: message,
      blocks: blocks,
    });
  } catch (error) {
    app.getLogger().error(`Failed to list spam reviews: ${error.message}`);
    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: `❌ **Error retrieving spam reviews:** ${error.message}`,
    });
  }
}

/**
 * Handle spam review actions (approve/reject/ignore)
 */
async function handleSpamAction(
  app: IAppInterface,
  read: IRead,
  modify: IModify,
  user: IUser,
  room: IRoom,
  persistence: IPersistence,
  persistenceRead: IPersistenceRead,
  prId: string,
  action: "approve" | "reject" | "ignore"
): Promise<void> {
  if (!prId) {
    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: `❌ **Missing PR ID**\n\nUsage: \`/code-review-agent spam ${action} <pr_id>\``,
    });
    return;
  }

  try {
    const spamService = app.getSpamDetectionService();

    // Verify the PR exists in pending reviews
    const spamItem = await SpamReviewPersistence.getSpamReviewItem(
      prId,
      persistenceRead
    );

    if (!spamItem) {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: `❌ **PR not found**\n\nNo pending spam review found for PR ID: \`${prId}\``,
      });
      return;
    }

    if (spamItem.status !== "pending") {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: `❌ **PR already reviewed**\n\nPR #${
          spamItem.prNumber
        } was already ${spamItem.status} by ${
          spamItem.reviewedBy || "unknown"
        }`,
      });
      return;
    }

    // Perform the action
    await spamService.reviewSpamItem(
      prId,
      action,
      user.id,
      persistence,
      persistenceRead
    );

    const actionMessages = {
      approve: "✅ **PR Approved**",
      reject: "❌ **PR Rejected as Spam**",
      ignore: "🔇 **PR Ignored**",
    };

    const actionDescriptions = {
      approve:
        "The PR has been marked as legitimate and will proceed to reviewer assignment.",
      reject:
        "The PR has been confirmed as spam and will be flagged accordingly.",
      ignore:
        "The PR has been marked to ignore - no further action will be taken.",
    };

    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: `${actionMessages[action]}

**Repository:** ${spamItem.repoName}
**PR #${spamItem.prNumber}:** ${spamItem.title}
**Author:** @${spamItem.author}

${actionDescriptions[action]}

**View PR:** https://github.com/${spamItem.repoName}/pull/${spamItem.prNumber}`,
    });

    app
      .getLogger()
      .info(`Admin ${user.username} ${action}ed spam review for PR ${prId}`);
  } catch (error) {
    app
      .getLogger()
      .error(`Failed to ${action} spam review ${prId}: ${error.message}`);
    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: `❌ **Error processing spam ${action}:** ${error.message}`,
    });
  }
}

/**
 * Show spam command help
 */
async function handleSpamHelp(
  modify: IModify,
  user: IUser,
  room: IRoom
): Promise<void> {
  const helpMessage = `🔍 **Spam Review Commands**

**List pending reviews:**
\`/code-review-agent spam\` or \`/code-review-agent spam list\`

**Review specific PR:**
\`/code-review-agent spam approve <pr_id>\` - Mark PR as legitimate
\`/code-review-agent spam reject <pr_id>\` - Confirm PR as spam
\`/code-review-agent spam ignore <pr_id>\` - Ignore the PR

**Get help:**
\`/code-review-agent spam help\`

**Example:**
\`/code-review-agent spam approve 123456789\`

PRs marked as approved will proceed to normal reviewer assignment. Rejected PRs are flagged as spam. Ignored PRs receive no further processing.`;

  await sendNotification({
    modify: modify,
    user: user,
    room: room,
    message: helpMessage,
  });
}

/**
 * Build message for spam list
 */
function buildSpamListMessage(pendingReviews: SpamReviewItem[]): string {
  const count = pendingReviews.length;
  const header = `🚨 **${count} Pending Spam Review${
    count === 1 ? "" : "s"
  }**\n\n`;

  const reviews = pendingReviews
    .slice(0, 10)
    .map((item, index) => {
      const flags =
        item.flags.length > 0 ? ` | Flags: ${item.flags.join(", ")}` : "";
      return `**${index + 1}.** PR #${item.prNumber} in ${item.repoName}
   📝 ${item.title}
   👤 @${item.author} | 🎯 Score: ${item.spamScore}/100${flags}
   🔗 https://github.com/${item.repoName}/pull/${item.prNumber}
   📋 **ID:** \`${item.prId}\``;
    })
    .join("\n\n");

  const footer =
    count > 10 ? `\n\n*Showing first 10 of ${count} pending reviews*` : "";

  return (
    header +
    reviews +
    footer +
    "\n\n*Use the action buttons below or commands to review these PRs.*"
  );
}

/**
 * Build interactive blocks for spam list
 */
function buildSpamListBlocks(pendingReviews: SpamReviewItem[]): LayoutBlock[] {
  const blocks: LayoutBlock[] = [
    getSectionBlock(
      `🚨 **${pendingReviews.length} Pending Spam Review${
        pendingReviews.length === 1 ? "" : "s"
      }**`
    ),
  ];

  // Show first 5 items with action buttons
  const itemsToShow = pendingReviews.slice(0, 5);

  itemsToShow.forEach((item, index) => {
    const flags =
      item.flags.length > 0 ? `\n🏷️ **Flags:** ${item.flags.join(", ")}` : "";

    blocks.push(
      getSectionBlock(
        `**${index + 1}. PR #${item.prNumber}** - ${item.title}\n` +
          `📁 ${item.repoName} | 👤 @${item.author}\n` +
          `🎯 **Spam Score:** ${item.spamScore}/100${flags}\n` +
          `🆔 **ID:** \`${item.prId}\``,
        getButton({
          labelText: "View PR",
          actionId: `view_pr_${item.prId}`,
          url: `https://github.com/${item.repoName}/pull/${item.prNumber}`,
        })
      ),

      getActionsBlock(`spam_actions_${item.prId}`, [
        getButton({
          labelText: "✅ Approve",
          actionId: `approve_spam_${item.prId}`,
          value: `approve_${item.prId}`,
          style: "primary",
        }),
        getButton({
          labelText: "❌ Reject",
          actionId: `reject_spam_${item.prId}`,
          value: `reject_${item.prId}`,
          style: "danger",
        }),
        getButton({
          labelText: "🔇 Ignore",
          actionId: `ignore_spam_${item.prId}`,
          value: `ignore_${item.prId}`,
        }),
      ])
    );

    if (index < itemsToShow.length - 1) {
      blocks.push(getDividerBlock());
    }
  });

  if (pendingReviews.length > 5) {
    blocks.push(
      getContextBlock(
        `*Showing first 5 of ${pendingReviews.length} pending reviews. Use \`/code-review-agent spam list\` to see all.*`
      )
    );
  }

  return blocks;
}
