// src/commands/subcommands/username.ts
import {
  IModify,
  IRead,
  IPersistence,
  IPersistenceRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { IAppInterface } from "../../interfaces/IAppInterface";
import { 
  PendingUserMappingPersistence, 
  PendingUserMapping 
} from "../../persistence/PendingUserMappingPersistence";
import { UserMappingPersistence, UserMapping } from "../../persistence/UserMappingPersistence";
import { sendNotification, sendDirectMessage } from "../../helpers/message";
import { isUserHighHierarchy } from "../../helpers/message";
import { LayoutBlock } from "@rocket.chat/ui-kit";
import {
  getSectionBlock,
  getActionsBlock,
  getButton,
  getDividerBlock,
  getContextBlock,
} from "../../helpers/blockBuilder";

export async function handleUsernameCommand(
  app: IAppInterface,
  read: IRead,
  modify: IModify,
  user: IUser,
  room: IRoom,
  persistence: IPersistence,
  args: string[]
): Promise<void> {
  const action = args[0]?.toLowerCase();
  const persistenceRead = read.getPersistenceReader();

  switch (action) {
    case "list":
      await handleListPendingMappings(
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
      await handleMappingAction(
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
      await handleMappingAction(
        app,
        read,
        modify,
        user,
        room,
        persistence,
        persistenceRead,
        args[1],
        "reject",
        args.slice(2).join(" ") // rejection reason
      );
      break;

    case "help":
      await handleUsernameHelp(modify, user, room);
      break;

    case undefined:
      if (!isUserHighHierarchy(user)) {
        await sendNotification({
          modify: modify,
          user: user,
          room: room,
          message: "❌ **Missing GitHub username**\n\nUsage: `/code-review-agent username <github-username>`",
        });
        return;
      }
      // Default action for admins is list
      await handleListPendingMappings(
        app,
        read,
        modify,
        user,
        room,
        persistence,
        persistenceRead
      );
      break;

    default:
      // Treat as GitHub username submission
      await handleUsernameSubmission(
        app,
        read,
        modify,
        user,
        room,
        persistence,
        persistenceRead,
        action // The "action" is actually the GitHub username
      );
      break;
  }
}

/**
 * Handle user submission of GitHub username
 */
async function handleUsernameSubmission(
  app: IAppInterface,
  read: IRead,
  modify: IModify,
  user: IUser,
  room: IRoom,
  persistence: IPersistence,
  persistenceRead: IPersistenceRead,
  githubUsername: string
): Promise<void> {
  try {
    // Validate GitHub username format
    if (!githubUsername || !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(githubUsername)) {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: "❌ **Invalid GitHub username format**\n\nGitHub usernames can only contain alphanumeric characters and hyphens, and cannot start or end with a hyphen.",
      });
      return;
    }

    // Check if user already has a mapping
    const existingMapping = await UserMappingPersistence.getUserMapping(user.id, persistenceRead);
    if (existingMapping) {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: `❌ **Already mapped**\n\nYour RocketChat account is already linked to GitHub user @${existingMapping.githubUsername}.\n\nTo change this mapping, please contact an administrator.`,
      });
      return;
    }

    // Check if user already has a pending request
    const existingPendingMapping = await PendingUserMappingPersistence.getPendingUserMappingByRocketChatUserId(user.id, persistenceRead);
    if (existingPendingMapping) {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: `⏳ **Request already pending**\n\nYou already have a pending mapping request for GitHub user @${existingPendingMapping.githubUsername}.\n\nPlease wait for admin review before submitting a new request.`,
      });
      return;
    }

    // Check if GitHub username is already mapped to another user
    const existingGithubMapping = await UserMappingPersistence.getUserMappingByGithubUsername(githubUsername, persistenceRead);
    if (existingGithubMapping) {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: `❌ **GitHub username already mapped**\n\nThe GitHub username @${githubUsername} is already linked to another RocketChat user.\n\nIf you believe this is an error, please contact an administrator.`,
      });
      return;
    }

    // Check if GitHub username has a pending request
    const existingPendingGithubMapping = await PendingUserMappingPersistence.getPendingUserMappingByGithubUsername(githubUsername, persistenceRead);
    if (existingPendingGithubMapping) {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: `❌ **GitHub username has pending request**\n\nThe GitHub username @${githubUsername} already has a pending mapping request.\n\nPlease choose a different username or wait for the existing request to be processed.`,
      });
      return;
    }

    // Fetch GitHub user data
    const githubService = app.getGitHubService();
    let githubUserData;
    try {
      githubUserData = await githubService.getUserInfo(githubUsername);
    } catch (error) {
      if (error.message.includes('404')) {
        await sendNotification({
          modify: modify,
          user: user,
          room: room,
          message: `❌ **GitHub user not found**\n\nThe GitHub username @${githubUsername} does not exist.\n\nPlease check the spelling and try again.`,
        });
        return;
      }
      throw error;
    }

    // Create pending mapping request
    const pendingMapping: PendingUserMapping = {
      id: `${user.id}_${Date.now()}`,
      rocketchatUserId: user.id,
      rocketchatUsername: user.username,
      githubUsername: githubUserData.login,
      githubUserId: githubUserData.id,
      githubMetadata: {
        name: githubUserData.name,
        company: githubUserData.company,
        location: githubUserData.location,
        bio: githubUserData.bio,
        publicRepos: githubUserData.public_repos,
        followers: githubUserData.followers,
        following: githubUserData.following,
        createdAt: githubUserData.created_at,
        avatarUrl: githubUserData.avatar_url,
        htmlUrl: githubUserData.html_url,
      },
      status: 'pending',
      requestedAt: new Date(),
    };

    await PendingUserMappingPersistence.savePendingUserMapping(pendingMapping, persistence);

    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: `✅ **Username mapping request submitted**\n\nYour request to link your RocketChat account with GitHub user @${githubUserData.login} has been submitted for admin review.\n\nYou'll be notified via direct message once your request is processed.`,
    });

    app.getLogger().info(`Username mapping request submitted: ${user.username} -> @${githubUsername}`);

  } catch (error) {
    app.getLogger().error(`Failed to submit username mapping: ${error.message}`);
    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: `❌ **Error submitting username mapping:** ${error.message}`,
    });
  }
}

/**
 * List pending username mapping requests (Admin only)
 */
async function handleListPendingMappings(
  app: IAppInterface,
  read: IRead,
  modify: IModify,
  user: IUser,
  room: IRoom,
  persistence: IPersistence,
  persistenceRead: IPersistenceRead
): Promise<void> {
  // Check if user has admin permissions
  if (!isUserHighHierarchy(user)) {
    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: "❌ **Access Denied**\n\nYou don't have permission to view pending username mappings. This feature is restricted to administrators.\n\nTo submit your own GitHub username, use: `/code-review-agent username <github-username>`",
    });
    return;
  }

  try {
    const pendingMappings = await PendingUserMappingPersistence.getPendingUserMappings(persistenceRead);

    if (pendingMappings.length === 0) {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: "✅ **No Pending Username Mappings**\n\nAll username mapping requests have been processed! No requests require admin attention.",
      });
      return;
    }

    const message = buildMappingListMessage(pendingMappings);
    const blocks = buildMappingListBlocks(pendingMappings);

    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: message,
      blocks: blocks,
    });
  } catch (error) {
    app.getLogger().error(`Failed to list pending mappings: ${error.message}`);
    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: `❌ **Error retrieving pending mappings:** ${error.message}`,
    });
  }
}

/**
 * Handle mapping actions (approve/reject)
 */
async function handleMappingAction(
  app: IAppInterface,
  read: IRead,
  modify: IModify,
  user: IUser,
  room: IRoom,
  persistence: IPersistence,
  persistenceRead: IPersistenceRead,
  mappingId: string,
  action: "approve" | "reject",
  rejectionReason?: string
): Promise<void> {
  // Check if user has admin permissions
  if (!isUserHighHierarchy(user)) {
    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: "❌ **Access Denied**\n\nYou don't have permission to review username mappings. This feature is restricted to administrators.",
    });
    return;
  }

  if (!mappingId) {
    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: `❌ **Missing mapping ID**\n\nUsage: \`/code-review-agent username ${action} <mapping_id>${action === 'reject' ? ' [reason]' : ''}\``,
    });
    return;
  }

  try {
    // Verify the mapping exists
    const pendingMapping = await PendingUserMappingPersistence.getPendingUserMapping(mappingId, persistenceRead);

    if (!pendingMapping) {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: `❌ **Mapping not found**\n\nNo pending username mapping found for ID: \`${mappingId}\``,
      });
      return;
    }

    if (pendingMapping.status !== "pending") {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: `❌ **Mapping already reviewed**\n\nMapping for @${pendingMapping.githubUsername} was already ${pendingMapping.status} by ${pendingMapping.reviewedBy || "unknown"}`,
      });
      return;
    }

    if (action === "approve") {
      // Double-check that GitHub username isn't already mapped
      const existingMapping = await UserMappingPersistence.getUserMappingByGithubUsername(pendingMapping.githubUsername, persistenceRead);
      if (existingMapping) {
        await sendNotification({
          modify: modify,
          user: user,
          room: room,
          message: `❌ **Cannot approve: GitHub username already mapped**\n\nThe GitHub username @${pendingMapping.githubUsername} is now linked to another user. Please reject this request.`,
        });
        return;
      }

      // Create the actual user mapping
      const userMapping: UserMapping = {
        rcUserId: pendingMapping.rocketchatUserId,
        rcUsername: pendingMapping.rocketchatUsername,
        githubUsername: pendingMapping.githubUsername,
        createdAt: new Date(),
        lastUsed: new Date(),
      };

      await UserMappingPersistence.saveUserMapping(userMapping, persistence);

      // Notify the user of approval
      const targetUser = await read.getUserReader().getById(pendingMapping.rocketchatUserId);
      if (targetUser) {
        await sendDirectMessage({
          read: read,
          modify: modify,
          user: targetUser,
          message: `✅ **GitHub username mapping approved!**\n\nYour RocketChat account has been successfully linked with GitHub user @${pendingMapping.githubUsername}.\n\nYou will now receive notifications when you're assigned as a reviewer for pull requests.`,
          persistence: persistence,
        });
      }
    } else {
      // Reject action
      const reason = rejectionReason || "No reason provided";
      
      // Notify the user of rejection
      const targetUser = await read.getUserReader().getById(pendingMapping.rocketchatUserId);
      if (targetUser) {
        await sendDirectMessage({
          read: read,
          modify: modify,
          user: targetUser,
          message: `❌ **GitHub username mapping rejected**\n\nYour request to link with GitHub user @${pendingMapping.githubUsername} has been rejected.\n\n**Reason:** ${reason}\n\nYou can submit a new request with a different GitHub username if needed.`,
          persistence: persistence,
        });
      }
    }

    // Update the pending mapping status
    await PendingUserMappingPersistence.updatePendingUserMappingStatus(
      mappingId,
      action === "approve" ? "approved" : "rejected",
      user.id,
      persistence,
      persistenceRead,
      action === "reject" ? rejectionReason : undefined
    );

    const actionMessages = {
      approve: "✅ **Username Mapping Approved**",
      reject: "❌ **Username Mapping Rejected**",
    };

    const actionDescriptions = {
      approve: "The user mapping has been created and the user has been notified.",
      reject: `The mapping request has been rejected. Reason: ${rejectionReason || "No reason provided"}`,
    };

    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: `${actionMessages[action]}

**RocketChat User:** @${pendingMapping.rocketchatUsername}
**GitHub User:** @${pendingMapping.githubUsername}
**GitHub Profile:** ${pendingMapping.githubMetadata.htmlUrl}

${actionDescriptions[action]}`,
    });

    app.getLogger().info(`Admin ${user.username} ${action}ed username mapping: ${pendingMapping.rocketchatUsername} -> @${pendingMapping.githubUsername}`);

  } catch (error) {
    app.getLogger().error(`Failed to ${action} username mapping ${mappingId}: ${error.message}`);
    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: `❌ **Error processing username mapping ${action}:** ${error.message}`,
    });
  }
}

/**
 * Show username command help
 */
async function handleUsernameHelp(
  modify: IModify,
  user: IUser,
  room: IRoom
): Promise<void> {
  const isAdmin = isUserHighHierarchy(user);

  const adminCommands = isAdmin
    ? `

**🔧 Admin Commands:**
\`/code-review-agent username\` or \`/code-review-agent username list\` - List pending requests
\`/code-review-agent username approve <id>\` - Approve a mapping request
\`/code-review-agent username reject <id> [reason]\` - Reject a mapping request`
    : "";

  const helpMessage = `👤 **Username Mapping Commands**

**📝 Submit GitHub username:**
\`/code-review-agent username <github-username>\` - Submit your GitHub username for admin review

**📋 Examples:**
\`/code-review-agent username octocat\`${adminCommands}

**ℹ️ About:**
This allows you to link your GitHub account without OAuth authorization. Your request will be reviewed by administrators who can verify your identity before approving the mapping.

**📧 Notifications:**
You'll receive a direct message when your request is approved or rejected.`;

  await sendNotification({
    modify: modify,
    user: user,
    room: room,
    message: helpMessage,
  });
}

/**
 * Build message for mapping list
 */
function buildMappingListMessage(pendingMappings: PendingUserMapping[]): string {
  const count = pendingMappings.length;
  const header = `👥 **${count} Pending Username Mapping${count === 1 ? "" : "s"}**\n\n`;

  const mappings = pendingMappings
    .slice(0, 10)
    .map((mapping, index) => {
      const accountAge = new Date(mapping.githubMetadata.createdAt).toLocaleDateString();
      return `**${index + 1}.** @${mapping.rocketchatUsername} → @${mapping.githubMetadata.name || mapping.githubUsername}
   🐙 GitHub: @${mapping.githubUsername} (${mapping.githubMetadata.publicRepos} repos, ${mapping.githubMetadata.followers} followers)
   📅 Account created: ${accountAge} | 🏢 ${mapping.githubMetadata.company || 'No company'}
   🔗 ${mapping.githubMetadata.htmlUrl}
   📋 **ID:** \`${mapping.id}\``;
    })
    .join("\n\n");

  const footer = count > 10 ? `\n\n*Showing first 10 of ${count} pending requests*` : "";

  return (
    header +
    mappings +
    footer +
    "\n\n*Use the action buttons below or commands to review these requests.*"
  );
}

/**
 * Build interactive blocks for mapping list
 */
function buildMappingListBlocks(pendingMappings: PendingUserMapping[]): LayoutBlock[] {
  const blocks: LayoutBlock[] = [
    getSectionBlock(
      `👥 **${pendingMappings.length} Pending Username Mapping${
        pendingMappings.length === 1 ? "" : "s"
      }**`
    ),
  ];

  // Show first 5 items with action buttons
  const itemsToShow = pendingMappings.slice(0, 5);

  itemsToShow.forEach((mapping, index) => {
    const accountAge = new Date(mapping.githubMetadata.createdAt).toLocaleDateString();
    
    blocks.push(
      getSectionBlock(
        `**${index + 1}. @${mapping.rocketchatUsername}** → **@${mapping.githubUsername}**\n` +
        `👤 ${mapping.githubMetadata.name || mapping.githubUsername} | 🏢 ${mapping.githubMetadata.company || 'No company'}\n` +
        `🐙 ${mapping.githubMetadata.publicRepos} repos, ${mapping.githubMetadata.followers} followers | 📅 ${accountAge}\n` +
        `🆔 **ID:** \`${mapping.id}\``,
        getButton({
          labelText: "View GitHub",
          actionId: `view_github_${mapping.id}`,
          url: mapping.githubMetadata.htmlUrl,
        })
      ),

      getActionsBlock(`username_actions_${mapping.id}`, [
        getButton({
          labelText: "✅ Approve",
          actionId: `approve_username_${mapping.id}`,
          value: `approve_${mapping.id}`,
          style: "primary",
        }),
        getButton({
          labelText: "❌ Reject",
          actionId: `reject_username_${mapping.id}`,
          value: `reject_${mapping.id}`,
          style: "danger",
        }),
      ])
    );

    if (index < itemsToShow.length - 1) {
      blocks.push(getDividerBlock());
    }
  });

  if (pendingMappings.length > 5) {
    blocks.push(
      getContextBlock(
        `*Showing first 5 of ${pendingMappings.length} pending requests. Use \`/code-review-agent username list\` to see all.*`
      )
    );
  }

  return blocks;
} 