# Mutual Servers Ranking for Valenced

Mobile port of [Best-Jaro/MutualServersRanking](https://github.com/Best-Jaro/MutualServersRanking), the Vencord desktop plugin. This is an **experimental Valenced-specific build** that uses React Native rather than Vencord's desktop UI.

## Install

1. In Discord with Valenced, go to **Settings → Valenced → Plugins** and tap the gear by the Plugins header.
2. In **Advanced**, select **Install from file** and choose `MutualServersRanking-Valenced.zip`.
3. Enable **Mutual Servers Ranking** in Valenced's plugin list.
4. Open the plugin's **settings/options** to display the ranking screen. No `/mutualranking` chat command is sent or required.

## Features

- Friends or locally cached members of a selected server.
- Rank by shared servers or cached mutual-friend counts.
- Name/ID search, row expansion, manual refresh, optional five-second cache updates.
- Best-effort profile action sheet opening when available.
- English mobile UI using React Native.

## Privacy and limitations

- No Discord HTTP calls, no profile scraping, no token access, no bulk guild-member requests.
- Results only reflect data already cached in the current Discord client. Missing data is **not** interpreted as a zero count.
- Discord's mobile internal stores differ by app version. In particular, member enumeration, profile action sheet lookup, and cached mutual-friend data may be unavailable or incomplete.
- On mobile only the first **150** matching results are rendered. Searching can surface additional users.
- Auto-update is **off by default** to avoid repeated expensive cache scans on mobile.
- This build has been syntax-checked and tested with a mocked Valenced runtime, **not** against an Android installation. Please report mobile version / logs if a store is unavailable.

## Package format

The ZIP contains root-level `manifest.json` and `index.js`. It is a zero-dependency JavaScript bundle that evaluates to `{ default: plugin({ ... }) }`, the exact external-script contract used by the Valenced loader. This port doesn't require Gradle or a Kotlin native component. It is intentionally separate from the Vencord `index.tsx` and `style.css` files.

SPDX-License-Identifier: GPL-3.0-or-later