import {
  IModify,
  IRead,
  IPersistence,
  IHttp,
} from "@rocket.chat/apps-engine/definition/accessors";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { IAppInterface } from "../../interfaces/IAppInterface";
import { isUserHighHierarchy, sendNotification } from "../../helpers/message";

export async function handleTriggerCommand(
  app: IAppInterface,
  read: IRead,
  modify: IModify,
  user: IUser,
  room: IRoom,
  http: IHttp,
  persistence: IPersistence
): Promise<void> {
  // const isAdmin = await isUserHighHierarchy(user, read)
  // if (isAdmin) {
  //   await sendNotification({
  //     modify: modify,
  //     user: user,
  //     room: room,
  //     message:
  //       "❌ **Access Denied**\n\nOnly administrators can trigger the pipeline manually.",
  //   });
  //   return;
  // }

  try {
    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message:
        "🚀 **Triggering PR Processing Pipeline...**\n\nThis may take a few minutes depending on the number of new PRs.",
    });

    // Trigger the pipeline directly
    await app.runPRProcessingPipeline(read, modify, http, persistence);

    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message:
        "✅ **Pipeline completed successfully!**\n\nCheck logs for detailed results.",
    });
  } catch (error) {
    app.getLogger().error(`Manual pipeline trigger failed: ${error.message}`);
    await sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: `❌ **Pipeline failed:** ${error.message}`,
    });
  }
}
