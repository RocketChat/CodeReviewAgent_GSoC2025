import { IPersistence, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

export interface StoredCodeowners {
    repoName: string;
    entries: Array<{
        pattern: string;
        owners: string[];
    }>;
    lastUpdated: Date;
}

export class CodeownersPersistence {
    private static readonly CODEOWNERS_ASSOCIATION_KEY = 'code-review-codeowners';

    // ✅ WRITE operations
    static async saveCodeowners(repoName: string, data: StoredCodeowners, persistenceWrite: IPersistence): Promise<void> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            `${this.CODEOWNERS_ASSOCIATION_KEY}:${repoName}`
        );
        await persistenceWrite.updateByAssociation(association, data, true);
    }

    static async deleteCodeowners(repoName: string, persistenceWrite: IPersistence): Promise<void> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            `${this.CODEOWNERS_ASSOCIATION_KEY}:${repoName}`
        );
        await persistenceWrite.removeByAssociation(association);
    }

    // ✅ READ operations
    static async getCodeowners(repoName: string, persistenceRead: IPersistenceRead): Promise<StoredCodeowners | null> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            `${this.CODEOWNERS_ASSOCIATION_KEY}:${repoName}`
        );
        const result = await persistenceRead.readByAssociation(association);
        if (result.length > 0) {
                            return result[0] as StoredCodeowners;
                        }
                return null;
    }

    static async getAllCodeowners(persistenceRead: IPersistenceRead): Promise<{ [repoName: string]: StoredCodeowners }> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            this.CODEOWNERS_ASSOCIATION_KEY
        );
        const results = await persistenceRead.readByAssociations([association]);
        
        const codeownersMap: { [repoName: string]: StoredCodeowners } = {};
        if (results) {
            for (const data of results as StoredCodeowners[]) {
                codeownersMap[data.repoName] = data;
            }
        }
        return codeownersMap;
    }
}