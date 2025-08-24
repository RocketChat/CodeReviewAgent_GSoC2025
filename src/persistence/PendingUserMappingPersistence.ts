import { IPersistence, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

export interface PendingUserMapping {
    rocketchatUserId: string;
    rocketchatUsername: string;
    githubUsername: string;
    githubUserId: number;
    githubMetadata: {
        name?: string;
        company?: string;
        location?: string;
        bio?: string;
        publicRepos: number;
        followers: number;
        following: number;
        createdAt: string;
        avatarUrl: string;
        htmlUrl: string;
    };
    status: 'pending' | 'approved' | 'rejected';
    requestedAt: Date;
    reviewedAt?: Date;
    reviewedBy?: string;
    rejectionReason?: string;
}

export class PendingUserMappingPersistence {
    private static readonly PENDING_USER_MAPPING_ASSOCIATION_KEY = 'code-review-pending-user-mapping';

    // ✅ WRITE operations
    static async savePendingUserMapping(mapping: PendingUserMapping, persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.PENDING_USER_MAPPING_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.USER, mapping.rocketchatUserId)
        ];
        await persistenceWrite.updateByAssociations(associations, mapping, true);
    }

    static async updatePendingUserMappingStatus(
        rocketchatUserId: string,
        status: PendingUserMapping['status'],
        reviewedBy: string,
        persistenceWrite: IPersistence,
        persistenceRead: IPersistenceRead,
        rejectionReason?: string
    ): Promise<void> {
        const existingMapping = await this.getPendingUserMapping(rocketchatUserId, persistenceRead);
        if (existingMapping) {
            const updatedMapping = {
                ...existingMapping,
                status,
                reviewedBy,
                reviewedAt: new Date(),
                rejectionReason
            };
            await this.savePendingUserMapping(updatedMapping, persistenceWrite);
        }
    }

    static async deletePendingUserMapping(rocketchatUserId: string, persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.PENDING_USER_MAPPING_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.USER, rocketchatUserId)
        ];
        await persistenceWrite.removeByAssociations(associations);
    }

    // ✅ READ operations
    static async getPendingUserMapping(rocketchatUserId: string, persistenceRead: IPersistenceRead): Promise<PendingUserMapping | null> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.PENDING_USER_MAPPING_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.USER, rocketchatUserId)
        ];

        const result = await persistenceRead.readByAssociations(associations);
        if (result.length > 0) {
            return result[0] as PendingUserMapping;
        }
        return null;
    }

    static async getPendingUserMappings(persistenceRead: IPersistenceRead): Promise<PendingUserMapping[]> {
        const allMappings = await this.getAllPendingUserMappings(persistenceRead);
        return allMappings.filter(mapping => mapping.status === 'pending');
    }

    static async getAllPendingUserMappings(persistenceRead: IPersistenceRead): Promise<PendingUserMapping[]> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            this.PENDING_USER_MAPPING_ASSOCIATION_KEY
        );
        const results = await persistenceRead.readByAssociation(association);
        return results ? results as PendingUserMapping[] : [];
    }
    
    static async getPendingUserMappingByRocketChatUserId(rcUserId: string, persistenceRead: IPersistenceRead): Promise<PendingUserMapping | null> {
        const allMappings = await this.getAllPendingUserMappings(persistenceRead);
        return allMappings.find(mapping => mapping.rocketchatUserId === rcUserId && mapping.status === 'pending') || null;
    }

    static async getPendingUserMappingByGithubUsername(githubUsername: string, persistenceRead: IPersistenceRead): Promise<PendingUserMapping | null> {
        const allMappings = await this.getAllPendingUserMappings(persistenceRead);
        return allMappings.find(mapping => mapping.githubUsername === githubUsername && mapping.status === 'pending') || null;
    }


    static async deleteAllPendingUserMapping(persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.PENDING_USER_MAPPING_ASSOCIATION_KEY)        ];
        await persistenceWrite.removeByAssociations(associations);
    }
} 