import { IHttpResponse } from '@rocket.chat/apps-engine/definition/accessors';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { AppSettingsEnum } from '../config/settings';

export class PRService {
  constructor(private app: CodeReviewAgentApp) {}

  public async fetcher(user: IUser): Promise<Boolean> {
    try {
      const owner = await this.app.getAccessors().environmentReader.getSettings().getValueById(AppSettingsEnum.OWNER_NAME_ID);
      const repositories_list_raw =  await this.app.getAccessors().environmentReader.getSettings().getValueById(AppSettingsEnum.REPOSITORIES_LIST_ID);
      const repositories = repositories_list_raw.split('\n')
      const token = await this.app.getOauth2ClientInstance().getAccessTokenForUser(user);

      let url = '';
      repositories.forEach(async (repository) => {
        url = `https://api.github.com/repos/${owner}/${repository}/pulls`

      const response: IHttpResponse = await this.app.http().get(user, url);
      if (response.statusCode !== 200) {
        throw new Error(`Failed to fetch tasks: ${response.content}`);
      }
    })
      // save to database? take a decision here!
      return true;
    } catch (error) {
      this.app.getLogger().error(`Error in PRService.fetcher: ${error.message}`);
      throw new Error('Could not retrieve prs. Please try again later.');
    }
  }

}