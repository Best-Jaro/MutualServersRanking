# MutualServersRanking

A custom [Vencord](https://vencord.dev/) plugin that ranks Discord friends and known server members by mutual servers or mutual friends.

**Author:** [Best-Jaro](https://github.com/Best-Jaro)  
**Version:** v3 (experimental)  
**License:** GPL-3.0-or-later

## Features

- Rank Discord friends or locally known members of a selected server.
- Sort by **mutual servers** or cached **mutual friends**.
- Search by name or Discord user ID.
- Expand a user to inspect shared servers or cached mutual friends.
- Open a user's Discord profile manually.
- Open the panel with the local-only `/mutualranking` Vencord command.
- Refresh from the local Discord cache automatically every five seconds while the panel is open, or refresh manually.
- English-language interface.

## Installation

This is a **source plugin**, not a standalone Vesktop installer.

1. Use a Vencord checkout that supports custom plugins.
2. From the root of the Vencord checkout, clone this repository into `src/userplugins/MutualServersRanking`:

   ```powershell
   git clone https://github.com/Best-Jaro/MutualServersRanking.git src/userplugins/MutualServersRanking
   ```

3. Rebuild Vencord using your normal build command (for example, `pnpm build`).
4. Launch or install your rebuilt Discord/Vesktop integration.
5. Enable **MutualServersRanking** in **Vencord Settings → Plugins**.
6. Select `/mutualranking` from Discord's slash-command picker to open the panel.

> **Privacy:** Select the plugin's local command from the slash-command picker. Do not send `/mutualranking` as ordinary chat text.

## Limitations

- Rankings are calculated from locally available Discord client data, so members and counts may be incomplete.
- `Not cached` means mutual-friend information is unavailable, **not** zero friends.
- The plugin does not scrape profiles, bulk-request Discord members, fetch profiles in the background, or access user tokens.
- Internal Discord and Vencord APIs may change across versions.
- This version has not been tested in every Vencord or Vesktop build.

## Changelog

### v3
- Improved modal text contrast, layout, and scrolling.
- Changed the slash command to Vencord's local `BUILT_IN` type.
- Improved mutual-friend reading from `UserProfileStore`.
- Added optional local-cache auto-refresh.
- Added an Open Discord profile button.

## Credits

Created by **[Best-Jaro](https://github.com/Best-Jaro)**.
