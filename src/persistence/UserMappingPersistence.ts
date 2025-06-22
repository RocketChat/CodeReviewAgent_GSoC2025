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
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            `${this.USER_MAPPING_ASSOCIATION_KEY}:${mapping.rcUserId}`
        );
        await persistenceWrite.updateByAssociation(association, mapping, true);
    }

    static async deleteUserMapping(rcUserId: string, persistenceWrite: IPersistence): Promise<void> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            `${this.USER_MAPPING_ASSOCIATION_KEY}:${rcUserId}`
        );
        await persistenceWrite.removeByAssociation(association);
    }

    // ✅ READ operations
    static async getUserMapping(rcUserId: string, persistenceRead: IPersistenceRead): Promise<UserMapping | null> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            `${this.USER_MAPPING_ASSOCIATION_KEY}:${rcUserId}`
        );
        const result = await persistenceRead.readByAssociation(association);
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
            RocketChatAssociationModel.USER,
            this.USER_MAPPING_ASSOCIATION_KEY
        );
        const results = await persistenceRead.readByAssociations([association]);
        return results ? results as UserMapping[] : [];
    }
}



