import type {
  ILogger,
  IRead,
  IModify,
  IHttp,
  IPersistence,
} from "@rocket.chat/apps-engine/definition/accessors";
import type { IOAuth2Client } from "@rocket.chat/apps-engine/definition/oauth2/IOAuth2";
import { PRService } from "../services/PRService";
import { GitHubAPIService } from "../services/GitHubAPIService";
import { AIService } from "../services/AIService";
import { CodeownersService } from "../services/CodeownersService";
import { SpamDetectionService } from "../services/SpamDetectionService";
import { ReviewerMatchingService } from "../services/ReviewerMatchingService";
import { NotificationService } from "../services/NotificationService";

export interface IAppInterface {
  getLogger(): ILogger;
  getOauth2ClientInstance(): IOAuth2Client;
  getPRService(): PRService;
  getGitHubService(): GitHubAPIService;
  getAIService(): AIService;
  getCodeownersService(): CodeownersService;
  getSpamDetectionService(): SpamDetectionService;
  getReviewerMatchingService(): ReviewerMatchingService;
  getNotificationService(): NotificationService;
  runPRProcessingPipeline(
    read: IRead,
    modify: IModify,
    http: IHttp,
    persistence: IPersistence
  ): Promise<void>;
}
