import { IUIKitSurfaceViewParam } from '@rocket.chat/apps-engine/definition/accessors';
import { ModalsEnum } from '../enums/Modals';
import { UIKitSurfaceType } from '@rocket.chat/apps-engine/definition/uikit';
import { LayoutBlock} from '@rocket.chat/ui-kit';
import { getActionsBlock, getButton, getContextBlock, getDividerBlock, getImage, getInputBox, getSectionBlock } from '../helpers/blockBuilder';
import { PendingUserMapping } from '../persistence/PendingUserMappingPersistence';
import { BlockActionEnum } from '../enums/BlockAction';

export async function pendingUsernameApprovalsModal({pendingMappings, roomId}: {pendingMappings: PendingUserMapping[], roomId: string}): Promise<IUIKitSurfaceViewParam> {
    const viewId = ModalsEnum.PENDING_USER_MAPPING_APPROVALS;
    const blocks = buildMappingListBlocks(pendingMappings, roomId);

    let closeButton = getButton({labelText: 'Close'});  
  
    return {
      id: viewId,
      type: UIKitSurfaceType.MODAL,
      title: {
        type: 'plain_text',
        text: ModalsEnum.PENDING_USER_MAPPING_APPROVALS_MODAL_NAME,
      },
      close: closeButton,
      blocks: blocks,
    };
}

  /**
   * Build interactive blocks for mapping list
   */
  function buildMappingListBlocks(pendingMappings: PendingUserMapping[], roomId: string): LayoutBlock[] {
    const blocks: LayoutBlock[] = [
      getSectionBlock(
        `👥 **${pendingMappings.length} Pending Username Mapping${
          pendingMappings.length === 1 ? "" : "s"
        }**`, undefined, "mrkdwn"
      ),
    ];
    
    pendingMappings.forEach((mapping, index) => {
      const accountAge = new Date(mapping.githubMetadata.createdAt).toLocaleDateString();
      
      blocks.push(
        getSectionBlock(
          `${index + 1}. **@${mapping.rocketchatUsername}** → **@${mapping.githubUsername}**\n` +
          `👤 ${mapping.githubMetadata.name || mapping.githubUsername} | 🏢 ${mapping.githubMetadata.company || 'No company'}\n` +
          `🐙 ${mapping.githubMetadata.publicRepos} repos, ${mapping.githubMetadata.followers} followers | 📅 ${accountAge}\n`,
          getImage({
            imageUrl: mapping.githubMetadata.avatarUrl,
            altText: mapping.githubUsername
          }),
          "mrkdwn"
        ),
  
        getActionsBlock(`username-actions_${mapping.rocketchatUserId}`, [
          getButton({
            labelText: "View GitHub",
            actionId: `view_github_${mapping.rocketchatUserId}`,
            url: mapping.githubMetadata.htmlUrl,
          }),
          getButton({
            labelText: "✅ Approve",
            actionId: BlockActionEnum.APPROVE_USER_MAPPING_ACTION_ID,
            value: `${roomId}#${mapping.rocketchatUserId}`,
            style: "primary",
          }),
          getButton({
            labelText: "❌ Reject",
            actionId: BlockActionEnum.REJECT_USER_MAPPING_ACTION_ID,
            value: `${roomId}#${mapping.rocketchatUserId}`,
            style: "danger",
          }),
        ])
      );

      blocks.push(getDividerBlock());
      
    });
  
    return blocks;
  } 