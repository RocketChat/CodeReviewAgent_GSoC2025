import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { AIService } from './AIService';
import { GitHubAPIService, GitHubCommit } from './GitHubAPIService';
import { CodeownersService } from './CodeownersService';
import { UserMappingPersistence, UserMapping } from '../persistence/UserMappingPersistence';
import { IModify, IPersistence, IPersistenceRead, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { PRPersistence, StoredPR } from '../persistence/PRPersistence';
import { ReviewAssignmentPersistence } from '../persistence/ReviewAssignmentPersistence';

export interface ReviewerRecommendation {
    username: string;
    reasoning: string;
    expertise: string[];
    familiarityLevel: 'high' | 'medium' | 'low';
    score: number;
    codeownersMatch: boolean;
    recentActivity: boolean;
    hasRocketChatAccount: boolean;
    rocketchatUserId?: string;
}

export interface ReviewerAnalysisData {
    pr: StoredPR;
    files: any[];
    codeownersMatches: string[];
    commitHistory: { [file: string]: GitHubCommit[] };
    potentialReviewers: string[];
}

export class ReviewerMatchingService {
    private aiService: AIService;
    private githubService: GitHubAPIService;
    private codeownersService: CodeownersService;

    constructor(private app: CodeReviewAgentApp) {
        this.aiService = app.getAIService();
        this.githubService = app.getGitHubService();
        this.codeownersService = app.getCodeownersService();
    }

    /**
     * Main entry point - find the top 3 reviewers for a PR
     */
    public async findReviewers(persistenceRead: IPersistenceRead, pr: StoredPR, repoName: string): Promise<ReviewerRecommendation[]> {
        try {
            this.app.getLogger().info(`Finding reviewers for PR ID: ${pr.id} #${pr.number} in ${repoName}`);

            // Gather analysis data
            const analysisData = await this.gatherReviewerAnalysisData(persistenceRead, pr);
            
            // Use AI to analyze and rank reviewers
            const aiRecommendations = await this.performAIReviewerAnalysis(analysisData);
            
            // Enhance with RC account mapping and metadata
            const enhancedRecommendations = await this.enhanceWithMetadata(persistenceRead, aiRecommendations);
            
            // Return top 3, prioritizing those with RC accounts
            const sortedRecommendations = this.prioritizeAndSort(enhancedRecommendations);
            
            this.app.getLogger().info(`Found ${sortedRecommendations.length} reviewer recommendations for PR #${pr.number}`);
            return sortedRecommendations.slice(0, 3);

        } catch (error) {
            this.app.getLogger().error(`Reviewer matching failed for PR #${pr.number}: ${error.message}`);
            
            // Return fallback recommendations based on CODEOWNERS only
            return await this.getFallbackReviewers(persistenceRead, pr);
        }
    }

    /**
     * Gather comprehensive data for reviewer analysis
     */
    private async gatherReviewerAnalysisData(persistenceRead: IPersistenceRead, pr: StoredPR): Promise<ReviewerAnalysisData> {
        const [owner, repo, number] = pr.id.split('/');

        // Get PR files
        const files = await this.githubService.getPullRequestFiles(owner, repo, parseInt(number));
        
        // Get CODEOWNERS matches for changed files
        const codeownersMatches = await this.getCodeownersMatches(persistenceRead, files, pr.repoName);
        
        // Get recent commit history for changed files (last 6 months)
        const commitHistory = await this.getCommitHistoryForFiles(files, owner, repo);
        
        // Extract all potential reviewers from codeowners + commit history
        const potentialReviewers = this.extractPotentialReviewers(codeownersMatches, commitHistory, pr.author.username);

        return {
            pr,
            files,
            codeownersMatches,
            commitHistory,
            potentialReviewers
        };
    }

    /**
     * Get CODEOWNERS matches for the changed files
     */
    private async getCodeownersMatches(persistenceRead: IPersistenceRead, files: any[], repoName: string): Promise<string[]> {
        try {
            const matches: string[] = [];
            
            for (const file of files) {
                const owners = await this.codeownersService.getOwnersForPath(persistenceRead, repoName, file.filename);
                matches.push(...owners);
            }
            
            // Remove duplicates
            return [...new Set(matches)];
        } catch (error) {
            this.app.getLogger().warn(`CODEOWNERS lookup failed: ${error.message}`);
            return [];
        }
    }

    /**
     * Get commit history for changed files (last 6 months)
     */
    private async getCommitHistoryForFiles(files: any[], owner: string, repo: string): Promise<{ [file: string]: GitHubCommit[] }> {
        const commitHistory: { [file: string]: GitHubCommit[] } = {};
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        // Limit to top 10 files to avoid API rate limits
        const filesToAnalyze = files.slice(0, 10);

        for (const file of filesToAnalyze) {
            try {
                const commits = await this.githubService.getCommitHistory(owner, repo, file.filename, sixMonthsAgo);
                commitHistory[file.filename] = commits.slice(0, 20); // Limit to recent 20 commits
            } catch (error) {
                this.app.getLogger().warn(`Failed to get commits for ${file.filename}: ${error.message}`);
                commitHistory[file.filename] = [];
            }
        }

        return commitHistory;
    }

    /**
     * Extract unique potential reviewers from all sources
     */
    private extractPotentialReviewers(codeownersMatches: string[], commitHistory: { [file: string]: GitHubCommit[] }, prAuthor: string): string[] {
        const reviewers = new Set<string>();

        // Add codeowners
        codeownersMatches.forEach(owner => {
            // Remove @ prefix if present
            const cleanOwner = owner.startsWith('@') ? owner.slice(1) : owner;
            if (cleanOwner !== prAuthor) {
                reviewers.add(cleanOwner);
            }
        });

        // Add commit authors
        Object.values(commitHistory).forEach(commits => {
            commits.forEach(commit => {
                if (commit.author?.login && commit.author.login !== prAuthor) {
                    reviewers.add(commit.author.login);
                }
            });
        });

        return Array.from(reviewers);
    }

    /**
     * Use AI to analyze and rank potential reviewers
     */
    private async performAIReviewerAnalysis(data: ReviewerAnalysisData): Promise<ReviewerRecommendation[]> {
        const systemInstruction = `You are an expert at matching code reviewers to pull requests in open source projects.

Your task is to analyze the PR and potential reviewers, then recommend the top reviewers based on:

1. CODEOWNERS file matches (highest priority)
2. Recent activity on the changed files
3. Expertise inferred from commit patterns
4. Reviewer workload balance

Consider the complexity and scope of changes when selecting reviewers.

Return ONLY a JSON array of reviewer objects with this exact structure:
[
  {
    "username": "<github_username>",
    "reasoning": "<detailed explanation>",
    "expertise": ["<area1>", "<area2>"],
    "familiarityLevel": "<high|medium|low>",
    "score": <number 0-100>
  }
]

Rank by suitability (highest score first). Return 3-6 reviewers maximum.`;

        // Build commit activity summary
        const commitSummary = this.buildCommitActivitySummary(data.commitHistory);
        
        const prompt = `Analyze and rank reviewers for this pull request:

**Repository:** ${data.pr.repoName}
**PR Title:** ${data.pr.title}
**PR Description:**
${data.pr.description || 'No description provided'}

**Files Changed (${data.files.length} files):**
${data.files.map(f => `- ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n')}

**CODEOWNERS Matches:**
${data.codeownersMatches.length > 0 ? data.codeownersMatches.join(', ') : 'None found'}

**Recent Commit Activity (last 6 months):**
${commitSummary}

**All Potential Reviewers:**
${data.potentialReviewers.join(', ')}

Rank these reviewers by their suitability to review this specific PR. Consider:
- CODEOWNERS matches should be weighted heavily
- Recent contributors to changed files are valuable
- Balance reviewer workload when possible
- Match reviewer expertise to PR complexity

Provide detailed reasoning for each recommendation.`;

        const result = await this.aiService.makeAIRequest(prompt, systemInstruction, {
            temperature: 0.3,
            maxTokens: 2048
        });

        if (result.success) {
            try {
                const analysisText = result.result as string;
                const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
                
                if (jsonMatch) {
                    const recommendations = JSON.parse(jsonMatch[0]);
                    
                    if (!Array.isArray(recommendations)) {
                        throw new Error('Response is not an array');
                    }

                    // Validate and enhance each recommendation
                    return recommendations.map((rec: any) => {
                        if (!rec.username || !rec.reasoning || !Array.isArray(rec.expertise) || 
                            !['high', 'medium', 'low'].includes(rec.familiarityLevel) ||
                            typeof rec.score !== 'number') {
                            throw new Error(`Invalid recommendation format for ${rec.username}`);
                        }

                        return {
                            username: rec.username,
                            reasoning: rec.reasoning,
                            expertise: rec.expertise,
                            familiarityLevel: rec.familiarityLevel as 'high' | 'medium' | 'low',
                            score: Math.min(100, Math.max(0, rec.score)),
                            codeownersMatch: data.codeownersMatches.includes(rec.username) || data.codeownersMatches.includes(`@${rec.username}`),
                            recentActivity: this.hasRecentActivity(rec.username, data.commitHistory),
                            hasRocketChatAccount: false // Will be filled in enhanceWithMetadata
                        };
                    });
                } else {
                    throw new Error('No JSON array found in AI response');
                }
            } catch (parseError) {
                this.app.getLogger().warn(`Failed to parse AI reviewer analysis: ${parseError.message}`);
                throw new Error(`Analysis parsing failed: ${parseError.message}`);
            }
        } else {
            throw new Error(`AI analysis failed: ${result.error}`);
        }
    }

    /**
     * Build summary of commit activity for the prompt
     */
    private buildCommitActivitySummary(commitHistory: { [file: string]: GitHubCommit[] }): string {
        const activityMap: { [user: string]: { files: string[], commits: number } } = {};

        Object.entries(commitHistory).forEach(([file, commits]) => {
            commits.forEach(commit => {
                if (commit.author?.login) {
                    const user = commit.author.login;
                    if (!activityMap[user]) {
                        activityMap[user] = { files: [], commits: 0 };
                    }
                    if (!activityMap[user].files.includes(file)) {
                        activityMap[user].files.push(file);
                    }
                    activityMap[user].commits++;
                }
            });
        });

        if (Object.keys(activityMap).length === 0) {
            return 'No recent activity found';
        }

        return Object.entries(activityMap)
            .sort(([,a], [,b]) => b.commits - a.commits)
            .slice(0, 10) // Top 10 most active
            .map(([user, activity]) => 
                `- ${user}: ${activity.commits} commits across ${activity.files.length} files`
            ).join('\n');
    }

    /**
     * Check if user has recent activity in the commit history
     */
    private hasRecentActivity(username: string, commitHistory: { [file: string]: GitHubCommit[] }): boolean {
        return Object.values(commitHistory).some(commits =>
            commits.some(commit => commit.author?.login === username)
        );
    }

    /**
     * Enhance recommendations with RC account mapping
     */
    private async enhanceWithMetadata(persistenceRead: IPersistenceRead, recommendations: ReviewerRecommendation[]): Promise<ReviewerRecommendation[]> {

        for (const rec of recommendations) {
            this.app.getLogger().info(`Reviewer ${rec.username} has expertise in ${rec.expertise} and familarity level ${rec.familiarityLevel}, ${rec.reasoning}, hence AI confidence is ${rec.score}`)
            try {
                const userMapping = await UserMappingPersistence.getUserMappingByGithubUsername(rec.username, persistenceRead);
                if (userMapping) {
                    rec.hasRocketChatAccount = true;
                    rec.rocketchatUserId = userMapping.rcUserId;
                }
            } catch (error) {
                this.app.getLogger().warn(`Failed to check RC mapping for ${rec.username}: ${error.message}`);
            }
        }

        return recommendations;
    }

    /**
     * Prioritize and sort recommendations
     */
    private prioritizeAndSort(recommendations: ReviewerRecommendation[]): ReviewerRecommendation[] {
        return recommendations.sort((a, b) => {
            // Primary: RC account availability
            if (a.hasRocketChatAccount !== b.hasRocketChatAccount) {
                return a.hasRocketChatAccount ? -1 : 1;
            }
            
            // Secondary: CODEOWNERS match
            if (a.codeownersMatch !== b.codeownersMatch) {
                return a.codeownersMatch ? -1 : 1;
            }
            
            // Tertiary: AI score
            return b.score - a.score;
        });
    }

    /**
     * Fallback recommendations when AI analysis fails
     */
    private async getFallbackReviewers(persistenceRead: IPersistenceRead, pr: StoredPR): Promise<ReviewerRecommendation[]> {
        this.app.getLogger().info(`Using fallback reviewer selection for PR #${pr.number}`);
        
        try {
            const [owner, repo, number] = pr.id.split('/');
            const files = await this.githubService.getPullRequestFiles(owner, repo, parseInt(number));
            const codeownersMatches = await this.getCodeownersMatches(persistenceRead, files, pr.repoName);
            
            const fallbackRecommendations: ReviewerRecommendation[] = codeownersMatches.slice(0, 3).map(username => ({
                username: username.startsWith('@') ? username.slice(1) : username,
                reasoning: 'Fallback recommendation based on CODEOWNERS file',
                expertise: ['general'],
                familiarityLevel: 'medium' as const,
                score: 70,
                codeownersMatch: true,
                recentActivity: false,
                hasRocketChatAccount: false
            }));

            return await this.enhanceWithMetadata(persistenceRead, fallbackRecommendations);
        } catch (error) {
            this.app.getLogger().error(`Fallback reviewer selection failed: ${error.message}`);
            return [];
        }
    }

    /**
     * Send reminders to all review assignments 
     */
    public async sendReviewReminders(read: IRead, modify: IModify, persistence: IPersistence, persistenceRead: IPersistenceRead): Promise<void> {
        try {
            const notificationService = this.app.getNotificationService();

            const reviewAssignments = await ReviewAssignmentPersistence.getAllPendingReviewAssignments(persistenceRead);
            if (!reviewAssignments) {
                this.app.getLogger().info(`No pending review assignments`);
                return;
            }
            
            for (const reviewAssignment of reviewAssignments) {
                const reviewer: ReviewerRecommendation = {
                    username: reviewAssignment.githubUsername,
                    reasoning: reviewAssignment.reasoning,
                    expertise: reviewAssignment.expertise,
                    familiarityLevel: reviewAssignment.familiarityLevel,
                    score: reviewAssignment.score,
                    codeownersMatch: reviewAssignment.codeownersMatch,
                    recentActivity: reviewAssignment.recentActivity,
                    hasRocketChatAccount: true,
                    rocketchatUserId: reviewAssignment.rcUserId,
                };
            
                const referencedPr = await PRPersistence.getPR(reviewAssignment.prId, persistenceRead);
            
                await notificationService.sendReviewerNotification(
                    referencedPr!, reviewer, read, modify, persistence
                );
            }

        } catch (error) {
            this.app.getLogger().error(`Failed to send review reminders: ${error.message}`);
            
        }
    }

}