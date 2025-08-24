import type {
    IModify,
    IPersistence,
    IPersistenceRead,
    IRead,
  } from "@rocket.chat/apps-engine/definition/accessors";
  import type { IUser } from "@rocket.chat/apps-engine/definition/users";
  import type { IAppInterface } from "../../interfaces/IAppInterface";
  import { isUserHighHierarchy, sendNotification } from "../../helpers/message";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { PendingUserMappingPersistence } from "../../persistence/PendingUserMappingPersistence";
import { pendingUsernameApprovalsModal } from "../../modals/PendingUsernameApprovalsModal";

export async function handleApprovalsCommand(
    app: IAppInterface,
    read: IRead,
    modify: IModify,
    user: IUser,
    room: IRoom,
    persistence: IPersistence,
    persistenceRead: IPersistenceRead,
    triggerId: string
  ): Promise<void> {
    // Check if user has admin permissions
    if (!(await isUserHighHierarchy(user, read))) {
      await sendNotification({
        modify: modify,
        user: user,
        room: room,
        message: "❌ **Access Denied**\n\nYou don't have permission to view pending username mappings. This feature is restricted to administrators.\n\nTo submit your own GitHub username, use: `/code-review-agent username <github-username>`",
      });
      return;
    }
  
    try {
      const roomId = room.id;
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
  
      var modal = await pendingUsernameApprovalsModal({ pendingMappings, roomId });
      await modify.getUiController().openSurfaceView(modal, { triggerId: triggerId }, user);
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
  