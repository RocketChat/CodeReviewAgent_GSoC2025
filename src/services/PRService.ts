import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { AppSettingsEnum } from '../config/settings';
import { GitHubAPIService, GitHubPullRequest } from './GitHubAPIService';
import { PRPersistence, StoredPR } from '../persistence/PRPersistence';
import { IPersistence, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';

export class PRService {
    private githubService: GitHubAPIService;

    constructor(private app: CodeReviewAgentApp) {
        this.githubService = new GitHubAPIService(app);
    }

    /**
     * Fetches new PRs from all configured repositories and stores them
     */
    public async fetchAndStoreNewPRs(persistence: IPersistence, persistenceRead: IPersistenceRead): Promise<StoredPR[]> {
        try {
            const logger = this.app.getLogger();
            
            const owner: string = await this.app.getAccessors().environmentReader
                .getSettings().getValueById(AppSettingsEnum.OWNER_NAME_ID);
            const repositoriesRaw: string = await this.app.getAccessors().environmentReader
                .getSettings().getValueById(AppSettingsEnum.REPOSITORIES_LIST_ID);
            
            if (!owner || !repositoriesRaw) {
                logger.error('Owner name or repositories list not configured');
                return [];
            }
            
            const repositories: string[] = repositoriesRaw.split('\n')
                .map(repo => repo.trim())
                .filter(repo => repo.length > 0);
            
            logger.info(`Fetching PRs for ${repositories.length} repositories`);
            
            const newPRs: StoredPR[] = [];
            const since = new Date(Date.now() - 12 * 60 * 60 * 1000); // Last 12 hours
            
            for (const repo of repositories) {
                try {
                    logger.info(`Fetching PRs for ${owner}/${repo}`);
                    const prs = await this.githubService.getPullRequests(owner, repo, since);
                    
                    for (const pr of prs) {
                        // Check if PR already exists
                        // const existingPR = await PRPersistence.getPR(`${owner}/${repo}/${pr.number}`, persistenceRead);
                        // if (existingPR) {
                        //     logger.info(`Already processed PR: ${pr.number}`)
                        //     continue; // Skip if already processed
                        // }
                        
                        // Get additional PR data
                        const prFiles = await this.githubService.getPullRequestFiles(owner, repo, pr.number);
                        const prDiff = await this.githubService.getPullRequestDiff(owner, repo, pr.number);
                        
                        // Get author details
                        const authorInfo = await this.githubService.getUserInfo(pr.user.login);
                        
                        const storedPR: StoredPR = {
                            id: `${owner}/${repo}/${pr.number}`,
                            repoOwner: owner,
                            repoName: repo,
                            number: pr.number,
                            title: pr.title,
                            description: pr.body || '',
                            author: {
                                username: pr.user.login,
                                id: pr.user.id,
                                createdAt: authorInfo.created_at,
                                publicRepos: authorInfo.public_repos || 0,
                                followers: authorInfo.followers || 0
                            },
                            filesChanged: prFiles.map(file => file.filename),
                            diff: prDiff,
                            createdAt: new Date(pr.created_at),
                            processedAt: new Date(),
                            status: 'new'
                        };
                        
                        await PRPersistence.savePR(storedPR, persistence);
                        newPRs.push(storedPR);
                        
                        logger.info(`Stored new PR: ${storedPR.id}`);
                    }
                    
                } catch (error) {
                    logger.error(`Failed to fetch PRs for ${owner}/${repo}: ${error.message}`);
                }
            }
            
            logger.info(`Fetched and stored ${newPRs.length} new PRs`);
            return newPRs;
            
        } catch (error) {
            this.app.getLogger().error(`Error in fetchAndStoreNewPRs: ${error.message}`);
            throw error;
        }
    }

    /**
     * Gets a summary of a PR's diff for AI analysis
     */
    public getDiffSummary(diff: string, maxLength: number = 2000): string {
        const lines = diff.split('\n');
        const summary: string[] = [];
        let addedLines = 0;
        let deletedLines = 0;
        let currentFile = '';
        
        for (const line of lines) {
            if (line.startsWith('diff --git')) {
                const match = line.match(/diff --git a\/(.*) b\/(.*)/);
                if (match) {
                    currentFile = match[1];
                }
            } else if (line.startsWith('+++') || line.startsWith('---')) {
                continue;
            } else if (line.startsWith('+') && !line.startsWith('+++')) {
                addedLines++;
                if (summary.length < 20) {
                    summary.push(`${currentFile}: +${line.substring(1).trim()}`);
                }
            } else if (line.startsWith('-') && !line.startsWith('---')) {
                deletedLines++;
                if (summary.length < 20) {
                    summary.push(`${currentFile}: -${line.substring(1).trim()}`);
                }
            }
        }
        
        const header = `+${addedLines} lines, -${deletedLines} lines\n\n`;
        const content = summary.join('\n');
        const result = header + content;
        
        return result.length > maxLength ? result.substring(0, maxLength) + '...' : result;
    }

    /**
     * Checks if a contributor is first-time for the repository
     */
    public async isFirstTimeContributor(username: string, owner: string, repo: string): Promise<boolean> {
        try {
            // Get recent commits from the user
            const commits = await this.githubService.getCommitHistory(owner, repo, '', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
            return !commits.some(commit => commit.author && commit.author.login === username);
        } catch (error) {
            this.app.getLogger().warn(`Could not determine first-time contributor status for ${username}: ${error.message}`);
            return false; // Assume not first-time if we can't determine
        }
    }

    /**
     * Calculates account age in a human-readable format
     */
    public calculateAccountAge(createdAt: string): string {
        const accountDate = new Date(createdAt);
        const now = new Date();
        const ageMs = now.getTime() - accountDate.getTime();
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        
        if (ageDays < 30) {
            return `${ageDays} days`;
        } else if (ageDays < 365) {
            const months = Math.floor(ageDays / 30);
            return `${months} months`;
        } else {
            const years = Math.floor(ageDays / 365);
            return `${years} years`;
        }
    }

    /**
    * Updates PR status with additional data
     */
    public async updatePRStatus(
        prId: string, 
        status: StoredPR['status'], 
        persistence: IPersistence,
        persistenceRead: IPersistenceRead,
        additionalData?: Partial<StoredPR>
    ): Promise<void> {
        return PRPersistence.updatePRStatus(prId, status, persistence, persistenceRead, additionalData);
    }

    /**
     * Get PRs by status
     */
    public async getPRsByStatus(status: StoredPR['status'], persistenceRead: IPersistenceRead): Promise<StoredPR[]> {
        return PRPersistence.getPRsByStatus(status, persistenceRead);
    }

    /**
     * Get a single PR by ID
     */
    public async getPR(prId: string, persistenceRead: IPersistenceRead): Promise<StoredPR | null> {
        return PRPersistence.getPR(prId, persistenceRead);
    }

}