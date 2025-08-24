import { IUIKitSurfaceViewParam } from '@rocket.chat/apps-engine/definition/accessors';
import { ModalsEnum } from '../enums/Modals';
import { UIKitSurfaceType } from '@rocket.chat/apps-engine/definition/uikit';
import { LayoutBlock} from '@rocket.chat/ui-kit';
import { getButton, getInputBox, getSectionBlock } from '../helpers/blockBuilder';

export async function usernameInputModal({roomId}: {roomId: string}): Promise<IUIKitSurfaceViewParam> {
  const viewId = ModalsEnum.USERNAME_INPUT + `#${roomId}`;
  const block: LayoutBlock[] = [];
  block.push(
    getSectionBlock(
      `ℹ️ You may also use \`auth\` command to automatically link your GitHub account, using OAuth also allows you to do AI powered PR reviews on your behalf.`,
      undefined,
      "mrkdwn"
    ))
  let githubUsernameInputBox = getInputBox({ labelText: ModalsEnum.GITHUB_USERNAME_INPUT_LABEL, placeholderText: ModalsEnum.GITHUB_USERNAME_INPUT_LABEL_DEFAULT, blockId: ModalsEnum.GITHUB_USERNAME_BLOCK, actionId: ModalsEnum.GITHUB_USERNAME_INPUT});
  
  block.push(githubUsernameInputBox);

  let closeButton = getButton({labelText: 'Close'});

  let submitButton = getButton({labelText: ModalsEnum.SAVE_USERNAME_SUBMIT_BUTTON_LABEL, actionId: ModalsEnum.SAVE_USERNAME});

  return {
    id: viewId,
    type: UIKitSurfaceType.MODAL,
    title: {
      type: 'plain_text',
      text: ModalsEnum.USERNAME_INPUT_MODAL_NAME,
    },
    close: closeButton,
    submit: submitButton,
    blocks: block,
  };
}