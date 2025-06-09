import type {
	IHttp,
	IModify,
	IPersistence,
	IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import type { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import type {
	ISlashCommand,
	SlashCommandContext,
} from "@rocket.chat/apps-engine/definition/slashcommands";
import type { IUser } from "@rocket.chat/apps-engine/definition/users";
import type { CodeReviewAgentApp } from "../../CodeReviewAgentApp";
import { sendNotification } from "../helpers/message";
import { authorize } from "./subcommands/authorize";

export class CodeReviewAgentCommand implements ISlashCommand {
	public command = "code-review-agent";
	public i18nParamsExample = "slashcommand_params";
	public i18nDescription = "slashcommand_description";
	public providesPreview = false;

	constructor(private readonly app: CodeReviewAgentApp) {}

	public async executor(
		context: SlashCommandContext,
		read: IRead,
		modify: IModify,
		http: IHttp,
		persistence: IPersistence,
	): Promise<void> {
		const command = this.getCommandFromContextArguments(context);
		if (!command) {
			return await this.displayAppHelpMessage(
				read,
				modify,
				context.getSender(),
				context.getRoom(),
			);
		}

		switch (command) {
			case "auth":
				await authorize(
					this.app,
					read,
					modify,
					context.getSender(),
					persistence,
				);
				break;
			default:
				await this.displayAppHelpMessage(
					read,
					modify,
					context.getSender(),
					context.getRoom(),
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
		room: IRoom,
	): Promise<void> {
		const text = `Code Review Agent App provides you the following slash commands, /code-review-agent-app:
        1. \`help:\` shows this list.
        2. \`auth:\` starts the process to authorize your GitHub Account.
    `;

		return sendNotification({
			modify: modify,
			user: user,
			room: room,
			message: text,
		});
	}
}
