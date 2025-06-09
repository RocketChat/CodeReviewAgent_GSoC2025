# Code Review Agent
The Code Review Assistant app for Rocket.Chat addresses the common challenge of delayed code reviews, where pull requests often remain unattended for extended periods. This app intelligently analyzes the files modified in a pull request, examines the commit history of those files, leverages the CODEOWNERS file, and reviews past activity to identify the most relevant reviewers and does preliminary LLM review. By notifying only the most appropriate contributors, the app streamlines the review process. Integrated directly within Rocket.Chat, it provides user-friendly reminders and updates, LLM does the sanity review, enabling developers to stay informed and collaborate more effectively on code reviews.

## Getting Started
Now that you have generated a blank default Rocket.Chat App, what are you supposed to do next?
Start developing! Open up your favorite editor, our recommended one is Visual Studio code,
and start working on your App. Once you have something ready to test, you can either
package it up and manually deploy it to your test instance or you can use the CLI to do so.
Here are some commands to get started:
- `rc-apps package`: this command will generate a packaged app file (zip) which can be installed **if** it compiles with TypeScript
- `rc-apps deploy`: this will do what `package` does but will then ask you for your server url, username, and password to deploy it for you

## Documentation
Here are some links to examples and documentation:
- [Rocket.Chat Apps TypeScript Definitions Documentation](https://rocketchat.github.io/Rocket.Chat.Apps-engine/)
- [Rocket.Chat Apps TypeScript Definitions Repository](https://github.com/RocketChat/Rocket.Chat.Apps-engine)
- [Example Rocket.Chat Apps](https://github.com/graywolf336/RocketChatApps)
- Community Forums
  - [App Requests](https://forums.rocket.chat/c/rocket-chat-apps/requests)
  - [App Guides](https://forums.rocket.chat/c/rocket-chat-apps/guides)
  - [Top View of Both Categories](https://forums.rocket.chat/c/rocket-chat-apps)
- [#rocketchat-apps on Open.Rocket.Chat](https://open.rocket.chat/channel/rocketchat-apps)
