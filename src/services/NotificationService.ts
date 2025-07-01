import { IModify, IRead, IPersistence } from '@rocket.chat/apps-engine/definition/accessors';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { GitHubPullRequest } from './GitHubAPIService';
import { ReviewerRecommendation } from './ReviewerMatchingService';
import { UserMappingPersistence } from '../persistence/UserMappingPersistence';
import { sendDirectMessage } from '../helpers/message';
import { LayoutBlock } from '@rocket.chat/ui-kit';
import { getSectionBlock, getActionsBlock, getButton } from '../helpers/blockBuilder';

export interface NotificationResult {
    successful: number;
    failed: number;
    details: {
        username: string;
        success: boolean;
        reason?: string;
        rcUserId?: string;
    }[];
}

export class NotificationService {
    constructor(private app: CodeReviewAgentApp) {}

    /**
     * Send review notifications to all recommended reviewers
     */
    public async notifyReviewers(
        pr: GitHubPullRequest, 
        reviewers: ReviewerRecommendation[], 
        repoName: string,
        read: IRead,
        modify: IModify,
        persistence: IPersistence
    ): Promise<NotificationResult> {
        this.app.getLogger().info(`Sending notifications for PR #${pr.number} to ${reviewers.length} reviewers`);

        const result: NotificationResult = {
            successful: 0,
            failed: 0,
            details: []
        };

        for (const reviewer of reviewers) {
            try {
                const notificationResult = await this.sendReviewerNotification(
                    pr, reviewer, repoName, read, modify, persistence
                );

                if (notificationResult.success) {
                    result.successful++;
                    result.details.push({
                        username: reviewer.username,
                        success: true,
                        rcUserId: reviewer.rocketchatUserId
                    });
                } else {
                    result.failed++;
                    result.details.push({
                        username: reviewer.username,
                        success: false,
                        reason: notificationResult.reason
                    });
                }
            } catch (error) {
                this.app.getLogger().error(`Failed to notify reviewer ${reviewer.username}: ${error.message}`);
                result.failed++;
                result.details.push({
                    username: reviewer.username,
                    success: false,
                    reason: error.message
                });
            }
        }

        this.app.getLogger().info(`Notification summary for PR #${pr.number}: ${result.successful} successful, ${result.failed} failed`);
        return result;
    }

    /**
     * Send notification to a single reviewer
     */
    private async sendReviewerNotification(
        pr: GitHubPullRequest,
        reviewer: ReviewerRecommendation,
        repoName: string,
        read: IRead,
        modify: IModify,
        persistence: IPersistence
    ): Promise<{ success: boolean; reason?: string }> {
        
        // Check if reviewer has RC account
        if (!reviewer.hasRocketChatAccount) {
            return { 
                success: false, 
                reason: `No Rocket.Chat account linked for GitHub user @${reviewer.username}` 
            };
        }

        try {
            // Get the RC user
            const rcUser = await read.getUserReader().getById(reviewer.rocketchatUserId!);
            if (!rcUser) {
                return { 
                    success: false, 
                    reason: `Rocket.Chat user not found for ID ${reviewer.rocketchatUserId}` 
                };
            }

            // Build and send notification message
            const message = this.buildNotificationMessage(pr, reviewer, repoName);
            const blocks = this.buildNotificationBlocks(pr, reviewer, repoName);

            await sendDirectMessage({
                read: read,
                modify: modify,
                user: rcUser,
                message: message,
                blocks: blocks,
                persistence: persistence
            });

            this.app.getLogger().info(`Successfully notified ${reviewer.username} (RC: ${rcUser.username}) about PR #${pr.number}`);
            return { success: true };

        } catch (error) {
            this.app.getLogger().error(`Failed to send notification to ${reviewer.username}: ${error.message}`);
            return { 
                success: false, 
                reason: `Notification delivery failed: ${error.message}` 
            };
        }
    }

    /**
     * Build notification message text
     */
    private buildNotificationMessage(pr: GitHubPullRequest, reviewer: ReviewerRecommendation, repoName: string): string {
        const prUrl = `https://github.com/${repoName}/pull/${pr.number}`;
        const expertiseText = reviewer.expertise.length > 0 ? ` (${reviewer.expertise.join(', ')})` : '';
        
        return `🔍 **You've been assigned to review a pull request!**

**Repository:** ${repoName}
**PR #${pr.number}:** ${pr.title}
**Author:** @${pr.user.login}

**Why you were selected:**
${reviewer.reasoning}

**Your expertise match:** ${reviewer.familiarityLevel}${expertiseText}
${reviewer.codeownersMatch ? '🎯 **CODEOWNERS match**' : ''}
${reviewer.recentActivity ? '📈 **Recent activity on these files**' : ''}

**View PR:** ${prUrl}

*Powered by Code Review Agent - helping you focus on the reviews that matter most.*`;
    }

    /**
     * Build interactive notification blocks
     */
    private buildNotificationBlocks(pr: GitHubPullRequest, reviewer: ReviewerRecommendation, repoName: string): LayoutBlock[] {
        const prUrl = `https://github.com/${repoName}/pull/${pr.number}`;
        
        const blocks: LayoutBlock[] = [
            getSectionBlock(`🔍 **New PR Review Assignment**

**Repository:** ${repoName}
**PR #${pr.number}:** ${pr.title}
**Author:** @${pr.user.login}
**Match Level:** ${reviewer.familiarityLevel} (${reviewer.score}/100)`),
            
            getSectionBlock(`**Why you were selected:**
${reviewer.reasoning}`),
            
            getActionsBlock('pr_actions', [
                getButton({
                    labelText: 'View Pull Request',
                    actionId: 'view_pr',
                    value: prUrl,
                    style: 'primary',
                    url: prUrl
                }),
                getButton({
                    labelText: 'View Changed Files',
                    actionId: 'view_files',
                    value: `${prUrl}/files`,
                    url: `${prUrl}/files`
                })
            ])
        ];

        // Add expertise and match indicators
        const indicators: string[] = [];
        if (reviewer.codeownersMatch) indicators.push('🎯 CODEOWNERS match');
        if (reviewer.recentActivity) indicators.push('📈 Recent file activity');
        if (reviewer.expertise.length > 0) indicators.push(`💡 Expertise: ${reviewer.expertise.join(', ')}`);

        if (indicators.length > 0) {
            blocks.push(getSectionBlock(indicators.join('\n')));
        }

        return blocks;
    }

    /**
     * Send notification to admins about successful PR processing
     */
    public async notifyAdminsOfProcessing(
        pr: GitHubPullRequest,
        repoName: string,
        reviewers: ReviewerRecommendation[],
        notificationResult: NotificationResult,
        read: IRead,
        modify: IModify,
        persistence: IPersistence
    ): Promise<void> {
        try {
            // Get admin users (those with high hierarchy)
            const adminUsers = await this.getAdminUsers(read);
            
            if (adminUsers.length === 0) {
                this.app.getLogger().warn('No admin users found to notify about PR processing');
                return;
            }

            const message = this.buildAdminNotificationMessage(pr, repoName, reviewers, notificationResult);

            for (const admin of adminUsers) {
                try {
                    await sendDirectMessage({
                        read: read,
                        modify: modify,
                        user: admin,
                        message: message,
                        persistence: persistence
                    });
                } catch (error) {
                    this.app.getLogger().warn(`Failed to notify admin ${admin.username}: ${error.message}`);
                }
            }

            this.app.getLogger().info(`Notified ${adminUsers.length} admins about PR #${pr.number} processing`);

        } catch (error) {
            this.app.getLogger().error(`Failed to notify admins: ${error.message}`);
        }
    }

    /**
     * Build admin notification message
     */
    private buildAdminNotificationMessage(
        pr: GitHubPullRequest,
        repoName: string,
        reviewers: ReviewerRecommendation[],
        notificationResult: NotificationResult
    ): string {
        const prUrl = `https://github.com/${repoName}/pull/${pr.number}`;
        const successfulReviewers = notificationResult.details
            .filter(d => d.success)
            .map(d => d.username)
            .join(', ');
        
        const failedReviewers = notificationResult.details
            .filter(d => !d.success)
            .map(d => `${d.username} (${d.reason})`)
            .join('\n- ');

        return `📊 **PR Processing Complete**

**Repository:** ${repoName}
**PR #${pr.number}:** ${pr.title}
**Author:** @${pr.user.login}

**Reviewers Assigned (${reviewers.length} total):**
✅ **Successfully notified (${notificationResult.successful}):** ${successfulReviewers || 'None'}

${notificationResult.failed > 0 ? `❌ **Failed notifications (${notificationResult.failed}):**\n- ${failedReviewers}` : ''}

**View PR:** ${prUrl}

*This is an automated summary from Code Review Agent.*`;
    }

    /**
     * Get admin users for notifications
     * Note: This is a simplified approach. In a real implementation,
     * you might want to store admin user IDs in app settings.
     */
    private async getAdminUsers(read: IRead): Promise<IUser[]> {
        try {
            // For now, we'll need to implement this differently since IUserRead 
            // doesn't have a getUsers() method. Options:
            // 1. Store admin user IDs in app settings
            // 2. Get admins from role-based approach using IRoleRead
            // 3. Notify only the app installer (from installation context)
            
            // Simple fallback: return empty array for now
            // TODO: Implement proper admin user discovery via settings or roles
            this.app.getLogger().warn('Admin user discovery not yet implemented - no admin notifications sent');
            return [];
        } catch (error) {
            this.app.getLogger().error(`Failed to get admin users: ${error.message}`);
            return [];
        }
    }

    /**
     * Send notification when spam is detected and queued for review
     */
    public async notifyAdminsOfSpamDetection(
        pr: GitHubPullRequest,
        repoName: string,
        spamScore: number,
        reasoning: string,
        read: IRead,
        modify: IModify,
        persistence: IPersistence
    ): Promise<void> {
        try {
            const adminUsers = await this.getAdminUsers(read);
            
            if (adminUsers.length === 0) {
                this.app.getLogger().warn('No admin users found to notify about spam detection');
                return;
            }

            const message = `🚨 **Spam Detected - Admin Review Required**

**Repository:** ${repoName}
**PR #${pr.number}:** ${pr.title}
**Author:** @${pr.user.login}
**Spam Score:** ${spamScore}/100

**Analysis:**
${reasoning}

**Action Required:** Use \`/code-review-agent spam\` to review pending spam detections.

**View PR:** https://github.com/${repoName}/pull/${pr.number}`;

            for (const admin of adminUsers) {
                try {
                    await sendDirectMessage({
                        read: read,
                        modify: modify,
                        user: admin,
                        message: message,
                        persistence: persistence
                    });
                } catch (error) {
                    this.app.getLogger().warn(`Failed to notify admin ${admin.username} about spam: ${error.message}`);
                }
            }

            this.app.getLogger().info(`Notified ${adminUsers.length} admins about spam detection in PR #${pr.number}`);

        } catch (error) {
            this.app.getLogger().error(`Failed to notify admins about spam: ${error.message}`);
        }
    }
}