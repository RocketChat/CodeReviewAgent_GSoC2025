import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import {
  IUIKitResponse,
  UIKitBlockInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';

import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { BlockActionEnum } from '../enums/BlockAction';
import { handleApproveUserMapping } from './subhandlers/handleApproveUserMapping';

export class ExecuteBlockActionHandler {
  constructor(
    private readonly app: CodeReviewAgentApp,
    private readonly read: IRead,
    private readonly modify: IModify,
    private readonly persistence: IPersistence
  ) {}

  public async run(context: UIKitBlockInteractionContext): Promise<IUIKitResponse> {
    const persistenceRead = this.read.getPersistenceReader();
    const data = context.getInteractionData();
    let { actionId, user, triggerId, room, value } = data;
    const [roomId, buttonValue] = value!.split('#');

    const logger = this.app.getLogger();
    if (!room) {
      logger.warn('Room data not present in context.');
      room = await this.read.getRoomReader().getById(roomId);
      if (!room) {
        logger.error(`Room with id: ${roomId} does not exist.`);
        return context.getInteractionResponder().errorResponse();
      }
    }
    if (!value) {
      logger.error('Value is missing in context.');
      return context.getInteractionResponder().errorResponse();
    }

    let message: string;
    try {
      switch (actionId) {
        case BlockActionEnum.APPROVE_USER_MAPPING_ACTION_ID:
          await handleApproveUserMapping({
            app: this.app,
            read: this.read,
            modify: this.modify,
            persistence: this.persistence,
            persistenceRead: persistenceRead,
            user: user,
            room: room,
            mappingUserRcId: buttonValue
          })
          return context.getInteractionResponder().successResponse();
        
        default:
          logger.warn(`Invalid Action ID: ${actionId} received.`);
          return context.getInteractionResponder().errorResponse();
      }
    } catch (error) {
      logger.error(error.message);
      return context.getInteractionResponder().viewErrorResponse({
        viewId: actionId,
        errors: error?.message,
      });
    }
  }
}