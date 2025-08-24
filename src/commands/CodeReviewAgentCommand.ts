import {
  IHttp,
  IModify,
  IPersistence,
  IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
  ISlashCommand,
  SlashCommandContext,
} from "@rocket.chat/apps-engine/definition/slashcommands";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";

import { IAppInterface } from "../interfaces/IAppInterface";
import { handleAuthCommand } from "./subcommands/auth";
import { handleSpamCommand } from "./subcommands/spam";
import { handleStatusCommand } from "./subcommands/status";
import { handleTriggerCommand } from "./subcommands/trigger";
import { isUserHighHierarchy, sendNotification } from "../helpers/message";
import { usernameInputModal } from "../modals/UsernameInputModal";
import { handleApprovalsCommand } from "./subcommands/approvals";
import { handleCleanupCommand } from "./subcommands/cleanup";

export class CodeReviewAgentCommand implements ISlashCommand {
  public command = "code-review-agent";
  public i18nParamsExample = "slashcommand_params";
  public i18nDescription = "slashcommand_description";
  public providesPreview = false;

  constructor(private readonly app: IAppInterface) {}

  public async executor(
    context: SlashCommandContext,
    read: IRead,
    modify: IModify,
    http: IHttp,
    persistence: IPersistence
  ): Promise<void> {
    const command = this.getCommandFromContextArguments(context);
    const args = context.getArguments().slice(1);
    const triggerId = context.getTriggerId()!;
    const room = context.getRoom()
    const roomId = room.id;
    const persistenceRead = read.getPersistenceReader();

    if (!command) {
      return await this.displayAppHelpMessage(
        read,
        modify,
        context.getSender(),
        context.getRoom()
      );
    }

    switch (command) {
      case "auth":
        await handleAuthCommand(
          this.app,
          read,
          modify,
          context.getSender(),
          persistence
        );
        break;

      case "spam":
        await handleSpamCommand(
          this.app,
          read,
          modify,
          context.getSender(),
          context.getRoom(),
          persistence,
          args
        );
        break;

      case "status":
        await handleStatusCommand(
          this.app,
          read,
          modify,
          context.getSender(),
          context.getRoom(),
          persistence
        );
        break;
      case "trigger":
        await handleTriggerCommand(
          this.app,
          read,
          modify,
          context.getSender(),
          context.getRoom(),
          http,
          persistence
        );
        break;
      case "username":
        var modal = await usernameInputModal({ roomId });
        await modify.getUiController().openSurfaceView(modal, { triggerId }, context.getSender());
        break;
      case "approvals":
        await handleApprovalsCommand(
          this.app,
          read,
          modify,
          context.getSender(),
          room,
          persistence,
          persistenceRead,
          triggerId
        );
        break;
        case "cleanup":
          await handleCleanupCommand(
            this.app,
            modify,
            context.getSender(),
            room,
            persistence,
            persistenceRead
          );
          break;
      case "help":
      default:
        await this.displayAppHelpMessage(
          read,
          modify,
          context.getSender(),
          context.getRoom()
        );
        break;
    }
  }

  private getCommandFromContextArguments(context: SlashCommandContext): string {
    const [command] = context.getArguments();
    return command;
  }

  private async displayAppHelpMessage(
    read: IRead,
    modify: IModify,
    user: IUser,
    room: IRoom
  ): Promise<void> {
    const isAdmin = await isUserHighHierarchy(user, read)

    const adminCommands = isAdmin
      ? `

**🔧 Admin Commands:**
• \`spam\` - Review spam-detected PRs
• \`approve\` - List pending username mappings`
      : "";

    const text = `🤖 **Code Review Agent Commands**

**📋 General Commands:**
• \`help\` - Show this help message
• \`auth\` - Authenticate with GitHub (to link your GitHub account with Rocket.Chat account automatically)
• \`username\` - Submit GitHub username for review (to link your GitHub account with Rocket.Chat account after admin approval)
• \`status\` - Show app status and activity${adminCommands}

**🚀 About:**
This app helps streamline code reviews by:
• 🤖 AI-powered spam detection
• 👥 Smart reviewer matching
• 🔔 Automated notifications

**🔗 Account Linking:**
You can link your GitHub account via OAuth (\`auth\`) or submit your username for admin review (\`username\`).

Need help? Check the app settings for configuration options.`;

    return sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: text,
    });
  }
}
