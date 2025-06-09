import type {
	IHttp,
	IModify,
	IPersistence,
	IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { ApiEndpoint } from "@rocket.chat/apps-engine/definition/api";
import {
	IApiEndpoint,
	type IApiEndpointInfo,
	type IApiRequest,
	type IApiResponse,
} from "@rocket.chat/apps-engine/definition/api";

export class CodeReviewAgentWebhook extends ApiEndpoint {
	public path = "codereviewagentpwebhook";
	public async post(
		request: IApiRequest,
		endpoint: IApiEndpointInfo,
		read: IRead,
		modify: IModify,
		http: IHttp,
		persis: IPersistence,
	): Promise<IApiResponse> {
		const creator = modify.getCreator();
		const userReader = read.getUserReader();
		const payload = request.content;
		// handle payload
		return this.success();
	}
}
