import { App } from "@rocket.chat/apps-engine/definition/App";
import type {
	IAppAccessors,
	IAppInstallationContext,
	IConfigurationExtend,
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
import { CodeReviewAgentCommand } from "./src/commands/CodeReviewAgentCommand";
import { CodeReviewAgentWebhook } from "./src/endpoints/incoming";
import { isUserHighHierarchy, sendDirectMessage } from "./src/helpers/message";

export class CodeReviewAgentApp extends App {
	public botUser: IUser;
	public readonly botUsername: string = "code-review-agent-app.bot";
	private readonly oauth2ClientInstance: IOAuth2Client;

	private oauth2Config: IOAuth2ClientOptions = {
		alias: "code-review-agent-app",
		accessTokenUri: "https://github.com/login/oauth/access_token",
		authUri: "https://github.com/login/oauth/authorize",
		refreshTokenUri: "https://github.com/login/oauth/access_token",
		revokeTokenUri: "https://api.github.com/applications/client_id/token",
		authorizationCallback: this.authorizationCallback.bind(this),
		defaultScopes: ["users", "repo"],
	};

	constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
		super(info, logger, accessors);
		this.oauth2ClientInstance = createOAuth2Client(this, this.oauth2Config);
	}

	private async authorizationCallback(
		token: IAuthData,
		user: IUser,
		read: IRead,
		modify: IModify,
		http: IHttp,
		persistence: IPersistence,
	) {
		const text = `The authentication process has succeeded! :tada:`;
		await sendDirectMessage({
			read: read,
			modify: modify,
			user: user,
			message: text,
			persistence: persistence,
		});
	}

	public async onInstall(
		context: IAppInstallationContext,
		read: IRead,
		http: IHttp,
		persistence: IPersistence,
		modify: IModify,
	): Promise<void> {
		const user = context.user;
		const quickReminder =
			"Quick reminder: Let your team members know about the Code Review App.\n";
		const text =
			`Welcome to the Code Review Agent Rocket.Chat App!\n` +
			`To start managing your repositories, You first need to complete the app's setup and then authorize your GitHub account.\n` +
			`To do so, type  \`/code-review-agent-app auth\`\n` +
			`${isUserHighHierarchy(user) ? quickReminder : ""}`;
		await sendDirectMessage({
			read: read,
			modify: modify,
			user: user,
			message: text,
			persistence: persistence,
		});
	}

	public getOauth2ClientInstance(): IOAuth2Client {
		return this.oauth2ClientInstance;
	}

	public async extendConfiguration(
		configuration: IConfigurationExtend,
	): Promise<void> {
		await Promise.all([
			this.getOauth2ClientInstance().setup(configuration),
			configuration.slashCommands.provideSlashCommand(
				new CodeReviewAgentCommand(this),
			),
			configuration.api.provideApi({
				visibility: ApiVisibility.PUBLIC,
				security: ApiSecurity.UNSECURE,
				endpoints: [new CodeReviewAgentWebhook(this)],
			}),
		]);
	}
}
