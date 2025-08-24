import { IPersistence, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

export interface ReviewAssignment {
    status: 'pending' | 'done' | 'ignored';
    prId: string;
    rcUserId: string;
    rcUsername: string;
    githubUsername: string;
    reasoning: string;
    expertise: string[];
    familiarityLevel: 'high' | 'medium' | 'low';
    score: number;
    codeownersMatch: boolean;
    recentActivity: boolean;
}

export class ReviewAssignmentPersistence {
    private static readonly REVIEW_ASSIGNMENT_ASSOCIATION_KEY = 'review-assignment';

    // ✅ WRITE operations
    static async saveReviewAssignment(reviewAssignment: ReviewAssignment, persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.REVIEW_ASSIGNMENT_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.USER, reviewAssignment.rcUserId)
        ];
        await persistenceWrite.updateByAssociations(associations, reviewAssignment, true);
    }

    static async deleteReviewAssignment(rcUserId: string, persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.REVIEW_ASSIGNMENT_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.USER, rcUserId)
        ];
        await persistenceWrite.removeByAssociations(associations);
    }

    // ✅ READ operations
    static async getReviewAssignment(rcUserId: string, persistenceRead: IPersistenceRead): Promise<ReviewAssignment | null> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.REVIEW_ASSIGNMENT_ASSOCIATION_KEY),
            new RocketChatAssociationRecord(RocketChatAssociationModel.USER, rcUserId)
        ];
        const result = await persistenceRead.readByAssociations(associations);
        if (result.length > 0) {
                    return result[0] as ReviewAssignment;
                }
        return null;
    }


    static async getAllPendingReviewAssignments(persistenceRead: IPersistenceRead): Promise<ReviewAssignment[] | null> {
        const allAssignments = await this.getAllReviewAssignments(persistenceRead);
        return allAssignments.filter(assignment => assignment.status === 'pending') || null;
    }


    static async getAllReviewAssignments(persistenceRead: IPersistenceRead): Promise<ReviewAssignment[]> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            this.REVIEW_ASSIGNMENT_ASSOCIATION_KEY
        );
        const results = await persistenceRead.readByAssociations([association]);
        return results ? results as ReviewAssignment[] : [];
    }


    static async deleteAllReviewAssignments(persistenceWrite: IPersistence): Promise<void> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, this.REVIEW_ASSIGNMENT_ASSOCIATION_KEY)];
        await persistenceWrite.removeByAssociations(associations);
    }
}



