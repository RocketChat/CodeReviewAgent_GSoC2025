import type {
  IModify,
  IPersistence,
  IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import type { IUser } from "@rocket.chat/apps-engine/definition/users";
import type { IAppInterface } from "../../interfaces/IAppInterface";
import { getButton, getSectionBlock } from "../../helpers/blockBuilder";
import { sendDirectMessage } from "../../helpers/message";

export async function handleAuthCommand(
  app: IAppInterface,
  read: IRead,
  modify: IModify,
  user: IUser,
  persistence: IPersistence
): Promise<void> {
  const url = await app.getOauth2ClientInstance().getUserAuthorizationUrl(user);
  const authButton = getAuthorizeButton(url.toString());

  const textsectionBlock = getSectionBlock(
    "Please click the button below to authorize access to your GitHub account 👇",
    authButton
  );

  await sendDirectMessage({
    read: read,
    modify: modify,
    user: user,
    persistence: persistence,
    blocks: [textsectionBlock],
  });
}

function getAuthorizeButton(url: string) {
  return getButton({
    labelText: "Authorize",
    style: "primary",
    url,
  });
}
