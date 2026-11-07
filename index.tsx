/*
 * MutualServersRanking
 * Copyright (c) 2026 Best-Jaro
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import { openUserProfile } from "@utils/discord";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { GuildMemberStore, GuildStore, React, RelationshipStore, UserProfileStore, UserStore } from "@webpack/common";

import "./style.css";

type GuildEntry = { id: string; name: string; };
type Mode = "friends" | "members";
type Metric = "servers" | "friends";
type RankedUser = {
    id: string;
    name: string;
    friend: boolean;
    servers: GuildEntry[];
    mutualFriendIds: string[] | null;
    mutualFriendCount: number | null;
};

const settings = definePluginSettings({
    ranking: {
        type: OptionType.COMPONENT,
        description: "View mutual-server and mutual-friend rankings",
        component: RankingPanel
    }
});

function getGuilds(): GuildEntry[] {
    return Object.values(GuildStore.getGuilds() as Record<string, GuildEntry>)
        .filter(g => Boolean(g?.id && g?.name))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function getKnownMembers(guildId: string): string[] {
    if (!guildId) return [];
    // Read the client's existing data. Never fetch a member list here.
    try {
        const ids = GuildMemberStore.getMemberIds(guildId);
        return Array.isArray(ids) ? ids : [];
    } catch {
        return [];
    }
}

function getCachedMutualFriends(userId: string): { ids: string[] | null; count: number | null; } {
    // Read local profile data only. In particular, do not bulk-request profiles.
    try {
        const friends = UserProfileStore.getMutualFriends(userId);
        const count = UserProfileStore.getMutualFriendsCount(userId);
        const ids = Array.isArray(friends)
            ? [...new Set(friends.map(friend => friend.key || friend.user?.id).filter((id): id is string => Boolean(id)))]
            : null;

        return {
            ids,
            count: typeof count === "number" && Number.isFinite(count)
                ? count
                : ids?.length ?? null
        };
    } catch {
        return { ids: null, count: null };
    }
}

function collect(mode: Mode, selectedGuildId: string): RankedUser[] {
    const guilds = getGuilds();
    const me = UserStore.getCurrentUser()?.id;
    const friendIds = RelationshipStore.getFriendIDs();
    const friendSet = new Set(friendIds);
    const candidates = mode === "friends" ? friendIds : getKnownMembers(selectedGuildId);
    const candidateIds = [...new Set(candidates)].filter(id => id && id !== me);

    // Build a snapshot of the guild-member cache once per refresh.
    const knownMembers = new Map(guilds.map(g => [g.id, new Set(getKnownMembers(g.id))]));

    return candidateIds.map(id => {
        const user = UserStore.getUser(id);
        const mutual = getCachedMutualFriends(id);
        return {
            id,
            name: user?.globalName || user?.username || id,
            friend: friendSet.has(id),
            servers: guilds.filter(g => knownMembers.get(g.id)?.has(id)),
            mutualFriendIds: mutual.ids,
            mutualFriendCount: mutual.count
        };
    });
}

function RankingPanel() {
    const [mode, setMode] = React.useState<Mode>("friends");
    const [metric, setMetric] = React.useState<Metric>("servers");
    const [guildId, setGuildId] = React.useState("");
    const [query, setQuery] = React.useState("");
    const [expanded, setExpanded] = React.useState<string | null>(null);
    const [rows, setRows] = React.useState<RankedUser[]>([]);
    const [autoUpdate, setAutoUpdate] = React.useState(true);

    const guilds = getGuilds();
    const activeGuildId = guildId || guilds[0]?.id || "";

    // Automatic initial scan and automatic recomputation when the scope changes.
    React.useEffect(() => {
        setRows(collect(mode, activeGuildId));
        setExpanded(null);
    }, [mode, activeGuildId]);

    // Only inspect the local cache while this panel is open: no network calls.
    // This picks up data naturally loaded after the user opens Discord profiles.
    React.useEffect(() => {
        if (!autoUpdate) return;
        const timer = setInterval(() => setRows(collect(mode, activeGuildId)), 5000);
        return () => clearInterval(timer);
    }, [mode, activeGuildId, autoUpdate]);

    function refresh() {
        setRows(collect(mode, activeGuildId));
    }

    const sorted = [...rows].sort((a, b) => {
        const aScore = metric === "servers" ? a.servers.length : a.mutualFriendCount ?? -1;
        const bScore = metric === "servers" ? b.servers.length : b.mutualFriendCount ?? -1;
        return bScore - aScore || a.name.localeCompare(b.name);
    });
    const search = query.trim().toLowerCase();
    const filtered = sorted.filter(r => `${r.name} ${r.id}`.toLowerCase().includes(search));
    const availableProfiles = rows.filter(r => r.mutualFriendCount !== null).length;

    return <div className="msr-root">
        <div className="msr-controls">
            <label className="msr-field">
                <span>People</span>
                <select value={mode} onChange={e => setMode(e.target.value as Mode)}>
                    <option value="friends">Friends</option>
                    <option value="members">Server members</option>
                </select>
            </label>
            {mode === "members" && <label className="msr-field msr-field-guild">
                <span>Server</span>
                <select value={activeGuildId} onChange={e => setGuildId(e.target.value)}>
                    {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
            </label>}
            <label className="msr-field">
                <span>Rank by</span>
                <select value={metric} onChange={e => { setMetric(e.target.value as Metric); setExpanded(null); }}>
                    <option value="servers">Mutual servers</option>
                    <option value="friends">Mutual friends (cached)</option>
                </select>
            </label>
        </div>

        <div className="msr-toolbar">
            <button type="button" className="msr-refresh" onClick={refresh}>Refresh ranking</button>
            <label className="msr-autoupdate">
                <input type="checkbox" checked={autoUpdate} onChange={e => setAutoUpdate(e.target.checked)} />
                <span>Auto-update from Discord cache</span>
            </label>
        </div>

        <p className="msr-note">Only information already available in your Discord client is used. Results may be incomplete.</p>
        {metric === "friends" && <p className="msr-note">
            Mutual-friend data is only available for profiles Discord has already loaded. Open a user's profile normally, then return here; the ranking will update automatically when that information becomes available.
        </p>}

        <input
            className="msr-search"
            type="search"
            aria-label="Search ranking"
            placeholder="Search by name or user ID..."
            value={query}
            onChange={e => setQuery(e.target.value)}
        />
        <div className="msr-summary">
            <span>Showing {filtered.length} of {rows.length} users</span>
            {metric === "friends" && <span>Profiles with cached counts: {availableProfiles}</span>}
        </div>

        <div className="msr-list">
            {filtered.length === 0 && <div className="msr-empty">No matching users found in the local cache.</div>}
            {filtered.map((person, i) => <div key={person.id} className="msr-person">
                <button
                    type="button"
                    className="msr-person-button"
                    aria-expanded={expanded === person.id}
                    onClick={() => setExpanded(expanded === person.id ? null : person.id)}
                >
                    <span className="msr-person-name">
                        <span className="msr-rank">#{i + 1}</span>
                        <span className="msr-name">{person.name}</span>
                        {person.friend && <span className="msr-friend-tag">Friend</span>}
                    </span>
                    <span className="msr-count">
                        {metric === "servers"
                            ? `${person.servers.length} mutual ${person.servers.length === 1 ? "server" : "servers"}`
                            : person.mutualFriendCount === null
                                ? "Not cached"
                                : `${person.mutualFriendCount} mutual ${person.mutualFriendCount === 1 ? "friend" : "friends"}`}
                    </span>
                </button>
                {expanded === person.id && <div className="msr-details">
                    <div className="msr-detail-heading">{metric === "servers" ? "Shared servers" : "Shared friends"}</div>
                    {metric === "servers"
                        ? (person.servers.length > 0
                            ? person.servers.map(g => <div key={g.id} className="msr-detail-item">{g.name}</div>)
                            : <div>No confirmed matches in the local cache.</div>)
                        : (person.mutualFriendCount === null
                            ? <div>No cached mutual-friend information for this profile.</div>
                            : person.mutualFriendIds?.length
                                ? person.mutualFriendIds.map(id => <div key={id} className="msr-detail-item">
                                    {UserStore.getUser(id)?.globalName || UserStore.getUser(id)?.username || id}
                                </div>)
                                : <div>{person.mutualFriendCount === 0 ? "No cached mutual friends." : "The count is cached, but the list is not available."}</div>)}
                    <div className="msr-detail-actions">
                        <button type="button" className="msr-profile-button" onClick={() => { void openUserProfile(person.id); }}>
                            Open Discord profile
                        </button>
                    </div>
                </div>}
            </div>)}
        </div>
    </div>;
}

function openRanking() {
    openModal(modalProps => <ModalRoot {...modalProps} className="msr-modal" size={ModalSize.LARGE}>
        <ModalHeader className="msr-modal-header">
            <div className="msr-modal-title">
                <strong>Mutual Servers Ranking</strong>
                <span>Private, local ranking</span>
            </div>
            <ModalCloseButton onClick={modalProps.onClose} />
        </ModalHeader>
        <ModalContent className="msr-modal-content">
            <RankingPanel />
        </ModalContent>
    </ModalRoot>);
}

export default definePlugin({
    name: "MutualServersRanking",
    description: "Rank friends and known server members by cached mutual servers or mutual friends.",
    tags: ["Friends", "Servers", "Utility", "Commands"],
    authors: [{ name: "Best-Jaro", id: 695567308126421003n }],
    settings,
    commands: [{
        name: "mutualranking",
        description: "Open your private Mutual Servers Ranking panel",
        // BUILT_IN executes locally. BUILT_IN_TEXT (the default) can send chat text.
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: () => { openRanking(); }
    }]
});
