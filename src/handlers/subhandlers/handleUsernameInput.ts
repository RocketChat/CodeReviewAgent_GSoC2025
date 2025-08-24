import { IModify, IPersistence, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { CodeReviewAgentApp } from '../../../CodeReviewAgentApp';
import { ModalsEnum } from '../../enums/Modals';
import { sendNotification } from '../../helpers/message';
import { PendingUserMapping, PendingUserMappingPersistence } from '../../persistence/PendingUserMappingPersistence';
import { UserMappingPersistence } from '../../persistence/UserMappingPersistence';

export async function handleUsernameInput({
  app,
  context,
  room,
  modify,
  persistence,
  persistenceRead,
  username
}: {
  app: CodeReviewAgentApp;
  context?: UIKitViewSubmitInteractionContext;
  room: IRoom;
  modify: IModify;
  persistence: IPersistence,
  persistenceRead: IPersistenceRead,
  username?: string
}) {
  const logger = app.getLogger();
  const data = context?.getInteractionData();
  const state = data?.view.state;
  const user: IUser = context?.getInteractionData().user!;
  const githubUsername = username ?? state?.[ModalsEnum.GITHUB_USERNAME_BLOCK]?.[ModalsEnum.GITHUB_USERNAME_INPUT];
  

  if (!githubUsername) {
    const error = 'Username is missing!';
    logger.error(error + ' | TriggerID: ' + data?.triggerId);
    const msg = modify
      .getCreator()
      .startMessage()
      .setText(`❗️ Unable to create task! \n Error: ${error}}`)
      .setRoom(room!);
    await modify.getNotifier().notifyUser(user, msg.getMessage());
  }

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
            message: `❌ **Already mapped**\n\nYour RocketChat account is already linked to GitHub user @${existingMapping.githubUsername}.\n\nTo change this mapping, either use \`auth\` flow to overwrite or please contact an administrator.`,
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