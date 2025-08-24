import { IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';

import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { ModalsEnum } from '../enums/Modals';
import { sendNotification } from '../helpers/message';
import { handleUsernameInput } from './subhandlers/handleUsernameInput';

export class ExecuteViewSubmitHandler {
  constructor(
    private readonly app: CodeReviewAgentApp,
    private readonly read: IRead,
    private readonly modify: IModify,
    private readonly persistence: IPersistence
  ) {}

  public async run(context: UIKitViewSubmitInteractionContext) {
    const persistenceRead = this.read.getPersistenceReader();
    const logger = this.app.getLogger();
    const data = context.getInteractionData();
    let { view, room, user } = data;

    const [viewId, roomId] = view.id.split('#');

    if (!room) {
      logger.warn('Room data not present in context.');
      room = await this.read.getRoomReader().getById(roomId);
      if (!room) {
        logger.error(`Room with id: ${roomId} does not exist.`);
        return context.getInteractionResponder().errorResponse();
      }
    }

    try {
      switch (viewId) {
        case ModalsEnum.USERNAME_INPUT:
          await handleUsernameInput({ app: this.app, context, room, modify: this.modify, persistenceRead: persistenceRead, persistence: this.persistence})
          return context.getInteractionResponder().successResponse();
        
        default:
          logger.warn(`Invalid ${viewId} received in context.`);
          return context.getInteractionResponder().errorResponse();
      }
    } catch (error) {
      logger.error(error);
      await sendNotification({
        modify: this.modify,
        user,
        room,
        message: `❗️ Unable to process your request! \nError: ${error.message}`,
      });
      return context.getInteractionResponder().viewErrorResponse({
        viewId: data.view.id,
        errors: error.message,
      });
    }
  }
}