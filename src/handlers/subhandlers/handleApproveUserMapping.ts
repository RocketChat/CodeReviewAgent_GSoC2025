import { IModify, IPersistence, IPersistenceRead, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { CodeReviewAgentApp } from '../../../CodeReviewAgentApp';
import { ModalsEnum } from '../../enums/Modals';
import { sendDirectMessage, sendNotification } from '../../helpers/message';
import { PendingUserMapping, PendingUserMappingPersistence } from '../../persistence/PendingUserMappingPersistence';
import { UserMapping, UserMappingPersistence } from '../../persistence/UserMappingPersistence';

export async function handleApproveUserMapping({
  app,
  read,
  modify,
  persistence,
  persistenceRead,
  user,
  room,
  mappingUserRcId
}: {
  app: CodeReviewAgentApp;
  read: IRead,
  modify: IModify;
  persistence: IPersistence,
  persistenceRead: IPersistenceRead,
  user: IUser
  room: IRoom;
  mappingUserRcId: string
}) {
  const logger = app.getLogger();

  try {
    const pendingMapping = await PendingUserMappingPersistence.getPendingUserMapping(mappingUserRcId, persistenceRead);

    if (!pendingMapping) {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: `❌ **Mapping not found**\n\nNo pending username mapping found for the user with ID: \`${mappingUserRcId}\``,
      });
      return;
    }

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
    await PendingUserMappingPersistence.deletePendingUserMapping(mappingUserRcId, persistence)
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
    
    logger.info(`Username mapping request submitted: ${user.username} -> @${pendingMapping.githubUsername}`);

    } catch (error) {
    logger.error(`Failed to submit username mapping: ${error.message}`);
    await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: `❌ **Error submitting username mapping:** ${error.message}`,
    });
  }
}