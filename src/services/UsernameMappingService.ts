import { IHttp, IHttpResponse, IModify, IPersistence, IPersistenceRead, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { AppSettingsEnum } from '../config/settings';
import { sendNotification } from '../helpers/message';
import { PendingUserMapping, PendingUserMappingPersistence } from '../persistence/PendingUserMappingPersistence';
import { UserMappingPersistence } from '../persistence/UserMappingPersistence';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { IAppInterface } from '../interfaces/IAppInterface';

export class UsernameMappingService {
    
    constructor(private app: CodeReviewAgentApp) {}

    /**
 * Handle user submission of GitHub username
 */
    async handleUsernameSubmission(
        read: IRead,
        modify: IModify,
        user: IUser,
        room: IRoom,
        persistence: IPersistence,
        persistenceRead: IPersistenceRead,
        githubUsername: string
    ): Promise<void> {
        
    }
  
}