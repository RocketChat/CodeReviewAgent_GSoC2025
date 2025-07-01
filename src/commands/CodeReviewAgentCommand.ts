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
import { authorize } from "./subcommands/authorize";
import { handleSpamCommand } from "./subcommands/spam";
import { handleStatusCommand } from "./subcommands/status";
import { handleTriggerCommand } from "./subcommands/trigger";
import { sendNotification } from "../helpers/message";

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
        await authorize(
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
    const isAdmin =
      user.roles &&
      user.roles.some((role) => role === "admin" || role === "owner");

    const adminCommands = isAdmin
      ? `

**🔧 Admin Commands:**
• \`spam\` - Review spam-detected PRs
• \`spam list\` - List pending spam reviews
• \`spam approve <pr_id>\` - Approve flagged PR
• \`spam reject <pr_id>\` - Reject as spam
• \`spam ignore <pr_id>\` - Ignore PR`
      : "";

    const text = `🤖 **Code Review Agent Commands**

**📋 General Commands:**
• \`help\` - Show this help message
• \`auth\` - Authenticate with GitHub
• \`status\` - Show app status and activity${adminCommands}

**💡 Examples:**
• \`/code-review-agent auth\`
• \`/code-review-agent status\`${isAdmin ? "\n• `/code-review-agent spam`" : ""}

**🚀 About:**
This app helps streamline code reviews by:
• 🤖 AI-powered spam detection
• 👥 Smart reviewer matching
• 🔔 Automated notifications

Need help? Check the app settings for configuration options.`;

    return sendNotification({
      modify: modify,
      user: user,
      room: room,
      message: text,
    });
  }
}
