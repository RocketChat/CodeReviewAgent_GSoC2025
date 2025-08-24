import { IPersistence, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

export interface UserMapping {
    rcUserId: string;
    rcUsername: string;
    githubUsername: string;
    githubToken?: string;
    createdAt: Date;
    lastUsed: Date;
}

export class UserMappingPersistence {
    private static readonly USER_MAPPING_ASSOCIATION_KEY = 'code-review-user-mapping';

    // ✅ WRITE operations
    static async saveUserMapping(mapping: UserMapping, persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.USER_MAPPING_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.USER, mapping.rcUserId)
        ];
        await persistenceWrite.updateByAssociations(associations, mapping, true);
    }

    static async deleteUserMapping(rcUserId: string, persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.USER_MAPPING_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.USER, rcUserId)
        ];
        await persistenceWrite.removeByAssociations(associations);
    }

    // ✅ READ operations
    static async getUserMapping(rcUserId: string, persistenceRead: IPersistenceRead): Promise<UserMapping | null> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.USER_MAPPING_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.USER, rcUserId)
        ];
        const result = await persistenceRead.readByAssociations(associations);
        if (result.length > 0) {
                    return result[0] as UserMapping;
                }
        return null;
    }

    static async getUserMappingByGithubUsername(githubUsername: string, persistenceRead: IPersistenceRead): Promise<UserMapping | null> {
        const allMappings = await this.getAllUserMappings(persistenceRead);
        return allMappings.find(mapping => mapping.githubUsername === githubUsername) || null;
    }

    static async getAllUserMappings(persistenceRead: IPersistenceRead): Promise<UserMapping[]> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            this.USER_MAPPING_ASSOCIATION_KEY
        );
        const results = await persistenceRead.readByAssociations([association]);
        return results ? results as UserMapping[] : [];
    }


    static async deleteAllUserMapping(persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.USER_MAPPING_ASSOCIATION_KEY)];
        await persistenceWrite.removeByAssociations(associations);
    }
}



