import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { AIService } from './AIService';
import { GitHubAPIService, GitHubPullRequest } from './GitHubAPIService';
import { PRPersistence, StoredPR } from '../persistence/PRPersistence';
import { SpamReviewPersistence, SpamReviewItem } from '../persistence/SpamReviewPersistence';
import { IPersistence, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';

export interface SpamAnalysisResult {
    spamScore: number; // 0-100
    reasoning: string;
    keyFlags: string[];
    recommendation: 'review' | 'approve';
    isSpam: boolean; // Convenience flag: any detection = spam
}

export interface PRAnalysisData {
    pr: StoredPR;
    files: any[];
    userInfo: any;
    diffSummary: string;
    accountAge: number;
}

export class SpamDetectionService {
    private aiService: AIService;
    private githubService: GitHubAPIService;

    constructor(private app: CodeReviewAgentApp) {
        this.aiService = app.getAIService();
        this.githubService = app.getGitHubService();
    }

    /**
     * Main entry point - analyzes PR for spam and queues for admin review if detected
     */
    public async analyzePR(pr: StoredPR, repoName: string, persistence: IPersistence): Promise<SpamAnalysisResult> {
        try {
            this.app.getLogger().info(`Starting spam analysis for PR #${pr.number} in ${repoName}`);

            // Gather comprehensive PR data
            const analysisData = await this.gatherPRAnalysisData(pr);
            
                    // Perform AI-based spam analysis
        const spamResult = await this.performAISpamAnalysis(analysisData);
            
            // If spam detected, queue for admin review
            if (spamResult.isSpam) {
                await this.queueForAdminReview(pr, repoName, spamResult, persistence);
                this.app.getLogger().warn(`Spam detected in PR #${pr.number}: ${spamResult.reasoning}`);
            } else {
                this.app.getLogger().info(`PR #${pr.number} passed spam detection`);
            }

            return spamResult;

        } catch (error) {
            this.app.getLogger().error(`Spam detection failed for PR #${pr.number}: ${error.message}`);
            
            // Return safe fallback - treat as potential spam for manual review
            return {
                spamScore: 75,
                reasoning: `Analysis failed due to technical error: ${error.message}. Marked for manual review.`,
                keyFlags: ['analysis_error'],
                recommendation: 'review',
                isSpam: true
            };
        }
    }

    /**
     * Gather comprehensive data about the PR for analysis
     */
    private async gatherPRAnalysisData(pr: StoredPR): Promise<PRAnalysisData> {
        const [owner, repo, number] = pr.id.split('/');

        // Get PR files and user info in parallel
        const [files, userInfo] = await Promise.all([
            this.githubService.getPullRequestFiles(owner, repo, parseInt(number)),
            this.githubService.getUserInfo(pr.author.username)
        ]);

        // Calculate account age
        const accountCreated = new Date(pr.author.createdAt);
        const accountAge = Math.floor((Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24));

        // Generate diff summary
        const diffSummary = this.generateDiffSummary(files);

        return {
            pr,
            files,
            userInfo,
            diffSummary,
            accountAge
        };
    }

    /**
     * Use AI to analyze PR for spam characteristics
     */
    private async performAISpamAnalysis(data: PRAnalysisData): Promise<SpamAnalysisResult> {
        const systemInstruction = `You are an expert at detecting spam pull requests in open source repositories. 

Analyze the provided PR data and identify potential spam characteristics including:
- Very new GitHub accounts (< 30 days)
- Low-quality or nonsensical PR descriptions
- Suspicious file changes (adding unrelated files, large binary files)
- Poor commit messages
- Pattern matching for common spam (cryptocurrency, promotional content)
- Excessive changes for a first-time contributor
- Generic or template-like content

Return ONLY a JSON object with this exact structure:
{
  "spamScore": <number 0-100>,
  "reasoning": "<detailed explanation>",
  "keyFlags": ["<flag1>", "<flag2>"],
  "recommendation": "<review|approve>"
}`;

        const prompt = `Analyze this pull request for spam characteristics:

**Repository:** ${data.pr.repoName}
**PR Title:** ${data.pr.title}
**PR Description:**
${data.pr.description || 'No description provided'}

**Author Information:**
- Username: ${data.pr.author.username}
- Account Age: ${data.accountAge} days
- Public Repos: ${data.pr.author.publicRepos}
- Followers: ${data.pr.author.followers}

**Files Changed (${data.files.length} files):**
${data.files.map(f => `- ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n')}

**Diff Summary:**
${data.diffSummary}

Provide detailed analysis focusing on red flags that indicate this might be spam.`;

        const result = await this.aiService.makeAIRequest(prompt, systemInstruction, {
            temperature: 0.2, // Low temperature for consistent analysis
            maxTokens: 1024
        });

        if (result.success) {
            try {
                const analysisText = result.result as string;
                const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
                
                if (jsonMatch) {
                    const analysis = JSON.parse(jsonMatch[0]);
                    
                    // Validate required fields
                    if (typeof analysis.spamScore !== 'number' || 
                        !analysis.reasoning || 
                        !Array.isArray(analysis.keyFlags) ||
                        !['review', 'approve'].includes(analysis.recommendation)) {
                        throw new Error('Invalid analysis format');
                    }

                    // Any spam score > 0 = potential spam requiring review
                    const isSpam = analysis.spamScore > 50;
                    
                    return {
                        spamScore: Math.min(100, Math.max(0, analysis.spamScore)),
                        reasoning: analysis.reasoning,
                        keyFlags: analysis.keyFlags,
                        recommendation: analysis.recommendation,
                        isSpam
                    };
                } else {
                    throw new Error('No JSON found in AI response');
                }
            } catch (parseError) {
                this.app.getLogger().warn(`Failed to parse AI spam analysis: ${parseError.message}`);
                throw new Error(`Analysis parsing failed: ${parseError.message}`);
            }
        } else {
            throw new Error(`AI analysis failed: ${result.error}`);
        }
    }

    /**
     * Queue PR for admin review when spam is detected
     */
    private async queueForAdminReview(pr: StoredPR, repoName: string, spamResult: SpamAnalysisResult, persistence: IPersistence): Promise<void> {

        const spamReviewItem: SpamReviewItem = {
            prId: pr.id.toString(),
            repoName: repoName,
            prNumber: pr.number,
            title: pr.title,
            author: pr.author.username,
            spamScore: spamResult.spamScore,
            reasoning: spamResult.reasoning,
            flags: spamResult.keyFlags,
            createdAt: new Date(),
            status: 'pending'
        };

        await SpamReviewPersistence.saveSpamReviewItem(spamReviewItem, persistence);
        this.app.getLogger().info(`Queued PR #${pr.number} for admin spam review`);
    }

    /**
     * Generate summary of file changes for analysis
     */
    private generateDiffSummary(files: any[]): string {
        if (files.length === 0) return 'No files changed';

        const summary = {
            totalFiles: files.length,
            additions: files.reduce((sum, f) => sum + f.additions, 0),
            deletions: files.reduce((sum, f) => sum + f.deletions, 0),
            fileTypes: {} as { [ext: string]: number }
        };

        // Categorize file types
        files.forEach(file => {
            const ext = file.filename.split('.').pop()?.toLowerCase() || 'no-extension';
            summary.fileTypes[ext] = (summary.fileTypes[ext] || 0) + 1;
        });

        const topFileTypes = Object.entries(summary.fileTypes)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([ext, count]) => `${ext}(${count})`)
            .join(', ');

        return `${summary.totalFiles} files: +${summary.additions}/-${summary.deletions}. Types: ${topFileTypes}`;
    }

    /**
     * Admin helper - mark spam review item as approved/rejected
     */
    public async reviewSpamItem(prId: string, decision: 'approve' | 'reject' | 'ignore', reviewerUserId: string, persistence: IPersistence, persistenceRead: IPersistenceRead): Promise<void> {

        const statusMap = {
            'approve': 'approved' as const,
            'reject': 'rejected' as const,
            'ignore': 'ignored' as const
        };

        await SpamReviewPersistence.updateSpamReviewStatus(
            prId,
            statusMap[decision],
            reviewerUserId,
            persistence,
            persistenceRead
        );

        this.app.getLogger().info(`Spam review decision for PR ${prId}: ${decision} by ${reviewerUserId}`);
    }

    /**
     * Get pending spam reviews for admin interface
     */
    public async getPendingSpamReviews(persistenceRead: IPersistenceRead): Promise<SpamReviewItem[]> {
        return await SpamReviewPersistence.getPendingSpamReviews(persistenceRead);
    }
}