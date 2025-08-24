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
import { UserMappingPersistence } from "../../persistence/UserMappingPersistence";

export async function handleCleanupCommand(
    app: IAppInterface,
    modify: IModify,
    user: IUser,
    room: IRoom,
    persistence: IPersistence,
    persistenceRead: IPersistenceRead,
  ): Promise<void> {
   
  
    try {
      const roomId = room.id;
      await PendingUserMappingPersistence.deleteAllPendingUserMapping(persistence);
      const pendingMappings = await PendingUserMappingPersistence.getPendingUserMappings(persistenceRead);
  
      if (pendingMappings.length === 0) {
        await sendNotification({
          modify: modify,
          user: user,
          room: room,
          message: "✅ **No Pending Username Mappings**\n\nAll username mapping requests have been processed! No requests require admin attention.",
        });
      }
      await UserMappingPersistence.deleteAllUserMapping(persistence);

      const mappings = await UserMappingPersistence.getAllUserMappings(persistenceRead);
  
      if (mappings.length === 0) {
        await sendNotification({
          modify: modify,
          user: user,
          room: room,
          message: "✅ **No Username Mappings**\n\nAll username mappings are deleted now.",
        });
      }
  
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
  