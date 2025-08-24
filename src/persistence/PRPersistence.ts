import { IPersistence, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

export interface StoredPR {
    id: string;
    repoOwner: string;
    repoName: string;
    number: number;
    title: string;
    description: string;
    author: {
        username: string;
        id: number;
        createdAt: string;
        publicRepos: number;
        followers: number;
    };
    filesChanged: string[];
    diff: string;
    createdAt: Date;
    processedAt: Date;
    status: 'new' | 'spam_detected' | 'clean' | 'reviewers_assigned' | 'failed';
    spamScore?: number;
    spamReasoning?: string;
    spamFlags?: string[];
    assignedReviewers?: Array<{
        username: string;
        reasoning: string;
        expertise: string[];
        familiarityLevel: 'high' | 'medium' | 'low';
        score: number;
    }>;
    errorMessage?: string;
}

export class PRPersistence {
    private static readonly PR_ASSOCIATION_KEY = 'code-review-pr';

    static async savePR(pr: StoredPR, persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.PR_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, pr.id)
        ];
        await persistenceWrite.updateByAssociations(associations, pr, true);
    }

    static async updatePRStatus(
        prId: string, 
        status: StoredPR['status'], 
        persistenceWrite: IPersistence,
        persistenceRead: IPersistenceRead,
        additionalData?: Partial<StoredPR>
    ): Promise<void> {
        const existingPR = await this.getPR(prId, persistenceRead);
        if (existingPR) {
            const updatedPR = {
                ...existingPR,
                status,
                ...additionalData,
                processedAt: new Date()
            };
            await this.savePR(updatedPR, persistenceWrite);
        }
    }

    static async deletePR(prId: string, persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.PR_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, prId)
        ];
        await persistenceWrite.removeByAssociations(associations);
    }

    static async getPR(prId: string, persistenceRead: IPersistenceRead): Promise<StoredPR | null> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.PR_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, prId)
        ];
        const result = await persistenceRead.readByAssociations(associations);

        if (result.length > 0) {
            return result[0] as StoredPR;
        }

        return null;
    }

    static async getAllPRs(persistenceRead: IPersistenceRead): Promise<StoredPR[]> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.PR_ASSOCIATION_KEY),
        ];
        const results = await persistenceRead.readByAssociations(associations);
        return results ? results as StoredPR[] : [];
    }

    static async getPRsByStatus(status: StoredPR['status'], persistenceRead: IPersistenceRead): Promise<StoredPR[]> {
        const allPRs = await this.getAllPRs(persistenceRead);
        return allPRs.filter(pr => pr.status === status);
    }

    static async getPRsByRepo(repoName: string, persistenceRead: IPersistenceRead): Promise<StoredPR[]> {
        const allPRs = await this.getAllPRs(persistenceRead);
        return allPRs.filter(pr => pr.repoName === repoName);
    }
}
