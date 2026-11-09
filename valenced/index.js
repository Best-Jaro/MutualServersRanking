(() => {
    'use strict';

    /*
     * Mutual Servers Ranking - Valenced mobile port
     * Copyright (c) 2026 Best-Jaro
     * SPDX-License-Identifier: GPL-3.0-or-later
     *
     * No user-token access and no HTTP requests. Reads Discord's in-memory caches only.
     * This is a self-contained Valenced script (not a Vencord desktop plugin).
     */


    const MAX_VISIBLE_ROWS = 150;

    function safeCall(object, method, ...args) {
        try {
            return typeof object?.[method] === 'function'
                ? object[method](...args)
                : undefined;
        } catch (_) {
            return undefined;
        }
    }

    function store(name) {
        try {
            return valenced.discord.flux.Stores[name];
        } catch (_) {
            return undefined;
        }
    }

    function guildsInCache() {
        const raw = safeCall(store('GuildStore'), 'getGuilds');
        if (!raw || typeof raw !== 'object') return [];
        return Object.values(raw)
            .filter(g => typeof g?.id === 'string' && typeof g?.name === 'string')
            .map(({ id, name }) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    function friendIdsInCache() {
        const relationships = store('RelationshipStore');
        const ids = safeCall(relationships, 'getFriendIDs');
        if (Array.isArray(ids)) return [...new Set(ids.map(String))];

        // Some mobile versions expose a relationship map instead of getFriendIDs().
        const relationshipMap = safeCall(relationships, 'getRelationships');
        if (!relationshipMap || typeof relationshipMap !== 'object') return [];
        return Object.entries(relationshipMap)
            .filter(([, entry]) => entry === 1 || entry?.type === 1)
            .map(([id]) => id);
    }

    function memberIdsInCache(guildId) {
        if (!guildId) return [];
        const members = store('GuildMemberStore');
        const ids = safeCall(members, 'getMemberIds', guildId);
        if (Array.isArray(ids)) return [...new Set(ids.map(String))];

        const entries = safeCall(members, 'getMembers', guildId);
        if (Array.isArray(entries)) {
            return [...new Set(entries.map(entry =>
                typeof entry === 'string' ? entry : entry?.userId || entry?.user?.id || entry?.id
            ).filter(Boolean).map(String))];
        }
        return [];
    }

    function cachedMutualFriends(userId) {
        const candidateStores = [store('UserProfileStore'), store('MutualFriendsStore')];
        for (const profile of candidateStores) {
            if (!profile) continue;
            const raw = safeCall(profile, 'getMutualFriends', userId);
            const count = safeCall(profile, 'getMutualFriendsCount', userId);
            let ids = null;
            if (Array.isArray(raw)) {
                ids = [...new Set(raw.map(entry =>
                    typeof entry === 'string'
                        ? entry
                        : entry?.key || entry?.userId || entry?.user?.id || entry?.id
                ).filter(Boolean).map(String))];
            }
            if (Number.isFinite(count) && count >= 0)
                return { ids, count };
            if (ids !== null)
                return { ids, count: ids.length };
        }
        return { ids: null, count: null };
    }

    function getUserName(userId) {
        const user = safeCall(store('UserStore'), 'getUser', userId);
        return user?.globalName || user?.global_name || user?.username || userId;
    }

    function collect(mode, selectedGuildId) {
        const guilds = guildsInCache();
        const ownId = safeCall(store('UserStore'), 'getCurrentUser')?.id;
        const friends = friendIdsInCache();
        const friendSet = new Set(friends);
        const candidates = mode === 'friends'
            ? friends
            : memberIdsInCache(selectedGuildId);
        const candidatesUnique = [...new Set(candidates)].filter(id => id && id !== ownId);

        // Snapshot all cached members once, rather than re-query for every user.
        const membershipByUser = new Map();
        for (const guild of guilds) {
            const ids = memberIdsInCache(guild.id);
            for (const userId of ids) {
                let list = membershipByUser.get(userId);
                if (!list) membershipByUser.set(userId, list = []);
                list.push(guild);
            }
        }

        const rows = candidatesUnique.map(id => {
            const mutual = cachedMutualFriends(id);
            return {
                id,
                name: getUserName(id),
                friend: friendSet.has(id),
                servers: membershipByUser.get(id) || [],
                mutualFriendIds: mutual.ids,
                mutualFriendCount: mutual.count,
            };
        });
        return { guilds, rows };
    }

    function openProfile(userId) {
        // The profile action sheet is internal and not guaranteed across versions.
        try {
            const finders = valenced.modules.finders;
            const [open] = finders.lookupModule(
                finders.filters.withName('showUserProfileActionSheet')
            );
            if (typeof open === 'function') {
                open({ userId });
                return true;
            }
        } catch (_) { /* Ignore version-dependent finder failures. */ }
        return false;
    }

    function RankingScreen() {
        const React = valenced.react.React;
        const RN = valenced.react.ReactNative;
        const h = React.createElement;
        const { View, Text, Pressable, ScrollView, TextInput, Switch } = RN;
        const light = RN.useColorScheme?.() === 'light';
        const colors = light ? {
            background: '#f7f8fa', panel: '#ffffff', text: '#202127', muted: '#59616e',
            border: '#d9dce3', brand: '#5865f2', tint: '#e5e8ff',
        } : {
            background: '#191a20', panel: '#282a32', text: '#f2f3f5', muted: '#babdc7',
            border: '#40434d', brand: '#7784ff', tint: '#363a60',
        };

        const [mode, setMode] = React.useState('friends');
        const [metric, setMetric] = React.useState('servers');
        const [selectedGuildId, setSelectedGuildId] = React.useState('');
        const [showGuildPicker, setShowGuildPicker] = React.useState(false);
        const [query, setQuery] = React.useState('');
        const [expanded, setExpanded] = React.useState(null);
        const [autoUpdate, setAutoUpdate] = React.useState(false);
        const [snapshot, setSnapshot] = React.useState(() => ({ guilds: guildsInCache(), rows: [] }));
        const [profileError, setProfileError] = React.useState(false);
        const activeGuildId = selectedGuildId || snapshot.guilds[0]?.id || '';

        const refresh = () => {
            const next = collect(mode, activeGuildId);
            setSnapshot(next);
            setExpanded(null);
            setProfileError(false);
        };

        React.useEffect(() => {
            refresh();
        }, [mode, activeGuildId]);

        React.useEffect(() => {
            if (!autoUpdate) return;
            const timer = setInterval(() => setSnapshot(collect(mode, activeGuildId)), 5000);
            return () => clearInterval(timer);
        }, [mode, activeGuildId, autoUpdate]);

        const rows = React.useMemo(() => {
            const sorted = [...snapshot.rows].sort((a, b) => {
                const aScore = metric === 'servers' ? a.servers.length : a.mutualFriendCount ?? -1;
                const bScore = metric === 'servers' ? b.servers.length : b.mutualFriendCount ?? -1;
                return bScore - aScore || a.name.localeCompare(b.name);
            });
            const q = query.trim().toLowerCase();
            return q ? sorted.filter(item => `${item.name} ${item.id}`.toLowerCase().includes(q)) : sorted;
        }, [snapshot.rows, metric, query]);
        const visibleRows = rows.slice(0, MAX_VISIBLE_ROWS);
        const selectedGuildName = snapshot.guilds.find(g => g.id === activeGuildId)?.name || 'No cached servers';

        const label = (value, style) => h(Text, {
            style: [{ color: colors.text, fontSize: 14 }, style],
        }, value);
        const small = (value, style) => label(value, { color: colors.muted, fontSize: 12, lineHeight: 18, ...style });
        const button = (value, onPress, active, key) => h(Pressable, {
            key,
            onPress,
            accessibilityRole: 'button',
            style: {
                paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
                backgroundColor: active ? colors.brand : colors.panel,
                borderWidth: 1, borderColor: active ? colors.brand : colors.border,
                marginRight: 8, marginBottom: 8,
            },
        }, label(value, { color: active ? '#ffffff' : colors.text, fontWeight: '600' }));
        const sectionTitle = value => label(value, {
            fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8,
        });
        const line = { height: 1, backgroundColor: colors.border };

        return h(ScrollView, {
            style: { flex: 1, backgroundColor: colors.background },
            contentContainerStyle: { padding: 16, paddingBottom: 56 },
            keyboardShouldPersistTaps: 'handled',
        },
            label('Mutual Servers Ranking', { fontWeight: '800', fontSize: 23, marginBottom: 6 }),
            small('Private, local ranking. Only existing Discord cache is read; data may be incomplete.'),

            sectionTitle('People'),
            h(View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
                button('Friends', () => setMode('friends'), mode === 'friends', 'friends'),
                button('Server members', () => setMode('members'), mode === 'members', 'members')),

            mode === 'members' ? h(View, null,
                sectionTitle('Server'),
                button(selectedGuildName + '  ▾', () => setShowGuildPicker(!showGuildPicker), false, 'guild-pick'),
                showGuildPicker ? h(ScrollView, {
                    nestedScrollEnabled: true,
                    style: { maxHeight: 210, backgroundColor: colors.panel, borderRadius: 10,
                        borderWidth: 1, borderColor: colors.border },
                }, snapshot.guilds.map(g => h(Pressable, {
                    key: g.id,
                    accessibilityRole: 'button',
                    onPress: () => { setSelectedGuildId(g.id); setShowGuildPicker(false); },
                    style: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
                }, label(g.name)))) : null) : null,

            sectionTitle('Rank by'),
            h(View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
                button('Mutual servers', () => { setMetric('servers'); setExpanded(null); }, metric === 'servers', 'servers'),
                button('Mutual friends', () => { setMetric('friends'); setExpanded(null); }, metric === 'friends', 'mutual-friends')),

            h(View, { style: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } },
                h(View, { style: { flex: 1 } },
                    label('Auto-update from cache', { fontWeight: '600' }),
                    small('Recheck every 5 seconds while this screen is open')),
                h(Switch, { value: autoUpdate, onValueChange: setAutoUpdate })),
            h(View, { style: { marginTop: 8, alignSelf: 'flex-start' } },
                button('Refresh ranking', refresh, true, 'refresh')),

            metric === 'friends' ? small(
                'Mutual-friend counts are shown only if Discord already cached them. ' +
                'Viewing a profile normally may populate that cache.',
                { marginTop: 4, marginBottom: 10 },
            ) : null,

            h(TextInput, {
                value: query,
                onChangeText: setQuery,
                placeholder: 'Search by name or user ID',
                placeholderTextColor: colors.muted,
                autoCapitalize: 'none',
                autoCorrect: false,
                style: {
                    color: colors.text, backgroundColor: colors.panel,
                    borderColor: colors.border, borderWidth: 1, borderRadius: 10,
                    paddingVertical: 10, paddingHorizontal: 12, marginTop: 15, marginBottom: 12,
                },
            }),
            small(`Showing ${visibleRows.length} of ${rows.length} matching users`),
            rows.length > MAX_VISIBLE_ROWS ? small(
                `Only the first ${MAX_VISIBLE_ROWS} matches are rendered for mobile performance. Narrow the search to find other users.`,
                { marginTop: 3 },
            ) : null,
            metric === 'friends' ? small(
                `Profiles with cached counts: ${snapshot.rows.filter(row => row.mutualFriendCount !== null).length}`,
                { marginTop: 3 },
            ) : null,

            h(View, { style: { marginTop: 12, borderWidth: 1, borderColor: colors.border,
                borderRadius: 12, overflow: 'hidden' } },
                visibleRows.length === 0 ? h(View, { style: { padding: 18 } },
                    small('No matching users found in the local cache.')) :
                visibleRows.map((person, index) => h(View, {
                    key: person.id, style: { borderBottomWidth: index < visibleRows.length - 1 ? 1 : 0,
                        borderBottomColor: colors.border },
                },
                    h(Pressable, {
                        accessibilityRole: 'button',
                        onPress: () => { setExpanded(expanded === person.id ? null : person.id); setProfileError(false); },
                        style: { padding: 12, backgroundColor: colors.panel },
                    },
                        h(View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } },
                            h(View, { style: { flex: 1, paddingRight: 8 } },
                                label(`#${index + 1}  ${person.name}`, { fontWeight: '700' }),
                                person.friend ? small('Friend') : null),
                            small(metric === 'servers'
                                ? `${person.servers.length} servers`
                                : person.mutualFriendCount === null
                                    ? 'Not cached' : `${person.mutualFriendCount} friends`,
                            { fontWeight: '600' }))),
                    expanded === person.id ? h(View, {
                        style: { padding: 12, paddingTop: 10, backgroundColor: colors.background },
                    },
                        sectionTitle(metric === 'servers' ? 'Shared servers' : 'Shared friends'),
                        metric === 'servers'
                            ? (person.servers.length
                                ? person.servers.map(g => h(View, { key: g.id, style: { paddingVertical: 4 } }, label(g.name)))
                                : small('No confirmed shared servers in the local cache.'))
                            : (person.mutualFriendCount === null
                                ? small('No cached mutual-friend data for this profile.')
                                : person.mutualFriendIds?.length
                                    ? person.mutualFriendIds.map(id => h(View, { key: id, style: { paddingVertical: 4 } }, label(getUserName(id))))
                                    : small(person.mutualFriendCount === 0
                                        ? 'No cached mutual friends.'
                                        : 'Count cached, but the friend list is not available.')),
                        h(View, { style: { marginTop: 12, alignSelf: 'flex-start' } },
                            button('Open Discord profile', () => setProfileError(!openProfile(person.id)), false, 'profile')),
                        profileError ? small('Profile opening is unavailable in this Discord build.') : null,
                    ) : null,
                ))),
        );
    }

    return {
        default: plugin({
            start({ logger }) {
                logger?.log?.('Mutual Servers Ranking ready; open its plugin settings to view the ranking.');
            },
            SettingsComponent: RankingScreen,
        }),
    };
})()