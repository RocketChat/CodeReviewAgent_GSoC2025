import { IModify, IRead, IPersistence } from "@rocket.chat/apps-engine/definition/accessors";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { CodeReviewAgentApp } from "../../../CodeReviewAgentApp";
import { sendNotification } from "../../helpers/message";

export async function handleStatusCommand(
	app: CodeReviewAgentApp,
	read: IRead,
	modify: IModify,
	user: IUser,
	room: IRoom,
	persistence: IPersistence
): Promise<void> {
	try {
		const spamService = app.getSpamDetectionService();
		const persistenceRead = read.getPersistenceReader()
		// Get recent stats
		const pendingSpamReviews = await spamService.getPendingSpamReviews(persistenceRead);
		
		const message = `📊 **Code Review Agent Status**

		• 🔍 Spam reviews needed: ${pendingSpamReviews.length}

		**Quick Actions:**
		• \`/code-review-agent spam\` - Review spam detections
		• \`/code-review-agent auth\` - Link GitHub account
		• \`/code-review-agent help\` - Show all commands

		*Last updated: ${new Date().toLocaleString()}*`;

		await sendNotification({
			modify: modify,
			user: user,
			room: room,
			message: message
		});
		
	} catch (error) {
		app.getLogger().error(`Status command failed: ${error.message}`);
		await sendNotification({
			modify: modify,
			user: user,
			room: room,
			message: `❌ **Unable to retrieve status:** ${error.message}`
		});
	}
}
