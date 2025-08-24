import { IPersistence, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

export interface SpamReviewItem {
    prId: string;
    repoName: string;
    prNumber: number;
    title: string;
    author: string;
    spamScore: number;
    reasoning: string;
    flags: string[];
    createdAt: Date;
    status: 'pending' | 'approved' | 'rejected' | 'ignored';
    reviewedBy?: string;
    reviewedAt?: Date;
}

export class SpamReviewPersistence {
    private static readonly SPAM_REVIEW_ASSOCIATION_KEY = 'code-review-spam-review';

    // ✅ WRITE operations
    static async saveSpamReviewItem(item: SpamReviewItem, persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.SPAM_REVIEW_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, item.prId)
        ];
        await persistenceWrite.updateByAssociations(associations, item, true);
    }

    static async updateSpamReviewStatus(
        prId: string, 
        status: SpamReviewItem['status'], 
        reviewedBy: string, 
        persistenceWrite: IPersistence,
        persistenceRead: IPersistenceRead
    ): Promise<void> {
        const existingItem = await this.getSpamReviewItem(prId, persistenceRead);
        if (existingItem) {
            const updatedItem = {
                ...existingItem,
                status,
                reviewedBy,
                reviewedAt: new Date()
            };
            await this.saveSpamReviewItem(updatedItem, persistenceWrite);
        }
    }

    static async deleteSpamReviewItem(prId: string, persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.SPAM_REVIEW_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, prId)
        ];
        await persistenceWrite.removeByAssociations(associations);
    }

    // ✅ READ operations
    static async getSpamReviewItem(prId: string, persistenceRead: IPersistenceRead): Promise<SpamReviewItem | null> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.SPAM_REVIEW_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, prId)
        ];
        const result = await persistenceRead.readByAssociations(associations);
                if (result.length > 0) {
                            return result[0] as SpamReviewItem;
                        }
                return null;
    }

    static async getPendingSpamReviews(persistenceRead: IPersistenceRead): Promise<SpamReviewItem[]> {
        const allItems = await this.getAllSpamReviewItems(persistenceRead);
        return allItems.filter(item => item.status === 'pending');
    }

    static async getAllSpamReviewItems(persistenceRead: IPersistenceRead): Promise<SpamReviewItem[]> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            this.SPAM_REVIEW_ASSOCIATION_KEY
        );
        const results = await persistenceRead.readByAssociations([association]);
        return results ? results as SpamReviewItem[] : [];
    }
}