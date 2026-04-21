import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getRejudgedTaskDifficulty, getTaskDifficulty } from 'src/AIJudge';
import supabase from 'src/config/supabaseClient';
import { notificationService } from 'src/notifications/NotificationService';

interface AIDataState {
    score?: number;
    reasoning?: string;
    has_menu_open?: boolean;
}

interface TowerState {
    type: 'basic' | 'night' | 'freeze' | 'fire' | 'merge';
    ammo: number;
}

interface EnemyState {
    id: number;
    x: number; // column index (0 to 13)
    y: number; // row index (mapped to displayHours)
    hp: number;
    type: 'normal' | 'tornado' | 'speedster';
    emoji: string;
    freeze: number;
    fire: number;
    accum: number;
}

// Utility to generate a YYYY-MM-DD string for our active date keys
const getLocalDateString = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Utility to display the dates nicely in the column headers
const formatDateShort = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return `${d.getMonth() + 1}/${d.getDate()}`;
};

const SHOP_ITEMS = [
    { type: 'basic', cost: 5, icon: '🔫' },
    { type: 'night', cost: 10, icon: '🌙' },
    { type: 'freeze', cost: 15, icon: '❄️' },
    { type: 'fire', cost: 15, icon: '🔥' },
    { type: 'merge', cost: 15, icon: '🧲' }
] as const;

export default function CalendarScreen() {
    // Until DB loads: isBattleMode and setIsBattleMode will be false
    const [isBattleMode, setIsBattleMode] = React.useState(false);
    const [isAdmin, setIsAdmin] = React.useState(false);

    const handleEndMatch = async () => {
        // Save the previous state in case the DB connection fails
        const previousState = isBattleMode;

        // Update UI immediately
        setIsBattleMode(false);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { error } = await supabase.from('profiles')
                .update({ is_in_multiplayer_mode: false })
                .eq('id', user.id);

            // If the DB connection fails, restore mode
            if (error) {
                setIsBattleMode(previousState);
                Alert.alert("DB connection failed", "Could not switch to battle mode.");
                console.error(error.message);
            } else {
                if (router.setParams) router.setParams({ battle: '' });
            }
        }
    };

    const [userBedtime, setUserBedtime] = React.useState<number>(0); // Default to midnight (0)

    // The Opponent Sleep Settings
    const opponentBedtime = 22; // 10 PM
    const isOppAwake = React.useCallback((h: number) => {
        // Calculate the 15-hour active window for the opponent
        const oppStartHour = (opponentBedtime - 14 + 24) % 24;
        if (oppStartHour <= opponentBedtime) {
            return h >= oppStartHour && h <= opponentBedtime;
        } else {
            return h >= oppStartHour || h <= opponentBedtime;
        }
    }, [opponentBedtime]);

    // Calculates exactly 15 hours ending at the user's bedtime
    const userDisplayHours = React.useMemo(() => {
        const hours = [];
        for (let i = 14; i >= 0; i--) {
            hours.push((userBedtime - i + 24) % 24);
        }
        return hours;
    }, [userBedtime]);

    // Calculates the combined timeline of both players depending on who is awake
    const displayHours = React.useMemo(() => {
        const uHours = userDisplayHours;
        if (!isBattleMode) return uHours;

        const oHours: number[] = [];
        for (let i = 14; i >= 0; i--) {
            oHours.push((opponentBedtime - i + 24) % 24);
        }

        // Establish a logical chronological timeline starting from 4 AM
        const daySequence = [];
        for (let i = 4; i < 28; i++) {
            daySequence.push(i % 24);
        }

        // Filter the timeline to only the hours in which AT LEAST ONE player is awake
        return daySequence.filter(h => uHours.includes(h) || oHours.includes(h));
    }, [userDisplayHours, isBattleMode, opponentBedtime]);

    // Calculates what "Today" is, keeping it on yesterday until the bedtime passes
    const getLogicalToday = React.useCallback(() => {
        const d = new Date();
        if (d.getHours() < userBedtime) {
            d.setDate(d.getDate() - 1);
        }
        return d;
    }, [userBedtime]);

    const [currentLogicalDate, setCurrentLogicalDate] = React.useState<string>(getLocalDateString(getLogicalToday()));

    // Generate an array of 14 days starting from the logical "Today"
    const fourteenDays = React.useMemo(() => {
        const days = [];
        const logicalToday = getLogicalToday();
        for (let i = 0; i < 14; i++) {
            const d = new Date(logicalToday.getFullYear(), logicalToday.getMonth(), logicalToday.getDate() + i);
            days.push(getLocalDateString(d));
        }
        return days;
    }, [getLogicalToday]);

    const [viewMode, setViewMode] = React.useState<'1D' | '2D'>('1D'); // Toggle between list and grid
    const [activeDate, setActiveDate] = React.useState<string>(getLocalDateString(new Date())); // The specific day viewed in 1D mode

    const [editingKey, setEditingKey] = React.useState<string | null>(null); // Track the hour rectangle being typed into (format: YYYY-MM-DD_H)
    const [routines, setRoutines] = React.useState<Record<string, string>>({}); // Store the text of each rectangle
    const [eventIds, setEventIds] = React.useState<Record<string, string>>({}); // Track the event IDs for performance and the SunnyStreak team's convenience
    const [AIData, setAIData] = React.useState<Record<string, AIDataState>>({}); // Stores the scores and reasoning for each hour, keyed by the 24-hour index and the date
    const [debateKey, setDebateKey] = React.useState<string | null>(null); // Stores the specific event currently being appealed; null means that the modal is closed
    const [debateText, setDebateText] = React.useState(''); // Holds the user's written argument for the High Court while they are typing in the modal
    const [isDebating, setIsDebating] = React.useState(false); // Tracks the loading state of the thinking model API call to show a spinner and disable the buttons
    const [debatedKeys, setDebatedKeys] = React.useState<string[]>([]); // Tracks which events have already been appealed to prevent infinite arguing
    const [globalPoints, setGlobalPoints] = React.useState<number>(0); // Tracks the total number of points earned

    // The Tactical Ops Game State
    const [towers, setTowers] = React.useState<Record<string, TowerState>>({});
    const [enemies, setEnemies] = React.useState<EnemyState[]>([]);
    const [selectedShopItem, setSelectedShopItem] = React.useState<typeof SHOP_ITEMS[number] | null>(null);
    const [activeTowerKey, setActiveTowerKey] = React.useState<string | null>(null);
    const [gameOver, setGameOver] = React.useState(false);
    const enemyIdCounter = React.useRef(0);
    const lastTapRef = React.useRef<{key: string, time: number} | null>(null);

    // The Wall Mechanics State
    const [walls, setWalls] = React.useState<string[]>([]);
    const [spawnedWallDates, setSpawnedWallDates] = React.useState<string[]>([]);

    // Flag to prevent overwriting DB on the initial load
    const hasLoadedState = React.useRef(false);
    const saveGameStateRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Synchronize point deductions with the database
    const deductPoints = async (item_cost: number) => {
        // Save the previous state in case the DB connection fails
        const previousGlobalPoints = globalPoints;

        // Update UI immediately
        setGlobalPoints(prev => prev - item_cost);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { error } = await supabase.rpc('buy_item', {
                item_cost: item_cost
            });
            if (error) {
                console.error("Failed to deduct points:", error.message);
                setGlobalPoints(previousGlobalPoints);
                Alert.alert("DB connection failed", "Purchase could not be done. Points restored.");
                return false; // Transaction failed
            }
            return true; // Transaction succeeded
        }
    };

    // Dynamically calculate the Y pixel offset based on the interleaved row heights
    const getRowTopPos = React.useCallback((rowIndex: number) => {
        let top = 0;
        for (let i = 0; i < rowIndex; i++) {
            const h = displayHours[i];
            const showUser = userDisplayHours.includes(h);
            const showOpp = isBattleMode && isOppAwake(h);
            top += (showUser && showOpp) ? 91 : 46;
        }
        return top;
    }, [displayHours, userDisplayHours, isBattleMode, isOppAwake]);

    // Stable mock generation for the opponent's routines based on the time key
    const getMockOpponentTask = React.useCallback((key: string, hour: number) => {
        if (!isOppAwake(hour)) return null;

        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = key.charCodeAt(i) + ((hash << 5) - hash);
        }
        const isTask = (Math.abs(hash) % 10) > 2; // Increased frequency for demonstration purposes
        if (isTask) {
            const score = (Math.abs(hash) % 5) + 1;
            const isTagged = (Math.abs(hash) % 2) === 0; // 50% chance that they tag you back to form a synergy
            const taskNames = ["Cardio Training", "Study Tactical Maps", "Weapon Maintenance", "Meditation", "Review Logs"];
            const baseName = taskNames[Math.abs(hash) % taskNames.length];
            const taskName = isTagged ? `${baseName} @PlayerOne` : baseName;
            return { text: taskName, score, isTagged };
        }
        return null;
    }, [isOppAwake]);

    const loadFromDBEvents = React.useCallback(async (user_id: string) => {
        // Get the start and the end in ISO format (UTC) for 14 days
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2).toISOString(); // Buffer for the bedtime
        const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30).toISOString(); // Fetch extra for the offset buffering

        // Ask Supabase for the events belonging to this user that fall within the next 14 days
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .eq('user_id', user_id)
            .gte('start_time', start)
            .lt('start_time', end);

        if (error) {
            console.error("Error loading events:", error);
            return;
        }

        console.log("Events fetched:", JSON.stringify(data, null, 2));

        // If events are found, put them into the React states so they display on the screen
        if (data) {
            const fetchedRoutines: Record<string, string> = {};
            const fetchedIds: Record<string, string> = {};
            const fetchedAIData: Record<string, AIDataState> = {};
            const fetchedDebatedKeys: string[] = [];

            data.forEach(event => {
                const d = new Date(event.start_time);
                const dateStr = getLocalDateString(d);
                const hour = d.getHours();
                const key = `${dateStr}_${hour}`;

                fetchedRoutines[key] = event.title;
                fetchedIds[key] = event.id; // Store the DB id so it can be updated when a user changes the event.
                fetchedAIData[key] = {
                    score: event.score,
                    reasoning: event.description,
                    has_menu_open: event.has_menu_open
                };

                if (event.has_been_appealed) {
                    fetchedDebatedKeys.push(key);
                }
            });

            setRoutines(fetchedRoutines);
            setEventIds(fetchedIds);
            setAIData(fetchedAIData);

            if (fetchedDebatedKeys.length > 0) {
                setDebatedKeys(prev => Array.from(new Set([...prev, ...fetchedDebatedKeys])));
            }
        }
    }, []);

    const loadInitialData = React.useCallback(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Fetch the events using the email
                await loadFromDBEvents(user.id);

                const { data, error } = await supabase
                    .from('profiles')
                    .select('global_score, bedtime, tactical_game_state, is_in_multiplayer_mode, is_admin')
                    .eq('id', user.id)
                    .single();

                if (error) {
                    console.error("fetch error:", error.message);
                    return;
                }

                if (data) {
                    if (data.global_score !== undefined) setGlobalPoints(data.global_score);
                    if (data.bedtime !== undefined && data.bedtime !== null) setUserBedtime(data.bedtime);
                    setIsAdmin(Boolean(data.is_admin));
                    if (data.is_in_multiplayer_mode !== undefined && data.is_in_multiplayer_mode !== null) {
                        setIsBattleMode(data.is_in_multiplayer_mode);
                    }

                    // Hydrate game state from DB
                    if (data.tactical_game_state) {
                        const state = data.tactical_game_state as any;
                        if (state.towers) setTowers(state.towers);
                        if (state.enemies) {
                            setEnemies(state.enemies);
                            // Ensure the ID counter prevents duplication when new enemies spawn
                            const maxId = state.enemies.reduce((max: number, e: any) => Math.max(max, e.id), -1);
                            enemyIdCounter.current = maxId + 1;
                        }
                        if (state.walls) setWalls(state.walls);
                        if (state.spawnedWallDates) setSpawnedWallDates(state.spawnedWallDates);
                    }
                }
            }

            // Now that data is loaded, allow the auto-saver to run on future state changes
            hasLoadedState.current = true;
        };
        init().catch(console.error);
    }, [loadFromDBEvents]);

    // Fetch the email, points, and bedtime from the users table in the database
    useFocusEffect(
        React.useCallback(() => {
            loadInitialData();
        }, [loadInitialData]),
    );

    // Debounced Auto-Save for Game State
    React.useEffect(() => {
        if (!hasLoadedState.current) return;
        if (saveGameStateRef.current) {
            clearTimeout(saveGameStateRef.current);
        }

        saveGameStateRef.current = setTimeout(async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const gameState = {
                towers,
                enemies,
                walls,
                spawnedWallDates
            };

            const { error } = await supabase
                .from('profiles')
                .update({ tactical_game_state: gameState })
                .eq('id', user.id);

            if (error) {
                console.error("Failed to sync game state to Database:", error.message);
            }
        }, 1500); // Wait 1.5 seconds after the last game state change before writing to DB

        return () => {
            if (saveGameStateRef.current) clearTimeout(saveGameStateRef.current);
        };
    }, [towers, enemies, walls, spawnedWallDates]);

    // Update the logical date if the bedtime settings change
    React.useEffect(() => {
        setCurrentLogicalDate(getLocalDateString(getLogicalToday()));
    }, [getLogicalToday]);

    const handleSave = async (hour: number) => {
        setEditingKey(null);
        const key = `${activeDate}_${hour}`;
        const text = routines[key]?.trim();
        const existingId = eventIds[key];

        // Clear the previous AI data if the user edits the task
        setAIData(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Extract the year, month, and day from the selected activeDate so it saves correctly
        const [year, month, day] = activeDate.split('-').map(Number);

        const start = new Date(year, month - 1, day, hour, 0, 0, 0);
        const startTime = start.toISOString();

        const end = new Date(year, month - 1, day, hour + 1, 0, 0, 0);
        const endTime = end.toISOString();

        try {
            if (text) {
                let currentEventId = existingId;
                if (existingId) {
                    const { error } = await supabase
                        .from('events')
                        .update({ title: text })
                        .eq('id', existingId);
                    if (error) {
                        console.error("Update failed:", error.message);
                        return; // Stop execution if the DB did not accept the change
                    }
                    console.log("Event updated successfully.");
                } else {
                    const {data, error} = await supabase
                        .from('events')
                        .insert({
                            user_id: user.id,
                            title: text,
                            start_time: startTime,
                            end_time: endTime,
                            score: 0,
                            has_menu_open: false,
                            has_been_appealed: false
                        })
                        .select()
                        .single();

                    if (error) {
                        console.error("Insert failed:", error.message);
                        return;
                    }
                    if (data) {
                        setEventIds(prev => ({...prev, [key]: data.id}));
                        currentEventId = data.id; // Capture the new id for the AI to use
                    }
                }

                // Notify the user later to start the task
                try {
                    await notificationService.scheduleNotify({
                        title: `Start task for hour: ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
                        body: `Your task, ${text}, starts now!`,
                        at: start,
                        data: { path: '/(tabs)' } // Allows tapping the notification to route back to the app
                    });
                } catch (notifyError) {
                    console.error("Failed to schedule \"start task\" notification:", notifyError);
                }

                // Notify the user later to claim the task's points
                try {
                    await notificationService.scheduleNotify({
                        title: `Claim task points for hour: ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
                        body: `Your task, ${text}, is complete. Come claim your points!`,
                        at: end,
                        data: { path: '/(tabs)' } // Allows tapping the notification to route back to the app
                    });
                } catch (notifyError) {
                    console.error("Failed to schedule \"claim points\" notification:", notifyError);
                }

                // Fetch the AI data on save and put it in Supabase
                getTaskDifficulty(text).then(async result => {
                    // Update the UI
                    setAIData(prev => ({...prev, [key]: {
                            score: result.score,
                            reasoning: result.reasoning,
                        }}));

                    // Update the database
                    if (currentEventId) {
                        const { error } = await supabase
                            .from('events')
                            .update({
                                score: result.score,
                                description: result.reasoning
                            })
                            .eq('id', currentEventId);

                        if (error) {
                            console.error(`Failed to save to DB score for key ${key}:`, error.message);
                        } else {
                            console.log(`Score ${result.score} saved to DB for key ${key}`);
                        }
                    }
                });
            } else if (!text && existingId) {
                // Delete the event from the calendar
                const { error } = await supabase
                    .from('events')
                    .delete()
                    .eq('id', existingId);
                if (error) {
                    console.error("Failed to delete event:", error.message);
                } else {
                    console.log("Event successfully cleared from database.");
                }

                setEventIds(prev => { const n = {...prev}; delete n[key]; return n; });
            }

            // Check if the column is completely filled after a save and create a wall if so
            const colIdx = fourteenDays.indexOf(activeDate);
            if (colIdx !== -1 && !spawnedWallDates.includes(activeDate)) {
                let full = true;
                for (const h of displayHours) {
                    const k = `${activeDate}_${h}`;
                    const showUser = userDisplayHours.includes(h);
                    const showOpp = isBattleMode && isOppAwake(h);

                    const hasUser = showUser ? !!routines[k] : true; // Auto-pass if the user is asleep
                    const hasOppTask = showOpp ? !!getMockOpponentTask(k, h) : true; // Auto-pass if the opponent is asleep

                    const cellFull = (showUser && showOpp) ? (hasUser || hasOppTask) : (showUser ? hasUser : hasOppTask);

                    if (!cellFull) {
                        full = false;
                        break;
                    }
                }
                if (full) {
                    const newWallTiles: string[] = [];
                    for (const h of displayHours) {
                        newWallTiles.push(`${colIdx}_${h}`);
                    }
                    setWalls(prev => [...prev, ...newWallTiles]);
                    setSpawnedWallDates(prev => [...prev, activeDate]);
                    Alert.alert("Wall formed!", "A defensive wall has spawned in this timeline!");
                }
            }

        } catch (e) {
            console.error("Save failed:", e);
        }
    };

    // The big rectangle under an event that appears when clicking the event's score triangle
    const toggleEventDetails = async (hour: number) => {
        const key = `${activeDate}_${hour}`;
        const currentData = AIData[key] || {};
        const existingId = eventIds[key];
        const newMenuState = !currentData.has_menu_open;

        // Do not allow the menu to expand before the event has been graded
        if (!existingId) return;

        if (newMenuState) {
            Object.keys(AIData).forEach(k => {
                if (k !== key && AIData[k].has_menu_open) {
                    const otherId = eventIds[k];
                    if (otherId) {
                        supabase.from('events').update({ has_menu_open: false }).eq('id', otherId).then(({ error }) => {
                            if (error) console.error("Failed to close other menu in DB:", error);
                        });
                    }
                }
            });
        }

        // Update the calendar immediately
        setAIData(prev => {
            const next = { ...prev };
            if (newMenuState) {
                for (const k in next) {
                    if (next[k].has_menu_open) {
                        next[k] = { ...next[k], has_menu_open: false };
                    }
                }
            }
            next[key] = { ...currentData, has_menu_open: newMenuState };
            return next;
        });

        // Save the updated calendar event to Supabase
        if (existingId) {
            try {
                const { error } = await supabase
                    .from('events')
                    .update({ has_menu_open: newMenuState })
                    .eq('id', existingId);

                if (error) console.error("Failed to update calendar event:", error.message);
            } catch (e) {
                console.error("Supabase update error:", e);
            }
        }
    };

    // Tactical Ops Mechanics
    const spawnEnemy = (x: number, y: number, hp: number) => {
        const r = Math.random();
        let type: 'normal' | 'tornado' | 'speedster' = 'normal';
        let emoji = '👾';
        if (r < 0.1) { type = 'tornado'; emoji = '🌪️'; }
        else if (r < 0.2) { type = 'speedster'; emoji = '⚡'; }

        setEnemies(prev => [...prev, {
            id: enemyIdCounter.current++,
            x, y, hp, type, emoji, freeze: 0, fire: 0, accum: 0
        }]);
    };

    // Advance the enemy positions and the moving walls independently
    const tickEnemies = React.useCallback((isFromTaskComplete: boolean = false) => {
        setActiveTowerKey(null); // Clear the shooter focus on a move
        let breach = false;

        // Use functional updates to safely cascade walls into enemies
        setWalls(prevWalls => {
            // Move the wall tiles forward 1 column
            let nextWalls = prevWalls.map(w => {
                const parts = w.split('_');
                const x = parseInt(parts[0], 10);
                const y = parseInt(parts[1], 10);
                return `${x + 1}_${y}`;
            }).filter(w => {
                const x = parseInt(w.split('_')[0], 10);
                return x <= 13;
            });

            setEnemies(prevEnemies => {
                const nextEnemies = prevEnemies.map(e => ({ ...e }));

                nextEnemies.forEach(e => {
                    // Map the enemy's visual 'y' position to the actual grid hour key coordinate
                    const enemyHourStr = displayHours[e.y] !== undefined ? displayHours[e.y] : 0;
                    const currentPosStr = `${e.x}_${enemyHourStr}`;

                    // If a wall advances into an enemy
                    if (nextWalls.includes(currentPosStr)) {
                        if (e.type === 'tornado') {
                            // Tornado destroys the wall tile that just hit it
                            nextWalls = nextWalls.filter(w => w !== currentPosStr);
                        } else {
                            // Push the normal/speedster forward (right)
                            e.x += 1;
                        }
                    }

                    // Check-in hesitation feature: If checking in a task, the enemies at the last line of defense stay put
                    if (isFromTaskComplete && e.x === 0) return;

                    if (e.freeze > 0) { e.freeze--; return; }

                    if (e.fire > 0) {
                        e.fire--;
                        const dirs = [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }];
                        const d = dirs[Math.floor(Math.random() * dirs.length)];
                        const nextX = e.x + d.dx;
                        const nextY = e.y + d.dy;

                        // Prevent random fire movement from passing walls or leaving the grid
                        if (nextY >= 0 && nextY < displayHours.length && nextX <= 13) {
                            const nextHourStr = displayHours[nextY];
                            const targetPos = `${nextX}_${nextHourStr}`;

                            if (nextWalls.includes(targetPos)) {
                                if (e.type === 'tornado') {
                                    nextWalls = nextWalls.filter(w => w !== targetPos);
                                    e.x = nextX;
                                    e.y = nextY;
                                }
                            } else {
                                e.x = nextX;
                                e.y = nextY;
                            }
                        }
                        if (e.x < 0) breach = true;
                        return;
                    }

                    // Enemy AI variants
                    let speed = 1;
                    if (e.type === 'speedster') {
                        e.accum += 1.5;
                        speed = Math.floor(e.accum);
                        e.accum -= speed;
                    }

                    // Move step by step to check for a wall collision
                    for (let s = 0; s < speed; s++) {
                        const targetWall = `${e.x - 1}_${enemyHourStr}`;
                        if (nextWalls.includes(targetWall)) {
                            if (e.type === 'tornado') {
                                // Tornado destroys the tile and moves into its space
                                nextWalls = nextWalls.filter(w => w !== targetWall);
                                e.x -= 1;
                                if (e.x < 0) { breach = true; break; }
                            } else {
                                // Hit a wall, stop moving this turn
                                break;
                            }
                        } else {
                            e.x -= 1;
                            if (e.x < 0) { breach = true; break; }
                        }
                    }
                });

                if (breach) setGameOver(true);
                return nextEnemies.filter(e => e.x >= 0 && e.x <= 13);
            });

            return nextWalls;
        });
    }, [displayHours]);

    // On task finish, reset the event to its default state
    const handleCompleteTask = async (hour: number) => {
        const key = `${activeDate}_${hour}`;
        const existingId = eventIds[key];

        // Capture variable states before changing anything
        const prevPoints = globalPoints;
        const prevRoutines = { ...routines };
        const prevAIData = { ...AIData };
        const prevEventIds = { ...eventIds };

        // Multiplayer: Tag logic
        const isTagged = routines[key]?.includes('@');
        const oppTask = (isBattleMode && isOppAwake(hour)) ? getMockOpponentTask(key, hour) : null;

        let pointsEarned = AIData[key]?.score || 0;
        let isSynergy = false;

        // Multiplayer: If both players tagged each other and successfully completed their tasks
        if (isTagged && oppTask?.isTagged) {
            pointsEarned += oppTask.score;
            isSynergy = true;
        }

        console.log(`Current global: ${globalPoints} | Earned from event: ${pointsEarned}`);
        const newTotalPoints = globalPoints + pointsEarned;
        console.log(`New total points: ${newTotalPoints}`);

        // Update the UI immediately
        setGlobalPoints(newTotalPoints);
        setRoutines(prev => { const n = {...prev}; delete n[key]; return n; });
        setAIData(prev => { const n = {...prev}; delete n[key]; return n; });
        setEventIds(prev => { const n = {...prev}; delete n[key]; return n; });

        if (isSynergy) {
            Alert.alert("Synergy Activated!", `You and your tagged partner both succeeded! Earned ${pointsEarned} points total.`);
        }

        // Trigger a turn: The enemies move when a task is checked in
        tickEnemies(true);

        try {
            // If synergy, update with the bonus score (user + mock opponent) first
            if (isSynergy) {
                const {error: updateError} = await supabase
                    .from('events')
                    .update({score: pointsEarned})
                    .eq('id', existingId);

                if (updateError) throw updateError;
            }

            // Call the RPC to move points to the profile
            const {error: rpcError} = await supabase.rpc('score_task', {
                target_event_id: existingId
            });
            if (rpcError) throw rpcError;

            // Delete the event
            const {error: deleteError} = await supabase
                .from('events')
                .delete()
                .eq('id', existingId);

            if (deleteError) throw deleteError;

            console.log("Success: Task completed and synced.");

        } catch (e) {
            // If any step above fails, revert everything
            console.error("Database connection failed, rolling back:", e);

            setGlobalPoints(prevPoints);
            setRoutines(prevRoutines);
            setAIData(prevAIData);
            setEventIds(prevEventIds);

            Alert.alert(
                "Database connection error",
                "Your task and points have been restored."
            );
        }
    }

    const handleSubmitDebate = async () => {
        if (debateKey === null || !debateText.trim()) return;

        setIsDebating(true);
        const taskText = routines[debateKey];
        const eventId = eventIds[debateKey];

        // Call the thinking model
        const result = await getRejudgedTaskDifficulty(taskText, debateText);

        // Update the UI with the new score and the thinking model's response
        setAIData(prev => ({...prev, [debateKey]: {...prev[debateKey],
                score: result.score === -1 ? prev[debateKey].score : result.score,
                reasoning: result.reasoning
            }}));

        // Save the debate result to the database
        if (eventId) {
            const { error } = await supabase
                .from('events')
                .update({
                    score: result.score === -1 ? AIData[debateKey].score : result.score,
                    description: result.reasoning,
                    has_been_appealed: true
                })
                .eq('id', eventId);
            if (error) {
                console.error("Error saving debate results:", error);
                return;
            }
        }

        // Stop the user from arguing with the event's AI response again
        setDebatedKeys(prev => [...prev, debateKey]);

        // Close and reset the modal
        setIsDebating(false);
        setDebateKey(null);
        setDebateText('');
    };

    const handleAdvanceTime = React.useCallback((oldTodayStr: string) => {
        const penalties: number[] = [];
        let synergyFailures = 0;

        displayHours.forEach(h => {
            const showUser = userDisplayHours.includes(h);
            const showOpp = isBattleMode && isOppAwake(h);
            const key = `${oldTodayStr}_${h}`;

            if (showUser && routines[key] && !towers[key]) {
                const isTagged = routines[key].includes('@');
                const oppTask = showOpp ? getMockOpponentTask(key, h) : null;

                if (isTagged) {
                    // Synergy rule: If one fails, nothing happens. If both fail, a massive penalty is applied.
                    if (oppTask?.isTagged) {
                        synergyFailures++;
                    }
                } else {
                    // Standard untagged penalty
                    penalties.push(AIData[key]?.score || 5);
                }
            }
        });

        // Tick the enemies via internal logic (flagged false as it is an automatic timeline advance)
        tickEnemies(false);

        // Spawn the Base Enemy & Penalties at the rightmost edge
        spawnEnemy(13, Math.floor(Math.random() * displayHours.length), 2);
        penalties.forEach(hp => spawnEnemy(13, Math.floor(Math.random() * displayHours.length), hp));

        // Spawn the Synergy Failure enemies (3 per failure)
        for (let i = 0; i < synergyFailures; i++) {
            const row = Math.floor(Math.random() * displayHours.length);
            spawnEnemy(13, row, 2);
            spawnEnemy(13, row, 2);
            spawnEnemy(13, row, 2);
        }

    }, [routines, towers, AIData, displayHours, userDisplayHours, tickEnemies, isBattleMode, isOppAwake, getMockOpponentTask]);

    // Continuously check if the bedtime has passed
    React.useEffect(() => {
        const interval = setInterval(() => {
            const newLogicalDateStr = getLocalDateString(getLogicalToday());
            if (newLogicalDateStr !== currentLogicalDate) {
                // The time has crossed the bedtime and the logical day has officially shifted!
                handleAdvanceTime(currentLogicalDate);
                setCurrentLogicalDate(newLogicalDateStr);
            }
        }, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [currentLogicalDate, getLogicalToday, handleAdvanceTime]);

    const handleGridCellPress = async (dateStr: string, hour: number) => {
        const key = `${dateStr}_${hour}`;
        const now = Date.now();
        const DOUBLE_PRESS_DELAY = 300;

        const isDoublePress = lastTapRef.current && lastTapRef.current.key === key && (now - lastTapRef.current.time) < DOUBLE_PRESS_DELAY;

        if (isDoublePress) {
            lastTapRef.current = null;
            setActiveTowerKey(null);
            setActiveDate(dateStr);
            setViewMode('1D');

            const currentData = AIData[key] || {};
            if (routines[key] && !currentData.has_menu_open) {
                // Close others in DB
                Object.keys(AIData).forEach(k => {
                    if (k !== key && AIData[k].has_menu_open) {
                        const otherId = eventIds[k];
                        if (otherId) {
                            supabase.from('events').update({ has_menu_open: false }).eq('id', otherId).then(({ error }) => {
                                if (error) console.error(error);
                            });
                        }
                    }
                });

                setAIData(prev => {
                    const next = { ...prev };
                    for (const k in next) {
                        if (next[k].has_menu_open) {
                            next[k] = { ...next[k], has_menu_open: false };
                        }
                    }
                    next[key] = { ...currentData, has_menu_open: true };
                    return next;
                });

                const existingId = eventIds[key];
                if (existingId) {
                    supabase.from('events').update({ has_menu_open: true }).eq('id', existingId).then(({ error }) => {
                        if (error) console.error(error);
                    });
                }
            }
            return;
        }

        lastTapRef.current = { key, time: now };

        if (selectedShopItem) {
            const score = AIData[key]?.score;
            if (routines[key] && score !== undefined && score > 0 && !towers[key]) {
                if (globalPoints >= selectedShopItem.cost) {
                    const success = await deductPoints(selectedShopItem.cost);
                    if (success) {
                        setTowers(prev => ({
                            ...prev, [key]: { type: selectedShopItem.type, ammo: score }
                        }));
                        setSelectedShopItem(null);
                    }
                } else {
                    Alert.alert("Not enough points", `You need ${selectedShopItem.cost} points.`);
                }
            } else {
                Alert.alert("Invalid Placement", "Towers can only be placed on SCORED tasks.");
            }
        } else if (towers[key]) {
            setActiveTowerKey(prev => prev === key ? null : key);
        } else {
            setActiveTowerKey(null);
        }
    };

    const handleGridCellLongPress = (dateStr: string, hour: number) => {
        setActiveTowerKey(null);
        setActiveDate(dateStr);
        setViewMode('1D');
        setEditingKey(`${dateStr}_${hour}`);
    };

    const handleEnemyPress = async (enemy: EnemyState) => {
        if (selectedShopItem) {
            setSelectedShopItem(null);
            return;
        }
        if (!activeTowerKey) return;

        const tower = towers[activeTowerKey];
        if (!tower || tower.ammo <= 0) return;

        const [tDateStr, tHourStr] = activeTowerKey.split('_');
        const tColIndex = fourteenDays.indexOf(tDateStr);
        const tRowIndex = displayHours.indexOf(parseInt(tHourStr, 10));

        if (tColIndex === -1 || tRowIndex === -1) return; // The tower is offscreen

        const dist = Math.abs(tColIndex - enemy.x) + Math.abs(tRowIndex - enemy.y);
        if (globalPoints < dist) {
            Alert.alert("Not enough points!", `Shot requires ${dist} pts.`);
            return;
        }

        const success = await deductPoints(dist);
        if (!success) return; // If the database connection fails, restore the original game state

        setTowers(prev => {
            const next = { ...prev };
            next[activeTowerKey] = { ...tower, ammo: tower.ammo - 1 };
            if (next[activeTowerKey].ammo <= 0) {
                delete next[activeTowerKey];
                setActiveTowerKey(null);
            }
            return next;
        });

        setEnemies(prev => {
            const next = prev.map(e => ({ ...e }));
            const target = next.find(e => e.id === enemy.id);
            if (!target) return next;

            if (tower.type === 'basic') target.hp -= 2;
            if (tower.type === 'night') target.hp -= (target.y >= 10 ? 5 : 1);
            if (tower.type === 'freeze') target.freeze = 3;
            if (tower.type === 'fire') target.fire = 3;
            if (tower.type === 'merge') {
                target.hp = Math.floor(target.hp / 2);
            }

            return next.filter(e => e.hp > 0);
        });
    };

    const restartGame = () => {
        setGameOver(false);
        setEnemies([]);
        setTowers({});
        setWalls([]);
        setActiveTowerKey(null);
    };

    const getTowerIcon = (type: string) => {
        const item = SHOP_ITEMS.find(s => s.type === type);
        return item ? item.icon : '';
    };

    const isAnyMenuOpenOnActiveDate = userDisplayHours.some(h => AIData[`${activeDate}_${h}`]?.has_menu_open);

    return (
        <View style={styles.mainContainer}>
            {/* Header Section */}
            <View style={styles.headerContainer}>
                {/* The Shop Hotbar - Hidden on 1D view */}
                <View style={styles.inventoryContainer}>
                    {viewMode === '2D' && (
                        <>
                            <Text style={styles.inventoryLabel}>Shop</Text>
                            <View style={styles.hotbar}>
                                {SHOP_ITEMS.map((item) => {
                                    const isSelected = selectedShopItem?.type === item.type;
                                    return (
                                        <TouchableOpacity
                                            key={item.type}
                                            style={[styles.inventorySlot, isSelected && styles.inventorySlotSelected]}
                                            onPress={() => setSelectedShopItem(isSelected ? null : item)}
                                        >
                                            <Text style={styles.shopIconText}>{item.icon}</Text>
                                            <Text style={[styles.shopCostText, isSelected && { color: '#000', fontWeight: 'bold' }]}>
                                                {item.cost}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </>
                    )}
                </View>

                {/* Display the End Match Button when interleaving the opponent's calendar */}
                {isBattleMode && (
                    <TouchableOpacity style={styles.endMatchBtn} onPress={handleEndMatch}>
                        <Text style={styles.endMatchBtnText}>End{'\n'}Match</Text>
                    </TouchableOpacity>
                )}

                {/* Advance Time Button (Admin only) */}
                {isAdmin ? (
                    <View style={styles.controls}>
                        <TouchableOpacity
                            style={styles.btnAdvance}
                            onPress={() => {
                                if (!isAdmin) return;

                                // Calculate tomorrow based on the current logical date
                                const [year, month, day] = currentLogicalDate.split('-').map(Number);
                                const nextDate = new Date(year, month - 1, day + 1);
                                const nextDateStr = getLocalDateString(nextDate);

                                // Trigger your existing timeline shift logic
                                handleAdvanceTime(currentLogicalDate);
                                setCurrentLogicalDate(nextDateStr);
                            }}
                        >
                            <Text style={styles.btnAdvanceText}>Advance 1 Day Ahead{'\n'}(Shift Calendar)</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {/* Global Points Display */}
                <View style={styles.pointsContainer}>
                    <Text style={styles.pointsLabel}>Global Points</Text>
                    <Text style={styles.pointsValue}>{globalPoints}</Text>
                </View>
            </View>

            {viewMode === '2D' ? (
                /* The 2D Grid Section */
                <View style={styles.gridContainerWrapper}>
                    <ScrollView horizontal style={styles.gridContainer}>
                        <View>
                            {/* Headers for the 14 days */}
                            <View style={styles.gridHeaderRow}>
                                <View style={styles.gridTimePlaceholder}>
                                    <Text style={styles.RedLineText}>Secure the line:</Text>
                                </View>
                                {fourteenDays.map((dateStr, idx) => (
                                    <TouchableOpacity
                                        key={dateStr}
                                        style={styles.gridDateButton}
                                        onPress={() => {
                                            setActiveDate(dateStr);
                                            setViewMode('1D'); // Expand the column into the to-do list
                                        }}
                                    >
                                        <Text style={styles.gridDateText}>
                                            {idx === 0 ? 'Today' : `+${idx}`}
                                        </Text>
                                        <Text style={{ fontSize: 9, color: '#64748b' }}>{formatDateShort(dateStr)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Rows dynamically mapped to waking hours */}
                            <ScrollView style={styles.gridScrollVertical}>
                                <View style={{ position: 'relative' }}>
                                    {displayHours.map((hour) => {
                                        const showUserRow = userDisplayHours.includes(hour);
                                        const showOppRow = isBattleMode && isOppAwake(hour);
                                        const rowHeight = (showUserRow && showOppRow) ? 91 : 46;

                                        return (
                                            <View key={`grid-hour-${hour}`} style={[styles.gridRow, { height: rowHeight }]}>
                                                <View style={styles.gridTimeColumn}>
                                                    <Text style={styles.gridTimeText}>
                                                        {`${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`}
                                                    </Text>
                                                </View>
                                                {fourteenDays.map((dateStr, colIndex) => {
                                                    const key = `${dateStr}_${hour}`;
                                                    const hasRoutine = !!routines[key];
                                                    const score = AIData[key]?.score;
                                                    const tower = towers[key];
                                                    const isActiveTower = activeTowerKey === key;
                                                    const opponentTask = showOppRow ? getMockOpponentTask(key, hour) : null;
                                                    const isWall = walls.includes(`${colIndex}_${hour}`);

                                                    return (
                                                        <View key={`grid-cell-wrapper-${key}`} style={styles.gridCellWrapper}>
                                                            {/* Top Half: User's Tasks */}
                                                            {showUserRow && (
                                                                <TouchableOpacity
                                                                    style={[
                                                                        styles.gridCell,
                                                                        showOppRow && styles.gridCellSplit, // Halves the height dynamically when stacking
                                                                        hasRoutine && !tower && styles.gridCellActive,
                                                                        tower && styles.gridCellTower,
                                                                        isWall && styles.wallCell, // Applies wall styling if present
                                                                        isActiveTower && styles.gridCellActiveShooter
                                                                    ]}
                                                                    onPress={() => handleGridCellPress(dateStr, hour)}
                                                                    onLongPress={() => handleGridCellLongPress(dateStr, hour)}
                                                                    activeOpacity={0.8}
                                                                >
                                                                    {tower ? (
                                                                        <>
                                                                            <Text style={{ fontSize: isBattleMode ? 12 : 16, textAlign: 'center' }}>
                                                                                {getTowerIcon(tower.type)}{isWall ? '\n🐊' : ''}
                                                                            </Text>
                                                                            <View style={styles.ammoBadge}>
                                                                                <Text style={styles.ammoText}>{tower.ammo}</Text>
                                                                            </View>
                                                                        </>
                                                                    ) : hasRoutine ? (
                                                                        <Text style={[styles.gridCellText, { textAlign: 'center' }]}>
                                                                            {score !== undefined ? score : '📝'}{isWall ? '\n🐊' : ''}
                                                                        </Text>
                                                                    ) : isWall ? (
                                                                        <Text style={{ fontSize: isBattleMode ? 12 : 16, textAlign: 'center' }}>🐊</Text>
                                                                    ) : null}
                                                                </TouchableOpacity>
                                                            )}

                                                            {/* Bottom Half: Opponent's Tasks - Hidden if the opponent is sleeping */}
                                                            {showOppRow && (
                                                                <TouchableOpacity
                                                                    style={[
                                                                        styles.gridCell,
                                                                        styles.gridCellSplit,
                                                                        styles.gridCellOpponent,
                                                                        opponentTask ? styles.gridCellOpponentActive : styles.gridCellOpponentEmpty,
                                                                        !showUserRow && { borderTopWidth: 0 }, // Clean the border if the user row is hidden
                                                                        isWall && styles.wallCell
                                                                    ]}
                                                                    onPress={() => handleGridCellPress(dateStr, hour)}
                                                                    onLongPress={() => handleGridCellLongPress(dateStr, hour)}
                                                                    activeOpacity={0.8}
                                                                >
                                                                    {opponentTask ? (
                                                                        <Text style={[styles.gridCellTextOpponent, { textAlign: 'center' }]}>
                                                                            {opponentTask.score}{isWall ? '\n🐊' : ''}
                                                                        </Text>
                                                                    ) : isWall ? (
                                                                        <Text style={{ fontSize: 10, textAlign: 'center' }}>🐊</Text>
                                                                    ) : null}
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        );
                                    })}

                                    {/* Enemies Rendered Over the Grid */}
                                    {enemies.map(enemy => {
                                        const leftPos = 80 + (enemy.x * 60);
                                        const topPos = getRowTopPos(enemy.y); // Dynamic Y offset based on the opponent's sleep state rows

                                        let distanceCostStr = '';
                                        let affordClass = false;
                                        if (activeTowerKey) {
                                            const [tDateStr, tHourStr] = activeTowerKey.split('_');
                                            const tColIndex = fourteenDays.indexOf(tDateStr);
                                            const tRowIndex = displayHours.indexOf(parseInt(tHourStr, 10));
                                            if (tColIndex !== -1 && tRowIndex !== -1) {
                                                const dist = Math.abs(tColIndex - enemy.x) + Math.abs(tRowIndex - enemy.y);
                                                distanceCostStr = dist.toString();
                                                affordClass = globalPoints >= dist;
                                            }
                                        }

                                        return (
                                            <TouchableOpacity
                                                key={`enemy-${enemy.id}`}
                                                style={[
                                                    styles.enemyBody,
                                                    enemy.type === 'tornado' && styles.enemyTornado,
                                                    enemy.type === 'speedster' && styles.enemySpeedster,
                                                    enemy.freeze > 0 && styles.enemyFrozen,
                                                    enemy.fire > 0 && styles.enemyBurning,
                                                    { left: leftPos + 13, top: topPos + 5.5 } // Centers directly within the top box (the user's lane)
                                                ]}
                                                onPress={() => handleEnemyPress(enemy)}
                                            >
                                                {activeTowerKey && distanceCostStr !== '' ? (
                                                    <View style={[styles.targetingCost, affordClass ? styles.costAfford : styles.costBroke]}>
                                                        <Text style={{ color: 'inherit', fontWeight: '900', fontSize: 12 }}>{distanceCostStr}</Text>
                                                    </View>
                                                ) : (
                                                    <Text style={{ fontSize: 16 }}>{enemy.emoji}</Text>
                                                )}
                                                <View style={styles.enemyHpBadge}>
                                                    <Text style={styles.enemyHpText}>{enemy.hp}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </ScrollView>
                        </View>
                    </ScrollView>
                </View>
            ) : (
                /* Non-scrollable hour bars Section (1D mode) - Maps exclusively over the user's active hours */
                <View style={styles.calendarDayView}>
                    <TouchableOpacity
                        style={styles.currentDateBanner}
                        onPress={() => setViewMode(prev => prev === '1D' ? '2D' : '1D')}
                    >
                        <Text style={styles.currentDateBannerText}>
                            Tasks for: {formatDateShort(activeDate)}
                        </Text>
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                        {userDisplayHours.map((hour) => {
                            const key = `${activeDate}_${hour}`;
                            const isEditing = editingKey === key;
                            const timeLabel = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;

                            const hasRoutine = !!routines[key];
                            const currentAIData = AIData[key] || {};
                            const isMenuOpen = !!currentAIData.has_menu_open;
                            const shouldShrink = isAnyMenuOpenOnActiveDate && !isMenuOpen;

                            return (
                                <View key={key} style={{ flex: shouldShrink ? 0 : 1 }}>
                                    <View style={[styles.timeSlot, { flex: isAnyMenuOpenOnActiveDate ? 0 : 1, paddingVertical: shouldShrink ? 0 : 2 }]}>
                                        <Text style={styles.timeLabel}>{timeLabel}</Text>

                                        <TouchableOpacity
                                            style={[styles.eventArea, { minHeight: 0 }]}
                                            activeOpacity={1}
                                            onPress={() => setEditingKey(key)}
                                        >
                                            {isEditing ? (
                                                <TextInput
                                                    autoFocus
                                                    value={routines[key] || ''}
                                                    onChangeText={(t) => setRoutines({ ...routines, [key]: t })}

                                                    // Clicking away triggers: save and AI
                                                    onBlur={() => handleSave(hour)}

                                                    // Tell the keyboard to vanish when 'enter' is pressed
                                                    submitBehavior="blurAndSubmit"

                                                    style={[styles.textInput, { padding: 2 }]}
                                                />
                                            ) : (
                                                <Text style={{ color: routines[key] ? '#333' : '#007bff' }}>
                                                    {routines[key] || '+ Click to schedule routine'}
                                                </Text>
                                            )}
                                        </TouchableOpacity>

                                        {/* The Triangle Button */}
                                        {hasRoutine && !isEditing && (
                                            <TouchableOpacity
                                                style={styles.triangleButton}
                                                onPress={() => toggleEventDetails(hour)}
                                                // Make the button visually inactive if there is no score yet
                                                activeOpacity={currentAIData.score !== undefined ? 0.2 : 1}
                                            >
                                                {currentAIData.score !== undefined ? (
                                                    <Text style={styles.triangleScoreText}>◁ {currentAIData.score}</Text>
                                                ) : (
                                                    <View style={styles.triangleIcon} />
                                                )}
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {/* The row expansion rectangle (the event's menu) */}
                                    {isMenuOpen && (
                                        <View style={[styles.expandedRow, { flex: 6, minHeight: 0 }]}>
                                            {/* Display the 'Done' button ONLY if the currently viewed day is actually 'Today' */}
                                            {activeDate === currentLogicalDate && (
                                                <TouchableOpacity
                                                    style={styles.doneButton}
                                                    onPress={() => handleCompleteTask(hour)}
                                                >
                                                    <Text style={styles.doneText}>Press{'\n'}when done{'\n'}with task</Text>
                                                </TouchableOpacity>
                                            )}

                                            <TouchableOpacity
                                                style={styles.reasoningArea}
                                                activeOpacity={0.8}
                                                onPress={() => {
                                                    if (debatedKeys.includes(key)) {
                                                        Alert.alert("Sorry, but the case is closed.");
                                                    } else {
                                                        setDebateKey(key);
                                                    }
                                                }}
                                            >
                                                <Text style={styles.reasoningText} numberOfLines={2}>
                                                    {currentAIData.reasoning}
                                                </Text>

                                                <Text style={styles.debateHintText}>
                                                    {debatedKeys.includes(key)
                                                        ? "case closed by High Court"
                                                        : "tap to debate this score"}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                </View>
            )}

            {/* The Game Over Overlay */}
            <Modal visible={gameOver} transparent={true} animationType="fade">
                <View style={styles.gameOverOverlay}>
                    <Text style={styles.gameOverTitle}>CALENDAR BREACH</Text>
                    <Text style={styles.gameOverSub}>An enemy reached Yesterday.</Text>
                    <TouchableOpacity style={styles.btnRestart} onPress={restartGame}>
                        <Text style={styles.btnRestartText}>Restart Timeline</Text>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* The Debate Modal */}
            <Modal visible={debateKey !== null} transparent={true} animationType="fade" onRequestClose={() => setDebateKey(null)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Appeal to the higher court</Text>
                        <Text style={styles.modalSubtitle}>Explain why you disagree in one sentence:</Text>

                        <TextInput
                            style={styles.modalInput}
                            multiline
                            placeholder="Example: My friend's wheeled-throne was squeaking at a frequency that caused my window to break..."
                            value={debateText}
                            onChangeText={setDebateText}
                            maxLength={100} // Keep it brief
                        />

                        <View style={styles.modalButtonRow}>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: '#ccc' }]}
                                onPress={() => { setDebateKey(null); setDebateText(''); }}
                                disabled={isDebating}
                            >
                                <Text>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: '#4a86e8' }]}
                                onPress={handleSubmitDebate}
                                disabled={isDebating || !debateText.trim()}
                            >
                                {isDebating ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff' }}>Submit Appeal</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// Grid Styles
const styles = StyleSheet.create({
    mainContainer: { flex: 1, backgroundColor: '#fff' },

    // RESTORED ORIGINAL HEADER STYLES
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 12,
        backgroundColor: '#f1f5f9',
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    inventoryContainer: {
        flexDirection: 'column',
    },
    inventoryLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#64748b',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    hotbar: {
        flexDirection: 'row',
        gap: 6,
    },
    inventorySlot: {
        width: 36,
        height: 38,
        backgroundColor: '#e2e8f0',
        borderWidth: 2,
        borderColor: '#94a3b8',
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    inventorySlotSelected: {
        backgroundColor: '#fef08a',
        borderColor: '#eab308',
        transform: [{ scale: 1.1 }]
    },
    shopIconText: { fontSize: 16 },
    shopCostText: { fontSize: 9, color: '#64748b', marginTop: 1 },
    pointsContainer: {
        alignItems: 'flex-end',
    },
    pointsLabel: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    pointsValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fbbf24',
    },
    endMatchBtn: {
        backgroundColor: '#ef4444',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginHorizontal: 10,
    },
    endMatchBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 9,
        textAlign: 'center',
        textTransform: 'uppercase'
    },

    gridContainerWrapper: { flex: 1, backgroundColor: '#f8fafc' },

    gridContainer: { flex: 1 },
    gridHeaderRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#cbd5e1',
        backgroundColor: '#f1f5f9'
    },
    gridTimePlaceholder: {
        width: 80,
        borderRightWidth: 2,
        borderRightColor: '#f44336', // RED LINE between time and Today
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        paddingRight: 6,
        paddingBottom: 4
    },
    RedLineText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#f44336',
        textTransform: 'uppercase'
    },
    gridDateButton: {
        width: 60, paddingVertical: 10,
        alignItems: 'center', justifyContent: 'center',
        borderRightWidth: 1, borderRightColor: '#cbd5e1'
    },
    gridDateText: { fontSize: 12, fontWeight: 'bold', color: '#334155' },

    gridScrollVertical: { flex: 1 },
    gridRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    gridTimeColumn: {
        width: 80, paddingVertical: 12,
        alignItems: 'center', justifyContent: 'center',
        borderRightWidth: 2, borderRightColor: '#f44336', // RED LINE between time and Today
        backgroundColor: '#f8fafc'
    },
    gridTimeText: { fontSize: 12, color: '#64748b', fontWeight: '500' },

    gridCellWrapper: {
        width: 60,
        borderRightWidth: 1,
        borderRightColor: '#e2e8f0',
        flexDirection: 'column',
        height: '100%', // Ensures it perfectly fills the row height regardless of scaling
    },
    gridCell: {
        flex: 1,
        width: '100%',
        minHeight: 45, // Set to the standard row height
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent'
    },
    gridCellSplit: {
        // Naturally stack two 45.5px tall cells automatically due to the flex flex-direction column on the parent
    },
    gridCellOpponent: {
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
    },
    gridCellOpponentActive: {
        backgroundColor: '#fda4af', // The opponent task background
    },
    gridCellOpponentEmpty: {
        backgroundColor: '#fff1f2', // Empty background
    },
    gridCellTextOpponent: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#881337',
    },

    wallCell: {
        backgroundColor: '#b91c1c', // Deep brick-red
        justifyContent: 'center',
        alignItems: 'center',
        borderRightWidth: 1,
        borderRightColor: '#7f1d1d'
    },

    controls: {
        justifyContent: 'center',
    },
    btnAdvance: {
        backgroundColor: '#3b82f6', // A nice blue to distinguish it from the red End Match button
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginHorizontal: 10,
    },
    btnAdvanceText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 9,
        textAlign: 'center',
        textTransform: 'uppercase'
    },

    gridCellActive: { backgroundColor: '#bde0fe' },
    gridCellTower: { backgroundColor: '#5D4037' },
    gridCellActiveShooter: { borderColor: '#FFEB3B', borderWidth: 2 },
    gridCellText: { fontSize: 12, fontWeight: 'bold', color: '#0f172a' },

    ammoBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#000', borderRadius: 8, paddingHorizontal: 4, borderWidth: 1, borderColor: '#888' },
    ammoText: { fontSize: 9, color: '#fff', fontWeight: 'bold' },

    enemyBody: { position: 'absolute', width: 34, height: 34, backgroundColor: '#D32F2F', borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
    enemyTornado: { backgroundColor: '#455A64', borderRadius: 17 },
    enemySpeedster: { backgroundColor: '#FFC107' },
    enemyFrozen: { backgroundColor: '#80DEEA' },
    enemyBurning: { backgroundColor: '#FF9800' },
    enemyHpBadge: { position: 'absolute', top: -8, backgroundColor: '#000', paddingHorizontal: 4, borderRadius: 4, borderWidth: 1, borderColor: '#555' },
    enemyHpText: { fontSize: 9, color: '#fff', fontWeight: 'bold' },
    targetingCost: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', borderRadius: 4, borderWidth: 2 },
    costAfford: { borderColor: '#00E676', color: '#00E676' },
    costBroke: { borderColor: '#FF1744', color: '#FF1744' },

    gameOverOverlay: { flex: 1, backgroundColor: 'rgba(15,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
    gameOverTitle: { color: '#f44336', fontSize: 40, fontWeight: '900', marginBottom: 10 },
    gameOverSub: { color: '#aaa', fontSize: 16, marginBottom: 30 },
    btnRestart: { backgroundColor: '#D32F2F', paddingHorizontal: 30, paddingVertical: 15, borderRadius: 8 },
    btnRestartText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    currentDateBanner: { padding: 8, backgroundColor: '#e2e8f0', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
    currentDateBannerText: { fontWeight: 'bold', color: '#334155' },
    calendarDayView: { flex: 1 },
    timeSlot: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
    timeLabel: { width: 100, fontWeight: 'bold' },
    eventArea: { flex: 1, minHeight: 30, justifyContent: 'center' },
    textInput: { width: '100%', padding: 5, backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 4 },
    triangleButton: { paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' },
    triangleIcon: { width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid', borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 15, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#bde0fe' },
    triangleScoreText: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    expandedRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333', minHeight: 60 },
    doneButton: { backgroundColor: '#8fbc8f', width: 100, justifyContent: 'center', alignItems: 'center', padding: 5, borderRightWidth: 1, borderRightColor: '#333' },
    doneText: { textAlign: 'center', color: '#000', fontSize: 12 },
    reasoningArea: { flex: 1, backgroundColor: '#4a86e8', padding: 10, justifyContent: 'center' },
    reasoningText: { color: '#000', fontSize: 14 },
    debateHintText: { color: '#000', fontSize: 10, fontStyle: 'italic', marginTop: 4, opacity: 0.6 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 8, padding: 20, elevation: 5 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
    modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 15 },
    modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 4, padding: 10, minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },
    modalButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    modalButton: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 4, justifyContent: 'center', alignItems: 'center', minWidth: 80 }
});