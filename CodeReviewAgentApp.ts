import { App } from "@rocket.chat/apps-engine/definition/App";
import type {
  IAppAccessors,
  IAppInstallationContext,
  IConfigurationExtend,
  IConfigurationModify,
  IHttp,
  ILogger,
  IModify,
  IPersistence,
  IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
  ApiSecurity,
  ApiVisibility,
} from "@rocket.chat/apps-engine/definition/api";
import type { IAppInfo } from "@rocket.chat/apps-engine/definition/metadata";
import type {
  IAuthData,
  IOAuth2Client,
  IOAuth2ClientOptions,
} from "@rocket.chat/apps-engine/definition/oauth2/IOAuth2";
import { createOAuth2Client } from "@rocket.chat/apps-engine/definition/oauth2/OAuth2";
import type { IUser } from "@rocket.chat/apps-engine/definition/users";
import { StartupType } from "@rocket.chat/apps-engine/definition/scheduler";
import { ISettingUpdateContext } from "@rocket.chat/apps-engine/definition/settings/ISettingUpdateContext";
import { ISetting } from "@rocket.chat/apps-engine/definition/settings";

// Import services
import { PRService } from "./src/services/PRService";
import { GitHubAPIService } from "./src/services/GitHubAPIService";
import { GeminiService } from "./src/services/GeminiService";
import { CodeownersService } from "./src/services/CodeownersService";
import { SpamDetectionService } from "./src/services/SpamDetectionService";
import { ReviewerMatchingService } from "./src/services/ReviewerMatchingService";
import { NotificationService } from "./src/services/NotificationService";

// Import persistence
import {
  UserMappingPersistence,
  UserMapping,
} from "./src/persistence/UserMappingPersistence";
import { CodeownersPersistence } from "./src/persistence/CodeownersPersistence";

// Import commands and endpoints
import { CodeReviewAgentCommand } from "./src/commands/CodeReviewAgentCommand";
import { CodeReviewAgentWebhook } from "./src/endpoints/incoming";

// Import helpers and config
import { isUserHighHierarchy, sendDirectMessage } from "./src/helpers/message";
import { ValidationHelper } from "./src/helpers/validation";
import { settings, AppSettingsEnum } from "./src/config/settings";

// Import handlers
import { handleOnPreSettingUpdate } from "./src/handlers/onPreSettingUpdateHandler";
import { handleOnSettingUpdated } from "./src/handlers/onSettingUpdatedHandler";
import { IAppInterface } from "./src/interfaces/IAppInterface";

export class CodeReviewAgentApp extends App implements IAppInterface {
  public botUser: IUser;
  public readonly botUsername: string = "code-review-agent-app.bot";
  private readonly oauth2ClientInstance: IOAuth2Client;

  // Services
  private prService?: PRService;
  private githubService?: GitHubAPIService;
  private geminiService?: GeminiService;
  private codeownersService?: CodeownersService;
  private spamDetectionService?: SpamDetectionService;
  private reviewerMatchingService?: ReviewerMatchingService;
  private notificationService?: NotificationService;

  private oauth2Config: IOAuth2ClientOptions = {
    alias: "code-review-agent-app",
    accessTokenUri: "https://github.com/login/oauth/access_token",
    authUri: "https://github.com/login/oauth/authorize",
    refreshTokenUri: "https://github.com/login/oauth/access_token",
    revokeTokenUri: "https://api.github.com/applications/client_id/token",
    authorizationCallback: this.authorizationCallback.bind(this),
    defaultScopes: ["user:email", "repo"],
  };

  constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
    super(info, logger, accessors);
    this.oauth2ClientInstance = createOAuth2Client(this, this.oauth2Config);
  }

  // Service getters with lazy initialization
  public getPRService(): PRService {
    if (!this.prService) {
      this.prService = new PRService(this);
    }
    return this.prService;
  }

  public getGitHubService(): GitHubAPIService {
    if (!this.githubService) {
      this.githubService = new GitHubAPIService(this);
    }
    return this.githubService;
  }

  public getGeminiService(): GeminiService {
    if (!this.geminiService) {
      this.geminiService = new GeminiService(this);
    }
    return this.geminiService;
  }

  public getCodeownersService(): CodeownersService {
    if (!this.codeownersService) {
      this.codeownersService = new CodeownersService(this);
    }
    return this.codeownersService;
  }
  public getSpamDetectionService(): SpamDetectionService {
    if (!this.spamDetectionService) {
      this.spamDetectionService = new SpamDetectionService(this);
    }
    return this.spamDetectionService;
  }

  public getReviewerMatchingService(): ReviewerMatchingService {
    if (!this.reviewerMatchingService) {
      this.reviewerMatchingService = new ReviewerMatchingService(this);
    }
    return this.reviewerMatchingService;
  }

  public getNotificationService(): NotificationService {
    if (!this.notificationService) {
      this.notificationService = new NotificationService(this);
    }
    return this.notificationService;
  }

  private async authorizationCallback(
    token: IAuthData,
    user: IUser,
    read: IRead,
    modify: IModify,
    http: IHttp,
    persistence: IPersistence
  ) {
    try {
      // Get GitHub user info to store username mapping
      const githubService = this.getGitHubService();

      // Make a request to get user info using the OAuth token
      const response = await http.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token.token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (response.statusCode !== 200) {
        throw new Error("Failed to get GitHub user information");
      }

      const githubUser = response.data;

      // Store user mapping
      const userMapping: UserMapping = {
        rcUserId: user.id,
        rcUsername: user.username,
        githubUsername: githubUser.login,
        githubToken: token.token,
        createdAt: new Date(),
        lastUsed: new Date(),
      };

      await UserMappingPersistence.saveUserMapping(userMapping, persistence);

      const text = `✅ **Authentication Successful!**

Your GitHub account **@${githubUser.login}** has been linked to your Rocket.Chat account.

You will now receive notifications when you're assigned as a reviewer for pull requests.`;

      await sendDirectMessage({
        read: read,
        modify: modify,
        user: user,
        message: text,
        persistence: persistence,
      });
    } catch (error) {
      this.getLogger().error(`OAuth callback error: ${error.message}`);

      const errorText = `❌ **Authentication Failed**

There was an error linking your GitHub account. Please try again or contact your administrator.

Error: ${error.message}`;

      await sendDirectMessage({
        read: read,
        modify: modify,
        user: user,
        message: errorText,
        persistence: persistence,
      });
    }
  }

  public async onInstall(
    context: IAppInstallationContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify
  ): Promise<void> {
    const user = context.user;
    const quickReminder = isUserHighHierarchy(user)
      ? "Quick reminder: Let your team members know about the Code Review Agent and encourage them to authenticate with their GitHub accounts.\n"
      : "";

    const text = `🚀 **Welcome to the Code Review Agent!**

This app helps streamline your code review process by:
• 🤖 **AI-powered spam detection** for pull requests
• 👥 **Smart reviewer matching** based on codeowners and commit history  
• 🔔 **Automatic notifications** to the best reviewers

**Next Steps:**
1. Configure the app settings (GitHub org, repositories, tokens)
2. Authenticate your GitHub account: \`/code-review-agent auth\`
3. Start receiving intelligent PR review assignments!

${quickReminder}Need help? Use \`/code-review-agent help\` for available commands.`;

    await sendDirectMessage({
      read: read,
      modify: modify,
      user: user,
      message: text,
      persistence: persistence,
    });
  }

  public async onPreSettingUpdate(
    context: ISettingUpdateContext,
    configurationModify: IConfigurationModify,
    read: IRead,
    http: IHttp
  ): Promise<ISetting> {
    return handleOnPreSettingUpdate(context, configurationModify, read, http);
  }

  public async onSettingUpdated(
    setting: ISetting,
    configurationModify: IConfigurationModify,
    read: IRead,
    http: IHttp
  ): Promise<void> {
    return handleOnSettingUpdated(
      setting,
      configurationModify,
      read,
      http,
      this.getLogger(),
      () => {
        this.geminiService = undefined;
        this.spamDetectionService = undefined;
        this.reviewerMatchingService = undefined;
      },
      () => {
        this.githubService = undefined;
        this.prService = undefined;
        this.codeownersService = undefined;
        this.reviewerMatchingService = undefined;
      }
    );
  }

  public getOauth2ClientInstance(): IOAuth2Client {
    return this.oauth2ClientInstance;
  }

  public async extendConfiguration(
    configuration: IConfigurationExtend
  ): Promise<void> {
    // Setup OAuth2
    await this.getOauth2ClientInstance().setup(configuration);

    // Setup slash commands
    await configuration.slashCommands.provideSlashCommand(
      new CodeReviewAgentCommand(this)
    );

    // Setup API endpoints
    await configuration.api.provideApi({
      visibility: ApiVisibility.PUBLIC,
      security: ApiSecurity.UNSECURE,
      endpoints: [new CodeReviewAgentWebhook(this)],
    });

    // Setup schedulers
    await configuration.scheduler.registerProcessors([
      {
        id: "pr-fetcher-processor",
        startupSetting: {
          type: StartupType.RECURRING,
          interval: "0 */12 * * *", // Every 12 hours
        },
        processor: async (jobContext, read, modify, http, persistence) => {
          this.getLogger().info("Starting PR fetcher and processing job");
          try {
            await this.runPRProcessingPipeline(read, modify, http, persistence);
          } catch (error) {
            this.getLogger().error(
              `PR processing pipeline failed: ${error.message}`
            );
          }
        },
      },
      {
        id: "codeowners-sync",
        startupSetting: {
          type: StartupType.RECURRING,
          interval: "0 0 * * 0", // Weekly on Sunday
        },
        processor: async (jobContext, read, modify, http, persistence) => {
          this.getLogger().info("Starting codeowners sync job");
          try {
            const codeownersService = this.getCodeownersService();
            await codeownersService.syncAllRepositories(persistence);
            this.getLogger().info("Codeowners sync completed successfully");
          } catch (error) {
            this.getLogger().error(`Codeowners sync failed: ${error.message}`);
          }
        },
      },
    ]);

    // Setup settings with validation
    for (const setting of settings) {
      await configuration.settings.provideSetting(setting);
    }
  }

  /**
   * Main PR Processing Pipeline - Phase 2 Implementation
   */
  public async runPRProcessingPipeline(
    read: IRead,
    modify: IModify,
    http: IHttp,
    persistence: IPersistence
  ): Promise<void> {
    try {
      const prService = this.getPRService();
      const spamService = this.getSpamDetectionService();
      const reviewerService = this.getReviewerMatchingService();
      const notificationService = this.getNotificationService();
      const persistenceRead = read.getPersistenceReader();

      // Step 1: Fetch new PRs
      const newPRs = await prService.fetchAndStoreNewPRs(
        persistence,
        persistenceRead
      );
      this.getLogger().info(`Found ${newPRs.length} new PRs to process`);

      if (newPRs.length === 0) {
        this.getLogger().info("No new PRs to process");
        return;
      }

      // Step 2: Process each new PR through the pipeline
      for (const prData of newPRs) {
        try {
          await this.processSinglePR(prData, read, modify, persistence);
        } catch (error) {
          this.getLogger().error(
            `Failed to process PR ${prData.id}: ${error.message}`
          );
          // Continue with other PRs even if one fails
        }
      }

      this.getLogger().info(
        `PR processing pipeline completed for ${newPRs.length} PRs`
      );
    } catch (error) {
      this.getLogger().error(`PR processing pipeline failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process a single PR through the complete pipeline
   */
  private async processSinglePR(
    prData: any,
    read: IRead,
    modify: IModify,
    persistence: IPersistence
  ): Promise<void> {
    const prId = prData.id.toString();
    const repoName = prData.repository || prData.repoName;

    this.getLogger().info(`Processing PR #${prData.prNumber} in ${repoName}`);

    try {
      const spamService = this.getSpamDetectionService();
      const reviewerService = this.getReviewerMatchingService();
      const notificationService = this.getNotificationService();
      const prService = this.getPRService();
      const persistenceRead = read.getPersistenceReader();

      // Step 1: Spam Detection
      this.getLogger().debug(`Running spam detection for PR ${prId}`);
      const spamResult = await spamService.analyzePR(
        prData,
        repoName,
        persistence
      );

      if (spamResult.isSpam) {
        // Update PR status and notify admins
        await prService.updatePRStatus(
          prId,
          "spam_detected",
          persistence,
          persistenceRead,
          {
            spamScore: spamResult.spamScore,
            spamReasoning: spamResult.reasoning,
            spamFlags: spamResult.keyFlags,
          }
        );

        await notificationService.notifyAdminsOfSpamDetection(
          prData,
          repoName,
          spamResult.spamScore,
          spamResult.reasoning,
          read,
          modify,
          persistence
        );

        this.getLogger().warn(
          `PR ${prId} flagged as spam (score: ${spamResult.spamScore})`
        );
        return; // Stop processing for spam PRs
      }

      // Step 2: Reviewer Matching (only for clean PRs)
      this.getLogger().debug(`Finding reviewers for PR ${prId}`);
      const reviewers = await reviewerService.findReviewers(
        persistenceRead,
        prData,
        repoName
      );

      if (reviewers.length === 0) {
        await prService.updatePRStatus(
          prId,
          "failed",
          persistence,
          persistenceRead,
          {
            errorMessage: "No suitable reviewers found",
          }
        );
        this.getLogger().warn(`No reviewers found for PR ${prId}`);
        return;
      }

      // Step 3: Update PR with reviewer assignments
      await prService.updatePRStatus(
        prId,
        "reviewers_assigned",
        persistence,
        persistenceRead,
        {
          assignedReviewers: reviewers,
        }
      );

      // Step 4: Send Notifications
      this.getLogger().debug(`Sending notifications for PR ${prId}`);
      const notificationResult = await notificationService.notifyReviewers(
        prData,
        reviewers,
        repoName,
        read,
        modify,
        persistence
      );

      // Step 5: Notify admins of successful processing
      await notificationService.notifyAdminsOfProcessing(
        prData,
        repoName,
        reviewers,
        notificationResult,
        read,
        modify,
        persistence
      );

      // Final status update
      const finalStatus =
        notificationResult.successful > 0 ? "clean" : "failed";
      await prService.updatePRStatus(
        prId,
        finalStatus,
        persistence,
        persistenceRead
      );

      this.getLogger().info(
        `PR ${prId} processed successfully: ${reviewers.length} reviewers assigned, ` +
          `${notificationResult.successful} notifications sent`
      );
    } catch (error) {
      // Update PR status as failed
      const prService = this.getPRService();
      const persistenceRead = read.getPersistenceReader();
      await prService.updatePRStatus(
        prId,
        "failed",
        persistence,
        persistenceRead,
        {
          errorMessage: error.message,
        }
      );

      this.getLogger().error(`PR ${prId} processing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validates all app settings
   */
  public async validateSettings(): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      const settingsReader =
        this.getAccessors().environmentReader.getSettings();
      // Validate GitHub settings
      const owner = await settingsReader.getValueById(
        AppSettingsEnum.OWNER_NAME_ID
      );
      if (!owner || !ValidationHelper.isValidGitHubUsername(owner)) {
        errors.push("Invalid GitHub owner/organization name");
      }

      const token = await settingsReader.getValueById(
        AppSettingsEnum.ORG_ADMIN_PAT_TOKEN_ID
      );
      if (!token || !ValidationHelper.isValidGitHubToken(token)) {
        errors.push("Invalid GitHub Personal Access Token");
      }

      const repositoriesRaw = await settingsReader.getValueById(
        AppSettingsEnum.REPOSITORIES_LIST_ID
      );
      if (!repositoriesRaw) {
        errors.push("Repository list is required");
      } else {
        const repositories =
          ValidationHelper.sanitizeRepositoryList(repositoriesRaw);
        if (repositories.length === 0) {
          errors.push("No valid repositories found in repository list");
        }
      }

      // Validate Gemini settings
      const apiKey = await settingsReader.getValueById(
        AppSettingsEnum.GEMINI_API_KEY_ID
      );
      if (!apiKey || !ValidationHelper.isValidApiKey(apiKey)) {
        errors.push("Invalid Gemini API key");
      }

      const model = await settingsReader.getValueById(
        AppSettingsEnum.GEMINI_MODEL_ID
      );
      if (!model) {
        errors.push("Gemini model selection is required");
      }
    } catch (error) {
      errors.push(`Settings validation error: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
